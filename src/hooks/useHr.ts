import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { nomePersona } from "@/lib/nomePersona";
import { supabase } from "@/integrations/supabase/client";

// ── Types ──────────────────────────────────────────────────────────────────
export type AvailabilityStatus =
  | "office"
  | "smart_working"
  | "unavailable"
  | "travel"
  | "vacation"
  | "permit"
  | "sick";
export type RequestType = "holiday" | "permit" | "travel";
export type RequestStatus = "pending" | "approved" | "rejected";
export type AttendanceStatus = "auto_qr" | "manual_override";

/**
 * Una riga di calendario come la puo' vedere chi la sta guardando.
 *
 * Su se' stessi e per un amministratore e' la riga intera. Su un collega e'
 * ridotta: niente id, niente causale, niente nota, e solo il mese corrente.
 * Cosa si vede lo decide il database, non l'interfaccia — vedi
 * `fn_hr_availability_window`.
 */
export interface HrAvailability {
  id: string | null;
  user_id: string;
  date: string;
  /** La causale vera, oppure "available"/"unavailable" se `masked`. */
  status: AvailabilityStatus | MaskedStatus;
  note: string | null;
  hours_planned: number | null;
  is_self: boolean;
  masked: boolean;
}

export type MaskedStatus = "available" | "unavailable";

/** Vero quando la riga arriva ridotta e la causale non e' leggibile. */
export function isMasked(row: HrAvailability): row is HrAvailability & { status: MaskedStatus } {
  return row.masked;
}

export interface HrRequest {
  id: string;
  user_id: string;
  type: RequestType;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
  status: RequestStatus;
  manager_note: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

export interface HrAttendance {
  id: string;
  user_id: string;
  timestamp_in: string;
  timestamp_out: string | null;
  location_lat: number | null;
  location_lng: number | null;
  status: AttendanceStatus;
  approved_by: string | null;
  device_label: string | null;
  note: string | null;
  created_at: string;
}

export interface HrQrToken {
  id: string;
  user_id: string;
  token: string;
  active: boolean;
  rotated_at: string;
}

export interface HrProfile {
  id: string;
  full_name: string | null;
  /** Per meta' delle persone il nome sta qui e non in `full_name`. */
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
  office_id: string | null;
  /** Il nome gia' risolto: una regola sola, in `lib/nomePersona`. */
  nome: string;
}

/**
 * Il dominio delle persone interne.
 *
 * In `profiles` convivono i nostri e i referenti dei clienti. HR riguarda solo
 * i nostri: il calendario delle presenze, le ferie e le timbrature non hanno
 * senso per chi lavora per il cliente, e su 28 profili 8 sono esterni — 8 righe
 * di clienti in mezzo al calendario del team.
 */
const INTERNAL_EMAIL_DOMAIN = "@fgb-studio.com";

// ── Profiles (people displayed in HR module) ──────────────────────────────
/**
 * @param tutti Include anche chi ha un indirizzo fuori dal dominio. Serve per
 *   i badge: qualcuno di casa ha una mail sua — la titolare, per esempio — e il
 *   filtro sul dominio la lascerebbe senza modo di timbrare.
 */
export function useHrProfiles(tutti = false) {
  return useQuery({
    queryKey: ["hr", "profiles", tutti ? "all" : "internal"],
    queryFn: async () => {
      let q = supabase
        .from("profiles")
        .select("id, full_name, display_name, email, avatar_url, office_id");
      if (!tutti) q = q.ilike("email", `%${INTERNAL_EMAIL_DOMAIN}`);
      const { data, error } = await q;
      if (error) throw error;

      // L'ordinamento non lo fa piu' il database su `full_name`: per meta'
      // delle persone quella colonna e' vuota, e finivano tutte in fondo
      // insieme, in ordine casuale. Si ordina sul nome risolto, che esiste
      // sempre — e con `localeCompare` perche' «Àngela» venga dove ci si
      // aspetta e non dopo la Z.
      return ((data ?? []) as HrProfile[])
        .map((p) => ({ ...p, nome: nomePersona(p) }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "it"));
    },
  });
}

// ── Availability ──────────────────────────────────────────────────────────
/**
 * Il calendario, filtrato da chi lo sta leggendo.
 *
 * Passa da una funzione e non dalla tabella perche' il confine qui e' una
 * colonna, non una riga: di un collega si puo' sapere se e' disponibile, non
 * perche'. RLS lavora sulle righe, quindi la tabella e' chiusa a "il proprio o
 * l'amministratore" e la vista ridotta la costruisce il database.
 */
export function useHrAvailability(fromISO: string, toISO: string) {
  return useQuery({
    queryKey: ["hr", "availability", fromISO, toISO],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("fn_hr_availability_window", {
        p_from: fromISO,
        p_to: toISO,
      });
      if (error) throw error;
      return (data ?? []) as HrAvailability[];
    },
  });
}

export function useUpsertAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      user_id: string;
      date: string;
      status: AvailabilityStatus;
      note?: string | null;
      hours_planned?: number | null;
    }) => {
      const { data, error } = await (supabase as any)
        .from("hr_availability")
        .upsert(input, { onConflict: "user_id,date" })
        .select("*")
        .single();
      if (error) throw error;
      return data as HrAvailability;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr", "availability"] }),
  });
}

export function useDeleteAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("hr_availability").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr", "availability"] }),
  });
}

// ── Requests ──────────────────────────────────────────────────────────────
export function useHrRequests() {
  return useQuery({
    queryKey: ["hr", "requests"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as HrRequest[];
    },
  });
}

export function useCreateRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      type: RequestType;
      start_date: string;
      end_date: string;
      start_time?: string | null;
      end_time?: string | null;
      reason?: string | null;
    }) => {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await (supabase as any)
        .from("hr_requests")
        .insert({ ...input, user_id: user.id })
        .select("*")
        .single();
      if (error) throw error;
      return data as HrRequest;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr"] }),
  });
}

export function useUpdateRequestStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      status: RequestStatus;
      manager_note?: string | null;
    }) => {
      const user = (await supabase.auth.getUser()).data.user;
      const { data, error } = await (supabase as any)
        .from("hr_requests")
        .update({
          status: input.status,
          manager_note: input.manager_note ?? null,
          approved_by: user?.id ?? null,
          approved_at: new Date().toISOString(),
        })
        .eq("id", input.id)
        .select("*")
        .single();
      if (error) throw error;
      return data as HrRequest;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr"] }),
  });
}

export function useDeleteRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("hr_requests").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr", "requests"] }),
  });
}

// ── Presenze ──────────────────────────────────────────────────────────────

/**
 * La giornata di una persona, come esce dalle sue letture.
 *
 * Non e' una riga scritta da qualcuno: e' `v_hr_giornate`, che ogni volta
 * rilegge le timbrature e ne ricava la forma. Aggiungere a mano una lettura
 * dimenticata la rimette a posto senza toccare nient'altro.
 */
export interface GiornataHr {
  user_id: string;
  /** La data secondo il fuso di Roma, non secondo UTC. */
  giorno: string;
  letture: number;
  ingresso: string | null;
  pausa: string | null;
  ripresa: string | null;
  uscita: string | null;
  /** Numero dispari di letture: la persona non ha ancora timbrato l'uscita. */
  ancora_dentro: boolean;
  minuti_lavorati: number | null;
  minuti_pausa: number | null;
}

export function useGiornate(filters: { userId?: string; dal?: string; al?: string }) {
  return useQuery({
    queryKey: ["hr", "giornate", filters],
    queryFn: async () => {
      let q = (supabase as any)
        .from("v_hr_giornate")
        .select("*")
        .order("giorno", { ascending: false });
      if (filters.userId) q = q.eq("user_id", filters.userId);
      if (filters.dal) q = q.gte("giorno", filters.dal);
      if (filters.al) q = q.lte("giorno", filters.al);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as GiornataHr[];
    },
  });
}

/** Le letture grezze di una giornata: quello che il varco ha visto davvero. */
export function useLettureDelGiorno(userId: string | null, giorno: string | null) {
  return useQuery({
    enabled: !!userId && !!giorno,
    queryKey: ["hr", "letture", userId, giorno],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_timbrature")
        .select("id, ts, origine, note, device_label")
        .eq("user_id", userId)
        // Il giorno e' quello di Roma: si chiede dalla mezzanotte locale alla
        // successiva, non da quella UTC.
        .gte("ts", new Date(`${giorno}T00:00:00`).toISOString())
        .lt("ts", new Date(`${giorno}T23:59:59.999`).toISOString())
        .order("ts");
      if (error) throw error;
      return (data ?? []) as { id: string; ts: string; origine: string; note: string | null; device_label: string | null }[];
    },
  });
}

/**
 * Il badge di chi sta guardando.
 *
 * Se non ne ha ancora uno glielo crea: e' il modo in cui il QR arriva sul
 * telefono di ciascuno senza che nessuno debba generarlo e spedirlo.
 */
export function useMioBadge() {
  return useQuery({
    queryKey: ["hr", "mio-badge"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("hr_mio_badge");
      if (error) throw error;
      return data as string;
    },
    staleTime: Infinity,
  });
}

/**
 * Le letture scritte a mano.
 *
 * Chi ha dimenticato il badge, chi e' andato dritto in cantiere, chi ieri sera
 * e' uscito senza passare al varco: si scrivono gli orari mancanti, e la
 * giornata si ricompone da se'. Restano marcate `manuale`, con chi le ha
 * inserite: una presenza decisa da una persona non deve somigliare a una letta
 * da un badge.
 */
export function useAggiungiLetture() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      user_id: string;
      /** ISO completi, gia' risolti sul giorno scelto. */
      istanti: string[];
      note?: string | null;
      inserita_da?: string | null;
    }) => {
      const righe = input.istanti.map((ts) => ({
        user_id: input.user_id,
        ts,
        origine: "manuale",
        note: input.note ?? null,
        inserita_da: input.inserita_da ?? null,
      }));
      const { error } = await (supabase as any).from("hr_timbrature").insert(righe);
      if (error) throw error;
      return righe.length;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr", "giornate"] });
      qc.invalidateQueries({ queryKey: ["hr", "letture"] });
    },
  });
}

// ── QR tokens ─────────────────────────────────────────────────────────────
export function useHrQrTokens() {
  return useQuery({
    queryKey: ["hr", "qr_tokens"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("hr_qr_tokens").select("*");
      if (error) throw error;
      return (data ?? []) as HrQrToken[];
    },
  });
}

function genToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function useRotateQrToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const token = `hr_${genToken()}`;
      const { data, error } = await (supabase as any)
        .from("hr_qr_tokens")
        .upsert(
          { user_id: userId, token, active: true, rotated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        )
        .select("*")
        .single();
      if (error) throw error;
      return data as HrQrToken;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr", "qr_tokens"] }),
  });
}

/**
 * Cosa ha letto la telecamera.
 *
 * Un solo «no» non basta: chi sta al varco deve sapere se ha davanti il QR
 * sbagliato, un badge revocato o un problema di lettura, perche' le tre cose si
 * risolvono in tre modi diversi — e finche' erano tutte «Unknown QR» nessuna si
 * risolveva.
 */
export type EsitoQr =
  /**
   * Lettura registrata: chi, quando, e che numero e' nella giornata. Se sia
   * ingresso, pausa, ripresa o uscita qui non si dice — si vede a fine
   * giornata, e lo dice `v_hr_giornate`. Il verso e' solo la parita': dispari
   * si entra, pari si esce.
   */
  | { esito: "ok"; nome: string; quando: string; ordinale: number; verso: "in" | "out" }
  /** Lo stesso badge ripassato entro un minuto e mezzo: non si legge due volte. */
  | { esito: "ripetuto"; nome: string; quando: string; ordinale: number }
  /** Un QR qualunque: non e' un badge di questo sistema. */
  | { esito: "non_badge" }
  /** Ha la forma giusta ma nessun badge attivo corrisponde. */
  | { esito: "sconosciuto" }
  /** Il badge c'e' ma e' stato revocato. */
  | { esito: "revocato" }
  | { esito: "non_leggibile"; messaggio: string };

/** La forma di un badge emesso da qui: `hr_` piu' sedici byte in esadecimale. */
const FORMA_BADGE = /^hr_[0-9a-f]{32}$/;

/**
 * Timbra con il badge appena letto.
 *
 * La decisione — entrata o uscita, doppia passata, giornata rimasta aperta —
 * sta tutta nella funzione `hr_timbra` del database, e per un motivo: al varco
 * la sessione non ha il diritto ne' di leggere i badge ne' di scrivere le
 * presenze, e non deve averlo. Qui resta il minimo: riconoscere a vista un QR
 * che badge non e', e tradurre la risposta.
 */
export async function timbraConBadge(
  token: string,
  contesto: { location?: { lat: number; lng: number } | null; device?: string | null } = {},
): Promise<EsitoQr> {
  const pulito = token.trim();
  if (!FORMA_BADGE.test(pulito)) return { esito: "non_badge" };

  const { data, error } = await (supabase as any).rpc("hr_timbra", {
    p_token: pulito,
    p_lat: contesto.location?.lat ?? null,
    p_lng: contesto.location?.lng ?? null,
    p_device: contesto.device ?? null,
  });
  if (error) return { esito: "non_leggibile", messaggio: error.message };
  return data as EsitoQr;
}

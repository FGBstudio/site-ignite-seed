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
export function useHrProfiles() {
  return useQuery({
    queryKey: ["hr", "profiles", "internal"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, display_name, email, avatar_url, office_id")
        .ilike("email", `%${INTERNAL_EMAIL_DOMAIN}`);
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

// ── Attendance ────────────────────────────────────────────────────────────
export function useHrAttendance(filters: { userId?: string; fromISO?: string; toISO?: string }) {
  return useQuery({
    queryKey: ["hr", "attendance", filters],
    queryFn: async () => {
      let q = (supabase as any).from("hr_attendance").select("*").order("timestamp_in", { ascending: false });
      if (filters.userId) q = q.eq("user_id", filters.userId);
      if (filters.fromISO) q = q.gte("timestamp_in", filters.fromISO);
      if (filters.toISO) q = q.lte("timestamp_in", filters.toISO);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as HrAttendance[];
    },
  });
}

export function useRegisterAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      user_id: string;
      mode: "in" | "out";
      location?: { lat: number; lng: number } | null;
      device_label?: string | null;
      status?: AttendanceStatus;
    }) => {
      const status = input.status ?? "auto_qr";
      if (input.mode === "in") {
        const { data, error } = await (supabase as any)
          .from("hr_attendance")
          .insert({
            user_id: input.user_id,
            timestamp_in: new Date().toISOString(),
            location_lat: input.location?.lat ?? null,
            location_lng: input.location?.lng ?? null,
            status,
            device_label: input.device_label ?? null,
          })
          .select("*")
          .single();
        if (error) throw error;
        return { row: data as HrAttendance, action: "in" as const };
      }
      // OUT → find latest open record for that user
      const { data: openRows, error: findErr } = await (supabase as any)
        .from("hr_attendance")
        .select("*")
        .eq("user_id", input.user_id)
        .is("timestamp_out", null)
        .order("timestamp_in", { ascending: false })
        .limit(1);
      if (findErr) throw findErr;
      const open = (openRows ?? [])[0];
      if (!open) throw new Error("No open check-in found for this user");
      const { data, error } = await (supabase as any)
        .from("hr_attendance")
        .update({ timestamp_out: new Date().toISOString() })
        .eq("id", open.id)
        .select("*")
        .single();
      if (error) throw error;
      return { row: data as HrAttendance, action: "out" as const };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hr", "attendance"] }),
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

export async function resolveQrToken(token: string): Promise<string | null> {
  const { data, error } = await (supabase as any)
    .from("hr_qr_tokens")
    .select("user_id, active")
    .eq("token", token)
    .maybeSingle();
  if (error) return null;
  if (!data || !data.active) return null;
  return data.user_id as string;
}

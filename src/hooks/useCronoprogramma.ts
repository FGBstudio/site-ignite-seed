import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ANCORE,
  type CertGate,
  type CronoEvento,
  type Cronoprogramma,
  type CronoRegistroVoce,
  type SerieAnteprima,
  type SerieConteggi,
  type TimelineMilestone,
  type Violazione,
} from "@/types/cronoprogramma";

/**
 * L'accesso al cronoprogramma.
 *
 * Le domande che hanno una risposta sola — che handover vale, quali vincoli
 * sono rotti, quanti report servono — passano da funzioni del database e non
 * vengono ricalcolate qui. Non e' pigrizia: e' che la stessa risposta serve al
 * flusso PM, al cruscotto CEO e al motore delle date, e tre copie della stessa
 * regola divergono al primo cambiamento.
 */

// ── Il cronoprogramma del sito ────────────────────────────────────────────
export function useCronoprogrammaBySite(siteId: string | undefined) {
  return useQuery({
    queryKey: ["crono", "by-site", siteId],
    enabled: !!siteId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("cronoprogrammi")
        .select("*")
        .eq("site_id", siteId)
        .eq("stato", "attivo")
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Cronoprogramma | null;
    },
  });
}

export function useCronoEventi(cronoId: string | undefined) {
  return useQuery({
    queryKey: ["crono", "eventi", cronoId],
    enabled: !!cronoId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("cronoprogramma_eventi")
        .select("*")
        .eq("cronoprogramma_id", cronoId)
        .order("ordine");
      if (error) throw error;
      return (data ?? []) as CronoEvento[];
    },
  });
}

/**
 * Crea il cronoprogramma del sito con le otto ancore gia' in riga.
 *
 * Nascono tutte, anche vuote: un elenco completo dice al PM quali date il
 * sistema si aspetta, mentre una tabella vuota da riempire con un pulsante
 * "aggiungi evento" lascia indovinare quali siano quelle giuste.
 *
 * L'handover arriva precompilato dalla quotazione, quindi il cronoprogramma
 * nasce sempre con almeno una data vera e il gate non blocca mai nessuno.
 */
export function useCreateCronoprogramma() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      site_id: string;
      nome?: string | null;
      handoverContrattuale?: string | null;
    }) => {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("Non autenticato");

      const { data: crono, error } = await (supabase as any)
        .from("cronoprogrammi")
        .insert({ site_id: input.site_id, nome: input.nome ?? null, created_by: user.id })
        .select("*")
        .single();
      if (error) throw error;

      const righe = ANCORE.map((a, i) => {
        const isHandover = a.ancora === "handover";
        const data = isHandover ? input.handoverContrattuale ?? null : null;
        return {
          cronoprogramma_id: crono.id,
          ancora: a.ancora,
          nome: a.nome,
          ordine: i + 1,
          data_pianificata: data,
          // Il vincolo del database rifiuta una data senza fonte: quando la
          // data c'e', la fonte deve esserci gia' qui.
          fonte: data ? "Quotazione (contrattuale)" : null,
          stato: data ? "inserita" : "da_confermare",
        };
      });

      const { error: e2 } = await (supabase as any).from("cronoprogramma_eventi").insert(righe);
      if (e2) throw e2;

      return crono as Cronoprogramma;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crono"] }),
  });
}

export function useUpsertEvento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      data_pianificata?: string | null;
      data_effettiva?: string | null;
      fonte?: string | null;
      stato?: string;
    }) => {
      const user = (await supabase.auth.getUser()).data.user;
      const { id, ...campi } = input;
      const { data, error } = await (supabase as any)
        .from("cronoprogramma_eventi")
        .update({ ...campi, aggiornata_il: new Date().toISOString(), aggiornata_da: user?.id ?? null })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data as CronoEvento;
    },
    // Muovere una data di cantiere muove le timeline agganciate: si invalida
    // tutto, non solo il cronoprogramma.
    onSuccess: () => qc.invalidateQueries(),
  });
}

// ── L'aggancio ────────────────────────────────────────────────────────────
/**
 * Aggancia le certificazioni al cronoprogramma.
 *
 * Di default tutte quelle del sito che ne hanno bisogno: agganciarsi e' il
 * percorso normale, non un'opzione. E' il passaggio che impedisce alle date
 * discordanti di riprodursi — se creare fosse piu' comodo che agganciare, i
 * tredici siti con date in conflitto si ripresenterebbero in una tabella nuova.
 */
export function useAttachCronoprogramma() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { cronoprogramma_id: string; certification_ids: string[] }) => {
      const { error } = await (supabase as any)
        .from("certifications")
        .update({ cronoprogramma_id: input.cronoprogramma_id })
        .in("id", input.certification_ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}

// ── Le domande a cui risponde il database ─────────────────────────────────
export function useCertGate(certId: string | undefined) {
  return useQuery({
    queryKey: ["crono", "gate", certId],
    enabled: !!certId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("fn_cert_gate", {
        p_certification_id: certId,
      });
      if (error) throw error;
      return ((data ?? [])[0] ?? { bloccata: false, motivo: null }) as CertGate;
    },
  });
}

export function useViolazioni(certId: string | undefined) {
  return useQuery({
    queryKey: ["crono", "violazioni", certId],
    enabled: !!certId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("fn_cert_violazioni", {
        p_certification_id: certId,
      });
      if (error) throw error;
      return (data ?? []) as Violazione[];
    },
  });
}

export function useSerieConteggi(certId: string | undefined) {
  return useQuery({
    queryKey: ["crono", "serie-conteggi", certId],
    enabled: !!certId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("fn_serie_conteggi", {
        p_certification_id: certId,
      });
      if (error) throw error;
      return (data ?? []) as SerieConteggi[];
    },
  });
}

/**
 * Cosa succederebbe alla serie con un handover diverso.
 *
 * Non scrive niente: e' il pannello che il PM guarda prima di confermare.
 */
export function useSerieAnteprima(certId: string | undefined, nuovoHandover?: string | null) {
  return useQuery({
    queryKey: ["crono", "serie-anteprima", certId, nuovoHandover ?? "corrente"],
    enabled: !!certId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("fn_serie_anteprima", {
        p_certification_id: certId,
        p_nuovo_handover: nuovoHandover ?? null,
      });
      if (error) throw error;
      return (data ?? []) as SerieAnteprima[];
    },
  });
}

// ── Le milestone ──────────────────────────────────────────────────────────
export function useTimelineMilestones(certId: string | undefined) {
  return useQuery({
    queryKey: ["crono", "milestones", certId],
    enabled: !!certId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("certification_milestones")
        .select("*")
        .eq("certification_id", certId)
        .eq("milestone_type", "timeline")
        .order("order_index")
        .order("series_index");
      if (error) throw error;
      return (data ?? []) as TimelineMilestone[];
    },
  });
}

export function useUpdateMilestoneDate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; due_date: string | null }) => {
      const { error } = await (supabase as any)
        .from("certification_milestones")
        .update({ due_date: input.due_date })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crono"] }),
  });
}

/**
 * Genera la timeline dalla scaletta.
 *
 * La materializzazione e' gia' protetta dal gate lato database: se la
 * certificazione ha bisogno di un cronoprogramma e non ce l'ha, questa
 * chiamata non scrive nulla e restituisce zero.
 */
export function useMaterializeTimeline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (certId: string) => {
      const { data, error } = await (supabase as any).rpc("fn_materialize_timeline", {
        p_certification_id: certId,
      });
      if (error) throw error;
      return (data ?? 0) as number;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crono"] }),
  });
}

// ── Le altre certificazioni sullo stesso sito ─────────────────────────────
/**
 * Lettura ampia, scrittura stretta: il PM vede le timeline dei colleghi che
 * insistono sullo stesso cantiere, e non le tocca.
 *
 * Non e' cortesia. Due certificazioni sullo stesso sito si contendono le
 * stesse finestre di accesso: vedere quando la collega ha in programma la sua
 * campagna di misura evita conflitti che altrimenti emergono in cantiere.
 */
export interface CertSulSito {
  id: string;
  name: string | null;
  cert_type: string;
  cert_rating: string | null;
  project_subtype: string | null;
  pm_id: string | null;
  pm_nome: string | null;
  cronoprogramma_id: string | null;
  handover_date: string | null;
  baseline_handover_date: string | null;
  contract_end_date: string | null;
}

export function useCertificazioniSulSito(siteId: string | undefined) {
  return useQuery({
    queryKey: ["crono", "cert-sito", siteId],
    enabled: !!siteId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("certifications")
        .select(
          "id, name, cert_type, cert_rating, project_subtype, pm_id, cronoprogramma_id, handover_date, baseline_handover_date, contract_end_date"
        )
        .eq("site_id", siteId)
        .not("status", "in", '("canceled","cancelled")');
      if (error) throw error;

      const righe = (data ?? []) as CertSulSito[];
      const pmIds = Array.from(new Set(righe.map((r) => r.pm_id).filter(Boolean))) as string[];
      if (pmIds.length === 0) return righe;

      const { data: profili } = await (supabase as any)
        .from("profiles")
        .select("id, full_name, email")
        .in("id", pmIds);
      const nome = new Map<string, string>(
        ((profili ?? []) as any[]).map((p) => [p.id as string, (p.full_name || p.email) as string])
      );
      return righe.map((r) => ({ ...r, pm_nome: r.pm_id ? nome.get(r.pm_id) ?? null : null }));
    },
  });
}

// ── La cascata ────────────────────────────────────────────────────────────
export interface CascataRiga {
  milestone_id: string;
  order_index: number;
  requirement: string;
  natura: string;
  data_vecchia: string | null;
  data_nuova: string;
  giorni: number;
}

export interface CascataVerdetto {
  fine_stimata: string | null;
  scadenza_contratto: string | null;
  giorni_oltre: number | null;
  a_rischio: boolean;
  baseline: string | null;
  scostamento_baseline: number | null;
  report_contrattuali: number | null;
  report_proiettati: number | null;
}

/**
 * Cosa si sposterebbe. Non scrive: e' l'anteprima del §8.1 punto 3.
 *
 * Serve a rispondere in dieci secondi alla domanda che il PM riceve al
 * telefono — "il GC dice che la consegna slitta di due mesi, cosa succede a
 * noi?" — invece che in un pomeriggio su Excel.
 */
export function useCascataAnteprima(certId: string | undefined, nuovaData: string | null) {
  return useQuery({
    queryKey: ["crono", "cascata", certId, nuovaData],
    enabled: !!certId && !!nuovaData,
    queryFn: async () => {
      const [righe, verdetto] = await Promise.all([
        (supabase as any).rpc("fn_cascata_anteprima", {
          p_certification_id: certId,
          p_nuova_data: nuovaData,
        }),
        (supabase as any).rpc("fn_cascata_verdetto", {
          p_certification_id: certId,
          p_nuova_data: nuovaData,
        }),
      ]);
      if (righe.error) throw righe.error;
      if (verdetto.error) throw verdetto.error;
      return {
        righe: (righe.data ?? []) as CascataRiga[],
        verdetto: ((verdetto.data ?? [])[0] ?? null) as CascataVerdetto | null,
      };
    },
  });
}

export interface ConfermaInSospeso {
  proposta_id: string;
  certification_id: string;
  certificazione: string | null;
  sito: string | null;
  pm_id: string | null;
  ancora: string;
  data_precedente: string | null;
  data_nuova: string;
  fonte: string;
  proposta_il: string;
  milestone_da_spostare: number;
}

/**
 * La coda delle conferme.
 *
 * Non esiste una tabella di notifiche: la proposta in sospeso *e'* la
 * notifica. Un elenco parallelo di avvisi sarebbe una seconda copia dello
 * stesso fatto, e le due copie divergono al primo errore di scrittura.
 */
export function useConfermeInSospeso(soloMie = true) {
  return useQuery({
    queryKey: ["crono", "conferme", soloMie],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("fn_conferme_in_sospeso", {
        p_solo_mie: soloMie,
      });
      if (error) throw error;
      return (data ?? []) as ConfermaInSospeso[];
    },
  });
}

export function useConfermaCascata() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (propostaId: string) => {
      const { data, error } = await (supabase as any).rpc("fn_conferma_cascata", {
        p_proposta_id: propostaId,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}

/**
 * Applica il nuovo valore all'evento e conferma subito le proposte proprie.
 *
 * Le due cose sono un gesto solo per chi fa la modifica: ha appena visto
 * l'anteprima e ha deciso. Per gli altri PM restano due gesti separati, ed e'
 * il punto: PM-A non muove le milestone di PM-B.
 */
export function useApplicaSpostamento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      evento_id: string;
      data: string;
      fonte: string;
      certification_ids_proprie: string[];
    }) => {
      const user = (await supabase.auth.getUser()).data.user;
      const { error } = await (supabase as any)
        .from("cronoprogramma_eventi")
        .update({
          data_pianificata: input.data,
          fonte: input.fonte,
          stato: "inserita",
          aggiornata_il: new Date().toISOString(),
          aggiornata_da: user?.id ?? null,
        })
        .eq("id", input.evento_id);
      if (error) throw error;

      const { data: proposte } = await (supabase as any)
        .from("cronoprogramma_proposte")
        .select("id, certification_id")
        .eq("stato", "in_sospeso")
        .in("certification_id", input.certification_ids_proprie);

      let confermate = 0;
      for (const p of (proposte ?? []) as any[]) {
        const { error: e } = await (supabase as any).rpc("fn_conferma_cascata", {
          p_proposta_id: p.id,
        });
        if (!e) confermate += 1;
      }
      return confermate;
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}

// ── Il registro ───────────────────────────────────────────────────────────
export function useRegistro(cronoId: string | undefined) {
  return useQuery({
    queryKey: ["crono", "registro", cronoId],
    enabled: !!cronoId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("cronoprogramma_registro")
        .select("*")
        .eq("cronoprogramma_id", cronoId)
        .order("quando", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CronoRegistroVoce[];
    },
  });
}

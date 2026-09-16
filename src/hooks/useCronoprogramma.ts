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
 * Crea la PROJECT TIMELINE del sito dal template del tipo scelto — v1.1 §3.
 *
 * Le righe nascono dal template (il PM le ha gia' riviste nel dialogo di
 * creazione: aggiunte, tolte, rinominate) oppure, in assenza, dalle otto
 * ancore canoniche. Un elenco completo dice al PM quali date il sistema si
 * aspetta; una tabella vuota lo lascerebbe indovinare.
 *
 * L'handover arriva precompilato dalla quotazione, quindi la timeline nasce
 * sempre con almeno una data vera e il gate non blocca mai nessuno.
 */
export function useCreateCronoprogramma() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      site_id: string;
      nome?: string | null;
      tipo?: "design_construction" | "construction";
      handoverContrattuale?: string | null;
      righeTemplate?: Array<{
        nome: string;
        fase: boolean;
        famiglia: string | null;
        ancora: string | null;
        /** L'ossatura puo' arrivare gia' con qualche data: e' il primo salvataggio. */
        data_pianificata?: string | null;
        data_fine?: string | null;
        fonte?: string | null;
      }>;
    }) => {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("Non autenticato");

      const { data: crono, error } = await (supabase as any)
        .from("cronoprogrammi")
        .insert({
          site_id: input.site_id,
          nome: input.nome ?? null,
          tipo: input.tipo ?? "design_construction",
          created_by: user.id,
        })
        .select("*")
        .single();
      if (error) throw error;

      // ESSERE ESPLICITI QUI E' IL PUNTO.
      //
      // Prima, senza `righeTemplate`, questa funzione seminava le otto ancore
      // canoniche come righe: «Lancio gara d'appalto», «Involucro chiuso»,
      // «Sito pronto per test». Sono i nomi dell'enum, non le fasi di un
      // cantiere, e comparivano su qualunque sito — anche su uno che una gara
      // d'appalto non l'ha mai avuta. E' l'origine delle «voci a caso»: non
      // stavano nell'interfaccia, stavano nel database, seminate alla
      // creazione. Le due timeline che esistono oggi nascono cosi'.
      //
      // Adesso non c'e' ripiego: chi crea una timeline dice quali righe ci
      // vanno, oppure ne crea una vuota. Un default che inventa dodici righe
      // di cantiere e' peggio di nessun default.
      const base = input.righeTemplate ?? [];

      const righe = base.map((r, i) => {
        const isHandover = r.ancora === "handover";
        // Vince cio' che il PM ha gia' scritto sull'ossatura; l'handover, se
        // non l'ha toccato, arriva dalla Quotation come baseline.
        const data =
          (r as any).data_pianificata ?? (isHandover ? input.handoverContrattuale ?? null : null);
        const fonte =
          (r as any).fonte ?? (isHandover && data ? "Quotation" : null);
        return {
          cronoprogramma_id: crono.id,
          ancora: r.ancora,
          nome: r.nome,
          famiglia: r.famiglia,
          ordine: i + 1,
          data_pianificata: data,
          data_fine: (r as any).data_fine ?? null,
          fonte,
          stato: data ? "inserita" : "da_confermare",
        };
      });

      if (righe.length > 0) {
        const { error: e2 } = await (supabase as any).from("cronoprogramma_eventi").insert(righe);
        if (e2) throw e2;
      }

      return crono as Cronoprogramma;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crono"] }),
  });
}

/** L'override del tipo di progetto sulla certificazione — v1.1 §2. */
export function useSetProjectTipo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { certification_id: string; project_tipo: string | null }) => {
      const { error } = await (supabase as any)
        .from("certifications")
        .update({ project_tipo: input.project_tipo })
        .eq("id", input.certification_id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crono"] }),
  });
}

/** Una riga nuova, in coda. Le righe libere non hanno ancora ne' proposta. */
export function useAggiungiEvento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      cronoprogramma_id: string;
      nome: string;
      ancora?: string | null;
      famiglia?: string | null;
      data_pianificata?: string | null;
      data_fine?: string | null;
      fonte?: string | null;
      ordine: number;
    }) => {
      const user = (await supabase.auth.getUser()).data.user;
      const { data, error } = await (supabase as any)
        .from("cronoprogramma_eventi")
        .insert({
          ...input,
          stato: input.data_pianificata ? "inserita" : "da_confermare",
          aggiornata_il: new Date().toISOString(),
          aggiornata_da: user?.id ?? null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as CronoEvento;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crono"] }),
  });
}

export function useEliminaEvento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("cronoprogramma_eventi").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crono"] }),
  });
}

/**
 * L'import conferma dal PM — v1.1 §5.1 punto 5.
 *
 * Integrazione per evento, mai per sostituzione: le righe che combaciano con
 * un evento esistente ne aggiornano le date, le altre si aggiungono in coda.
 * Nessun azzeramento — un file del GC che non contiene gara e progetto non
 * deve cancellarli.
 */
export function useImportaEventi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      cronoprogramma_id: string;
      fonte: string;
      righe: Array<{
        /** L'evento esistente da aggiornare; null = riga nuova. */
        evento_id: string | null;
        nome: string;
        ancora: string | null;
        inizio: string | null;
        fine: string | null;
      }>;
      ordineDa: number;
    }) => {
      const user = (await supabase.auth.getUser()).data.user;
      const adesso = new Date().toISOString();
      let ordine = input.ordineDa;
      let aggiornate = 0;
      let nuove = 0;

      for (const r of input.righe) {
        if (r.evento_id) {
          const { error } = await (supabase as any)
            .from("cronoprogramma_eventi")
            .update({
              data_pianificata: r.inizio,
              data_fine: r.fine,
              fonte: input.fonte,
              stato: r.inizio ? "inserita" : "da_confermare",
              aggiornata_il: adesso,
              aggiornata_da: user?.id ?? null,
            })
            .eq("id", r.evento_id);
          if (error) throw error;
          aggiornate += 1;
        } else {
          ordine += 1;
          const { error } = await (supabase as any).from("cronoprogramma_eventi").insert({
            cronoprogramma_id: input.cronoprogramma_id,
            nome: r.nome,
            ancora: r.ancora,
            data_pianificata: r.inizio,
            data_fine: r.fine,
            fonte: input.fonte,
            stato: r.inizio ? "inserita" : "da_confermare",
            ordine,
            aggiornata_il: adesso,
            aggiornata_da: user?.id ?? null,
          });
          if (error) throw error;
          nuove += 1;
        }
      }
      return { aggiornate, nuove };
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useUpsertEvento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      nome?: string;
      data_pianificata?: string | null;
      data_fine?: string | null;
      data_effettiva?: string | null;
      famiglia?: string | null;
      ancora?: string | null;
      fonte?: string | null;
      stato?: string;
      avanzamento?: number;
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

/**
 * I vincoli di precedenza dichiarati sulla scaletta (v1.3 §5): servono alla
 * colonna «Ancorato a» per dire al PM «prima di: Lancio gara» anche quando il
 * vincolo non e' (ancora) violato.
 */
export interface VincoloRisolto {
  order_index: number;
  operatore: "prima_di" | "dopo_di";
  evento_id: string;
  evento_nome: string;
  evento_data: string | null;
  messaggio: string | null;
}

/**
 * I vincoli di precedenza, risolti sulle righe vere del sito.
 *
 * Prima si leggevano dal catalogo e si mostravano col nome dell'ancora
 * canonica — «prima di: Lancio gara d'appalto» — anche quando nella project
 * timeline quella riga non esisteva, perche' il PM aveva importato il gantt
 * del GC. Un vincolo senza bersaglio non ha niente da dire, e ora tace.
 */
export function useVincoliRisolti(certId: string | undefined) {
  return useQuery({
    queryKey: ["crono", "vincoli-risolti", certId],
    enabled: !!certId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("fn_cert_vincoli_risolti", {
        p_certification_id: certId,
      });
      if (error) throw error;
      return (data ?? []) as VincoloRisolto[];
    },
  });
}

/** Aggancia una riga della project timeline a una precedente dello stesso sito. */
export function useAncoraRiga() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      evento_id: string;
      cronoprogramma_id: string;
      ancora_evento_id: string | null;
      offset_giorni: number | null;
    }) => {
      const user = (await supabase.auth.getUser()).data.user;
      const { error } = await (supabase as any)
        .from("cronoprogramma_eventi")
        .update({
          ancora_evento_id: input.ancora_evento_id,
          offset_giorni: input.ancora_evento_id ? input.offset_giorni ?? 0 : null,
          aggiornata_il: new Date().toISOString(),
          aggiornata_da: user?.id ?? null,
        })
        .eq("id", input.evento_id);
      if (error) throw error;

      // Il ricalcolo e' del database: e' li' che vive la catena, ed e' li'
      // che si evitano i cicli.
      const { error: e2 } = await (supabase as any).rpc("fn_crono_ricalcola", {
        p_cronoprogramma_id: input.cronoprogramma_id,
      });
      if (e2) throw e2;
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}

/**
 * Aggancia un passo a una riga della project timeline — flusso v2 §3.2.
 *
 * Il motore legge `crono_evento_id` e `offset_days` dalla milestone stessa,
 * quindi basta scriverli li' e fargli ricalcolare: nessun secondo motore.
 * `evento_id = null` significa sganciare — la data resta dov'e' e diventa
 * manuale, come un'attivita' a pianificazione manuale in MS Project.
 *
 * La modifica finisce nel registro col nome del passo: cio' che sposta una
 * data lascia traccia, sempre.
 */
export function useCambiaAncoraggio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      milestone_id: string;
      certification_id: string;
      requirement: string;
      /** La riga di progetto a cui agganciare. NULL se si aggancia a un passo, o se si sgancia. */
      evento_id: string | null;
      /** Il passo precedente della stessa scaletta (order_index). Alternativo a evento_id. */
      anchor_order?: number | null;
      offset_days: number | null;
      /** Alla sgancio: la data da congelare come manuale. */
      data_da_congelare?: string | null;
      data_precedente: string | null;
      cronoprogramma_id: string | null;
      nota: string;
    }) => {
      const user = (await supabase.auth.getUser()).data.user;
      // Tre casi, mutuamente esclusivi: agganciato a una riga di progetto,
      // agganciato a un passo precedente della stessa scaletta, oppure
      // sganciato. Tenerne due insieme darebbe al motore due sorgenti per la
      // stessa data.
      const agganciato = !!input.evento_id || input.anchor_order != null;
      const campi: Record<string, unknown> = {
        crono_evento_id: input.evento_id,
        anchor_order: input.evento_id ? null : input.anchor_order ?? null,
        offset_days: agganciato ? input.offset_days ?? 0 : null,
      };
      if (!agganciato) {
        // Sganciato: niente piu' ancore di nessun tipo, e la data resta la
        // sua. Senza azzerare anchor_order il motore la riprenderebbe.
        campi.derived_from = null;
        campi.edit_locked_for_pm = false;
        if (input.data_da_congelare) campi.due_date = input.data_da_congelare;
      }
      const { error } = await (supabase as any)
        .from("certification_milestones")
        .update(campi)
        .eq("id", input.milestone_id);
      if (error) throw error;

      const { error: e2 } = await (supabase as any).rpc("fn_refresh_timeline_dates", {
        p_certification_id: input.certification_id,
      });
      if (e2) throw e2;

      const { data: dopo } = await (supabase as any)
        .from("certification_milestones")
        .select("due_date")
        .eq("id", input.milestone_id)
        .single();

      if (input.cronoprogramma_id && user) {
        await (supabase as any).from("cronoprogramma_registro").insert({
          cronoprogramma_id: input.cronoprogramma_id,
          evento_id: null,
          evento_nome: input.requirement,
          chi: user.id,
          data_precedente: input.data_precedente,
          data_nuova: dopo?.due_date ?? null,
          fonte: null,
          scostamento_giorni:
            input.data_precedente && dopo?.due_date
              ? Math.round(
                  (new Date(dopo.due_date).getTime() - new Date(input.data_precedente).getTime()) / 86400000
                )
              : null,
          note: input.nota,
        });
      }
      return dopo?.due_date ?? null;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crono"] }),
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
 * L'avanzamento di un passo di certificazione.
 *
 * Si scrive solo `avanzamento`: `status` e `completed_date` li deriva il
 * trigger. Scriverli anche da qui sarebbe il modo piu' rapido per farli
 * divergere.
 */
export function useAvanzamentoMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; avanzamento: number }) => {
      const { error } = await (supabase as any)
        .from("certification_milestones")
        .update({ avanzamento: Math.max(0, Math.min(100, Math.round(input.avanzamento))) })
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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { proponiTipo } from "@/lib/projectTimelineTemplates";
import type { AttivitaProgetto, PassoServizio, PuntoAncora } from "@/lib/timelineDerivazione";

/**
 * Il ponte fra lo schema reale e il modello della SPECIFICA_TIMELINE §5.
 *
 * La spec descrive `ProjectActivity` e `CertStep`; nel database si chiamano
 * `cronoprogramma_eventi` e `certification_milestones`, e portano dietro
 * vent'anni di colonne che alla vista non servono. Qui si traduce una volta
 * sola, in un posto solo — così le card e il pannello parlano il linguaggio
 * della spec e non devono sapere che `data_pianificata` è l'inizio.
 *
 * La traduzione non è cosmetica: è il punto in cui si decide COSA la vista
 * può toccare. Tutto quello che non passa di qui, la vista non lo vede e non
 * lo può rompere.
 */

// ── Lettura ───────────────────────────────────────────────────────────────

export interface DatiVista {
  certId: string;
  siteId: string | null;
  cronoprogrammaId: string | null;
  nomeSito: string | null;
  nomeServizio: string | null;
  servizioPerTinta: string | null;
  attivita: AttivitaProgetto[];
  passi: PassoServizio[];
  modificabile: boolean;
  /** La data contrattuale: il wizard di import la mostra e non la tocca. */
  handoverBaseline: string | null;
  tipoProgetto: "design_construction" | "construction";
}

export function useTimelineVista(certId: string | undefined) {
  return useQuery({
    queryKey: ["timeline-vista", certId],
    enabled: !!certId,
    queryFn: async (): Promise<DatiVista> => {
      const utente = (await supabase.auth.getUser()).data.user;

      const { data: cert, error: e1 } = await (supabase as any)
        .from("certifications")
        .select(
          "id, name, cert_type, cert_rating, site_id, pm_id, cronoprogramma_id, handover_date, baseline_handover_date, sites(name, city)"
        )
        .eq("id", certId)
        .single();
      if (e1) throw e1;

      const cronoId: string | null = cert.cronoprogramma_id ?? null;

      // Le attività del sito e le loro dipendenze, in due letture: la tabella
      // ponte non si può annidare nella select perché la vista ha bisogno
      // degli id nudi, non degli oggetti.
      const [eventiRes, dipRes, msRes] = await Promise.all([
        cronoId
          ? (supabase as any)
              .from("cronoprogramma_eventi")
              .select("id, nome, ordine, data_pianificata, data_fine, data_effettiva, ancora")
              .eq("cronoprogramma_id", cronoId)
              .order("ordine")
          : Promise.resolve({ data: [], error: null }),
        cronoId
          ? (supabase as any).from("crono_dipendenze").select("evento_id, dipende_da_id")
          : Promise.resolve({ data: [], error: null }),
        (supabase as any)
          .from("certification_milestones")
          .select(
            "id, requirement, order_index, due_date, override_date, avanzamento, crono_evento_id, anchor_point, offset_days, not_applicable, optional, edit_locked_for_pm, derived_from, series_step_order"
          )
          .eq("certification_id", certId)
          .eq("milestone_type", "timeline")
          .order("order_index"),
      ]);

      if (eventiRes.error) throw eventiRes.error;
      if (dipRes.error) throw dipRes.error;
      if (msRes.error) throw msRes.error;

      const madri = new Map<string, string[]>();
      for (const d of dipRes.data ?? []) {
        const lista = madri.get(d.evento_id) ?? [];
        lista.push(d.dipende_da_id);
        madri.set(d.evento_id, lista);
      }

      const attivita: AttivitaProgetto[] = (eventiRes.data ?? []).map((e: any) => ({
        id: e.id,
        nome: e.nome,
        // L'effettiva vince sulla pianificata: quando il fatto c'è, è quello
        // che si disegna.
        inizio: e.data_effettiva ?? e.data_pianificata ?? null,
        fine: e.data_fine ?? null,
        ordine: e.ordine,
        dipendeDa: madri.get(e.id) ?? [],
      }));

      const passi: PassoServizio[] = (msRes.data ?? [])
        // La serie ricorrente (report mensili) non è un passo della scaletta:
        // ha una riga per occorrenza e va mostrata altrove. Fuori scope §12.
        .filter((m: any) => m.series_step_order === null && !m.not_applicable)
        .map((m: any) => ({
          id: m.id,
          nome: m.requirement,
          ordine: m.order_index ?? 0,
          ancora: m.crono_evento_id
            ? {
                attivitaId: m.crono_evento_id,
                punto: (m.anchor_point ?? "end") as PuntoAncora,
                offsetGiorni: m.offset_days ?? 0,
              }
            : null,
          // Senza ancora, la `due_date` calcolata dalla catena interna è di
          // fatto il valore corrente: la vista la tratta come forzata, perché
          // è l'unica cosa che può mostrare e modificare.
          dataForzata: m.override_date ?? (m.crono_evento_id ? null : m.due_date ?? null),
          avanzamento: m.avanzamento ?? 0,
        }));

      const admin = !!utente && (await isAdmin(utente.id));

      return {
        certId: cert.id,
        siteId: cert.site_id ?? null,
        cronoprogrammaId: cronoId,
        nomeSito: cert.sites?.name ?? null,
        nomeServizio: cert.name ?? null,
        servizioPerTinta: `${cert.cert_type ?? ""} ${cert.cert_rating ?? ""} ${cert.name ?? ""}`,
        attivita,
        passi,
        modificabile: admin || cert.pm_id === utente?.id,
        handoverBaseline: cert.baseline_handover_date ?? cert.handover_date ?? null,
        tipoProgetto: proponiTipo(cert.cert_type, cert.cert_rating).tipo === "construction"
          ? "construction"
          : "design_construction",
      };
    },
  });
}

async function isAdmin(userId: string): Promise<boolean> {
  const { data } = await (supabase as any).from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).some((r: { role: string }) => r.role === "ADMIN" || r.role === "admin");
}

// ── Scrittura ─────────────────────────────────────────────────────────────

export type StatoSalvataggio = "fermo" | "salvataggio" | "salvato" | "errore";

export function useScritture(certId: string | undefined) {
  const qc = useQueryClient();
  const invalida = () => {
    qc.invalidateQueries({ queryKey: ["timeline-vista", certId] });
    qc.invalidateQueries({ queryKey: ["crono"] });
  };

  /** Le date di un'attività di progetto. */
  const dataAttivita = useMutation({
    mutationFn: async (i: { id: string; inizio?: string | null; fine?: string | null }) => {
      const campi: Record<string, unknown> = {};
      if ("inizio" in i) campi.data_pianificata = i.inizio;
      if ("fine" in i) campi.data_fine = i.fine;
      const { error } = await (supabase as any)
        .from("cronoprogramma_eventi")
        .update({ ...campi, aggiornata_il: new Date().toISOString() })
        .eq("id", i.id);
      if (error) throw error;
    },
    onSuccess: invalida,
  });

  /**
   * Le dipendenze: si riscrive l'insieme, non si fanno differenze.
   *
   * Un insieme di tre righe è piccolo e riscriverlo è un'operazione sola;
   * calcolare quali aggiungere e quali togliere sarebbe più codice e due
   * round-trip per risparmiare niente.
   */
  const dipendenze = useMutation({
    mutationFn: async (i: { eventoId: string; madri: string[] }) => {
      const { error: e1 } = await (supabase as any)
        .from("crono_dipendenze")
        .delete()
        .eq("evento_id", i.eventoId);
      if (e1) throw e1;

      if (i.madri.length > 0) {
        const utente = (await supabase.auth.getUser()).data.user;
        const { error: e2 } = await (supabase as any).from("crono_dipendenze").insert(
          i.madri.map((m) => ({
            evento_id: i.eventoId,
            dipende_da_id: m,
            creata_da: utente?.id ?? null,
          }))
        );
        if (e2) throw e2;
      }
    },
    onSuccess: invalida,
  });

  /**
   * L'override di un passo. `null` lo toglie e il passo torna al calcolo —
   * è il gesto del `↺` della spec §4.2.
   */
  const dataPasso = useMutation({
    mutationFn: async (i: { id: string; data: string | null }) => {
      const { error } = await (supabase as any)
        .from("certification_milestones")
        .update({ override_date: i.data })
        .eq("id", i.id);
      if (error) throw error;

      // Il ricalcolo riallinea `due_date`, che è la copia che leggono i
      // trigger pagamenti e le viste storiche.
      if (certId) await (supabase as any).rpc("fn_refresh_timeline_dates", { p_certification_id: certId });
    },
    onSuccess: invalida,
  });

  const avanzamentoPasso = useMutation({
    mutationFn: async (i: { id: string; pct: number }) => {
      const { error } = await (supabase as any)
        .from("certification_milestones")
        .update({ avanzamento: Math.max(0, Math.min(100, Math.round(i.pct))) })
        .eq("id", i.id);
      if (error) throw error;
    },
    onSuccess: invalida,
  });

  const inCorso =
    dataAttivita.isPending || dipendenze.isPending || dataPasso.isPending || avanzamentoPasso.isPending;
  const fallito =
    dataAttivita.isError || dipendenze.isError || dataPasso.isError || avanzamentoPasso.isError;

  return { dataAttivita, dipendenze, dataPasso, avanzamentoPasso, inCorso, fallito };
}

/**
 * Lo stato di salvataggio della barra in alto (spec §4.3).
 *
 * Non è un booleano: «Tutto salvato» deve restare scritto anche quando non
 * sta succedendo niente, altrimenti la barra lampeggia a ogni tasto e il PM
 * non sa mai se il suo lavoro è al sicuro. Quindi tre stati e un ritardo
 * prima di tornare a riposo.
 */
export function useStatoSalvataggio(inCorso: boolean, fallito: boolean): StatoSalvataggio {
  const [stato, setStato] = useState<StatoSalvataggio>("fermo");
  const eraInCorso = useRef(false);

  useEffect(() => {
    if (fallito) {
      setStato("errore");
      return;
    }
    if (inCorso) {
      eraInCorso.current = true;
      setStato("salvataggio");
      return;
    }
    if (eraInCorso.current) {
      setStato("salvato");
      const t = setTimeout(() => setStato("fermo"), 2600);
      return () => clearTimeout(t);
    }
  }, [inCorso, fallito]);

  return stato;
}

/**
 * Autosave per campo, con attesa.
 *
 * Il debounce è per CAMPO e non globale: due campi diversi toccati nello
 * stesso secondo devono salvare entrambi, non l'ultimo. Un timer per chiave
 * costa niente e toglie di mezzo la classe di bug in cui una modifica sparisce
 * perché ne è arrivata un'altra altrove.
 */
export function useAutosave(attesaMs = 700) {
  const timer = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const programma = useCallback(
    (chiave: string, azione: () => void) => {
      const esistente = timer.current.get(chiave);
      if (esistente) clearTimeout(esistente);
      timer.current.set(
        chiave,
        setTimeout(() => {
          timer.current.delete(chiave);
          azione();
        }, attesaMs)
      );
    },
    [attesaMs]
  );

  /** «Salva e chiudi» non aspetta: quello che è in attesa parte subito. */
  const svuota = useCallback(() => {
    for (const [, t] of timer.current) clearTimeout(t);
    timer.current.clear();
  }, []);

  useEffect(() => () => svuota(), [svuota]);

  return { programma, svuota, inAttesa: () => timer.current.size > 0 };
}

/** Le opzioni del menu «dipende da», già pronte e senza se stessa. */
export function useMadriPossibili(attivita: AttivitaProgetto[]) {
  return useMemo(
    () => (id: string) => attivita.filter((a) => a.id !== id),
    [attivita]
  );
}

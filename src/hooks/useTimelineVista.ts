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
  /** I passi vengono dal catalogo: esistono, ma non sono ancora righe salvate. */
  passiDaCatalogo: boolean;
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

      /**
       * I passi del servizio ci sono SEMPRE.
       *
       * Prima comparivano solo dopo che qualcuno premeva «genera»: fino a
       * quel momento la card era vuota, e il PM non aveva modo di sapere
       * quali fossero i passi della sua certificazione. Peggio, il pulsante
       * poteva non funzionare — la materializzazione ha un gate che la ferma
       * finché il sito non ha una project timeline — e allora restava una
       * card muta senza spiegazione.
       *
       * Adesso, quando non c'è ancora niente di salvato, si leggono i passi
       * dal CATALOGO: la scaletta di LEED ID+C, di WELL Core, quella che
       * corrisponde al servizio. Sono già lì, pronti, con le loro date vuote
       * da compilare. Diventano righe vere del database alla prima cosa che
       * il PM ci scrive — non prima, perché finché non le tocca non c'è
       * niente da salvare.
       */
      const materializzati = (msRes.data ?? []).length > 0;

      let daCatalogo: PassoServizio[] = [];
      if (!materializzati) {
        const { data: chiave } = await (supabase as any).rpc("fn_timeline_key_for_cert", {
          p_certification_id: certId,
        });
        if (chiave) {
          const { data: scaletta } = await (supabase as any)
            .from("cert_timeline_steps")
            .select("order_index, requirement, timing_kind, anchor_order, offset_days, optional")
            .eq("timeline_key", chiave)
            .order("order_index");

          daCatalogo = ((scaletta ?? []) as any[]).map((s) => ({
            // L'id porta il prefisso: chi lo riceve deve poter capire che
            // questa riga nel database non esiste ancora.
            id: `catalogo:${s.order_index}`,
            nome: s.requirement,
            ordine: s.order_index ?? 0,
            ancora: null,
            dataForzata: null,
            avanzamento: 0,
          }));
        }
      }

      const passi: PassoServizio[] = materializzati
        ? (msRes.data ?? [])
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
        }))
        : daCatalogo;

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
        passiDaCatalogo: !materializzati && daCatalogo.length > 0,
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

/**
 * Applica un import rivisto.
 *
 * Due regole scritte nell'ordine delle operazioni, non nei commenti:
 *
 *  1. si AGGIORNANO solo le date, mai il nome, mai le dipendenze, mai le date
 *     forzate sui passi. L'import porta quello che il file sa — le date — e
 *     lascia intatto quello che il file non sa (§4.2, non distruttivo);
 *  2. le righe nuove si aggiungono in coda. Se la timeline del sito non
 *     esiste ancora, nasce qui e ci si agganciano le certificazioni: è una
 *     delle due strade di creazione previste.
 */
export function useApplicaImport(certId: string | undefined) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      cronoprogrammaId: string | null;
      siteId: string | null;
      nomeSito: string | null;
      aggiornamenti: Array<{ attivitaId: string; inizio: string | null; fine: string | null }>;
      nuove: Array<{ nome: string; inizio: string | null; fine: string | null }>;
    }) => {
      const utente = (await supabase.auth.getUser()).data.user;
      let cronoId = input.cronoprogrammaId;

      if (!cronoId) {
        if (!input.siteId) throw new Error("Il sito non è noto: non posso creare la timeline.");
        const { data: creato, error } = await (supabase as any)
          .from("cronoprogrammi")
          .insert({ site_id: input.siteId, nome: input.nomeSito, created_by: utente?.id })
          .select("id")
          .single();
        if (error) throw error;
        cronoId = creato.id as string;

        if (certId) {
          await (supabase as any)
            .from("certifications")
            .update({ cronoprogramma_id: cronoId })
            .eq("id", certId);
        }
      }

      for (const a of input.aggiornamenti) {
        const { error } = await (supabase as any)
          .from("cronoprogramma_eventi")
          .update({
            data_pianificata: a.inizio,
            data_fine: a.fine,
            aggiornata_il: new Date().toISOString(),
            aggiornata_da: utente?.id ?? null,
          })
          .eq("id", a.attivitaId);
        if (error) throw error;
      }

      if (input.nuove.length > 0) {
        const { data: ultime } = await (supabase as any)
          .from("cronoprogramma_eventi")
          .select("ordine")
          .eq("cronoprogramma_id", cronoId)
          .order("ordine", { ascending: false })
          .limit(1);
        const da = (ultime?.[0]?.ordine as number | undefined) ?? 0;

        const { error } = await (supabase as any).from("cronoprogramma_eventi").insert(
          input.nuove.map((n, i) => ({
            cronoprogramma_id: cronoId,
            nome: n.nome,
            ordine: da + i + 1,
            data_pianificata: n.inizio,
            data_fine: n.fine,
            stato: n.inizio ? "inserita" : "da_confermare",
          }))
        );
        if (error) throw error;
      }

      return {
        aggiornate: input.aggiornamenti.length,
        create: input.nuove.length,
      };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timeline-vista", certId] });
      qc.invalidateQueries({ queryKey: ["crono"] });
    },
  });
}

// ── Righe aggiunte a mano ─────────────────────────────────────────────────

/**
 * Aggiungere, rinominare ed eliminare a mano.
 *
 * Erano sparite quando la vista è stata riscritta, e l'assenza non era una
 * semplificazione: senza, l'unico modo di avere una timeline era caricare un
 * file. Un cantiere che il gantt non ce l'ha ancora — o che ne ha uno che
 * copre metà delle fasi — restava senza niente. L'import è un acceleratore:
 * quando diventa l'unica strada, chi non ha il file è fuori.
 */
export function useRigheManuali(certId: string | undefined) {
  const qc = useQueryClient();
  const invalida = () => {
    qc.invalidateQueries({ queryKey: ["timeline-vista", certId] });
    qc.invalidateQueries({ queryKey: ["crono"] });
  };

  /** Una nuova attività di progetto, in coda. */
  const aggiungiAttivita = useMutation({
    mutationFn: async (i: { cronoprogrammaId: string; nome: string }) => {
      const { data: ultime } = await (supabase as any)
        .from("cronoprogramma_eventi")
        .select("ordine")
        .eq("cronoprogramma_id", i.cronoprogrammaId)
        .order("ordine", { ascending: false })
        .limit(1);

      const { data, error } = await (supabase as any)
        .from("cronoprogramma_eventi")
        .insert({
          cronoprogramma_id: i.cronoprogrammaId,
          nome: i.nome,
          ordine: ((ultime?.[0]?.ordine as number | undefined) ?? 0) + 1,
          stato: "da_confermare",
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: invalida,
  });

  const rinominaAttivita = useMutation({
    mutationFn: async (i: { id: string; nome: string }) => {
      const { error } = await (supabase as any)
        .from("cronoprogramma_eventi")
        .update({ nome: i.nome, aggiornata_il: new Date().toISOString() })
        .eq("id", i.id);
      if (error) throw error;
    },
    onSuccess: invalida,
  });

  const eliminaAttivita = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("cronoprogramma_eventi")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalida,
  });

  /**
   * Un passo di servizio aggiunto a mano.
   *
   * `order_index` va oltre l'ultimo della scaletta: i passi del catalogo
   * occupano le posizioni basse, e infilarsi in mezzo sposterebbe i
   * riferimenti di chi si ancora a loro per numero.
   */
  const aggiungiPasso = useMutation({
    mutationFn: async (i: { certificationId: string; nome: string }) => {
      const { data: ultimi } = await (supabase as any)
        .from("certification_milestones")
        .select("order_index")
        .eq("certification_id", i.certificationId)
        .eq("milestone_type", "timeline")
        .order("order_index", { ascending: false })
        .limit(1);

      const { data, error } = await (supabase as any)
        .from("certification_milestones")
        .insert({
          certification_id: i.certificationId,
          milestone_type: "timeline",
          category: "Timeline",
          requirement: i.nome,
          order_index: ((ultimi?.[0]?.order_index as number | undefined) ?? 0) + 1,
          status: "pending",
          optional: true,
          edit_locked_for_pm: false,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: invalida,
  });

  const rinominaPasso = useMutation({
    mutationFn: async (i: { id: string; nome: string }) => {
      const { error } = await (supabase as any)
        .from("certification_milestones")
        .update({ requirement: i.nome })
        .eq("id", i.id);
      if (error) throw error;
    },
    onSuccess: invalida,
  });

  const eliminaPasso = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("certification_milestones")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalida,
  });

  return {
    aggiungiAttivita,
    rinominaAttivita,
    eliminaAttivita,
    aggiungiPasso,
    rinominaPasso,
    eliminaPasso,
  };
}

/**
 * Agganciare un passo del servizio a un'attività di progetto.
 *
 * È il gesto che rende la HQ FGB timeline viva invece che una lista di date
 * scritte a mano: «GC closeout, 30 giorni dopo la fine dell'Handover». Da quel
 * momento, se il cantiere slitta, la data del passo si sposta da sola.
 *
 * I tre campi viaggiano insieme perché insieme sono una frase — quale
 * attività, quale estremo, quanti giorni — e scriverne uno senza gli altri
 * lascia un'àncora che punta a qualcosa senza dire cosa leggerne.
 */
export function useAncoraggio(certId: string | undefined) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (i: {
      passoId: string;
      attivitaId: string | null;
      punto: PuntoAncora;
      offsetGiorni: number;
    }) => {
      const { error } = await (supabase as any)
        .from("certification_milestones")
        .update({
          crono_evento_id: i.attivitaId,
          anchor_point: i.attivitaId ? i.punto : null,
          offset_days: i.attivitaId ? i.offsetGiorni : null,
          // Sganciare rimette in gioco il calcolo: se restasse l'override, la
          // data continuerebbe a non seguire niente e sembrerebbe un difetto.
          ...(i.attivitaId ? {} : { override_date: null }),
        })
        .eq("id", i.passoId);
      if (error) throw error;

      // Il ricalcolo lo fa il database: qui si chiede, non si calcola.
      if (certId) {
        await (supabase as any).rpc("fn_refresh_timeline_dates", { p_certification_id: certId });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timeline-vista", certId] });
      qc.invalidateQueries({ queryKey: ["crono"] });
    },
  });
}

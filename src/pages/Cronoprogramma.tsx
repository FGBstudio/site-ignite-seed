import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import {
  AlertTriangle,
  Anchor,
  FileUp,
  Link2,
  Lock,
  NotebookPen,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  ANCORA_NOME,
  FONTI_SUGGERITE,
  NATURA_ETICHETTA,
  naturaPasso,
  type CronoEvento,
  type TimelineMilestone,
} from "@/types/cronoprogramma";
import {
  PROJECT_TIPO_LABEL,
  TEMPLATE_BY_KEY,
  proponiTipo,
  type ProjectTipo,
  type TemplateKey,
} from "@/lib/projectTimelineTemplates";
import {
  useAggiungiEvento,
  useAttachCronoprogramma,
  useCambiaAncoraggio,
  useCertGate,
  useCertificazioniSulSito,
  useCreateCronoprogramma,
  useCronoEventi,
  useCronoprogrammaBySite,
  useEliminaEvento,
  useMaterializeTimeline,
  useSerieConteggi,
  useSetProjectTipo,
  useTimelineMilestones,
  useUpdateMilestoneDate,
  useUpsertEvento,
  useViolazioni,
  useVincoliDichiarati,
} from "@/hooks/useCronoprogramma";
import { useCorsieSito } from "@/hooks/usePortafoglio";
import {
  TimelineVerticale,
  type CorsiaCert,
  type VoceTimeline,
} from "@/components/cronoprogramma/TimelineVerticale";
import { CascataInline, ConfermeInSospeso, Registro } from "@/components/cronoprogramma/Cascata";
import { ImportTimeline } from "@/components/cronoprogramma/ImportTimeline";

const df = (s: string | null | undefined) =>
  s ? format(parseISO(s), "d LLL yy", { locale: it }) : "—";

/** Il ritardo del §8.2: la timeline segue la digitazione senza inseguire ogni tasto. */
function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

type BozzaEvento = { inizio?: string; fine?: string; fonte?: string; nome?: string };

/**
 * PROJECT TIMELINE e HQ FGB TIMELINE — v1.3.
 *
 * La PROJECT TIMELINE e' un record unico per sito: compilata una volta, e'
 * compilata per tutti (§1). Qui la sezione 1 ha quattro stati — caricamento,
 * non creata (due sole azioni: template o import), riepilogo compatto,
 * aperta in modifica — e non mostra mai un form vuoto quando il record esiste.
 * Le tabelle sono compatte e la timeline e' protagonista (§4); la colonna
 * «Ancorato a» rende visibile e governabile il legame coi passi di progetto
 * (§5), con l'evidenziazione bidirezionale.
 */
export default function CronoprogrammaPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();

  const { data: cert } = useQuery({
    queryKey: ["crono", "cert", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("certifications")
        .select("id, name, site_id, cert_type, cert_rating, project_subtype, pm_id, handover_date, baseline_handover_date, contract_end_date, project_tipo, cronoprogramma_id")
        .eq("id", projectId)
        .single();
      if (error) throw error;
      const { data: sito } = await (supabase as any)
        .from("sites").select("id, name, city").eq("id", data.site_id).single();
      return { ...data, sito };
    },
  });

  const siteId = cert?.site_id as string | undefined;
  const cronoQuery = useCronoprogrammaBySite(siteId);
  const crono = cronoQuery.data;
  // Il difetto bloccante della v1.3 §1 stava (anche) qui: mentre la query
  // caricava, la pagina mostrava il blocco di creazione. Mai piu': finche'
  // non si sa, si aspetta.
  const cronoInCaricamento = !!siteId && cronoQuery.isPending;

  const { data: eventi = [] } = useCronoEventi(crono?.id);
  const { data: gate } = useCertGate(projectId);
  const { data: milestones = [] } = useTimelineMilestones(projectId);
  const { data: violazioni = [] } = useViolazioni(projectId);
  const { data: vincoli = [] } = useVincoliDichiarati(projectId);
  const { data: conteggi = [] } = useSerieConteggi(projectId);
  const { data: altreCert = [] } = useCertificazioniSulSito(siteId);
  const { data: corsieSito } = useCorsieSito(siteId, crono?.id ?? null, !!crono);

  const salvaEvento = useUpsertEvento();
  const aggiungiEvento = useAggiungiEvento();
  const eliminaEvento = useEliminaEvento();
  const genera = useMaterializeTimeline();
  const salvaMilestone = useUpdateMilestoneDate();

  const mio = isAdmin || cert?.pm_id === user?.id;

  // ── Bozza locale + stati di interfaccia ─────────────────────────────────
  const [bozzaEventi, setBozzaEventi] = useState<Record<string, BozzaEvento>>({});
  const [bozzaPassi, setBozzaPassi] = useState<Record<string, string>>({});
  const [focus, setFocus] = useState<string | null>(null);
  const [cascataPer, setCascataPer] = useState<string | null>(null);
  const [importAperto, setImportAperto] = useState(false);
  const [tabellaAperta, setTabellaAperta] = useState(false);
  const [hoverPasso, setHoverPasso] = useState<TimelineMilestone | null>(null);
  const [selEvento, setSelEvento] = useState<CronoEvento | null>(null);
  const campiRef = useRef<Record<string, HTMLInputElement | null>>({});

  const bozzaEventiLenta = useDebounced(bozzaEventi);
  const bozzaPassiLenta = useDebounced(bozzaPassi);

  const dataEvento = (e: CronoEvento) =>
    bozzaEventiLenta[e.id]?.inizio ?? e.data_effettiva ?? e.data_pianificata ?? null;
  const fineEvento = (e: CronoEvento) => bozzaEventiLenta[e.id]?.fine ?? e.data_fine ?? null;
  const dataPasso = (m: TimelineMilestone) => bozzaPassiLenta[m.id] ?? m.due_date ?? null;

  const violPerOrdine = useMemo(
    () => new Map(violazioni.map((v) => [v.order_index, v])),
    [violazioni]
  );
  const vincoliPerOrdine = useMemo(
    () => new Map(vincoli.map((v) => [v.order_index, v])),
    [vincoli]
  );

  // ── L'ancora di progetto di un passo, per l'evidenziazione (§5) ─────────
  const eventoHandover = eventi.find((e) => e.ancora === "handover");
  const eventoStart = eventi.find((e) => e.ancora === "construction_start");
  const eventoDiPasso = (m: TimelineMilestone): CronoEvento | undefined => {
    if (m.derived_from === "handover") return eventoHandover;
    if (m.derived_from === "crono_construction_start") return eventoStart;
    const nat = naturaPasso(m);
    if (nat === "calcolato" || nat === "serie") return eventoHandover;
    return undefined;
  };

  const evidenziate = useMemo(() => {
    const out: string[] = [];
    if (hoverPasso) {
      out.push(`ms:${hoverPasso.id}`);
      const ev = eventoDiPasso(hoverPasso);
      if (ev) out.push(`evt:${ev.id}`);
    }
    if (selEvento) {
      out.push(`evt:${selEvento.id}`);
      for (const m of milestones) {
        if (eventoDiPasso(m)?.id === selEvento.id) out.push(`ms:${m.id}`);
      }
    }
    return out;
  }, [hoverPasso, selEvento, milestones, eventoHandover, eventoStart]);

  const passiDiEvento = useMemo(() => {
    if (!selEvento) return new Set<string>();
    return new Set(milestones.filter((m) => eventoDiPasso(m)?.id === selEvento.id).map((m) => m.id));
  }, [selEvento, milestones, eventoHandover, eventoStart]);

  // ── Le voci del grafico ─────────────────────────────────────────────────
  const voci: VoceTimeline[] = useMemo(() => {
    const out: VoceTimeline[] = eventi.map((e) => ({
      key: `evt:${e.id}`,
      label: e.nome,
      corsia: "project" as const,
      tipo: fineEvento(e) ? ("fase" as const) : ("milestone" as const),
      inizio: dataEvento(e),
      fine: fineEvento(e),
      famiglia: e.famiglia,
      natura: "ancora" as const,
      fatta: !!e.data_effettiva,
      daConfermare: e.stato === "da_confermare",
      isHandover: e.ancora === "handover",
      nota: e.fonte,
      cliccabile: true,
    }));

    const serie = milestones.filter((m) => m.series_step_order !== null);
    const singole = milestones.filter((m) => m.series_step_order === null);

    for (const m of singole) {
      const v = m.order_index !== null ? violPerOrdine.get(m.order_index) : undefined;
      const nat = naturaPasso(m);
      out.push({
        key: `ms:${m.id}`,
        label: m.requirement,
        corsia: "cert",
        tipo: "milestone",
        inizio: dataPasso(m),
        natura: nat,
        fatta: m.status === "achieved" || !!m.completed_date,
        offsetGiorni: nat === "calcolato" ? m.offset_days : null,
        isHandover: m.derived_from === "handover",
        violazione: v ? { messaggio: v.messaggio ?? "Vincolo violato" } : null,
        cliccabile: nat === "pm",
      });
    }

    if (serie.length > 0) {
      const ultima = serie[serie.length - 1];
      out.push({
        key: `serie:${ultima.series_step_order}`,
        label: `${serie.length} report mensili`,
        corsia: "cert",
        tipo: "milestone",
        inizio: ultima.due_date,
        natura: "serie",
      });
    }
    return out;
  }, [eventi, milestones, bozzaEventiLenta, bozzaPassiLenta, violPerOrdine]);

  // Le corsie delle altre certificazioni del sito, per l'overlay (v1.3 §4).
  const altreCorsie: CorsiaCert[] = useMemo(() => {
    if (!corsieSito || !cert) return [];
    return corsieSito.certificazioni
      .filter((c) => c.id !== cert.id && c.milestone.length > 0)
      .map((c) => ({
        id: c.id,
        titolo: c.nome,
        servizio: `${c.cert_type ?? ""} ${c.nome}`,
        voci: c.milestone
          .filter((m) => m.series_step_order === null)
          .map((m, i) => ({
            key: `alt:${c.id}:${i}`,
            label: m.requirement,
            corsia: "cert" as const,
            tipo: "milestone" as const,
            inizio: m.due_date,
            natura: m.derived_from
              ? ("ereditato" as const)
              : m.anchor_order !== null
              ? ("calcolato" as const)
              : ("pm" as const),
          })),
      }));
  }, [corsieSito, cert]);

  const portaAlCampo = (key: string) => {
    setFocus(key);
    const id = key.split(":")[1];
    campiRef.current[id]?.focus();
    campiRef.current[id]?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  if (!cert) {
    return (
      <MainLayout title="PROJECT TIMELINE">
        <div className="py-20 text-center text-muted-foreground">Caricamento…</div>
      </MainLayout>
    );
  }

  const tipoEffettivo: ProjectTipo =
    ((cert as any).project_tipo as ProjectTipo | null) ??
    proponiTipo(cert.cert_type, cert.cert_rating).tipo;
  const isExisting = tipoEffettivo === "existing";
  const cronoAltrove = !crono && altreCert.some((c) => c.cronoprogramma_id);

  /** Salvataggio di una riga: le ancore con una data gia' scritta passano dalla cascata. */
  const salvaRiga = async (e: CronoEvento) => {
    const b = bozzaEventi[e.id];
    if (!b) return;
    const vecchia = e.data_effettiva ?? e.data_pianificata;
    const cambiaInizio = b.inizio !== undefined && b.inizio !== (vecchia ?? "");
    if (e.ancora && vecchia && cambiaInizio && b.inizio) {
      setCascataPer(e.id);
      return;
    }
    try {
      await salvaEvento.mutateAsync({
        id: e.id,
        ...(b.nome !== undefined ? { nome: b.nome } : {}),
        ...(b.inizio !== undefined ? { data_pianificata: b.inizio || null } : {}),
        ...(b.fine !== undefined ? { data_fine: b.fine || null } : {}),
        ...(b.fonte !== undefined ? { fonte: b.fonte || null } : {}),
        stato: (b.inizio ?? vecchia) ? "inserita" : "da_confermare",
      });
      setBozzaEventi((s) => {
        const n = { ...s };
        delete n[e.id];
        return n;
      });
      toast({ title: "Riga aggiornata" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Errore", description: err.message });
    }
  };

  return (
    <MainLayout
      title={cert.sito?.name ?? "PROJECT TIMELINE"}
      subtitle={`${cert.name} · ${cert.sito?.city ?? ""} · ${PROJECT_TIPO_LABEL[tipoEffettivo]}`}
    >
      {/* v1.3 §4: tabelle al massimo ~55-60%, timeline protagonista ≥360px. */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-5">
          <ConfermeInSospeso />

          {/* ══ 1 · PROJECT TIMELINE ══ */}
          <Card className="p-5">
            <Intestazione
              numero={1}
              titolo="PROJECT TIMELINE"
              nota={
                isExisting
                  ? "Progetto su edificio in esercizio: nessuna timeline di cantiere. Si va dritti alla HQ FGB TIMELINE."
                  : "Un record unico per sito, condiviso: compilata una volta, e' compilata per tutti. Le modifiche si vedono da ogni certificazione agganciata."
              }
              badge={crono ? "condivisa" : undefined}
            />

            {isExisting ? (
              <TipoSelettore cert={cert} tipoEffettivo={tipoEffettivo} mio={mio} />
            ) : cronoInCaricamento ? (
              <div className="rounded-lg border border-dashed bg-muted/20 p-6 text-center text-xs text-muted-foreground">
                Carico la PROJECT TIMELINE del sito…
              </div>
            ) : !crono ? (
              <NonCreata
                cert={cert}
                siteId={siteId!}
                altreCert={altreCert}
                mio={mio}
                tipoEffettivo={tipoEffettivo}
                cronoAltrove={cronoAltrove}
                onImporta={() => setImportAperto(true)}
                onCreata={() => setTabellaAperta(true)}
              />
            ) : !tabellaAperta ? (
              <Riepilogo crono={crono} eventi={eventi} onApri={() => setTabellaAperta(true)} />
            ) : (
              <>
                <TabellaEventi
                  eventi={eventi}
                  bozza={bozzaEventi}
                  setBozza={setBozzaEventi}
                  modificabile={mio}
                  setFocus={setFocus}
                  campiRef={campiRef}
                  onSalva={salvaRiga}
                  onElimina={async (e: CronoEvento) => {
                    if (e.ancora === "handover") return;
                    await eliminaEvento.mutateAsync(e.id);
                    toast({ title: `«${e.nome}» eliminata` });
                  }}
                  cascataPer={cascataPer}
                  evidenziatoId={
                    hoverPasso ? eventoDiPasso(hoverPasso)?.id ?? null : selEvento?.id ?? null
                  }
                  selezionatoId={selEvento?.id ?? null}
                  onSeleziona={(e: CronoEvento) =>
                    setSelEvento((cur) => (cur?.id === e.id ? null : e))
                  }
                  renderCascata={(e: CronoEvento) => (
                    <CascataInline
                      evento={e}
                      nuovaData={bozzaEventi[e.id]?.inizio ?? ""}
                      fonte={bozzaEventi[e.id]?.fonte ?? e.fonte ?? ""}
                      certIdCorrente={cert.id}
                      certIdProprie={altreCert.filter((c) => c.pm_id === user?.id).map((c) => c.id)}
                      nomiAltri={Array.from(
                        new Set(
                          altreCert
                            .filter((c) => c.pm_id && c.pm_id !== user?.id && c.cronoprogramma_id)
                            .map((c) => c.pm_nome ?? "un collega")
                        )
                      )}
                      onFatto={() => {
                        setCascataPer(null);
                        setBozzaEventi((s) => {
                          const n = { ...s };
                          delete n[e.id];
                          return n;
                        });
                      }}
                      onAnnulla={() => setCascataPer(null)}
                    />
                  )}
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    disabled={!mio}
                    onClick={async () => {
                      const ordine = Math.max(0, ...eventi.map((x) => x.ordine)) + 1;
                      await aggiungiEvento.mutateAsync({
                        cronoprogramma_id: crono.id,
                        nome: "Nuova attivita'",
                        ordine,
                      });
                    }}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" /> Aggiungi riga
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs" disabled={!mio} onClick={() => setImportAperto(true)}>
                    <FileUp className="mr-1 h-3.5 w-3.5" /> Importa da file
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setTabellaAperta(false)}>
                    Chiudi
                  </Button>
                </div>
              </>
            )}

            <ImportTimeline
              aperto={importAperto}
              onChiudi={() => {
                setImportAperto(false);
                setTabellaAperta(true);
              }}
              siteId={siteId!}
              nomeSito={cert.sito?.name ?? null}
              cronoprogrammaId={crono?.id ?? null}
              eventi={eventi}
              tipoProposto={tipoEffettivo === "construction" ? "construction" : "design_construction"}
              handoverBaseline={cert.baseline_handover_date ?? cert.handover_date}
              certIds={altreCert.length ? altreCert.map((c) => c.id) : [cert.id]}
            />
          </Card>

          {/* ══ 2 · HQ FGB TIMELINE ══ */}
          <Card className={cn("p-5", gate?.bloccata && "opacity-60")}>
            <Intestazione
              numero={2}
              titolo="HQ FGB TIMELINE"
              nota="La FGB timeline integra il cronoprogramma di progetto con le milestone della/e certificazione/i che inserisci tu. Construction Start e Handover sono ereditati, in sola lettura."
              badge={cert.name ?? undefined}
            />

            {gate?.bloccata ? (
              <div className="flex items-start gap-3 rounded-lg border border-dashed bg-muted/30 p-5">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{gate.motivo}</p>
              </div>
            ) : milestones.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center">
                <Button
                  disabled={!mio || genera.isPending}
                  onClick={async () => {
                    const n = await genera.mutateAsync(cert.id);
                    toast({
                      title: n > 0 ? `Timeline generata · ${n} passi` : "Niente da generare",
                      description: n > 0 ? undefined : "La timeline esiste gia' oppure il gate e' ancora chiuso.",
                    });
                  }}
                >
                  <Sparkles className="mr-1.5 h-4 w-4" /> Genera la timeline dalla scaletta
                </Button>
              </div>
            ) : (
              <TabellaPassi
                milestones={milestones}
                eventi={eventi}
                bozza={bozzaPassi}
                setBozza={setBozzaPassi}
                modificabile={mio}
                violPerOrdine={violPerOrdine}
                vincoliPerOrdine={vincoliPerOrdine}
                setFocus={setFocus}
                campiRef={campiRef}
                certId={cert.id}
                cronoId={crono?.id ?? null}
                certNome={cert.name}
                onHover={setHoverPasso}
                passiAccesi={passiDiEvento}
                onSalva={async (m: TimelineMilestone) => {
                  const dd = bozzaPassi[m.id];
                  if (dd === undefined) return;
                  await salvaMilestone.mutateAsync({ id: m.id, due_date: dd || null });
                  setBozzaPassi((s) => {
                    const n = { ...s };
                    delete n[m.id];
                    return n;
                  });
                  toast({ title: "Data salvata" });
                }}
              />
            )}

            {conteggi.length > 0 && conteggi[0].proiettati > 0 && <ContatoreReport c={conteggi[0]} />}
          </Card>

          {/* ══ 3 · Il registro ══ */}
          <Registro cronoId={crono?.id} numero={3} />

          {/* ══ Le altre certificazioni sullo stesso sito ══ */}
          {altreCert.filter((c) => c.id !== cert.id).length > 0 && (
            <Card className="p-5">
              <p className="mb-1 text-sm font-medium">Le altre certificazioni su questo sito</p>
              <p className="mb-4 text-xs text-muted-foreground">
                Le vedi, non le modifichi. Nell'overlay della timeline compaiono come corsie affiancate.
              </p>
              <div className="space-y-2">
                {altreCert
                  .filter((c) => c.id !== cert.id)
                  .map((c) => (
                    <button
                      key={c.id}
                      onClick={() => navigate(`/projects/${c.id}/cronoprogramma`)}
                      className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors hover:bg-muted/50"
                    >
                      <span className="text-sm">{c.name}</span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        {c.pm_nome ?? "senza PM"}
                        {c.cronoprogramma_id && <Badge variant="outline" className="text-[10px]">agganciata</Badge>}
                      </span>
                    </button>
                  ))}
              </div>
            </Card>
          )}
        </div>

        {/* ══ Il pannello timeline: protagonista, sticky, alto quanto la viewport ══ */}
        <div className="xl:sticky xl:top-[96px] xl:max-h-[calc(100vh-120px)] xl:self-start xl:overflow-y-auto">
          <p className="mb-2 text-[10.5px] uppercase tracking-wider text-muted-foreground">
            Come si dispone · tocca per espandere a tutta la finestra
          </p>
          <TimelineVerticale
            voci={voci}
            scadenzaContratto={cert.contract_end_date}
            focus={focus}
            evidenziate={evidenziate}
            onVoceClick={portaAlCampo}
            titoloProject="Project timeline"
            titoloCert={cert.name ?? "HQ FGB timeline"}
            servizio={`${cert.cert_type ?? ""} ${cert.cert_rating ?? ""} ${cert.name ?? ""}`}
            altreCorsie={altreCorsie}
            compatta
          />
          {violazioni.length > 0 && (
            <div className="mt-3 space-y-2">
              {violazioni.map((v) => (
                <div
                  key={v.order_index}
                  className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    <b>{v.requirement}</b> — {v.messaggio} Sono {Math.abs(v.giorni)} giorni
                    {v.operatore === "prima_di" ? " oltre" : " prima"} dell'ancora.
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}

// ── Sezione 1: gli stati ──────────────────────────────────────────────────

/** Non ancora creata: due sole azioni, nessun form vuoto (v1.3 §1). */
function NonCreata({
  cert,
  siteId,
  altreCert,
  mio,
  tipoEffettivo,
  cronoAltrove,
  onImporta,
  onCreata,
}: {
  cert: any;
  siteId: string;
  altreCert: any[];
  mio: boolean;
  tipoEffettivo: ProjectTipo;
  cronoAltrove: boolean;
  onImporta: () => void;
  onCreata: () => void;
}) {
  const { toast } = useToast();
  const creaCrono = useCreateCronoprogramma();
  const aggancia = useAttachCronoprogramma();
  const setTipo = useSetProjectTipo();
  const proposta = proponiTipo(cert.cert_type, cert.cert_rating);
  const [tipo, setTipoLocale] = useState<ProjectTipo>(tipoEffettivo);
  const [template, setTemplate] = useState<TemplateKey>(
    tipoEffettivo === "construction" ? "construction" : proposta.template ?? "bdc"
  );

  const templateKey: TemplateKey = tipo === "construction" ? "construction" : template === "construction" ? "bdc" : template;

  return (
    <div className="space-y-3">
      {cronoAltrove && (
        <p className="text-xs text-muted-foreground">
          <Link2 className="mr-1 inline h-3 w-3" />
          Un'altra certificazione del sito sta creando la timeline? Ricarica: se esiste, la troverai gia' compilata.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Tipo di progetto:</span>
        {(["design_construction", "construction"] as ProjectTipo[]).map((t) => (
          <button
            key={t}
            type="button"
            disabled={!mio}
            onClick={async () => {
              setTipoLocale(t);
              await setTipo.mutateAsync({
                certification_id: cert.id,
                project_tipo: t === proposta.tipo ? null : t,
              });
            }}
            className={cn(
              "rounded-full border px-2.5 py-1",
              tipo === t ? "border-primary text-primary" : "text-muted-foreground hover:bg-muted/50"
            )}
          >
            {PROJECT_TIPO_LABEL[t]}
            {t === proposta.tipo && <span className="ml-1 text-[10px]">· dal catalogo</span>}
          </button>
        ))}
        {tipo === "design_construction" && (
          <>
            <span className="ml-2 text-muted-foreground">Template:</span>
            {(["idc", "bdc"] as TemplateKey[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setTemplate(k)}
                className={cn(
                  "rounded-full border px-2.5 py-1",
                  templateKey === k ? "border-primary text-primary" : "text-muted-foreground hover:bg-muted/50"
                )}
              >
                {TEMPLATE_BY_KEY[k].label}
              </button>
            ))}
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!mio || creaCrono.isPending}
          onClick={async () => {
            try {
              const righe = TEMPLATE_BY_KEY[templateKey].righe;
              const k = await creaCrono.mutateAsync({
                site_id: siteId,
                nome: cert.sito?.name ?? null,
                tipo: tipo as "design_construction" | "construction",
                handoverContrattuale: cert.baseline_handover_date ?? cert.handover_date,
                righeTemplate: righe.map((r) => ({
                  nome: r.nome,
                  fase: r.fase,
                  famiglia: r.famiglia,
                  ancora: r.ancora,
                })),
              });
              const daAgganciare = altreCert.map((c) => c.id);
              await aggancia.mutateAsync({
                cronoprogramma_id: k.id,
                certification_ids: daAgganciare.length ? daAgganciare : [cert.id],
              });
              toast({
                title: "PROJECT TIMELINE creata dal template",
                description: `${righe.length} righe senza date (l'handover arriva dalla Quotation). Ora datale, toglile, aggiungine.`,
              });
              onCreata();
            } catch (e: any) {
              toast({ variant: "destructive", title: "Errore", description: e.message });
            }
          }}
        >
          <Plus className="mr-1.5 h-4 w-4" /> Crea dal template {TEMPLATE_BY_KEY[templateKey].label.split(" ·")[0]}
        </Button>
        <Button variant="outline" disabled={!mio} onClick={onImporta}>
          <FileUp className="mr-1.5 h-4 w-4" /> Importa da file
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Le righe arrivano senza date, con le ancore FGB gia' marcate ●; l'handover e' precompilato dalla Quotation
        {cert.baseline_handover_date ? ` (${df(cert.baseline_handover_date)})` : ""}.
      </p>
    </div>
  );
}

/** Creata: riepilogo compatto collassato, mai il form da capo (v1.3 §1). */
function Riepilogo({
  crono,
  eventi,
  onApri,
}: {
  crono: any;
  eventi: CronoEvento[];
  onApri: () => void;
}) {
  const date = eventi
    .map((e) => e.data_effettiva ?? e.data_pianificata)
    .filter(Boolean)
    .sort() as string[];
  const handover = eventi.find((e) => e.ancora === "handover");
  const ultimo = eventi
    .map((e) => e.aggiornata_il)
    .filter(Boolean)
    .sort()
    .pop();

  const voce = (k: string, v: React.ReactNode) => (
    <div>
      <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground">{k}</p>
      <p className="text-sm font-medium tabular-nums">{v}</p>
    </div>
  );

  return (
    <div className="flex flex-wrap items-end justify-between gap-4 rounded-lg border bg-muted/20 p-4">
      <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
        {voce("Tipo", PROJECT_TIPO_LABEL[(crono.tipo ?? "design_construction") as ProjectTipo])}
        {voce("Eventi", `${eventi.length} righe`)}
        {voce("Periodo", date.length ? `${df(date[0])} → ${df(date[date.length - 1])}` : "date da inserire")}
        {voce("Handover", df(handover?.data_effettiva ?? handover?.data_pianificata))}
        {voce("Aggiornata", ultimo ? format(parseISO(ultimo), "d LLL yy, HH:mm", { locale: it }) : "—")}
      </div>
      <Button size="sm" variant="outline" onClick={onApri}>
        <Pencil className="mr-1.5 h-3.5 w-3.5" /> Apri / Modifica
      </Button>
    </div>
  );
}

function TipoSelettore({ cert, tipoEffettivo, mio }: { cert: any; tipoEffettivo: ProjectTipo; mio: boolean }) {
  const setTipo = useSetProjectTipo();
  const proposta = proponiTipo(cert.cert_type, cert.cert_rating);
  return (
    <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-xs text-muted-foreground">
      Tipo di progetto: <b className="text-foreground">{PROJECT_TIPO_LABEL[tipoEffettivo]}</b>
      {(cert as any).project_tipo ? " (scelto a mano)" : " (dal catalogo)"}.
      {mio && (
        <button
          type="button"
          className="ml-2 underline hover:text-foreground"
          onClick={() =>
            setTipo.mutate({
              certification_id: cert.id,
              project_tipo: (cert as any).project_tipo ? null : proposta.tipo === "existing" ? "design_construction" : "existing",
            })
          }
        >
          {(cert as any).project_tipo ? "torna alla proposta del catalogo" : "questo progetto ha un cantiere"}
        </button>
      )}
    </div>
  );
}

// ── Pezzi ─────────────────────────────────────────────────────────────────

function Intestazione({ numero, titolo, nota, badge }: { numero: number; titolo: string; nota: string; badge?: string }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-[11px] text-background">{numero}</span>
        <h2 className="text-sm font-medium uppercase tracking-wide">{titolo}</h2>
        {badge && <Badge variant="secondary" className="text-[10px]">{badge}</Badge>}
      </div>
      <p className="mt-1.5 max-w-[70ch] text-xs text-muted-foreground">{nota}</p>
    </div>
  );
}

/** Il pallino di stato: compatta la colonna senza perdere l'etichetta (v1.3 §4). */
function StatoPallino({ stato }: { stato: string }) {
  const meta =
    stato === "confermata"
      ? { c: "#3F7A1F", l: "conf." }
      : stato === "da_confermare"
      ? { c: "#D97706", l: "da conf." }
      : { c: "#9C998E", l: "inserita" };
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground" title={stato.replace("_", " ")}>
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: meta.c }} />
      {meta.l}
    </span>
  );
}

/** La fonte come icona col tooltip; si edita al click (v1.3 §4). */
function FonteIcona({
  fonte,
  modificabile,
  onSalva,
}: {
  fonte: string;
  modificabile: boolean;
  onSalva: (f: string) => void;
}) {
  const [bozza, setBozza] = useState(fonte);
  return (
    <Popover onOpenChange={(o) => o && setBozza(fonte)}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={!modificabile}
          className={cn("rounded p-1 hover:bg-muted", fonte ? "text-foreground" : "text-muted-foreground/50")}
          title={fonte || "fonte non indicata · clicca per aggiungerla"}
          aria-label={fonte ? `Fonte: ${fonte}` : "Aggiungi la fonte"}
        >
          <NotebookPen className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <p className="mb-1.5 text-[10.5px] uppercase tracking-wider text-muted-foreground">Fonte · consigliata</p>
        <Input list="fonti-crono" value={bozza} onChange={(e) => setBozza(e.target.value)} placeholder="es. gantt rev. 8 del GC" className="h-8 text-xs" />
        <div className="mt-2 flex justify-end">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onSalva(bozza)}>
            Salva
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TabellaEventi({
  eventi,
  bozza,
  setBozza,
  modificabile,
  setFocus,
  campiRef,
  onSalva,
  onElimina,
  cascataPer,
  renderCascata,
  evidenziatoId,
  selezionatoId,
  onSeleziona,
}: any) {
  const scrivi = (id: string, campi: Partial<BozzaEvento>) =>
    setBozza((s: any) => ({ ...s, [id]: { ...s[id], ...campi } }));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <th className="px-2 py-1.5 text-left font-medium">Fase / milestone</th>
            <th className="px-2 py-1.5 text-left font-medium">Inizio</th>
            <th className="px-2 py-1.5 text-left font-medium">Fine</th>
            <th className="w-8 px-1 py-1.5 text-left font-medium" title="Fonte">F.</th>
            <th className="px-2 py-1.5 text-left font-medium">Stato</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {eventi.map((e: CronoEvento) => {
            const b = bozza[e.id] ?? {};
            const inizio = b.inizio ?? e.data_pianificata ?? "";
            const fine = b.fine ?? e.data_fine ?? "";
            const nome = b.nome ?? e.nome;
            const sporco = Object.keys(b).length > 0;
            const libera = e.ancora === null;
            const acceso = evidenziatoId === e.id || selezionatoId === e.id;
            return (
              <Fragment key={e.id}>
                <tr className={cn("h-10 border-b last:border-0 transition-colors", acceso && "bg-primary/5")}>
                  <td className="px-2 py-1">
                    {libera && modificabile ? (
                      <Input value={nome} onChange={(ev) => scrivi(e.id, { nome: ev.target.value })} className="h-8 min-w-[170px] text-xs" />
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSeleziona(e)}
                        className={cn("flex items-center gap-1.5 text-left hover:text-primary", selezionatoId === e.id && "font-semibold text-primary")}
                        title="Seleziona: accende i passi della certificazione che pendono da qui"
                      >
                        {e.nome}
                        {e.ancora && <span className="text-[10px] text-muted-foreground" title="Ancora FGB">●</span>}
                      </button>
                    )}
                  </td>
                  <td className="px-2 py-1">
                    <Input
                      type="date"
                      value={inizio}
                      disabled={!modificabile}
                      ref={(el) => (campiRef.current[e.id] = el)}
                      onFocus={() => setFocus(`evt:${e.id}`)}
                      onBlur={() => setFocus(null)}
                      onChange={(ev) => scrivi(e.id, { inizio: ev.target.value })}
                      className="h-8 w-[132px] text-xs"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <Input
                      type="date"
                      value={fine}
                      disabled={!modificabile}
                      title="Solo per le fasi: una milestone e' un istante"
                      onChange={(ev) => scrivi(e.id, { fine: ev.target.value })}
                      className="h-8 w-[132px] text-xs"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <FonteIcona
                      fonte={b.fonte ?? e.fonte ?? ""}
                      modificabile={modificabile}
                      onSalva={(f) => scrivi(e.id, { fonte: f })}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <StatoPallino stato={e.stato} />
                  </td>
                  <td className="px-2 py-1 text-right">
                    <span className="flex items-center justify-end gap-1.5">
                      {sporco && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onSalva(e)}>
                          Salva
                        </Button>
                      )}
                      {libera && modificabile && (
                        <button type="button" onClick={() => onElimina(e)} className="text-muted-foreground hover:text-destructive" aria-label={`Elimina ${e.nome}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
                {cascataPer === e.id && (
                  <tr>
                    <td colSpan={6} className="px-2 pb-3">
                      {renderCascata(e)}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      <datalist id="fonti-crono">
        {FONTI_SUGGERITE.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
    </div>
  );
}

function TabellaPassi({
  milestones,
  eventi,
  bozza,
  setBozza,
  modificabile,
  violPerOrdine,
  vincoliPerOrdine,
  setFocus,
  campiRef,
  certId,
  cronoId,
  certNome,
  onHover,
  passiAccesi,
  onSalva,
}: any) {
  const singole = milestones.filter((m: TimelineMilestone) => m.series_step_order === null);
  const serie = milestones.filter((m: TimelineMilestone) => m.series_step_order !== null);
  const perOrdine = new Map<number, TimelineMilestone>(
    singole.filter((m: TimelineMilestone) => m.order_index !== null).map((m: TimelineMilestone) => [m.order_index!, m])
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <th className="px-2 py-1.5 text-left font-medium">#</th>
            <th className="px-2 py-1.5 text-left font-medium">Passo</th>
            <th className="px-2 py-1.5 text-left font-medium">Natura</th>
            <th className="px-2 py-1.5 text-left font-medium">Data</th>
            <th className="px-2 py-1.5 text-left font-medium">Ancorato a</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {singole.map((m: TimelineMilestone) => {
            const nat = naturaPasso(m);
            const v = m.order_index !== null ? violPerOrdine.get(m.order_index) : undefined;
            const editabile = modificabile && nat === "pm" && !m.edit_locked_for_pm;
            const b = bozza[m.id];
            const data = b ?? m.due_date ?? "";
            const acceso = passiAccesi.has(m.id);
            return (
              <tr
                key={m.id}
                className={cn("h-10 border-b last:border-0 transition-colors", m.not_applicable && "opacity-40", acceso && "bg-primary/5")}
                onMouseEnter={() => onHover(m)}
                onMouseLeave={() => onHover(null)}
              >
                <td className="px-2 py-1 text-xs text-muted-foreground">{m.order_index}</td>
                <td className="px-2 py-1">
                  {m.requirement}
                  {v && (
                    <div className="mt-0.5 flex items-center gap-1 text-[11px] text-amber-700">
                      <AlertTriangle className="h-3 w-3" /> {v.messaggio}
                    </div>
                  )}
                </td>
                <td className="px-2 py-1">
                  <Badge variant="outline" className="text-[10px]">{NATURA_ETICHETTA[nat]}</Badge>
                </td>
                <td className="px-2 py-1">
                  {editabile ? (
                    <Input
                      type="date"
                      value={data}
                      ref={(el) => (campiRef.current[m.id] = el)}
                      onFocus={() => setFocus(`ms:${m.id}`)}
                      onBlur={() => setFocus(null)}
                      onChange={(ev) => setBozza((s: any) => ({ ...s, [m.id]: ev.target.value }))}
                      className={cn("h-8 w-[132px] text-xs", v && "border-amber-500")}
                    />
                  ) : (
                    <span className="text-xs tabular-nums">{m.due_date ? df(m.due_date) : "—"}</span>
                  )}
                </td>
                <td className="px-2 py-1">
                  <AncoratoA
                    m={m}
                    nat={nat}
                    perOrdine={perOrdine}
                    vincolo={m.order_index !== null ? vincoliPerOrdine.get(m.order_index) : undefined}
                    modificabile={modificabile}
                    certId={certId}
                    cronoId={cronoId}
                    certNome={certNome}
                  />
                </td>
                <td className="px-2 py-1 text-right">
                  {b !== undefined && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onSalva(m)}>
                      Salva
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}

          {serie.length > 0 && (
            <tr className="border-b last:border-0">
              <td className="px-2 py-1 text-xs text-muted-foreground">{serie[0].series_step_order}</td>
              <td className="px-2 py-1">
                FGB Construction Report — serie mensile
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {serie.length} occorrenze, dal {format(parseISO(serie[0].due_date!), "LLL yy", { locale: it })} al{" "}
                  {format(parseISO(serie[serie.length - 1].due_date!), "LLL yy", { locale: it })}
                </div>
              </td>
              <td className="px-2 py-1">
                <Badge variant="outline" className="text-[10px]">serie</Badge>
              </td>
              <td className="px-2 py-1 text-xs text-muted-foreground">generata</td>
              <td className="px-2 py-1 text-[11px] text-muted-foreground">construction start → handover</td>
              <td />
            </tr>
          )}
        </tbody>
      </table>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Spuntare un passo e' un fatto di SAL: alimenta la fatturazione, non solo lo stato.
      </p>
    </div>
  );
}

/**
 * La colonna «Ancorato a» — v1.3 §5. Ereditati in sola lettura, calcolati con
 * ancora e offset modificabili (anteprima, poi applica: proposta-e-conferma),
 * passi PM col vincolo dichiarato, liberi agganciabili.
 */
function AncoratoA({
  m,
  nat,
  perOrdine,
  vincolo,
  modificabile,
  certId,
  cronoId,
  certNome,
}: {
  m: TimelineMilestone;
  nat: string;
  perOrdine: Map<number, TimelineMilestone>;
  vincolo: { operatore: string; ancora: string } | undefined;
  modificabile: boolean;
  certId: string;
  cronoId: string | null;
  certNome: string | null;
}) {
  if (nat === "ereditato") {
    return (
      <span className="text-[11px] text-muted-foreground">
        ← {m.derived_from === "handover" ? "Handover" : "Construction start"} · project timeline
      </span>
    );
  }
  if (nat === "auto") return <span className="text-[11px] text-muted-foreground">automatica</span>;

  if (nat === "calcolato") {
    const ancoraNome = m.anchor_order !== null ? perOrdine.get(m.anchor_order)?.requirement ?? `passo #${m.anchor_order}` : "—";
    return (
      <EditorAncoraggio
        m={m}
        perOrdine={perOrdine}
        modificabile={modificabile}
        certId={certId}
        cronoId={cronoId}
        certNome={certNome}
        trigger={
          <button
            type="button"
            disabled={!modificabile}
            className="inline-flex max-w-[220px] items-center gap-1 truncate rounded-full border px-2 py-0.5 text-[11px] hover:bg-muted"
            title={`${ancoraNome} + ${m.offset_days}gg — clicca per cambiare`}
          >
            <Anchor className="h-3 w-3 shrink-0" />
            <span className="truncate">{ancoraNome.length > 20 ? `${ancoraNome.slice(0, 19)}…` : ancoraNome}</span>
            <span className="tabular-nums">+{m.offset_days}gg ▾</span>
          </button>
        }
      />
    );
  }

  // Passo PM: il vincolo dichiarato, oppure la possibilita' di agganciarlo.
  if (vincolo) {
    return (
      <span className="text-[11px] text-muted-foreground">
        {vincolo.operatore === "prima_di" ? "prima di" : "dopo di"}:{" "}
        {ANCORA_NOME[vincolo.ancora as keyof typeof ANCORA_NOME] ?? vincolo.ancora}
      </span>
    );
  }
  return (
    <EditorAncoraggio
      m={m}
      perOrdine={perOrdine}
      modificabile={modificabile}
      certId={certId}
      cronoId={cronoId}
      certNome={certNome}
      trigger={
        <button type="button" disabled={!modificabile} className="text-[11px] text-muted-foreground underline decoration-dotted hover:text-foreground">
          — aggancia ▾
        </button>
      }
    />
  );
}

function EditorAncoraggio({
  m,
  perOrdine,
  modificabile,
  certId,
  cronoId,
  certNome,
  trigger,
}: {
  m: TimelineMilestone;
  perOrdine: Map<number, TimelineMilestone>;
  modificabile: boolean;
  certId: string;
  cronoId: string | null;
  certNome: string | null;
  trigger: React.ReactNode;
}) {
  const { toast } = useToast();
  const cambia = useCambiaAncoraggio();
  const [aperto, setAperto] = useState(false);
  const [anchor, setAnchor] = useState<number | null>(m.anchor_order);
  const [offset, setOffset] = useState<number>(m.offset_days ?? 30);

  const candidati = Array.from(perOrdine.values()).filter((x) => x.id !== m.id);
  const ancoraScelta = anchor !== null ? perOrdine.get(anchor) : undefined;
  const base = ancoraScelta ? ancoraScelta.actual_date ?? ancoraScelta.due_date : null;
  const anteprima = base
    ? format(new Date(new Date(`${base}T12:00:00`).getTime() + offset * 86400000), "d LLL yy", { locale: it })
    : null;

  if (!modificabile) return <>{trigger}</>;

  return (
    <Popover open={aperto} onOpenChange={setAperto}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3">
        <p className="mb-2 text-[10.5px] uppercase tracking-wider text-muted-foreground">Ancorato a</p>
        <div className="space-y-2 text-xs">
          <select
            value={anchor ?? ""}
            onChange={(e) => setAnchor(e.target.value === "" ? null : Number(e.target.value))}
            className="h-8 w-full rounded-md border bg-background px-2 text-xs"
            aria-label="Passo a cui ancorare"
          >
            <option value="">— nessuna ancora (torna passo PM)</option>
            {candidati.map((c) => (
              <option key={c.id} value={c.order_index!}>
                #{c.order_index} · {c.requirement}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2">
            offset
            <Input type="number" value={offset} onChange={(e) => setOffset(Number(e.target.value) || 0)} className="h-8 w-24 text-xs" />
            giorni
          </label>
          <p className="text-muted-foreground">
            {anchor === null
              ? "Senza ancora la data torna al PM: la scrivi tu."
              : anteprima
              ? `Anteprima: la data diventa ${anteprima}.`
              : "L'ancora scelta non ha ancora una data: il passo restera' vuoto finche' non l'avra'."}
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAperto(false)}>
              Annulla
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={cambia.isPending}
              onClick={async () => {
                try {
                  await cambia.mutateAsync({
                    milestone_id: m.id,
                    certification_id: certId,
                    requirement: m.requirement,
                    anchor_order: anchor,
                    offset_days: anchor === null ? null : offset,
                    data_precedente: m.due_date,
                    cronoprogramma_id: cronoId,
                    nota: `${certNome ?? "certificazione"} · ancoraggio modificato`,
                  });
                  toast({ title: "Ancoraggio aggiornato", description: "Date ricalcolate dal motore e registrate." });
                  setAperto(false);
                } catch (e: any) {
                  toast({ variant: "destructive", title: "Errore", description: e.message });
                }
              }}
            >
              Applica e ricalcola
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ContatoreReport({ c }: { c: any }) {
  const delta = c.proiettati - c.contrattuali;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border bg-muted/30 px-4 py-3 text-xs">
      <span>
        Report contrattuali <b className="tabular-nums">{c.contrattuali}</b>
      </span>
      <span>
        Proiettati <b className="tabular-nums">{c.proiettati}</b>
      </span>
      <span className={cn(delta > 0 && "text-primary", delta < 0 && "text-amber-700")}>
        {delta === 0
          ? "nessuna variazione"
          : delta > 0
          ? `${delta} in piu' da fatturare`
          : `${Math.abs(delta)} in meno del venduto`}
      </span>
    </div>
  );
}

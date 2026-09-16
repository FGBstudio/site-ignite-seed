import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { AlertTriangle, ChevronRight, Link2, Lock, Sparkles } from "lucide-react";
import {
  NATURA_ETICHETTA,
  naturaPasso,
  type CronoEvento,
  type TimelineMilestone,
} from "@/types/cronoprogramma";
import { PROJECT_TIPO_LABEL, proponiTipo, type ProjectTipo } from "@/lib/projectTimelineTemplates";
import { tintaServizio } from "@/lib/serviceColors";
import {
  useCertGate,
  useCertificazioniSulSito,
  useCronoEventi,
  useCronoprogrammaBySite,
  useMaterializeTimeline,
  useSerieConteggi,
  useSetProjectTipo,
  useTimelineMilestones,
  useAvanzamentoMilestone,
  useUpdateMilestoneDate,
  useViolazioni,
  useVincoliRisolti,
} from "@/hooks/useCronoprogramma";
import { useCorsieSito } from "@/hooks/usePortafoglio";
import {
  TimelineVerticale,
  type CorsiaCert,
  type VoceTimeline,
} from "@/components/cronoprogramma/TimelineVerticale";
import { CascataInline, ConfermeInSospeso, Registro } from "@/components/cronoprogramma/Cascata";
import { ImportTimeline } from "@/components/cronoprogramma/ImportTimeline";
import {
  SezioneProjectTimeline,
  ossaturaDaTemplate,
  templateDelTipo,
  type RigaOssatura,
} from "@/components/cronoprogramma/SezioneProjectTimeline";
import { AncoratoA, dataRiga } from "@/components/cronoprogramma/AncoratoA";
import { CampoData } from "@/components/cronoprogramma/CampoData";
import { AnelloAvanzamento } from "@/components/cronoprogramma/AnelloAvanzamento";

const df = (s: string | null | undefined) =>
  s ? format(parseISO(s), "d LLL yy", { locale: it }) : "—";

/**
 * La pagina progetto del PM — flusso v2, Fasi 1.2, 2 e 3.
 *
 * Due colonne: a sinistra le sezioni ① PROJECT TIMELINE e ② HQ FGB TIMELINE,
 * a destra il pannello timeline protagonista. La ① e' un record unico per
 * sito: creata da chiunque, esiste per tutte (§0.3), e non si ripresenta mai
 * vuota. La ② mostra esclusivamente i passi della scaletta della
 * certificazione aperta (V4), e la colonna «Ancorato a» li lega alle righe
 * della ① — le uniche altre voci ammesse in questa schermata.
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
        .select("id, name, site_id, cert_type, cert_rating, project_subtype, pm_id, handover_date, baseline_handover_date, contract_end_date, project_tipo, cronoprogramma_id, client")
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
  const crono = cronoQuery.data ?? undefined;
  // Finche' non si sa se il record esiste, non si mostra niente che assomigli
  // a un form da riempire: e' il difetto che il v2 §0.3 chiude per sempre.
  const cronoInCaricamento = !!siteId && cronoQuery.isPending;

  const { data: eventi = [] } = useCronoEventi(crono?.id);
  const { data: gate } = useCertGate(projectId);
  const { data: milestones = [] } = useTimelineMilestones(projectId);
  const { data: violazioni = [] } = useViolazioni(projectId);
  const { data: vincoli = [] } = useVincoliRisolti(projectId);
  const { data: conteggi = [] } = useSerieConteggi(projectId);
  const { data: altreCert = [] } = useCertificazioniSulSito(siteId);
  const { data: corsieSito } = useCorsieSito(siteId, crono?.id ?? null, !!crono);

  const genera = useMaterializeTimeline();
  const salvaMilestone = useUpdateMilestoneDate();
  const avanzaMilestone = useAvanzamentoMilestone();

  const mio = isAdmin || cert?.pm_id === user?.id;

  const [sezioneAperta, setSezioneAperta] = useState(false);
  const [importAperto, setImportAperto] = useState(false);
  const [ossatura, setOssatura] = useState<RigaOssatura[]>([]);
  const [focus, setFocus] = useState<string | null>(null);
  const [cascataPer, setCascataPer] = useState<string | null>(null);
  const [cascataDati, setCascataDati] = useState<{ data: string; fonte: string } | null>(null);
  const [hoverPasso, setHoverPasso] = useState<TimelineMilestone | null>(null);
  const [selEvento, setSelEvento] = useState<CronoEvento | null>(null);
  const [anteprimaAncora, setAnteprimaAncora] = useState<string | null>(null);
  const [conseguenza, setConseguenza] = useState<{ id: string; testo: string } | null>(null);
  const campiRef = useRef<Record<string, HTMLInputElement | null>>({});

  const tipoEffettivo: ProjectTipo = cert
    ? ((cert as any).project_tipo as ProjectTipo | null) ?? proponiTipo(cert.cert_type, cert.cert_rating).tipo
    : "design_construction";

  // L'ossatura si prepara appena si sa che il record non c'e'. Vive in locale
  // finche' il PM non la tocca: il primo salvataggio la rende condivisa.
  useEffect(() => {
    if (!cert || crono || cronoInCaricamento || tipoEffettivo === "existing") return;
    if (ossatura.length > 0) return;
    const key = templateDelTipo(tipoEffettivo, cert.cert_type, cert.cert_rating);
    setOssatura(ossaturaDaTemplate(key, cert.baseline_handover_date ?? cert.handover_date ?? null));
  }, [cert, crono, cronoInCaricamento, tipoEffettivo, ossatura.length]);

  // La frase di conseguenza dura il tempo di leggerla (§3.2.1 punto 4).
  useEffect(() => {
    if (!conseguenza) return;
    const t = setTimeout(() => setConseguenza(null), 6500);
    return () => clearTimeout(t);
  }, [conseguenza]);

  const violPerOrdine = useMemo(() => new Map(violazioni.map((v) => [v.order_index, v])), [violazioni]);
  const vincoliPerOrdine = useMemo(() => new Map(vincoli.map((v) => [v.order_index, v])), [vincoli]);

  const eventoHandover = eventi.find((e) => e.ancora === "handover");
  const eventoStart = eventi.find((e) => e.ancora === "construction_start");

  /** La riga di progetto da cui un passo pende: e' il legame che si accende. */
  const eventoDiPasso = (m: TimelineMilestone): CronoEvento | undefined => {
    if (m.crono_evento_id) return eventi.find((e) => e.id === m.crono_evento_id);
    if (m.derived_from === "handover") return eventoHandover;
    if (m.derived_from === "crono_construction_start") return eventoStart;
    const nat = naturaPasso(m);
    if (nat === "calcolato" || nat === "serie") return eventoHandover;
    return undefined;
  };

  // Evidenziazione bidirezionale (§3.2): dal passo alla riga e viceversa.
  const evidenziate = useMemo(() => {
    const out: string[] = [];
    if (anteprimaAncora) out.push(`evt:${anteprimaAncora}`);
    if (hoverPasso) {
      out.push(`ms:${hoverPasso.id}`);
      const ev = eventoDiPasso(hoverPasso);
      if (ev) out.push(`evt:${ev.id}`);
    }
    if (selEvento) {
      out.push(`evt:${selEvento.id}`);
      for (const m of milestones) if (eventoDiPasso(m)?.id === selEvento.id) out.push(`ms:${m.id}`);
    }
    return out;
  }, [anteprimaAncora, hoverPasso, selEvento, milestones, eventi]);

  const passiAccesi = useMemo(() => {
    if (!selEvento) return new Set<string>();
    return new Set(milestones.filter((m) => eventoDiPasso(m)?.id === selEvento.id).map((m) => m.id));
  }, [selEvento, milestones, eventi]);

  // ── Le voci del pannello ────────────────────────────────────────────────
  const voci: VoceTimeline[] = useMemo(() => {
    const righe: Array<{ id: string; nome: string; inizio: string | null; fine: string | null; famiglia: any; ancora: string | null; stato?: string; fonte?: string | null; effettiva?: string | null; avanzamento?: number | null }> =
      crono
        ? eventi.map((e) => ({
            id: e.id, nome: e.nome, inizio: e.data_effettiva ?? e.data_pianificata, fine: e.data_fine,
            famiglia: e.famiglia, ancora: e.ancora, stato: e.stato, fonte: e.fonte, effettiva: e.data_effettiva,
            avanzamento: e.avanzamento,
          }))
        : ossatura.map((r) => ({
            id: r.id, nome: r.nome, inizio: r.inizio, fine: r.fine,
            famiglia: r.famiglia, ancora: r.ancora, fonte: r.fonte, avanzamento: 0,
          }));

    const out: VoceTimeline[] = righe.map((r) => ({
      key: `evt:${r.id}`,
      label: r.nome,
      corsia: "project" as const,
      tipo: r.fine ? ("fase" as const) : ("milestone" as const),
      inizio: r.inizio,
      fine: r.fine,
      famiglia: r.famiglia,
      natura: "ancora" as const,
      fatta: !!r.effettiva || (r.avanzamento ?? 0) >= 100,
      avanzamento: r.avanzamento ?? 0,
      daConfermare: r.stato === "da_confermare",
      isHandover: r.ancora === "handover",
      nota: r.fonte,
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
        inizio: m.due_date,
        natura: nat,
        fatta: m.status === "achieved" || !!m.completed_date,
        avanzamento: m.avanzamento ?? 0,
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
  }, [crono, eventi, ossatura, milestones, violPerOrdine]);

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
            natura: m.derived_from ? ("ereditato" as const) : m.anchor_order !== null ? ("calcolato" as const) : ("pm" as const),
          })),
      }));
  }, [corsieSito, cert]);

  if (!cert) {
    return (
      <MainLayout title="Project timeline">
        <div className="py-20 text-center text-muted-foreground">Caricamento…</div>
      </MainLayout>
    );
  }

  const servizio = `${cert.cert_type ?? ""} ${cert.cert_rating ?? ""} ${cert.name ?? ""}`;
  const tinta = tintaServizio(servizio).strong;
  const bloccata = tipoEffettivo !== "existing" && !crono;

  return (
    <MainLayout
      title={cert.sito?.name ?? "Project timeline"}
      subtitle={`${cert.client ?? ""} · ${cert.sito?.city ?? ""} · ${PROJECT_TIPO_LABEL[tipoEffettivo]} · ${cert.name ?? ""}`}
    >
      {/* Breadcrumb sempre presente e cliccabile (§0.2). */}
      <nav className="mb-4 flex items-center gap-1 text-xs text-muted-foreground" aria-label="Percorso">
        <button onClick={() => navigate("/projects")} className="hover:text-foreground hover:underline">
          Services
        </button>
        <ChevronRight className="h-3 w-3" />
        <button onClick={() => navigate("/portafoglio")} className="hover:text-foreground hover:underline">
          {cert.sito?.name ?? "Sito"}
        </button>
        <ChevronRight className="h-3 w-3" />
        <span className="font-medium text-foreground">{cert.name}</span>
      </nav>

      {/* Il pannello sta in colonna 1 e il lavoro in colonna 2: la timeline e'
          cio' che si guarda mentre si compila, non un riquadro di servizio. In
          DOM resta seconda — si legge il form, poi il disegno. */}
      <div className="grid gap-6 xl:grid-cols-[minmax(520px,34%)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5 xl:order-2">
          <ConfermeInSospeso />

          {/* ══ ① PROJECT TIMELINE ══ */}
          <Card className="p-5">
            <Intestazione
              numero={1}
              titolo="PROJECT TIMELINE"
              nota="Un record unico per sito, condiviso: compilata una volta, è compilata per tutte le certificazioni che vi insistono."
              badge={crono ? "condivisa" : undefined}
            />
            <SezioneProjectTimeline
              cert={cert}
              siteId={siteId!}
              tipoEffettivo={tipoEffettivo}
              crono={crono}
              cronoInCaricamento={cronoInCaricamento}
              eventi={eventi}
              altreCertIds={altreCert.length ? altreCert.map((c) => c.id) : [cert.id]}
              modificabile={mio}
              aperta={sezioneAperta}
              setAperta={setSezioneAperta}
              onImporta={() => setImportAperto(true)}
              ossatura={ossatura}
              setOssatura={setOssatura}
              selezionatoId={selEvento?.id ?? null}
              evidenziatoId={hoverPasso ? eventoDiPasso(hoverPasso)?.id ?? null : anteprimaAncora}
              onSeleziona={(e) => setSelEvento((cur) => (cur?.id === e.id ? null : e))}
              onCascata={(e, data, fonte) => {
                setCascataPer(e.id);
                setCascataDati({ data, fonte });
              }}
              cascataPer={cascataPer}
              renderCascata={(e) => (
                <CascataInline
                  evento={e}
                  nuovaData={cascataDati?.data ?? ""}
                  fonte={cascataDati?.fonte ?? e.fonte ?? ""}
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
                    setCascataDati(null);
                  }}
                  onAnnulla={() => {
                    setCascataPer(null);
                    setCascataDati(null);
                  }}
                />
              )}
            />

            <ImportTimeline
              aperto={importAperto}
              onChiudi={() => {
                setImportAperto(false);
                if (crono) setSezioneAperta(true);
              }}
              siteId={siteId!}
              nomeSito={cert.sito?.name ?? null}
              cronoprogrammaId={crono?.id ?? null}
              eventi={eventi}
              tipoProposto={tipoEffettivo === "construction" ? "construction" : "design_construction"}
              handoverBaseline={cert.baseline_handover_date ?? cert.handover_date}
              certIds={altreCert.length ? altreCert.map((c) => c.id) : [cert.id]}
              onRiprendi={() => setImportAperto(true)}
            />
          </Card>

          {/* ══ ② HQ FGB TIMELINE ══ */}
          <Card className={cn("p-5", (gate?.bloccata || bloccata) && "opacity-60")}>
            <Intestazione
              numero={2}
              titolo="HQ FGB TIMELINE"
              nota="La FGB timeline integra il cronoprogramma di progetto con le milestone della certificazione che compili tu."
              badge={cert.name ?? undefined}
            />

            {gate?.bloccata || bloccata ? (
              <div className="flex items-start gap-3 rounded-lg border border-dashed bg-muted/30 p-5">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {gate?.motivo ?? "Si sblocca compilando la project timeline."}
                </p>
              </div>
            ) : milestones.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center">
                <Button
                  disabled={!mio || genera.isPending}
                  onClick={async () => {
                    const n = await genera.mutateAsync(cert.id);
                    toast({
                      title: n > 0 ? `Timeline generata · ${n} passi` : "Niente da generare",
                      description: n > 0 ? undefined : "La timeline esiste già oppure il gate è ancora chiuso.",
                    });
                  }}
                >
                  <Sparkles className="mr-1.5 h-4 w-4" /> Genera dalla scaletta {cert.name}
                </Button>
              </div>
            ) : (
              <TabellaPassi
                milestones={milestones}
                eventi={eventi}
                modificabile={mio}
                violPerOrdine={violPerOrdine}
                vincoliPerOrdine={vincoliPerOrdine}
                setFocus={setFocus}
                campiRef={campiRef}
                certId={cert.id}
                cronoId={crono?.id ?? null}
                certNome={cert.name}
                tinta={tinta}
                onHover={setHoverPasso}
                passiAccesi={passiAccesi}
                onAnteprimaAncora={setAnteprimaAncora}
                conseguenza={conseguenza}
                onConseguenza={(id, testo) => setConseguenza({ id, testo })}
                onAvanzamento={async (m: TimelineMilestone, v: number) => {
                  await avanzaMilestone.mutateAsync({ id: m.id, avanzamento: v });
                  toast({
                    title: v >= 100 ? "Completato" : v === 0 ? "Riaperto" : `${v}%`,
                    description: m.requirement,
                  });
                }}
                onSalva={async (m: TimelineMilestone, v: string) => {
                  await salvaMilestone.mutateAsync({ id: m.id, due_date: v || null });
                  toast({ title: "Salvato", description: `${m.requirement} · ${df(v)}` });
                }}
              />
            )}

            {conteggi.length > 0 && conteggi[0].proiettati > 0 && <ContatoreReport c={conteggi[0]} />}
          </Card>

          {/* ══ §3.3 · Le altre certificazioni del sito, in sola lettura ══ */}
          {altreCorsie.length > 0 && (
            <Card className="p-5">
              <p className="mb-1 text-sm font-medium">Le altre certificazioni sul sito 🔒</p>
              <p className="mb-4 text-xs text-muted-foreground">
                Servono a vedere le finestre dei colleghi, non si toccano.
              </p>
              <div className="space-y-3">
                {altreCorsie.map((c) => {
                  const t = tintaServizio(c.servizio);
                  const pm = corsieSito?.certificazioni.find((x) => x.id === c.id)?.pm;
                  return (
                    <div key={c.id}>
                      <button
                        onClick={() => navigate(`/projects/${c.id}/cronoprogramma`)}
                        className="flex items-center gap-2 text-sm hover:underline"
                      >
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-sm border"
                          style={{ background: t.bg, borderColor: t.strong, borderStyle: t.dashed ? "dashed" : "solid" }}
                        />
                        <b style={{ color: t.strong }}>{c.titolo}</b>
                        <span className="text-xs text-muted-foreground">· {pm ?? "senza PM"}</span>
                      </button>
                      <p className="ml-4.5 mt-0.5 truncate text-[11px] text-muted-foreground">
                        {c.voci.filter((v) => v.inizio).slice(0, 4).map((v) => `${v.label} · ${df(v.inizio)}`).join("  ·  ")}
                        {c.voci.length > 4 && " …"}
                      </p>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          <Registro cronoId={crono?.id} numero={3} />
        </div>

        {/* ══ Il pannello timeline: protagonista, sticky, a tutta altezza ══ */}
        <div className="flex flex-col xl:sticky xl:top-[92px] xl:order-1 xl:h-[calc(100vh-112px)] xl:self-start">
          <p className="mb-2 shrink-0 text-[10.5px] uppercase tracking-wider text-muted-foreground">
            Timeline live · tocca per espandere
          </p>
          <TimelineVerticale
            voci={voci}
            scadenzaContratto={cert.contract_end_date}
            focus={focus}
            evidenziate={evidenziate}
            onVoceClick={(key) => {
              setFocus(key);
              const id = key.split(":")[1];
              campiRef.current[id]?.focus();
              campiRef.current[id]?.scrollIntoView({ block: "center", behavior: "smooth" });
            }}
            titoloProject="Project timeline"
            titoloCert={cert.name ?? "HQ FGB timeline"}
            servizio={servizio}
            altreCorsie={altreCorsie}
            compatta
            riempi
          />
          {violazioni.length > 0 && (
            <div className="mt-3 max-h-[28%] shrink-0 space-y-2 overflow-y-auto">
              {violazioni.map((v) => (
                <div
                  key={v.order_index}
                  className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    <b>{v.requirement}</b> — {v.messaggio}
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

// ── Pezzi ─────────────────────────────────────────────────────────────────

function Intestazione({ numero, titolo, nota, badge }: { numero: number; titolo: string; nota: string; badge?: string }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-[11px] text-background">
          {numero}
        </span>
        <h2 className="text-sm font-medium uppercase tracking-wide">{titolo}</h2>
        {badge && <Badge variant="secondary" className="text-[10px]">{badge}</Badge>}
      </div>
      <p className="mt-1.5 max-w-[70ch] text-xs text-muted-foreground">{nota}</p>
    </div>
  );
}

function TabellaPassi({
  milestones,
  eventi,
  modificabile,
  violPerOrdine,
  vincoliPerOrdine,
  setFocus,
  campiRef,
  certId,
  cronoId,
  certNome,
  tinta,
  onHover,
  passiAccesi,
  onAnteprimaAncora,
  conseguenza,
  onConseguenza,
  onSalva,
  onAvanzamento,
}: any) {
  const singole = milestones.filter((m: TimelineMilestone) => m.series_step_order === null);
  const serie = milestones.filter((m: TimelineMilestone) => m.series_step_order !== null);
  const [hintChiuso, setHintChiuso] = useState(
    () => typeof window !== "undefined" && localStorage.getItem("fgb.hintAncora") === "1"
  );
  const primoCalcolato = singole.find((m: TimelineMilestone) => naturaPasso(m) === "calcolato");

  /**
   * La base per le scorciatoie «+30gg» del calendario: l'ultimo passo datato
   * prima di questo, e se non ce n'e' l'handover del cantiere. Non e' un
   * ancoraggio — quello sta nella colonna accanto e lo si dichiara — e' solo
   * il numero da cui un PM conta quando scrive una data a mano.
   */
  const riferimento = (i: number): { data: string; nome: string } | null => {
    for (let k = i - 1; k >= 0; k--) {
      const p = singole[k] as TimelineMilestone;
      if (p.due_date) return { data: p.due_date, nome: p.requirement };
    }
    const h = eventi.find((e: CronoEvento) => e.ancora === "handover");
    const d = h?.data_effettiva ?? h?.data_pianificata;
    return d ? { data: d, nome: h!.nome } : null;
  };

  return (
    <div className="overflow-x-auto">
      {/* Suggerimento una-tantum sul primo passo calcolato (§3.2.1 punto 7). */}
      {!hintChiuso && primoCalcolato && (
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-foreground px-3 py-2 text-[11px] text-background">
          <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">
            Questa data è collegata alla project timeline: tocca la catena per vedere o cambiare il
            collegamento.
          </span>
          <button
            onClick={() => {
              localStorage.setItem("fgb.hintAncora", "1");
              setHintChiuso(true);
            }}
            className="font-semibold underline"
          >
            Ok
          </button>
        </div>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <th className="px-2 py-1.5 text-left font-medium">#</th>
            <th className="px-2 py-1.5 text-left font-medium">Passo</th>
            <th className="px-2 py-1.5 text-left font-medium">Natura</th>
            <th className="px-2 py-1.5 text-left font-medium">Data</th>
            <th className="px-2 py-1.5 text-left font-medium">Ancorato a</th>
            <th className="px-2 py-1.5 text-left font-medium" title="Tocca l'anello per aggiornare">
              Avanz.
            </th>
          </tr>
        </thead>
        <tbody>
          {singole.map((m: TimelineMilestone, i: number) => {
            const nat = naturaPasso(m);
            const v = m.order_index !== null ? violPerOrdine.get(m.order_index) : undefined;
            const editabile = modificabile && nat === "pm" && !m.edit_locked_for_pm;
            const acceso = passiAccesi.has(m.id);
            const collegata = !!m.crono_evento_id;
            return (
              <Fragment key={m.id}>
                <tr

                  className={cn(
                    "h-10 border-b last:border-0 transition-colors",
                    m.not_applicable && "opacity-40",
                    acceso && "bg-primary/5"
                  )}
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
                    <Badge variant="outline" className="text-[10px]">
                      {NATURA_ETICHETTA[nat]}
                      {m.optional ? " · opz" : ""}
                    </Badge>
                  </td>
                  <td className="px-2 py-1">
                    {editabile ? (
                      <CampoData
                        value={m.due_date}
                        ref={(el) => (campiRef.current[m.id] = el)}
                        aria={`Data di ${m.requirement}`}
                        placeholder="aggiungi"
                        attesa
                        tinta={tinta}
                        onFocus={() => setFocus(`ms:${m.id}`)}
                        onBlur={() => setFocus(null)}
                        riferimento={riferimento(i)?.data ?? null}
                        riferimentoNome={riferimento(i)?.nome ?? null}
                        onChange={(val) => onSalva(m, val ?? "")}
                        className={cn("w-[136px]", v && "border-amber-500")}
                      />
                    ) : (
                      /* Una data collegata si distingue a colpo d'occhio da una
                         scritta a mano: tinta del servizio e catena (§3.2.1.4). */
                      <span
                        className={cn("inline-flex items-center gap-1 text-xs tabular-nums", collegata && "font-semibold")}
                        style={collegata ? { color: tinta } : undefined}
                      >
                        {df(m.due_date)}
                        {collegata && <Link2 className="h-3 w-3" aria-label="Data collegata" />}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1">
                    <AncoratoA
                      m={m}
                      eventi={eventi}
                      passi={singole}
                      vincolo={m.order_index !== null ? vincoliPerOrdine.get(m.order_index) : undefined}
                      modificabile={modificabile}
                      certId={certId}
                      cronoId={cronoId}
                      certNome={certNome}
                      tinta={tinta}
                      onAnteprimaAncora={onAnteprimaAncora}
                      onConseguenza={onConseguenza}
                    />
                  </td>
                  <td className="px-2 py-1">
                    {/* Era una checkbox senza onChange: non salvava niente.
                        Adesso e' l'unico comando dell'avanzamento — lo status
                        lo deriva il database. Un passo di certificazione e'
                        un istante (una consegna, una submission): il gesto e'
                        uno, fatto / non fatto. */}
                    <AnelloAvanzamento
                      pct={m.avanzamento ?? 0}
                      istante
                      inizio={m.due_date}
                      aggiornatoIl={m.avanzamento_aggiornato_il}
                      tinta={tinta}
                      etichetta={m.requirement}
                      disabled={!modificabile || m.not_applicable}
                      onChange={(v) => onAvanzamento(m, v)}
                    />
                  </td>
                </tr>
                {conseguenza?.id === m.id && (
                  <tr key={`${m.id}-conseguenza`}>
                    <td colSpan={6} className="px-2 pb-2">
                      <p className="rounded-md bg-muted px-2.5 py-1.5 text-[11px] text-muted-foreground">
                        {conseguenza.testo}
                      </p>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}

          {serie.length > 0 && (
            <tr className="border-b last:border-0">
              <td className="px-2 py-1 text-xs text-muted-foreground">{serie[0].series_step_order}</td>
              <td className="px-2 py-1">
                FGB Construction Reports
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {serie.length} occorrenze, dal {format(parseISO(serie[0].due_date!), "LLL yy", { locale: it })} al{" "}
                  {format(parseISO(serie[serie.length - 1].due_date!), "LLL yy", { locale: it })}
                </div>
              </td>
              <td className="px-2 py-1">
                <Badge variant="outline" className="text-[10px]">serie</Badge>
              </td>
              <td className="px-2 py-1 text-xs">
                <b className="tabular-nums">{serie.length}</b> occorrenze
              </td>
              <td className="px-2 py-1 text-[11px] text-muted-foreground">
                mensile · da Construction start a Handover
              </td>
              <td />
            </tr>
          )}
        </tbody>
      </table>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Spuntare «Fatto» è un fatto di SAL: alimenta la fatturazione, non solo lo stato.
      </p>
    </div>
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
        {delta === 0 ? "nessuna variazione" : delta > 0 ? `${delta} in più da fatturare` : `${Math.abs(delta)} in meno del venduto`}
      </span>
    </div>
  );
}

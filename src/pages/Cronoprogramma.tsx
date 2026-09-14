import { useEffect, useMemo, useRef, useState } from "react";
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
import { AlertTriangle, FileUp, Link2, Lock, Plus, Sparkles, Trash2 } from "lucide-react";
import {
  FONTI_SUGGERITE,
  NATURA_ETICHETTA,
  naturaPasso,
  type CronoEvento,
  type TimelineMilestone,
} from "@/types/cronoprogramma";
import {
  PROJECT_TIPO_DESC,
  PROJECT_TIPO_LABEL,
  TEMPLATE_BY_KEY,
  proponiTipo,
  type ProjectTipo,
  type TemplateKey,
  type TemplateRiga,
} from "@/lib/projectTimelineTemplates";
import {
  useAggiungiEvento,
  useAttachCronoprogramma,
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
} from "@/hooks/useCronoprogramma";
import { TimelineVerticale, type VoceTimeline } from "@/components/cronoprogramma/TimelineVerticale";
import { CascataInline, ConfermeInSospeso, Registro } from "@/components/cronoprogramma/Cascata";
import { ImportTimeline } from "@/components/cronoprogramma/ImportTimeline";

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
 * PROJECT TIMELINE e HQ FGB TIMELINE — v1.1.
 *
 * L'ordine e' vincolato: prima la PROJECT TIMELINE del sito (una sola,
 * condivisa), poi la timeline della certificazione, che ne eredita
 * Construction Start e Handover. L'aggiornamento delle date avviene
 * modificando direttamente le righe: cambio una data → anteprima della
 * cascata → conferma → registro. La sezione «nuove date» non esiste piu'.
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
  const { data: crono } = useCronoprogrammaBySite(siteId);
  const { data: eventi = [] } = useCronoEventi(crono?.id);
  const { data: gate } = useCertGate(projectId);
  const { data: milestones = [] } = useTimelineMilestones(projectId);
  const { data: violazioni = [] } = useViolazioni(projectId);
  const { data: conteggi = [] } = useSerieConteggi(projectId);
  const { data: altreCert = [] } = useCertificazioniSulSito(siteId);

  const aggancia = useAttachCronoprogramma();
  const salvaEvento = useUpsertEvento();
  const aggiungiEvento = useAggiungiEvento();
  const eliminaEvento = useEliminaEvento();
  const genera = useMaterializeTimeline();
  const salvaMilestone = useUpdateMilestoneDate();

  const mio = isAdmin || cert?.pm_id === user?.id;

  // ── Bozza locale ────────────────────────────────────────────────────────
  const [bozzaEventi, setBozzaEventi] = useState<Record<string, BozzaEvento>>({});
  const [bozzaPassi, setBozzaPassi] = useState<Record<string, string>>({});
  const [focus, setFocus] = useState<string | null>(null);
  const [cascataPer, setCascataPer] = useState<string | null>(null);
  const [importAperto, setImportAperto] = useState(false);
  const campiRef = useRef<Record<string, HTMLInputElement | null>>({});

  const bozzaEventiLenta = useDebounced(bozzaEventi);
  const bozzaPassiLenta = useDebounced(bozzaPassi);

  const dataEvento = (e: CronoEvento) =>
    bozzaEventiLenta[e.id]?.inizio ?? e.data_effettiva ?? e.data_pianificata ?? null;
  const fineEvento = (e: CronoEvento) => bozzaEventiLenta[e.id]?.fine ?? e.data_fine ?? null;
  const dataPasso = (m: TimelineMilestone) => bozzaPassiLenta[m.id] ?? m.due_date ?? null;

  // ── Le voci del grafico verticale ───────────────────────────────────────
  const violPerOrdine = useMemo(
    () => new Map(violazioni.map((v) => [v.order_index, v])),
    [violazioni]
  );

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

  const cronoAltrove = !crono && altreCert.some((c) => c.cronoprogramma_id);
  const agganciata = !!(cert as any).cronoprogramma_id || altreCert.find((c) => c.id === cert.id)?.cronoprogramma_id;
  const tipoEffettivo: ProjectTipo =
    ((cert as any).project_tipo as ProjectTipo | null) ??
    proponiTipo(cert.cert_type, cert.cert_rating).tipo;
  const isExisting = tipoEffettivo === "existing";

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
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_230px]">
        <div className="min-w-0 space-y-6">
          <ConfermeInSospeso />

          {/* ══ 1 · PROJECT TIMELINE ══ */}
          <Card className="p-5">
            <Intestazione
              numero={1}
              titolo="PROJECT TIMELINE"
              nota={
                isExisting
                  ? "Progetto su edificio in esercizio: nessuna timeline di cantiere. Si va dritti alla HQ FGB TIMELINE."
                  : "Una sola per sito, condivisa da tutte le certificazioni che vi insistono. L'handover arriva dalla quotazione; le date di progetto le metti tu, quelle di cantiere le integri dal gantt del GC — a mano o importando il file."
              }
              badge={crono ? "condivisa" : undefined}
            />

            {isExisting ? (
              <TipoSelettore cert={cert} tipoEffettivo={tipoEffettivo} mio={mio} />
            ) : !crono ? (
              <CreaProjectTimeline
                cert={cert}
                siteId={siteId!}
                altreCert={altreCert}
                mio={mio}
                tipoProposto={tipoEffettivo}
              />
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
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    disabled={!mio}
                    onClick={() => setImportAperto(true)}
                  >
                    <FileUp className="mr-1 h-3.5 w-3.5" /> Importa da file
                  </Button>
                </div>
                <ImportTimeline
                  aperto={importAperto}
                  onChiudi={() => setImportAperto(false)}
                  cronoprogrammaId={crono.id}
                  eventi={eventi}
                />
              </>
            )}
          </Card>

          {/* ══ 2 · HQ FGB TIMELINE ══ */}
          <Card className={cn("p-5", gate?.bloccata && "opacity-60")}>
            <Intestazione
              numero={2}
              titolo="HQ FGB TIMELINE"
              nota="La FGB timeline integra il cronoprogramma di progetto con le milestone della/e certificazione/i che inserisci tu. Construction Start e Handover non si compilano qui: sono ereditati, in sola lettura."
              badge={cert.name ?? undefined}
            />

            {gate?.bloccata ? (
              <div className="flex items-start gap-3 rounded-lg border border-dashed bg-muted/30 p-5">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{gate.motivo}</p>
              </div>
            ) : milestones.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center">
                {cronoAltrove && !agganciata && (
                  <p className="mb-3 text-xs text-muted-foreground">
                    <Link2 className="mr-1 inline h-3 w-3" />
                    Il sito ha gia' una PROJECT TIMELINE: questa certificazione vi si aggancia, non ne crea una seconda.
                  </p>
                )}
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
                bozza={bozzaPassi}
                setBozza={setBozzaPassi}
                modificabile={mio}
                violPerOrdine={violPerOrdine}
                setFocus={setFocus}
                campiRef={campiRef}
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

            {conteggi.length > 0 && conteggi[0].proiettati > 0 && (
              <ContatoreReport c={conteggi[0]} />
            )}
          </Card>

          {/* ══ 3 · Il registro ══ */}
          <Registro cronoId={crono?.id} numero={3} />

          {/* ══ Le altre certificazioni sullo stesso sito ══ */}
          {altreCert.filter((c) => c.id !== cert.id).length > 0 && (
            <Card className="p-5">
              <p className="mb-1 text-sm font-medium">Le altre certificazioni su questo sito</p>
              <p className="mb-4 text-xs text-muted-foreground">
                Le vedi, non le modifichi. Servono a sapere quando un collega ha in programma la sua
                campagna, prima che i due calendari si scontrino in cantiere.
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

        {/* ══ Il grafico verticale: compatto e sticky, click per espandere ══ */}
        <div className="xl:sticky xl:top-[120px] xl:self-start">
          <p className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            Come si dispone · tocca per espandere
          </p>
          <TimelineVerticale
            voci={voci}
            scadenzaContratto={cert.contract_end_date}
            focus={focus}
            onVoceClick={portaAlCampo}
            titoloProject="Project timeline"
            titoloCert={cert.name ?? "HQ FGB timeline"}
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

// ── Creazione: tipo + template rivedibile ─────────────────────────────────

function CreaProjectTimeline({
  cert,
  siteId,
  altreCert,
  mio,
  tipoProposto,
}: {
  cert: any;
  siteId: string;
  altreCert: any[];
  mio: boolean;
  tipoProposto: ProjectTipo;
}) {
  const { toast } = useToast();
  const creaCrono = useCreateCronoprogramma();
  const aggancia = useAttachCronoprogramma();
  const setTipo = useSetProjectTipo();

  const proposta = proponiTipo(cert.cert_type, cert.cert_rating);
  const [tipo, setTipoLocale] = useState<ProjectTipo>(tipoProposto);
  const [template, setTemplate] = useState<TemplateKey>(proposta.template ?? "bdc");
  const [righe, setRighe] = useState<TemplateRiga[]>(TEMPLATE_BY_KEY[proposta.template ?? "bdc"].righe);

  const cambiaTemplate = (k: TemplateKey) => {
    setTemplate(k);
    setRighe(TEMPLATE_BY_KEY[k].righe);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(PROJECT_TIPO_LABEL) as ProjectTipo[]).map((t) => (
          <button
            key={t}
            type="button"
            disabled={!mio}
            onClick={async () => {
              setTipoLocale(t);
              // L'override si scrive solo quando diverge dalla proposta del
              // catalogo: cosi' il default resta il catalogo, non una copia.
              await setTipo.mutateAsync({
                certification_id: cert.id,
                project_tipo: t === proposta.tipo ? null : t,
              });
              if (t === "construction") cambiaTemplate("construction");
              if (t === "design_construction" && template === "construction")
                cambiaTemplate(proposta.template === "idc" ? "idc" : "bdc");
            }}
            className={cn(
              "rounded-lg border px-3 py-2 text-left transition-colors",
              tipo === t ? "border-primary bg-primary/5" : "hover:bg-muted/50"
            )}
          >
            <span className={cn("block text-xs font-medium", tipo === t && "text-primary")}>
              {PROJECT_TIPO_LABEL[t]}
              {t === proposta.tipo && <span className="ml-1.5 text-[10px] text-muted-foreground">proposto dal catalogo</span>}
            </span>
            <span className="mt-0.5 block max-w-[260px] text-[11px] text-muted-foreground">
              {PROJECT_TIPO_DESC[t]}
            </span>
          </button>
        ))}
      </div>

      {tipo !== "existing" && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">Template:</span>
            {(Object.keys(TEMPLATE_BY_KEY) as TemplateKey[])
              .filter((k) => (tipo === "construction" ? k === "construction" : k !== "construction"))
              .map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => cambiaTemplate(k)}
                  className={cn(
                    "rounded-full border px-2.5 py-1",
                    template === k ? "border-primary text-primary" : "text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  {TEMPLATE_BY_KEY[k].label}
                </button>
              ))}
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-2 py-2 text-left font-medium">Fase / milestone</th>
                  <th className="px-2 py-2 text-left font-medium">Natura</th>
                  <th className="px-2 py-2 text-left font-medium">Ancora FGB</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {righe.map((r, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-2 py-1.5">
                      <Input
                        value={r.nome}
                        onChange={(e) =>
                          setRighe((rs) => rs.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))
                        }
                        className="h-7 min-w-[240px] text-xs"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground">{r.fase ? "fase" : "milestone"}</td>
                    <td className="px-2 py-1.5">
                      {r.ancora ? (
                        <Badge variant="outline" className="text-[10px]">● {r.ancora.replace(/_/g, " ")}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {r.ancora !== "handover" && (
                        <button
                          type="button"
                          onClick={() => setRighe((rs) => rs.filter((_, j) => j !== i))}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label={`Togli ${r.nome}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={!mio || creaCrono.isPending}
              onClick={async () => {
                try {
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
                  toast({ title: "PROJECT TIMELINE creata", description: "Le certificazioni del sito sono state agganciate." });
                } catch (e: any) {
                  toast({ variant: "destructive", title: "Errore", description: e.message });
                }
              }}
            >
              <Plus className="mr-1.5 h-4 w-4" /> Crea la PROJECT TIMELINE
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Nasce con l'handover contrattuale gia' dentro
              {cert.baseline_handover_date
                ? ` (${format(parseISO(cert.baseline_handover_date), "d LLL yyyy", { locale: it })})`
                : ""}
              . Le date le metti dopo, a mano o con l'import.
            </p>
          </div>
        </>
      )}
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

function Intestazione({
  numero,
  titolo,
  nota,
  badge,
}: {
  numero: number;
  titolo: string;
  nota: string;
  badge?: string;
}) {
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
}: any) {
  const scrivi = (id: string, campi: Partial<BozzaEvento>) =>
    setBozza((s: any) => ({ ...s, [id]: { ...s[id], ...campi } }));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-[10px] uppercase tracking-wider text-muted-foreground">
            <th className="px-2 py-2 text-left font-medium">Fase / milestone</th>
            <th className="px-2 py-2 text-left font-medium">Inizio</th>
            <th className="px-2 py-2 text-left font-medium">Fine</th>
            <th className="px-2 py-2 text-left font-medium">Fonte</th>
            <th className="px-2 py-2 text-left font-medium">Stato</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {eventi.map((e: CronoEvento) => {
            const b = bozza[e.id] ?? {};
            const inizio = b.inizio ?? e.data_pianificata ?? "";
            const fine = b.fine ?? e.data_fine ?? "";
            const fonte = b.fonte ?? e.fonte ?? "";
            const nome = b.nome ?? e.nome;
            const sporco = Object.keys(b).length > 0;
            const libera = e.ancora === null;
            return (
              <>
                <tr key={e.id} className="border-b last:border-0">
                  <td className="px-2 py-2">
                    {libera && modificabile ? (
                      <Input
                        value={nome}
                        onChange={(ev) => scrivi(e.id, { nome: ev.target.value })}
                        className="h-8 min-w-[180px] text-xs"
                      />
                    ) : (
                      <span className="flex items-center gap-1.5">
                        {e.nome}
                        {e.ancora && (
                          <span className="text-[10px] text-muted-foreground" title="Ancora FGB">●</span>
                        )}
                      </span>
                    )}
                    {e.famiglia && (
                      <span className="mt-0.5 block text-[10px] capitalize text-muted-foreground">
                        {e.famiglia.replace("_", " ")}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      type="date"
                      value={inizio}
                      disabled={!modificabile}
                      ref={(el) => (campiRef.current[e.id] = el)}
                      onFocus={() => setFocus(`evt:${e.id}`)}
                      onBlur={() => setFocus(null)}
                      onChange={(ev) => scrivi(e.id, { inizio: ev.target.value })}
                      className="h-8 w-[135px] text-xs"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      type="date"
                      value={fine}
                      disabled={!modificabile}
                      title="Solo per le fasi: una milestone e' un istante"
                      onChange={(ev) => scrivi(e.id, { fine: ev.target.value })}
                      className="h-8 w-[135px] text-xs"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      list="fonti-crono"
                      value={fonte}
                      disabled={!modificabile}
                      placeholder="consigliata"
                      onChange={(ev) => scrivi(e.id, { fonte: ev.target.value })}
                      className="h-8 w-[160px] text-xs"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px]",
                        e.stato === "confermata" && "border-emerald-300 bg-emerald-50 text-emerald-700",
                        e.stato === "da_confermare" && "border-amber-300 bg-amber-50 text-amber-700"
                      )}
                    >
                      {e.stato === "da_confermare" ? "da confermare" : e.stato}
                    </Badge>
                  </td>
                  <td className="px-2 py-2 text-right">
                    <span className="flex items-center justify-end gap-1.5">
                      {sporco && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onSalva(e)}>
                          Salva
                        </Button>
                      )}
                      {libera && modificabile && (
                        <button
                          type="button"
                          onClick={() => onElimina(e)}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label={`Elimina ${e.nome}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
                {cascataPer === e.id && (
                  <tr key={`${e.id}-cascata`}>
                    <td colSpan={6} className="px-2 pb-3">
                      {renderCascata(e)}
                    </td>
                  </tr>
                )}
              </>
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
  bozza,
  setBozza,
  modificabile,
  violPerOrdine,
  setFocus,
  campiRef,
  onSalva,
}: any) {
  const singole = milestones.filter((m: TimelineMilestone) => m.series_step_order === null);
  const serie = milestones.filter((m: TimelineMilestone) => m.series_step_order !== null);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-[10px] uppercase tracking-wider text-muted-foreground">
            <th className="px-2 py-2 text-left font-medium">#</th>
            <th className="px-2 py-2 text-left font-medium">Passo</th>
            <th className="px-2 py-2 text-left font-medium">Natura</th>
            <th className="px-2 py-2 text-left font-medium">Data</th>
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
            return (
              <tr key={m.id} className={cn("border-b last:border-0", m.not_applicable && "opacity-40")}>
                <td className="px-2 py-2 text-xs text-muted-foreground">{m.order_index}</td>
                <td className="px-2 py-2">
                  {m.requirement}
                  {v && (
                    <div className="mt-0.5 flex items-center gap-1 text-[11px] text-amber-700">
                      <AlertTriangle className="h-3 w-3" /> {v.messaggio}
                    </div>
                  )}
                </td>
                <td className="px-2 py-2">
                  <Badge variant="outline" className="text-[10px]">
                    {NATURA_ETICHETTA[nat]}
                    {nat === "calcolato" && m.offset_days !== null && ` +${m.offset_days}gg`}
                  </Badge>
                </td>
                <td className="px-2 py-2">
                  {editabile ? (
                    <Input
                      type="date"
                      value={data}
                      ref={(el) => (campiRef.current[m.id] = el)}
                      onFocus={() => setFocus(`ms:${m.id}`)}
                      onBlur={() => setFocus(null)}
                      onChange={(ev) => setBozza((s: any) => ({ ...s, [m.id]: ev.target.value }))}
                      className={cn("h-8 w-[140px] text-xs", v && "border-amber-500")}
                    />
                  ) : (
                    <span className="text-xs">
                      {m.due_date ? format(parseISO(m.due_date), "d LLL yyyy", { locale: it }) : "—"}
                      {nat === "ereditato" && (
                        <span className="ml-1.5 text-muted-foreground">dalla PROJECT TIMELINE</span>
                      )}
                    </span>
                  )}
                </td>
                <td className="px-2 py-2 text-right">
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
              <td className="px-2 py-2 text-xs text-muted-foreground">{serie[0].series_step_order}</td>
              <td className="px-2 py-2">
                FGB Construction Report — serie mensile
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {serie.length} occorrenze, dal {format(parseISO(serie[0].due_date!), "LLL yy", { locale: it })} al{" "}
                  {format(parseISO(serie[serie.length - 1].due_date!), "LLL yy", { locale: it })}
                </div>
              </td>
              <td className="px-2 py-2">
                <Badge variant="outline" className="text-[10px]">serie</Badge>
              </td>
              <td className="px-2 py-2 text-xs text-muted-foreground">generata</td>
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

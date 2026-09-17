import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ChevronRight, Loader2 } from "lucide-react";
import { TimelineLive, MetaTimeline } from "@/components/timeline/TimelineLive";
import { IntestazioneCard } from "@/components/timeline/IntestazioneCard";
import { CardProjectTimeline } from "@/components/timeline/CardProjectTimeline";
import { CardCertTimeline } from "@/components/timeline/CardCertTimeline";
import { CardImport } from "@/components/timeline/CardImport";
import { DialogoModelli } from "@/components/timeline/DialogoModelli";
import {
  useApplicaImport,
  useAutosave,
  useAncoraggio,
  useRigheManuali,
  useScritture,
  useStatoSalvataggio,
  useTimelineVista,
} from "@/hooks/useTimelineVista";
import { derivaAttivita, derivaPassi } from "@/lib/timelineDerivazione";
import { useMaterializeTimeline } from "@/hooks/useCronoprogramma";

/**
 * La vista Timeline — SPECIFICA_TIMELINE §4.
 *
 * Un solo compito per schermata: compilare le due timeline. A sinistra il
 * pannello live, sticky, che si ricompone a ogni data inserita; a destra le
 * card di compilazione. Tutto il resto — task, alert, report — sta altrove, e
 * la ragione è nel §1: la vista precedente non veniva compilata perché non si
 * capiva cosa fare, e ogni cosa in più su questa schermata è una cosa in meno
 * che il PM capisce.
 *
 * Il feedback è la sostanza della schermata, non la sua rifinitura: ogni
 * campo salva da solo dopo una pausa breve, e il pannello accanto cambia
 * subito. Chi compila deve vedere il lavoro prendere forma mentre lo fa.
 */
export default function TimelineVista() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const { data, isLoading } = useTimelineVista(projectId);
  const scritture = useScritture(projectId);
  const stato = useStatoSalvataggio(scritture.inCorso, scritture.fallito);
  const autosave = useAutosave();
  const applicaImport = useApplicaImport(projectId);
  const righe = useRigheManuali(projectId);
  const generaScaletta = useMaterializeTimeline();
  const ancoraggio = useAncoraggio(projectId);
  const [modelliAperto, setModelliAperto] = useState(false);

  const [evidenziata, setEvidenziata] = useState<string | null>(null);

  const attivita = useMemo(() => derivaAttivita(data?.attivita ?? []), [data?.attivita]);
  const passi = useMemo(
    () => derivaPassi(data?.passi ?? [], data?.attivita ?? []),
    [data?.passi, data?.attivita]
  );

  /**
   * Fa nascere i passi del servizio.
   *
   * Si chiama alla prima cosa che il PM scrive su un passo che arriva dal
   * catalogo. Il gate lato database può rifiutare — la scaletta di un
   * progetto di cantiere ha bisogno che il sito abbia una project timeline —
   * e in quel caso si dice il motivo vero invece di lasciare la schermata
   * muta: è la stessa domanda che si fa il PM guardandola.
   */
  const materializza = async () => {
    const n = await generaScaletta.mutateAsync(data!.certId);
    if (n === 0) {
      toast({
        variant: "destructive",
        title: "The service steps need the project timeline first",
        description:
          "This certification follows the construction site: fill in at least one project activity above, then the steps can be saved.",
      });
    }
    return n;
  };

  /** Il lampo sulla riga toccata: dice «ho preso» prima ancora del salvataggio. */
  const lampeggia = (id: string) => {
    setEvidenziata(id);
    setTimeout(() => setEvidenziata((c) => (c === id ? null : c)), 600);
  };

  if (isLoading || !data) {
    return (
      <MainLayout title="Timeline">
        <div className="py-20 text-center text-sm text-muted-foreground">Loading…</div>
      </MainLayout>
    );
  }

  const modificabile = data.modificabile;

  return (
    <MainLayout
      title={data.nomeSito ?? "Timeline"}
      subtitle={`${data.nomeServizio ?? ""} · fill in both timelines`}
    >
      {/* ── Barra: percorso, stato del salvataggio, uscita (§4.3) ── */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground" aria-label="Breadcrumb">
          <button onClick={() => navigate("/projects")} className="hover:text-foreground hover:underline">
            Services
          </button>
          <ChevronRight className="h-3 w-3" />
          <button onClick={() => navigate("/portafoglio")} className="hover:text-foreground hover:underline">
            {data.nomeSito ?? "Site"}
          </button>
          <ChevronRight className="h-3 w-3" />
          <span className="font-medium text-foreground">Timeline</span>
        </nav>

        <div className="flex items-center gap-3">
          <StatoBarra stato={stato} />
          <Button
            size="sm"
            className="rounded-full"
            onClick={() => {
              autosave.svuota();
              navigate(`/projects/${projectId}`);
            }}
          >
            Save and close
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(440px,42%)_minmax(0,1fr)]">
        {/* ── Pannello live: sticky, scroll interno ── */}
        <aside className="lg:sticky lg:top-[92px] lg:order-1 lg:h-[calc(100vh-120px)]">
          <div className="flex h-full flex-col rounded-xl border bg-card p-4">
            <IntestazioneCard
              titolo="LIVE TIMELINE"
              chip={`${data.nomeSito ?? "Site"} — ${data.nomeServizio ?? "Servizio"}`}
            />
            <div className="mb-2 shrink-0">
              <MetaTimeline attivita={attivita} passi={passi} />
            </div>
            <div className="max-h-[70vh] min-h-0 flex-1 overflow-auto lg:max-h-none">
              <TimelineLive
                attivita={attivita}
                passi={passi}
                servizio={data.servizioPerTinta}
                evidenzia={evidenziata}
                onVoceClick={(_, id) => lampeggia(id)}
              />
            </div>
          </div>
        </aside>

        {/* ── Colonna di compilazione ── */}
        <div className="min-w-0 space-y-5 lg:order-2">
          <CardImport
            attivita={data.attivita}
            modificabile={modificabile}
            onApplica={async (aggiornamenti, nuove) => {
              const esito = await applicaImport.mutateAsync({
                cronoprogrammaId: data.cronoprogrammaId,
                siteId: data.siteId,
                nomeSito: data.nomeSito,
                aggiornamenti,
                nuove,
              });
              toast({
                title: `${esito.aggiornate + esito.create} activities updated`,
                description: [
                  esito.aggiornate ? `${esito.aggiornate} matched` : null,
                  esito.create ? `${esito.create} new` : null,
                ]
                  .filter(Boolean)
                  .join(" · "),
              });
            }}
          />

          <CardProjectTimeline
            attivita={attivita}
            modificabile={modificabile}
            evidenziata={evidenziata}
            onData={(id, campo, valore) => {
              lampeggia(id);
              autosave.programma(`att:${id}:${campo}`, () =>
                scritture.dataAttivita.mutate(
                  { id, [campo]: valore },
                  {
                    onError: (e: unknown) =>
                      toast({
                        variant: "destructive",
                        title: "Could not save",
                        description: e instanceof Error ? e.message : "Try again in a moment.",
                      }),
                  }
                )
              );
            }}
            onDipendenze={(id, madri) => {
              lampeggia(id);
              scritture.dipendenze.mutate(
                { eventoId: id, madri },
                {
                  onError: (e: unknown) =>
                    toast({
                      variant: "destructive",
                      title: "Dependency not saved",
                      description: e instanceof Error ? e.message : "Try again in a moment.",
                    }),
                  onSuccess: () =>
                    toast({
                      title: madri.length ? "Dependency set" : "Dependency removed",
                      description: madri.length
                        ? "If the activity it depends on slips, this one follows."
                        : undefined,
                    }),
                }
              );
            }}
            onProponiInizio={(id, inizio) =>
              autosave.programma(`att:${id}:inizio`, () =>
                scritture.dataAttivita.mutate({ id, inizio })
              )
            }
            onUsaModello={() => setModelliAperto(true)}
            onAggiungi={async (nome) => {
              // Senza cronoprogramma la riga non ha dove andare: lo si crea
              // qui, come fa l'import. Una prima attività scritta a mano vale
              // quanto una importata.
              if (!data.cronoprogrammaId) {
                await applicaImport.mutateAsync({
                  cronoprogrammaId: null,
                  siteId: data.siteId,
                  nomeSito: data.nomeSito,
                  aggiornamenti: [],
                  nuove: [{ nome, inizio: null, fine: null }],
                });
              } else {
                await righe.aggiungiAttivita.mutateAsync({
                  cronoprogrammaId: data.cronoprogrammaId,
                  nome,
                });
              }
              toast({ title: "Activity added", description: nome });
            }}
            onRinomina={(id, nome) =>
              autosave.programma(`att:${id}:nome`, () =>
                righe.rinominaAttivita.mutate({ id, nome })
              )
            }
            onElimina={async (id, nome) => {
              await righe.eliminaAttivita.mutateAsync(id);
              toast({ title: "Activity deleted", description: nome });
            }}
          />

          <CardCertTimeline
            passi={passi}
            attivita={attivita}
            servizio={data.servizioPerTinta}
            nomeServizio={data.nomeServizio}
            modificabile={modificabile}
            evidenziato={evidenziata}
            onData={async (id, valore) => {
              // Un passo di catalogo non esiste ancora nel database: la prima
              // cosa che il PM ci scrive lo fa nascere, insieme a tutti i
              // suoi fratelli. E' il momento giusto — prima non c'era niente
              // da salvare, e chiederlo con un pulsante significava fargli
              // fare un gesto che il sistema poteva fare da solo.
              if (id.startsWith("catalogo:")) {
                await materializza();
                return;
              }
              lampeggia(id);
              autosave.programma(`passo:${id}:data`, () =>
                scritture.dataPasso.mutate(
                  { id, data: valore },
                  {
                    onSuccess: () => {
                      if (valore === null) {
                        toast({ title: "Date recalculated from the anchor" });
                      }
                    },
                    onError: (e: unknown) =>
                      toast({
                        variant: "destructive",
                        title: "Could not save",
                        description: e instanceof Error ? e.message : "Try again in a moment.",
                      }),
                  }
                )
              );
            }}
            onAvanzamento={async (id, pct) => {
              if (id.startsWith("catalogo:")) {
                await materializza();
                return;
              }
              lampeggia(id);
              autosave.programma(`passo:${id}:pct`, () =>
                scritture.avanzamentoPasso.mutate({ id, pct })
              );
            }}
            onAggiungi={async (nome) => {
              await righe.aggiungiPasso.mutateAsync({ certificationId: data.certId, nome });
              toast({ title: "Step added", description: nome });
            }}
            onRinomina={(id, nome) =>
              autosave.programma(`passo:${id}:nome`, () =>
                righe.rinominaPasso.mutate({ id, nome })
              )
            }
            onElimina={async (id, nome) => {
              await righe.eliminaPasso.mutateAsync(id);
              toast({ title: "Step deleted", description: nome });
            }}
            onAncoraggio={async (passoId, attivitaId, punto, off) => {
              await ancoraggio.mutateAsync({ passoId, attivitaId, punto, offsetGiorni: off });
              toast({
                title: attivitaId ? 'Step linked' : 'Link removed',
                description: attivitaId
                  ? 'If the activity moves, this date follows it.'
                  : 'This date no longer follows the project timeline.',
              });
            }}
            generando={generaScaletta.isPending}
            onGenera={async () => {
              const n = await generaScaletta.mutateAsync(data.certId);
              toast({
                title: n > 0 ? `${n} passi creati` : "Niente da creare",
                description:
                  n > 0
                    ? "Dalla scaletta del servizio. Adesso tocca alle date."
                    : "La scaletta esiste già, oppure il catalogo non ne prevede una per questo servizio.",
              });
            }}
          />

          {/* I modelli: solo quando la timeline è vuota, perché applicarli su
              una già compilata raddoppierebbe le righe invece di aiutare. */}
          <DialogoModelli
            aperto={modelliAperto}
            onChiudi={() => setModelliAperto(false)}
            suggerito={data.tipoProgetto === "construction" ? "cantiere" : "bdc"}
            onApplica={async (voci) => {
              const esito = await applicaImport.mutateAsync({
                cronoprogrammaId: data.cronoprogrammaId,
                siteId: data.siteId,
                nomeSito: data.nomeSito,
                aggiornamenti: [],
                nuove: voci,
              });
              toast({
                title: `${esito.create} activities created from the template`,
                description: "Now adjust the dates: they are estimates, not commitments.",
              });
            }}
          />
        </div>
      </div>
    </MainLayout>
  );
}

/** «● All saved» / «● Salvataggio…» — spec §4.3. */
function StatoBarra({ stato }: { stato: "fermo" | "salvataggio" | "salvato" | "errore" }) {
  if (stato === "salvataggio") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
        <Loader2 className="h-3 w-3 animate-spin" /> Saving…
      </span>
    );
  }
  if (stato === "errore") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-destructive">
        <span className="h-1.5 w-1.5 rounded-full bg-destructive" /> Could not save
      </span>
    );
  }
  return (
    <span
      className={cn(
        "flex items-center gap-1.5 text-xs transition-opacity",
        stato === "salvato" ? "text-muted-foreground opacity-100" : "text-muted-foreground opacity-0"
      )}
      aria-live="polite"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-success" /> All saved
    </span>
  );
}

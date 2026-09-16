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
import {
  useApplicaImport,
  useAutosave,
  useScritture,
  useStatoSalvataggio,
  useTimelineVista,
} from "@/hooks/useTimelineVista";
import { derivaAttivita, derivaPassi } from "@/lib/timelineDerivazione";

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

  const [evidenziata, setEvidenziata] = useState<string | null>(null);

  const attivita = useMemo(() => derivaAttivita(data?.attivita ?? []), [data?.attivita]);
  const passi = useMemo(
    () => derivaPassi(data?.passi ?? [], data?.attivita ?? []),
    [data?.passi, data?.attivita]
  );

  /** Il lampo sulla riga toccata: dice «ho preso» prima ancora del salvataggio. */
  const lampeggia = (id: string) => {
    setEvidenziata(id);
    setTimeout(() => setEvidenziata((c) => (c === id ? null : c)), 600);
  };

  if (isLoading || !data) {
    return (
      <MainLayout title="Timeline">
        <div className="py-20 text-center text-sm text-muted-foreground">Caricamento…</div>
      </MainLayout>
    );
  }

  const modificabile = data.modificabile;

  return (
    <MainLayout
      title={data.nomeSito ?? "Timeline"}
      subtitle={`${data.nomeServizio ?? ""} · compila le due timeline`}
    >
      {/* ── Barra: percorso, stato del salvataggio, uscita (§4.3) ── */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground" aria-label="Percorso">
          <button onClick={() => navigate("/projects")} className="hover:text-foreground hover:underline">
            Services
          </button>
          <ChevronRight className="h-3 w-3" />
          <button onClick={() => navigate("/portafoglio")} className="hover:text-foreground hover:underline">
            {data.nomeSito ?? "Sito"}
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
            Salva e chiudi
          </Button>
        </div>
      </div>

      <div className="grid gap-6 tl:grid-cols-[minmax(440px,42%)_minmax(0,1fr)]">
        {/* ── Pannello live: sticky, scroll interno ── */}
        <aside className="tl:sticky tl:top-[92px] tl:order-1 tl:h-[calc(100vh-120px)]">
          <div className="flex h-full flex-col rounded-xl border bg-card p-4">
            <IntestazioneCard
              titolo="TIMELINE LIVE"
              chip={`${data.nomeSito ?? "Sito"} — ${data.nomeServizio ?? "Servizio"}`}
            />
            <div className="mb-2 shrink-0">
              <MetaTimeline attivita={attivita} passi={passi} />
            </div>
            <div className="max-h-[70vh] min-h-0 flex-1 overflow-auto tl:max-h-none">
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
        <div className="min-w-0 space-y-5 tl:order-2">
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
                title: `${esito.aggiornate + esito.create} attività aggiornate`,
                description: [
                  esito.aggiornate ? `${esito.aggiornate} riconosciute` : null,
                  esito.create ? `${esito.create} nuove` : null,
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
                        title: "Non sono riuscito a salvare",
                        description: e instanceof Error ? e.message : "Riprova fra un momento.",
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
                      title: "Dipendenza non salvata",
                      description: e instanceof Error ? e.message : "Riprova fra un momento.",
                    }),
                  onSuccess: () =>
                    toast({
                      title: madri.length ? "Dipendenza impostata" : "Dipendenza rimossa",
                      description: madri.length
                        ? "Se l'attività da cui dipende slitta, questa la segue."
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
          />

          <CardCertTimeline
            passi={passi}
            attivita={attivita}
            servizio={data.servizioPerTinta}
            nomeServizio={data.nomeServizio}
            modificabile={modificabile}
            evidenziato={evidenziata}
            onData={(id, valore) => {
              lampeggia(id);
              autosave.programma(`passo:${id}:data`, () =>
                scritture.dataPasso.mutate(
                  { id, data: valore },
                  {
                    onSuccess: () => {
                      if (valore === null) {
                        toast({ title: "Data ricalcolata dall'àncora" });
                      }
                    },
                    onError: (e: unknown) =>
                      toast({
                        variant: "destructive",
                        title: "Non sono riuscito a salvare",
                        description: e instanceof Error ? e.message : "Riprova fra un momento.",
                      }),
                  }
                )
              );
            }}
            onAvanzamento={(id, pct) => {
              lampeggia(id);
              autosave.programma(`passo:${id}:pct`, () =>
                scritture.avanzamentoPasso.mutate({ id, pct })
              );
            }}
          />
        </div>
      </div>
    </MainLayout>
  );
}

/** «● Tutto salvato» / «● Salvataggio…» — spec §4.3. */
function StatoBarra({ stato }: { stato: "fermo" | "salvataggio" | "salvato" | "errore" }) {
  if (stato === "salvataggio") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
        <Loader2 className="h-3 w-3 animate-spin" /> Salvataggio…
      </span>
    );
  }
  if (stato === "errore") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-destructive">
        <span className="h-1.5 w-1.5 rounded-full bg-destructive" /> Salvataggio non riuscito
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
      <span className="h-1.5 w-1.5 rounded-full bg-success" /> Tutto salvato
    </span>
  );
}

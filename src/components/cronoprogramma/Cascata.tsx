import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { ArrowRight, BellRing, CheckCircle2, TriangleAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ANCORA_NOME, type CronoEvento } from "@/types/cronoprogramma";
import {
  useApplicaSpostamento,
  useCascataAnteprima,
  useConfermaCascata,
  useConfermeInSospeso,
  useRegistro,
  type CascataVerdetto,
} from "@/hooks/useCronoprogramma";

const d = (s: string | null | undefined) =>
  s ? format(parseISO(s), "d LLL yy", { locale: it }) : "—";

/**
 * L'anteprima della cascata, innescata dalla modifica in linea — v1.1 §7.
 *
 * La sezione «il GC comunica nuove date» non esiste piu': si cambia la data
 * direttamente sulla riga della PROJECT TIMELINE, e prima che la modifica
 * venga scritta compare questo pannello — cosa si muove, cosa no, il verdetto
 * sul contratto, chi verra' avvisato. La meccanica proposta-e-conferma e'
 * la stessa di prima; e' cambiato solo il punto d'innesco.
 */
export function CascataInline({
  evento,
  nuovaData,
  fonte,
  certIdCorrente,
  certIdProprie,
  nomiAltri,
  onFatto,
  onAnnulla,
}: {
  evento: CronoEvento;
  nuovaData: string;
  fonte: string;
  certIdCorrente: string;
  certIdProprie: string[];
  nomiAltri: string[];
  onFatto: () => void;
  onAnnulla: () => void;
}) {
  const { toast } = useToast();
  const isHandover = evento.ancora === "handover";
  const { data: anteprima } = useCascataAnteprima(isHandover ? certIdCorrente : undefined, nuovaData);
  const applica = useApplicaSpostamento();

  const dataAttuale = evento.data_effettiva ?? evento.data_pianificata;
  const delta = dataAttuale
    ? Math.round((parseISO(nuovaData).getTime() - parseISO(dataAttuale).getTime()) / 86400000)
    : 0;

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
      <p className="mb-3 text-xs font-medium text-primary">
        «{evento.nome}» {delta > 0 ? "+" : ""}
        {delta} giorni · {d(dataAttuale)} <ArrowRight className="inline h-3 w-3" /> {d(nuovaData)}
      </p>

      {isHandover && anteprima && (
        <>
          {anteprima.righe.length === 0 ? (
            <p className="text-xs text-muted-foreground">Niente da spostare con questa data.</p>
          ) : (
            <table className="w-full text-xs">
              <tbody>
                {anteprima.righe.map((r) => (
                  <tr key={r.milestone_id} className="border-t border-primary/15">
                    <td className="py-1.5 pr-2">{r.requirement}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      <span className="text-muted-foreground line-through">{d(r.data_vecchia)}</span>
                      <ArrowRight className="mx-1.5 inline h-3 w-3 text-primary" />
                      <b>{d(r.data_nuova)}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Verdetto v={anteprima.verdetto} />
        </>
      )}

      {!isHandover && (
        <p className="text-xs text-muted-foreground">
          Le milestone non si ricalcolano da questa ancora: lo spostamento serve al collocamento,
          ai vincoli di precedenza e ai colleghi che leggono la stessa data.
        </p>
      )}

      {nomiAltri.length > 0 && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <BellRing className="mt-0.5 h-3 w-3 shrink-0" />
          {nomiAltri.join(", ")} {nomiAltri.length === 1 ? "ricevera'" : "riceveranno"} la proposta
          per le proprie date: le conferma chi di competenza, non tu.
        </p>
      )}

      {!fonte.trim() && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Nessuna fonte indicata. Si puo' salvare lo stesso, ma chi legge non sapra' se la tua
          informazione e' piu' fresca della sua.
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          disabled={applica.isPending}
          onClick={async () => {
            try {
              const n = await applica.mutateAsync({
                evento_id: evento.id,
                data: nuovaData,
                fonte: fonte.trim() || "fonte non indicata",
                certification_ids_proprie: certIdProprie,
              });
              toast({
                title: "Spostamento confermato",
                description:
                  n > 0
                    ? `${n} timeline aggiornate. Le altre restano in attesa del loro PM.`
                    : "Data aggiornata e registrata.",
              });
              onFatto();
            } catch (e: any) {
              toast({ variant: "destructive", title: "Errore", description: e.message });
            }
          }}
        >
          Conferma spostamento
        </Button>
        <Button size="sm" variant="ghost" onClick={onAnnulla}>
          Annulla
        </Button>
      </div>
    </div>
  );
}

function Verdetto({ v }: { v: CascataVerdetto | null }) {
  if (!v) return null;
  const report =
    v.report_contrattuali !== null && v.report_proiettati !== null
      ? v.report_proiettati - v.report_contrattuali
      : null;

  return (
    <div className="mt-3 space-y-1.5 border-t border-primary/15 pt-3 text-[11px]">
      {v.scostamento_baseline !== null && (
        <p className="text-muted-foreground">
          Scostamento dalla baseline contrattuale del {d(v.baseline)}:{" "}
          <b className="tabular-nums text-foreground">
            {v.scostamento_baseline > 0 ? "+" : ""}
            {v.scostamento_baseline} giorni
          </b>
        </p>
      )}
      {v.a_rischio ? (
        <p className="flex items-start gap-1.5 font-medium text-destructive">
          <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
          Fine stimata {d(v.fine_stimata)}: {v.giorni_oltre} giorni oltre la scadenza del{" "}
          {d(v.scadenza_contratto)}. Proroga da negoziare.
        </p>
      ) : (
        <p className="flex items-start gap-1.5 text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" />
          Fine stimata {d(v.fine_stimata)}: dentro la scadenza contrattuale.
        </p>
      )}
      {report !== null && report !== 0 && (
        <p className="text-muted-foreground">
          Report di cantiere: {v.report_contrattuali} venduti,{" "}
          <b className="text-foreground">{v.report_proiettati} necessari</b> —{" "}
          {report > 0 ? `${report} da fatturare in piu'` : `${Math.abs(report)} in meno`}.
        </p>
      )}
    </div>
  );
}

/**
 * Le conferme che aspettano me.
 *
 * PM-A ha spostato una data condivisa; le mie milestone non si sono mosse e non
 * si muoveranno finche' non lo dico io. Alcune date non sono elastiche —
 * finestre di audit, submission d'ente — e uno spostamento silenzioso le
 * renderebbe impossibili senza che nessuno se ne accorga.
 */
export function ConfermeInSospeso() {
  const { data: conferme = [] } = useConfermeInSospeso(true);
  const conferma = useConfermaCascata();
  const { toast } = useToast();

  if (conferme.length === 0) return null;

  return (
    <Card className="border-amber-300 bg-amber-50/50 p-5 dark:border-amber-800 dark:bg-amber-950/20">
      <p className="mb-1 text-sm font-medium">
        {conferme.length} {conferme.length === 1 ? "conferma in sospeso" : "conferme in sospeso"}
      </p>
      <p className="mb-4 text-xs text-muted-foreground">
        Qualcuno ha spostato una data della PROJECT TIMELINE. Le tue milestone non si sono mosse:
        decidi tu.
      </p>
      <div className="space-y-2">
        {conferme.map((c) => (
          <div
            key={c.proposta_id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="text-sm">{c.certificazione}</p>
              <p className="text-[11px] text-muted-foreground">
                {c.sito} · {ANCORA_NOME[c.ancora as keyof typeof ANCORA_NOME] ?? c.ancora} ·{" "}
                {d(c.data_precedente)} <ArrowRight className="inline h-3 w-3" /> {d(c.data_nuova)} ·
                fonte: {c.fonte} · {c.milestone_da_spostare} milestone
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  await conferma.mutateAsync(c.proposta_id);
                  toast({ title: "Cascata confermata", description: "Registro aggiornato." });
                } catch (e: any) {
                  toast({ variant: "destructive", title: "Errore", description: e.message });
                }
              }}
            >
              Conferma
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}

/**
 * Il registro — v1.1 §8: la voce nomina la riga effettivamente spostata.
 *
 * «Marco ha spostato "Impianti pronti per test"», non «handover» qualunque
 * cosa si sia mossa. I derivati economici — fine stimata, scadenza, report —
 * compaiono solo quando la voce li ha, cioe' solo sull'handover: un numero
 * finto accanto a un fatto vero toglierebbe credibilita' a entrambi.
 */
export function Registro({ cronoId, numero = 3 }: { cronoId: string | undefined; numero?: number }) {
  const { data: voci = [] } = useRegistro(cronoId);
  if (voci.length === 0) return null;

  return (
    <Card className="p-5">
      <div className="mb-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-[11px] text-background">
            {numero}
          </span>
          <h2 className="text-sm font-medium">Registro della PROJECT TIMELINE</h2>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Ogni modifica: chi, quando, quale riga, da dove a dove. Sull'handover, anche cosa comporta.
        </p>
      </div>
      <div className="space-y-3">
        {voci.map((v) => {
          const oltre =
            v.fine_stimata && v.scadenza_contratto && v.fine_stimata > v.scadenza_contratto;
          const dReport =
            v.report_proiettati !== null && v.report_contrattuali !== null
              ? v.report_proiettati - v.report_contrattuali
              : 0;
          return (
            <div key={v.id} className="border-l-2 border-border pl-3">
              <p className="text-sm">
                Spostata <b>«{v.evento_nome ?? "una data"}»</b> dal {d(v.data_precedente)} al{" "}
                {d(v.data_nuova)}
                {v.note && <span className="text-muted-foreground"> · {v.note}</span>}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {format(parseISO(v.quando), "d LLL yy, HH:mm", { locale: it })}
                {v.fonte ? ` · ${v.fonte}` : " · fonte non indicata"}
                {v.scostamento_giorni !== null &&
                  ` · ${v.scostamento_giorni > 0 ? "+" : ""}${v.scostamento_giorni} gg`}
                {v.scostamento_baseline_giorni !== null &&
                  ` · ${v.scostamento_baseline_giorni > 0 ? "+" : ""}${v.scostamento_baseline_giorni} gg vs baseline`}
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {v.fine_stimata && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px]",
                      oltre && "border-destructive/40 bg-destructive/10 text-destructive"
                    )}
                  >
                    fine {d(v.fine_stimata)}
                    {oltre ? " · oltre contratto" : " · entro contratto"}
                  </Badge>
                )}
                {dReport !== 0 && (
                  <Badge variant="outline" className="text-[10px]">
                    report {v.report_contrattuali} → {v.report_proiettati}
                    {dReport > 0 ? ` · ${dReport} da fatturare` : ""}
                  </Badge>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

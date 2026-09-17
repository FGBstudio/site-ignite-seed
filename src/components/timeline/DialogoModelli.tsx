import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { Loader2 } from "lucide-react";
import { CampoData } from "@/components/cronoprogramma/CampoData";
import { dateDaModello, MODELLI, type ModelloTimeline } from "@/lib/modelliTimeline";

/**
 * Partire da un modello.
 *
 * Non è un generatore automatico: è una bozza. Il PM sceglie il tipo di
 * progetto, dice quando comincia, e si porta a casa una timeline plausibile da
 * correggere. Le date proposte vengono dalle durate dei cronoprogrammi
 * originali, quindi sono sbagliate quanto basta per essere credibili — e
 * correggere venti date è un altro mestiere rispetto a inventarne venti.
 *
 * L'anteprima mostra le prime voci con le date già calcolate, perché la
 * differenza fra i tre modelli non sta nei nomi ma in quanto durano: l'IDC
 * chiude in un anno, il BDC greco in tre.
 */

const df = (iso: string | null) => (iso ? format(parseISO(iso), "d LLL yy", { locale: it }) : "—");

interface Props {
  aperto: boolean;
  onChiudi: () => void;
  /** Suggerito: l'handover contrattuale è spesso l'unica data già nota. */
  suggerito?: "idc" | "bdc" | "cantiere";
  onApplica: (voci: Array<{ nome: string; inizio: string; fine: string | null }>) => Promise<void>;
}

export function DialogoModelli({ aperto, onChiudi, suggerito, onApplica }: Props) {
  const [scelto, setScelto] = useState<ModelloTimeline>(
    MODELLI.find((m) => m.chiave === suggerito) ?? MODELLI[0]
  );
  const [inizio, setInizio] = useState<string>(new Date().toISOString().slice(0, 10));
  const [salvando, setSalvando] = useState(false);

  const date = dateDaModello(scelto.voci, inizio);
  const fine = date[date.length - 1]?.fine ?? date[date.length - 1]?.inizio ?? null;

  const applica = async () => {
    setSalvando(true);
    try {
      await onApplica(
        scelto.voci.map((v, i) => ({ nome: v.nome, inizio: date[i].inizio, fine: date[i].fine }))
      );
      onChiudi();
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={aperto} onOpenChange={(o) => !o && onChiudi()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Start from a template</DialogTitle>
          <DialogDescription>
            A draft to adjust, not a final calendar. The durations come from real
            construction schedules.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
          {/* ── I tre modelli ── */}
          <div className="space-y-2">
            {MODELLI.map((m) => (
              <button
                key={m.chiave}
                type="button"
                onClick={() => setScelto(m)}
                className={cn(
                  "w-full rounded-lg border p-3 text-left transition-colors",
                  scelto.chiave === m.chiave ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                )}
              >
                <p className="text-sm font-medium">{m.nome}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  {m.descrizione}
                </p>
                <p className="mt-1.5 text-[10px] text-muted-foreground">
                  {m.voci.length} activities · from {m.origine}
                </p>
              </button>
            ))}
          </div>

          {/* ── Quando comincia, e cosa ne esce ── */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">First activity starts on</span>
              <CampoData
                value={inizio}
                aria="Project start date"
                onChange={(v) => v && setInizio(v)}
                className="w-[140px]"
              />
            </div>

            <p className="text-[11px] text-muted-foreground">
              Estimated end <b className="text-foreground">{df(fine)}</b> — the sum of the
              template durations, not a commitment.
            </p>

            <div className="max-h-64 overflow-y-auto rounded-lg border">
              <table className="w-full text-xs">
                <tbody>
                  {scelto.voci.map((v, i) => (
                    <tr key={`${v.nome}-${i}`} className="border-b last:border-0">
                      <td className="px-2 py-1.5">
                        {v.nome}
                        {v.ancora && (
                          <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[9.5px] text-muted-foreground">
                            {v.ancora === "handover"
                              ? "handover"
                              : v.ancora === "construction_start"
                                ? "site start"
                                : "gara"}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                        {df(date[i].inizio)}
                        {date[i].fine && ` → ${df(date[i].fine)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <span className="text-[11px] text-muted-foreground">
            Activities come in without dependencies: you link them where it matters.
          </span>
          <span className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onChiudi}>
              Cancel
            </Button>
            <Button size="sm" disabled={salvando} onClick={applica}>
              {salvando && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Create {scelto.voci.length} activities
            </Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { Minus, Plus } from "lucide-react";

const df = (s: string | null | undefined) =>
  s ? format(parseISO(s), "d LLL yy", { locale: it }) : "senza data";

/**
 * Il selettore dell'ancora — uno solo, usato dalla project timeline e dalla
 * timeline di certificazione.
 *
 * La regola che lo governa, e che prima era rotta: **si sceglie fra righe che
 * esistono davvero**. Mai un vocabolario astratto di ancore canoniche, mai
 * righe di un'ossatura che il PM ha gia' buttato importando il gantt vero.
 * Se non c'e' niente a cui agganciarsi, lo si dice e basta.
 *
 * I bersagli arrivano in gruppi perche' nella certificazione sono di due
 * nature — le righe del progetto e i passi precedenti della scaletta — e
 * saperlo cambia cosa ci si aspetta: un passo agganciato al progetto si muove
 * col cantiere, uno agganciato a un passo precedente si muove con la
 * certificazione.
 */

export interface Bersaglio {
  id: string;
  nome: string;
  data: string | null;
}

export interface GruppoBersagli {
  titolo: string;
  nota?: string;
  opzioni: Bersaglio[];
}

interface Props {
  titolo: string;
  gruppi: GruppoBersagli[];
  sceltaCorrente: string | null;
  offsetCorrente: number;
  tinta?: string;
  trigger: React.ReactNode;
  /** Accende il bersaglio sul pannello mentre lo si scorre. */
  onAnteprima?: (id: string | null) => void;
  onApplica: (id: string, offset: number) => Promise<void> | void;
  inCorso?: boolean;
  /** Mostrato quando nessun gruppo ha opzioni. */
  vuotoMessaggio?: string;
}

export function SelettoreAncora({
  titolo,
  gruppi,
  sceltaCorrente,
  offsetCorrente,
  tinta = "hsl(var(--primary))",
  trigger,
  onAnteprima,
  onApplica,
  inCorso,
  vuotoMessaggio = "Non c'è ancora nessuna riga con una data a cui agganciarsi.",
}: Props) {
  const [aperto, setAperto] = useState(false);
  const [scelta, setScelta] = useState<string | null>(sceltaCorrente);
  const [offset, setOffset] = useState(offsetCorrente);

  const tutte = gruppi.flatMap((g) => g.opzioni);
  const bersaglio = tutte.find((o) => o.id === scelta);
  const risultato =
    bersaglio?.data
      ? format(new Date(new Date(`${bersaglio.data}T12:00:00`).getTime() + offset * 86400000), "d LLL yy", { locale: it })
      : null;

  return (
    <Popover
      open={aperto}
      onOpenChange={(o) => {
        setAperto(o);
        if (o) {
          setScelta(sceltaCorrente);
          setOffset(offsetCorrente);
        } else {
          onAnteprima?.(null);
        }
      }}
    >
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-[23rem] p-3">
        <p className="mb-2 text-sm font-medium">{titolo}</p>

        {tutte.length === 0 ? (
          <p className="text-xs text-muted-foreground">{vuotoMessaggio}</p>
        ) : (
          <>
            <p className="mb-1.5 text-[10.5px] uppercase tracking-wider text-muted-foreground">
              Si calcola da
            </p>
            <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border p-1.5">
              {gruppi
                .filter((g) => g.opzioni.length > 0)
                .map((g) => (
                  <div key={g.titolo}>
                    <p className="px-1 pb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                      {g.titolo}
                      {g.nota && <span className="ml-1 normal-case tracking-normal">· {g.nota}</span>}
                    </p>
                    {g.opzioni.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onMouseEnter={() => onAnteprima?.(o.id)}
                        onFocus={() => onAnteprima?.(o.id)}
                        onMouseLeave={() => onAnteprima?.(scelta)}
                        onClick={() => {
                          setScelta(o.id);
                          onAnteprima?.(o.id);
                        }}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-muted",
                          scelta === o.id && "bg-muted font-medium"
                        )}
                      >
                        <span className="min-w-0 truncate">{o.nome}</span>
                        <span className={cn("shrink-0 tabular-nums", o.data ? "text-muted-foreground" : "text-amber-700")}>
                          {df(o.data)}
                        </span>
                      </button>
                    ))}
                  </div>
                ))}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <button type="button" onClick={() => setOffset((o) => Math.max(0, o - 5))} className="rounded border p-1 hover:bg-muted" aria-label="Cinque giorni prima">
                <Minus className="h-3 w-3" />
              </button>
              <Input
                type="number"
                value={offset}
                onChange={(e) => setOffset(Math.max(0, Number(e.target.value) || 0))}
                className="h-8 w-20 text-center text-xs"
                aria-label="Giorni di scarto"
              />
              <span className="text-xs text-muted-foreground">giorni dopo</span>
              <button type="button" onClick={() => setOffset((o) => o + 5)} className="rounded border p-1 hover:bg-muted" aria-label="Cinque giorni dopo">
                <Plus className="h-3 w-3" />
              </button>
            </div>

            {/* La frase, non il codice — e la conseguenza si legge prima. */}
            <p className="mt-3 text-xs">
              Si calcola da <b>{bersaglio?.nome ?? "—"}</b>
              {bersaglio?.data && <span className="text-muted-foreground"> ({df(bersaglio.data)})</span>} + {offset}{" "}
              giorni → <b style={{ color: tinta }}>{risultato ?? "—"}</b>
            </p>
            {bersaglio && !bersaglio.data && (
              <p className="mt-1 text-[11px] text-amber-700">
                Quella riga non ha ancora una data: il collegamento si fa lo stesso, e la data
                comparirà appena lei ne avrà una.
              </p>
            )}
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              D'ora in poi, se «{bersaglio?.nome ?? "questa riga"}» si sposta, questa data si
              ricalcola da sola.
            </p>

            <div className="mt-3 flex justify-end gap-2">
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAperto(false)}>
                Annulla
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs"
                disabled={!scelta || inCorso}
                onClick={async () => {
                  await onApplica(scelta!, offset);
                  setAperto(false);
                  onAnteprima?.(null);
                }}
              >
                Applica collegamento
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

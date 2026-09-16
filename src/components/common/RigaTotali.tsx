import { cn } from "@/lib/utils";

/**
 * La riga dei totali sotto una tabella filtrabile.
 *
 * Nasce da una domanda pratica: filtro per PM, e poi? Il numero di righe che
 * sto guardando è l'informazione più ovvia della schermata, e contarle a
 * occhio su una lista lunga è impossibile. Senza questa riga, l'unico modo di
 * sapere «quanti progetti ha Luca» è esportare e aprire Excel.
 *
 * Tre cose, in ordine di importanza:
 *
 *  1. **quante righe sto guardando adesso**, dopo i filtri — il numero grande;
 *  2. **su quante in totale**, ma solo quando un filtro è attivo: senza filtri
 *     ripetere lo stesso numero due volte è rumore;
 *  3. **quante ne vedo davvero**, quando la tabella ne disegna solo una parte.
 *     Questo è il punto meno appariscente e il più importante: una tabella che
 *     mostra 200 righe di 800 senza dirlo fa credere di aver visto tutto.
 *
 * Le voci di dettaglio (per stato, per tipo) stanno a destra e sono
 * facoltative: servono a leggere la composizione di quello che si è filtrato,
 * non a sostituire il conteggio.
 */

export interface VoceTotale {
  label: string;
  valore: number;
  /** Tinta della pastiglia; senza, resta neutra. */
  colore?: string;
  titolo?: string;
}

interface Props {
  /** Righe dopo i filtri: è il numero che si sta guardando. */
  totale: number;
  /** Righe senza filtri. Si mostra solo se diverso dal totale. */
  suTotale?: number;
  /** Righe effettivamente disegnate, quando la tabella tronca. */
  mostrate?: number;
  /** Come si chiama una riga: «progetti», «siti», «passi». */
  nome?: string;
  voci?: VoceTotale[];
  className?: string;
}

const nf = new Intl.NumberFormat("it-IT");

export function RigaTotali({
  totale,
  suTotale,
  mostrate,
  nome = "righe",
  voci = [],
  className,
}: Props) {
  const filtrato = suTotale !== undefined && suTotale !== totale;
  const troncato = mostrate !== undefined && mostrate < totale;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t bg-muted/30 px-3 py-2.5 text-xs",
        className
      )}
      // Il conteggio cambia mentre si filtra: chi usa uno screen reader deve
      // sentirlo cambiare, non doverlo andare a cercare.
      aria-live="polite"
    >
      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <b className="text-sm tabular-nums">{nf.format(totale)}</b>
        <span className="text-muted-foreground">{nome}</span>

        {filtrato && (
          <span className="text-muted-foreground">
            · filtrati da <span className="tabular-nums">{nf.format(suTotale!)}</span>
          </span>
        )}

        {troncato && (
          <span
            className="text-amber-700 dark:text-amber-400"
            title="La tabella ne disegna una parte per restare veloce: affina i filtri per vederle tutte"
          >
            · ne vedi <span className="tabular-nums">{nf.format(mostrate!)}</span>
          </span>
        )}
      </span>

      {voci.length > 0 && (
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {voci
            .filter((v) => v.valore > 0)
            .map((v) => (
              <span key={v.label} className="flex items-center gap-1.5" title={v.titolo}>
                {v.colore && (
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ background: v.colore }}
                    aria-hidden="true"
                  />
                )}
                <span className="tabular-nums font-medium">{nf.format(v.valore)}</span>
                <span className="text-muted-foreground">{v.label}</span>
              </span>
            ))}
        </span>
      )}
    </div>
  );
}

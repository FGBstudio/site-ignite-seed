import { importo } from "@/lib/payments/aggregati";

/**
 * Barre mensili, gennaio–dicembre.
 *
 * Un mese futuro è una stima e si disegna tratteggiato: una previsione e un
 * fatto disegnati uguali si leggono uguali, ed è il modo più rapido per
 * prendere una speranza per un incasso.
 *
 * Non è un grafico generico: è questo grafico, e serve a due pannelli soli.
 * Una libreria di charting qui pagherebbe un peso che non serve.
 */

export interface Strato {
  valore: number;
  colore: string;
  /** Tratteggiato: è una previsione, non un fatto. */
  stimato?: boolean;
  nome: string;
}

const MESI = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

export function BarreMensili({
  mesi,
  meseCorrente,
  altezza = 140,
  formato = (v: number) => importo(v),
}: {
  /** Per ogni mese, gli strati impilati dal basso. */
  mesi: Strato[][];
  meseCorrente?: number;
  altezza?: number;
  formato?: (v: number) => string;
}) {
  const totali = mesi.map((s) => s.reduce((t, x) => t + x.valore, 0));
  // Il massimo non è mai zero: una divisione per zero manderebbe tutte le barre
  // a NaN e il pannello resterebbe vuoto senza dire perché.
  const max = Math.max(...totali, 1);

  return (
    <div className="flex items-end gap-1.5" style={{ height: altezza + 34 }}>
      {mesi.map((strati, m) => {
        const totale = totali[m];
        const corrente = m === meseCorrente;
        return (
          <div key={m} className="flex flex-1 flex-col items-center justify-end gap-1">
            {/* Il valore sopra la barra, solo se c'è: gli zeri farebbero rumore. */}
            <span
              className="num text-[9.5px] leading-none"
              style={{ color: corrente ? "var(--ink)" : "var(--faint)" }}
            >
              {totale > 0 ? formato(totale) : ""}
            </span>

            <div
              className="flex w-full flex-col-reverse overflow-hidden rounded-[3px]"
              style={{ height: (totale / max) * altezza, minHeight: totale > 0 ? 2 : 0 }}
              title={strati
                .filter((s) => s.valore > 0)
                .map((s) => `${s.nome}: ${formato(s.valore)}`)
                .join("\n")}
            >
              {strati.map((s, i) =>
                s.valore <= 0 ? null : (
                  <div
                    key={i}
                    style={{
                      height: `${(s.valore / totale) * 100}%`,
                      background: s.stimato
                        ? // Il tratteggio dice «stima» senza bisogno di una legenda.
                          `repeating-linear-gradient(45deg, ${s.colore}, ${s.colore} 3px, transparent 3px, transparent 6px)`
                        : s.colore,
                      border: s.stimato ? `1px solid ${s.colore}` : undefined,
                    }}
                  />
                ),
              )}
            </div>

            <span
              className="text-[9.5px] leading-none"
              style={{
                color: corrente ? "var(--teal-dark)" : "var(--faint)",
                fontWeight: corrente ? 800 : 500,
              }}
            >
              {MESI[m]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

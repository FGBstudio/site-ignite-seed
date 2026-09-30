/**
 * Il prospetto del mese: quali righe ci finiscono, e quanto fanno.
 *
 * Nessun accesso al database e nessun React: e' la parte che decide cosa
 * compare nel foglio che Francesca consegna ogni venerdi', e va messa alla
 * prova perche' una riga di troppo nel previsionale e' cassa annunciata che
 * non arrivera'.
 */

/** Il mese come chiave, `YYYY-MM`. */
export function meseDi(iso: string | null | undefined): string | null {
  if (!iso || iso.length < 7) return null;
  return iso.slice(0, 7);
}

/** Il mese di oggi, per aprire il prospetto dove serve. */
export function meseCorrente(adesso: Date = new Date()): string {
  return `${adesso.getFullYear()}-${String(adesso.getMonth() + 1).padStart(2, "0")}`;
}

/** Il mese prima o dopo, restando dentro l'anno giusto. */
export function meseVicino(mese: string, passo: number): string {
  const [a, m] = mese.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + passo, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const NOMI = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];

/** «2026-09» → «settembre 2026». */
export function meseEsteso(mese: string): string {
  const [a, m] = mese.split("-").map(Number);
  return `${NOMI[m - 1] ?? "?"} ${a}`;
}

/**
 * Una data scritta solo come mese.
 *
 * Chi sa solo «entro novembre» sceglie il mese, e si registra l'ultimo giorno:
 * e' l'ipotesi prudente, perche' non anticipa cassa che potrebbe arrivare il
 * trenta.
 */
export function ultimoGiornoDelMese(mese: string): string {
  const [a, m] = mese.split("-").map(Number);
  const d = new Date(Date.UTC(a, m, 0));
  return d.toISOString().slice(0, 10);
}

export interface RigaPrevisionale {
  mese_previsto: string | null;
  entity_code?: string | null;
  imponibile: number;
  vat_amount: number;
  residual: number;
}

/**
 * Le righe del previsionale per un mese.
 *
 * Solo quelle con una promessa: una fattura di cui il cliente non ha detto
 * niente non compare, perche' metterla vorrebbe dire annunciare una cassa che
 * nessuno ha promesso. E' la regola che Francesca ha posto, ed e' qui che vive.
 */
export function previsionaleDelMese<T extends RigaPrevisionale>(
  righe: T[],
  mese: string,
  entita?: string | null,
): T[] {
  return righe.filter(
    (r) =>
      r.mese_previsto === mese &&
      (!entita || r.entity_code === entita),
  );
}

export interface RigaDefinitiva {
  mese_incasso: string;
  entity_code?: string | null;
  incassato: number;
}

/** Gli incassi di un mese: qui il mese lo decide il bonifico, non la promessa. */
export function definitivoDelMese<T extends RigaDefinitiva>(
  righe: T[],
  mese: string,
  entita?: string | null,
): T[] {
  return righe.filter(
    (r) => r.mese_incasso === mese && (!entita || r.entity_code === entita),
  );
}

/** I mesi su cui ha senso spostarsi, dal piu' recente. */
export function mesiDisponibili(mesi: Array<string | null | undefined>): string[] {
  return [...new Set(mesi.filter((m): m is string => !!m))].sort().reverse();
}

/** Somma una colonna. Separata perche' i totali del foglio sono il suo scopo. */
export function somma<T>(righe: T[], quale: (r: T) => number): number {
  return righe.reduce((s, r) => s + (Number(quale(r)) || 0), 0);
}

import type { InvoiceRow } from "@/types/payments";

/**
 * Chi si insegue, chi si bilancia, chi e' fermo.
 *
 * Tre insiemi che l'occhio deve poter tenere separati, perche' rispondono a tre
 * domande diverse. Mescolarli fa sembrare un problema quello che e'
 * un'operazione di chiusura — e fa sembrare ordinaria un'emergenza.
 *
 * Nessun accesso al database: e' la regola, e va messa alla prova.
 */

/** Un giorno su una fattura che non e' mai uscita dal recall per il tempo. */
const GIORNI_IN_UN_ANNO = 365;

export interface RecallDiviso<T> {
  /** Scadute e mai pagate: qui si telefona, lunedi' e mercoledi'. */
  daInseguire: T[];
  /**
   * Pagate in parte, con un residuo aperto.
   *
   * Quasi sempre sono trattenute bancarie: il cliente ha pagato, la banca ha
   * trattenuto le spese, e mancano trenta euro. Non si insegue un cliente che
   * ha gia' pagato — si riversa sulla fattura dopo, a fine progetto.
   */
  daBilanciare: T[];
  /** Ferme per mancato pagamento: la pratica non e' piu' dell'amministrazione. */
  bloccate: T[];
}

type Riga = Pick<InvoiceRow, "lifecycle_state" | "residual" | "paid_amount">;

/**
 * Divide il recall nei suoi tre insiemi.
 *
 * Il criterio non e' lo stato scritto ma il fatto: **qualcuno ha pagato
 * qualcosa?** Una fattura da 4.000 incassata per 3.980 e una da 11.000 mai
 * toccata sono due situazioni diverse anche se il database le chiama tutte e
 * due «in recall».
 */
export function dividiRecall<T extends Riga>(fatture: T[]): RecallDiviso<T> {
  const bloccate = fatture.filter((f) => f.lifecycle_state === "blocked");
  const aperte = fatture.filter(
    (f) => f.lifecycle_state === "in_recall" && f.residual > 0,
  );
  return {
    daInseguire: aperte.filter((f) => f.paid_amount <= 0),
    daBilanciare: aperte.filter((f) => f.paid_amount > 0),
    bloccate,
  };
}

/**
 * Trascina da piu' di un anno.
 *
 * Non cambia niente di come si comporta — «possono rimanere qua quanto voglio»
 * — ma si vede, perche' sono proprio quelle del giro di fine anno.
 */
export function oltreLAnno(
  f: Pick<InvoiceRow, "due_date">,
  oggi: Date = new Date(),
): boolean {
  const scadenza = Date.parse(`${f.due_date}T00:00:00Z`);
  if (Number.isNaN(scadenza)) return false;
  const giorni = Math.floor((oggi.getTime() - scadenza) / 86_400_000);
  return giorni > GIORNI_IN_UN_ANNO;
}

/** Quanto manca ancora su queste righe, in euro. */
export function scopertoTotale(fatture: Array<Pick<InvoiceRow, "residual_eur">>): number {
  return fatture.reduce((s, f) => s + (Number(f.residual_eur) || 0), 0);
}

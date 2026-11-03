/**
 * Il nome leggibile di uno schema di certificazione.
 *
 * Stava scritto a mano in **quattro file** — il wizard delle offerte, il form
 * progetto, l'onboarding sito/progetto e la pagina Projects — con sette, undici,
 * sette e sette voci, cioè quattro mappe diverse. Tutte nominavano `ESG` e
 * `GRESB`, che a catalogo non esistono, con tre grafie differenti; e nessuna
 * nominava i nove schemi che esistono davvero e che si mostravano col codice:
 * `WELL_GC_Support`, `MEP_Commissioning`, `TAXONOMY`, `WiredScore`…
 *
 * Il nome ora è una colonna di `cert_catalog`, `scheme_label`, con un vincolo NOT
 * NULL: uno schema nuovo non può arrivare senza. Qui c'è solo il passaggio da
 * codice a nome, e un ripiego per i pochi millisecondi prima che il catalogo sia
 * caricato — o per un codice che il catalogo non conosce.
 */

/** Le etichette del catalogo, ricordate appena arriva. */
let etichette: Record<string, string> = {};

/**
 * Lo chiama `useCertCatalog` quando il catalogo è stato letto.
 *
 * Una variabile di modulo e non uno stato di React perché i nomi servono anche
 * fuori da un componente: le colonne di un'esportazione CSV e i formattatori
 * delle tabelle sono definiti a livello di modulo, e passare un hook fin là
 * vorrebbe dire riscrivere tre pagine per un'etichetta.
 */
export function registraEtichetteSchemi(mappa: Record<string, string>): void {
  etichette = mappa;
}

/**
 * Il nome di uno schema.
 *
 * Il ripiego non è una seconda mappa da mantenere: è una regola meccanica. Un
 * codice come `WELL_GC_Support` diventa «WELL GC Support», che è brutto ma
 * leggibile, invece di comparire con gli underscore in una tendina commerciale.
 */
export function nomeSchema(scheme: string | null | undefined): string {
  if (!scheme) return "";
  return etichette[scheme] ?? scheme.replace(/_/g, " ");
}

/**
 * La codifica visiva dei fogli Excel di Payments.
 *
 * Sta in un modulo suo perché due export la usano — lo scadenzario e la
 * timeline — e una palette copiata in due punti diverge al primo ritocco:
 * finirebbero per essere due verdi leggermente diversi per la stessa cosa,
 * che è peggio di nessun colore.
 *
 * I colori sono gli stessi della griglia a schermo: verde per il denaro che
 * entra, rosso per quello che esce ai fornitori, ruggine per gli installatori.
 * Un foglio che li cambia costringe a reimparare a leggerlo.
 */

export const INK = "FF18201C";
export const MUTO = "FF6B746E";
export const VERDE = "FF1F7A56";
/**
 * Il verde di quello che non è ancora arrivato.
 *
 * Serve al planning, dove avvenuto e previsto sono due righe adiacenti: con lo
 * stesso verde si leggerebbero come una cosa sola, e la somma di un incasso e
 * di una speranza è il numero che manda fuori strada un previsionale.
 */
export const VERDE_TENUE = "FF7FA894";
export const ROSSO = "FFC0392B";
export const RUGGINE = "FFB4632C";
export const AMBRA = "FFB07A26";
export const FASCIA = "FF16201C";
export const TEAL_TENUE = "FFE4F1ED";
export const GRIGIO_TENUE = "FFF2F2F0";

// Coi centesimi. Su una ripartizione per progetto i centesimi sono il punto:
// «1.650,00 RMB (208,86 €)» e «€ 209» non sono lo stesso numero, e il secondo
// non si riconcilia con la fattura del fornitore.
export const EURO = '"€ "#,##0.00;"−€ "#,##0.00';
export const EURO_POS = '"€ "#,##0.00';
export const DATA = "dd/mm/yyyy";

/**
 * Il formato di un importo nella sua valuta.
 *
 * Il simbolo sta dentro il formato numerico e non nel testo: così la cella
 * resta un numero — si somma, si filtra, si ordina — e continua a dire di che
 * valuta è. Scriverci «RMB 12.434» come stringa la renderebbe inutilizzabile.
 */
export const FORMATO_VALUTA: Record<string, string> = {
  EUR: EURO,
  CNY: '"RMB "#,##0.00;"−RMB "#,##0.00',
  USD: '"$ "#,##0.00;"−$ "#,##0.00',
  GBP: '"£ "#,##0.00;"−£ "#,##0.00',
};

export const formatoDi = (valuta: string) => FORMATO_VALUTA[valuta] ?? EURO;

/** Il download, una volta sola: due implementazioni divergerebbero sul nome file. */
export function scarica(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * ExcelJS esporta di default in CJS e come namespace in ESM: il bundler può
 * consegnare l'uno o l'altro, e sbagliare qui fallisce a runtime e non in
 * compilazione. Una funzione sola che scioglie il dubbio.
 */
export async function caricaExcelJS(): Promise<typeof import("exceljs")> {
  const mod = await import("exceljs");
  return ((mod as unknown as { default?: unknown }).default ?? mod) as typeof import("exceljs");
}

/**
 * Le regole delle righe di fattura.
 *
 * Una fattura ha righe, e le righe hanno tre regole che valgono sia mentre si
 * compila sia quando il database controlla: il totale è la loro somma, una
 * fattura si intesta a un cliente solo, e il progetto lo si scrive solo se tutte
 * parlano dello stesso.
 *
 * Stanno qui, senza React e senza database, perché sono le stesse regole che
 * `fn_emetti_fattura_righe` applica in SQL. Averle in due posti è inevitabile —
 * il dialogo deve poter dire «no» prima di chiamare — ma averle *provate* in uno
 * dei due impedisce che divergano in silenzio.
 */

/** Una riga in compilazione: l'importo arriva da un campo di testo. */
export interface RigaInCorso {
  tranche_id?: string | null;
  descrizione: string;
  importo: number | string;
}

/**
 * Un numero da un campo di testo.
 *
 * La virgola è come si scrivono i decimali in italiano, e `Number("8.750,00")`
 * fa `NaN`. Chi compila non deve cambiare abitudine perché JavaScript ha una
 * preferenza.
 */
export function numero(v: number | string | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const pulito = v.trim().replace(/\s/g, "").replace(",", ".");
  const n = Number(pulito);
  return Number.isFinite(n) ? n : 0;
}

/** L'imponibile: la somma delle righe. Non è un campo, è un risultato. */
export function imponibile(righe: RigaInCorso[]): number {
  // Arrotondato al centesimo a ogni passo: sommare decimali binari e
  // arrotondare solo alla fine produce i 0,01 di scarto che poi nessuno spiega
  // al cliente.
  return righe.reduce((s, r) => Math.round((s + numero(r.importo)) * 100) / 100, 0);
}

/**
 * Le righe che non si possono emettere, con il motivo.
 *
 * Restituisce le posizioni, non solo un booleano: chi compila deve sapere
 * *quale* riga non va, non che «qualcosa» non va.
 */
export function righeIncomplete(righe: RigaInCorso[]): Array<{ indice: number; perche: string }> {
  return righe.flatMap((r, indice) => {
    if (r.descrizione.trim() === "") {
      return [{ indice, perche: "Manca la descrizione: una riga deve dire cosa è" }];
    }
    const n = numero(r.importo);
    if (n <= 0) {
      return [{ indice, perche: "L'importo deve essere maggiore di zero" }];
    }
    return [];
  });
}

/** Si può emettere quando c'è almeno una riga e nessuna è incompleta. */
export function righeEmettibili(righe: RigaInCorso[]): boolean {
  return righe.length > 0 && righeIncomplete(righe).length === 0;
}

/**
 * Il valore comune a tutte le righe, quando ce n'è uno.
 *
 * Serve due volte con lo stesso significato: il progetto si scrive sulla fattura
 * solo se le righe ne indicano uno, e l'intestatario si può accettare solo se le
 * righe ne indicano uno. I nulli non contano — una riga libera non ha progetto,
 * e non per questo impedisce alle altre di averne uno in comune.
 */
export function unicoComune<T>(valori: Array<T | null | undefined>): T | null {
  const veri = [...new Set(valori.filter((v) => v != null))] as T[];
  return veri.length === 1 ? veri[0] : null;
}

/** Quante tranche si stanno chiudendo: le righe libere non chiudono niente. */
export function trancheChiuse(righe: RigaInCorso[]): string[] {
  return [...new Set(righe.map((r) => r.tranche_id).filter(Boolean) as string[])];
}

/**
 * Una tranche non si mette due volte sulla stessa fattura.
 *
 * Il database lo vieta con un indice unico, ma lì il messaggio sarebbe una
 * violazione di vincolo. Qui si vede prima, mentre si compila.
 */
export function trancheRipetute(righe: RigaInCorso[]): string[] {
  const visti = new Set<string>();
  const doppi = new Set<string>();
  for (const r of righe) {
    if (!r.tranche_id) continue;
    if (visti.has(r.tranche_id)) doppi.add(r.tranche_id);
    visti.add(r.tranche_id);
  }
  return [...doppi];
}

/**
 * La descrizione di una riga che fattura una tranche.
 *
 * Sulle fatture vere si legge «50% LEED ID+C GOLD»: la percentuale della tranche,
 * poi il servizio. Comporla invece di scriverla è il motivo per cui nell'archivio
 * c'erano 156 diciture distinte per una quindicina di concetti — «50% LEED GOLD»,
 * «50% LEED ID + C GOLD», «50% LEED GOLD Consultancy» sono la stessa cosa.
 *
 * La percentuale non si scrive due volte: molti nomi di tranche ce l'hanno già
 * dentro («60% all'ordine hardware»), e prependerla produceva «60% 60% all'ordine
 * hardware» — che è successo davvero.
 */
export function componiDescrizione(
  pct: number | null | undefined,
  dicitura: string | null | undefined,
): string {
  const testo = (dicitura ?? "").trim();
  if (!testo) return "";
  const p = Number(pct);
  if (!Number.isFinite(p) || p <= 0) return testo;
  // Se comincia già con una percentuale, quella è la sua: non se ne aggiunge una
  // seconda.
  if (/^\d+([.,]\d+)?\s*%/.test(testo)) return testo;
  // Le percentuali intere si scrivono senza decimali: «50%», non «50,0%».
  const scritta = Number.isInteger(p) ? String(p) : String(p).replace(".", ",");
  return `${scritta}% ${testo}`;
}

/**
 * Su quali progetti si può fatturare.
 *
 * Non basta che una tranche sia esigibile: deve esserlo il progetto. Due casi
 * veri nei dati lo dicono — due tranche di progetti **cancellati** stavano in
 * attesa di fatturazione (3.360 €), e due di una **quotazione non ancora
 * approvata** (15.400 €). La seconda è la peggiore: una fattura pronta per un
 * lavoro che nessuno ci ha commissionato.
 *
 * Il filtro sta qui e non nello stato della tranche, perché lo stato della
 * tranche descrive un fatto — l'evento è arrivato o no — e i fatti non si
 * riscrivono per far sparire una riga da un elenco.
 */
const STATI_NON_FATTURABILI = new Set([
  // Prima dell'approvazione non c'è niente da fatturare: c'è un'offerta.
  "potential",
  "quotation",
  // Dopo la cancellazione non ci sarà più niente da fatturare.
  "canceled",
  "cancelled",
]);

export function progettoFatturabile(status: string | null | undefined): boolean {
  if (!status) return true; // Senza stato non si sa: meglio mostrarlo che nasconderlo.
  return !STATI_NON_FATTURABILI.has(status.toLowerCase());
}

/**
 * «30 giorni fine mese», in giorni.
 *
 * Il database calcola la scadenza come emissione + giorni: non sa cosa sia un
 * fine mese. Quindi il fine mese si traduce in un numero di giorni — quelli che
 * separano l'emissione dall'ultimo giorno del mese in cui cade emissione + 30.
 *
 * Il numero che resta scritto non è più «30»: è 41, o 43, a seconda del mese. È
 * corretto — la scadenza è quella giusta — ma va detto in chiaro nel dialogo,
 * perché chi rileggerà «41 giorni» fra sei mesi non deve pensare a un errore.
 */
export function giorniFineMese(emissione: string): number {
  const inizio = new Date(`${emissione}T00:00:00Z`);
  if (Number.isNaN(inizio.getTime())) return 30;
  const piu30 = new Date(inizio);
  piu30.setUTCDate(piu30.getUTCDate() + 30);
  // Giorno 0 del mese successivo è l'ultimo del mese corrente.
  const fine = new Date(Date.UTC(piu30.getUTCFullYear(), piu30.getUTCMonth() + 1, 0));
  return Math.round((fine.getTime() - inizio.getTime()) / 86_400_000);
}

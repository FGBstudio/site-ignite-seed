/**
 * Quanto spazio prendono gli appunti dentro la riga di un progetto.
 *
 * La barra del Gantt resta dov'era, in cima; gli appunti si impilano sotto,
 * dentro la fascia dello stesso progetto. La riga cresce quando c'è qualcosa da
 * ricordare e si schiaccia quando non c'è più.
 *
 * Sta in un file suo e non nel componente per due motivi: il fast refresh di
 * Vite si rompe quando un file esporta anche cose che non sono componenti, e
 * questo conto va messo alla prova — un progetto con venti appunti sparsi non
 * deve diventare alto venti righe.
 */

/** Alto quanto una riga di appunto. */
export const ALTEZZA_APPUNTO = 22;

/** La fascia del Gantt, in cima alla riga: la barra non si muove di lì. */
export const ALTEZZA_GANTT = 40;

/** Il minimo che serve a non far toccare l'ultimo appunto al bordo. */
const RESPIRO = 4;

/**
 * L'altezza della riga di un progetto, dati i suoi appunti.
 *
 * Si misura la **settimana più carica**, non il totale: gli appunti di settimane
 * diverse stanno uno accanto all'altro, non uno sopra l'altro. Sommarli tutti
 * farebbe di un progetto con venti appunti sparsi su venti settimane una riga
 * alta venti righe, con diciannove ventesimi di spazio vuoto.
 */
export function altezzaRiga(appunti: Array<{ settimana: string }>): number {
  if (appunti.length === 0) return ALTEZZA_GANTT;

  const perSettimana = new Map<string, number>();
  for (const a of appunti) {
    perSettimana.set(a.settimana, (perSettimana.get(a.settimana) ?? 0) + 1);
  }
  const massimo = Math.max(...perSettimana.values());
  return ALTEZZA_GANTT + massimo * ALTEZZA_APPUNTO + RESPIRO;
}

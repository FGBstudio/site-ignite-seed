/**
 * L'aritmetica dei passi del wizard, fuori dal componente.
 *
 * Sta qui per una ragione precisa: il tetto dei passi era scritto a mano
 * («next > 4») da quando il wizard ne aveva quattro. Aggiungendo Payments in
 * mezzo, l'ultimo passo e' diventato il quinto e quel confronto ha smesso di
 * far avanzare: il pulsante Continue calcolava il passo giusto e poi lo
 * buttava via, senza errori e senza segnali.
 *
 * Un numero scritto due volte — nell'elenco dei passi e nel confronto — prima
 * o poi diverge. Qui il tetto si passa, e i test lo fissano.
 */

export interface Passaggio {
  /** Il numero dell'ultimo passo esistente. */
  ultimo: number;
  /** La Strategia si salta quando c'e' una sola certificazione da quotare. */
  saltaStrategia: boolean;
  /** Il numero del passo Strategia, che è l'unico saltabile. */
  passoStrategia?: number;
}

export function prossimoPasso(corrente: number, p: Passaggio): number {
  const strategia = p.passoStrategia ?? 3;
  let next = corrente + 1;
  if (next === strategia && p.saltaStrategia) next = strategia + 1;
  return next > p.ultimo ? corrente : next;
}

export function passoPrecedente(corrente: number, p: Passaggio): number {
  const strategia = p.passoStrategia ?? 3;
  let prev = corrente - 1;
  if (prev === strategia && p.saltaStrategia) prev = strategia - 1;
  return prev < 1 ? corrente : prev;
}

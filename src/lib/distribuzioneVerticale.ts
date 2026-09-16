/**
 * Distribuire voci lungo un asse verticale senza farle accavallare.
 *
 * Serve in due punti del prodotto, e per la stessa ragione: c'è una quota
 * *ideale* per ogni voce — quella che le darebbe la sua data — e quelle quote
 * si ammassano. In un cronoprogramma vero decine di attività partono lo stesso
 * giorno, e metterle tutte alla loro quota le impila sullo stesso pixel.
 *
 * La cura non è nascondere voci (si perde informazione) né rimpicciolire il
 * testo (sotto una certa soglia è comunque illeggibile): è spostarle **il
 * minimo indispensabile** perché stiano distanziate.
 *
 * «Il minimo indispensabile» non è un modo di dire — è il problema della
 * regressione isotona, che si risolve esattamente con pool-adjacent-violators:
 * trasformando in `v_i = ideale_i − i·passo`, la soluzione monotona di v dà le
 * posizioni distanziate di almeno `passo` con lo spostamento TOTALE minimo.
 *
 * L'euristica ovvia — «spingi in giù finché non si toccano» — accumula invece
 * tutto lo scarto sulle ultime voci, che finiscono lontanissime dalla loro
 * quota vera. È il motivo per cui non è stata usata.
 *
 * L'ordine verticale non cambia mai: quello che nel tempo viene prima resta
 * sopra, sempre. Una voce che scavalca un'altra sarebbe peggio
 * dell'accavallamento, perché mentirebbe invece di confondere.
 */
export function distribuisci(ideali: number[], passo: number, min: number, max: number): number[] {
  const n = ideali.length;
  if (n === 0) return [];
  if (n === 1) return [Math.min(max, Math.max(min, ideali[0]))];

  // Se proprio non ci stanno, si stringe: meglio tutte leggibili e vicine che
  // metà fuori dalla cornice.
  const passoEff = Math.min(passo, (max - min) / (n - 1));

  const ordine = ideali.map((_, i) => i).sort((a, b) => ideali[a] - ideali[b]);
  const v = ordine.map((idx, k) => ideali[idx] - k * passoEff);

  const somma: number[] = [];
  const quanti: number[] = [];
  for (const x of v) {
    somma.push(x);
    quanti.push(1);
    while (
      somma.length > 1 &&
      somma[somma.length - 2] / quanti[quanti.length - 2] > somma[somma.length - 1] / quanti[quanti.length - 1]
    ) {
      const s = somma.pop()!;
      const c = quanti.pop()!;
      somma[somma.length - 1] += s;
      quanti[quanti.length - 1] += c;
    }
  }

  const piatto: number[] = [];
  for (let j = 0; j < somma.length; j++) {
    const media = somma[j] / quanti[j];
    for (let k = 0; k < quanti[j]; k++) piatto.push(media);
  }

  // Il blocco intero rientra nella cornice, senza deformarlo.
  const primo = piatto[0];
  const ultimo = piatto[n - 1] + (n - 1) * passoEff;
  let scarto = 0;
  if (primo < min) scarto = min - primo;
  else if (ultimo > max) scarto = Math.max(max - ultimo, min - primo);

  const out = new Array<number>(n);
  ordine.forEach((idx, k) => {
    out[idx] = piatto[k] + k * passoEff + scarto;
  });
  return out;
}

/**
 * La quota che spetta a una data, letta sulla scala di un'altra colonna.
 *
 * È il pezzo che tiene allineate nel tempo le due timeline. La colonna
 * PROGETTO detta l'asse — le sue tappe stanno a distanza fissa — e ogni passo
 * di certificazione si posiziona **dove cade la sua data fra quelle del
 * progetto**, interpolando fra le due tappe che lo contengono.
 *
 * Non è tornare a una scala temporale: dentro ciascuna colonna la spaziatura
 * resta fissa, ed è quello che impedisce agli ammassamenti di riformarsi. È
 * la relazione *fra* le colonne a diventare temporale, che è l'unica cosa che
 * serve per rispondere alla domanda «mentre succede questo, a che punto è il
 * cantiere?».
 *
 * Fuori dall'intervallo del progetto si appoggia agli estremi: una data che
 * cade prima della prima attività non ha un «prima» su cui stare.
 */
export function quotaPerData(
  data: string,
  dateScala: string[],
  quoteScala: number[]
): number | null {
  const n = Math.min(dateScala.length, quoteScala.length);
  if (n === 0) return null;
  if (n === 1) return quoteScala[0];

  if (data <= dateScala[0]) return quoteScala[0];
  if (data >= dateScala[n - 1]) return quoteScala[n - 1];

  for (let i = 0; i < n - 1; i++) {
    const a = dateScala[i];
    const b = dateScala[i + 1];
    if (data >= a && data <= b) {
      const totale = giorni(a, b);
      if (totale <= 0) return quoteScala[i];
      const frazione = giorni(a, data) / totale;
      return quoteScala[i] + (quoteScala[i + 1] - quoteScala[i]) * frazione;
    }
  }
  return quoteScala[n - 1];
}

const giorni = (a: string, b: string) =>
  Math.round(
    (new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 86_400_000
  );

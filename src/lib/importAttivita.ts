/**
 * L'import del cronoprogramma — SPECIFICA_TIMELINE §8.
 *
 * Due strade, un solo esito: una lista di righe `{nome, inizio, fine}` che il
 * PM rivede prima che tocchino qualcosa.
 *
 *  · **XLSX** si legge qui, nel browser. Il formato atteso è `Attività |
 *    Inizio | Fine`, ed è abbastanza semplice da non aver bisogno di un
 *    modello: la prima cella è il nome, le prime due date utili della riga
 *    sono inizio e fine.
 *  · **PDF e immagini** passano dal servizio di estrazione, perché lì le date
 *    spesso non sono scritte da nessuna parte: stanno nella posizione delle
 *    barre contro la scala dei mesi.
 *
 * L'abbinamento ai nomi è la parte delicata. Un file vero scrive «Concept
 * Design (CD)» dove noi abbiamo «Concept design + review», e nessun confronto
 * esatto li riconoscerà mai. Ma un abbinamento troppo generoso è peggio di
 * nessun abbinamento: scrive la data giusta sulla riga sbagliata, e il PM se
 * ne accorge mesi dopo. Per questo qui non si decide niente — si **propone**,
 * con il punteggio in chiaro, e conferma una persona.
 */

/**
 * Normalizza per il confronto: minuscole, niente accenti, niente
 * punteggiatura, spazi singoli.
 *
 * Si tengono i numeri, a differenza del prototipo che li buttava: «RIBA st.3»
 * e «RIBA st.4» sono due fasi diverse e senza le cifre diventano lo stesso
 * testo. È esattamente il tipo di collisione che fa scrivere la data sulla
 * riga sbagliata.
 */
export function normalizza(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Le parole troppo comuni per distinguere qualcosa. */
const RUMORE = new Set([
  "di", "del", "della", "dei", "delle", "e", "il", "la", "lo", "i", "gli", "le",
  "a", "al", "da", "in", "per", "con", "su", "the", "of", "and", "to", "for",
  "fase", "phase", "attivita", "activity", "stage",
]);

const parole = (s: string) => normalizza(s).split(" ").filter((p) => p && !RUMORE.has(p));

/**
 * Quanto due nomi si somigliano, 0..1 — coefficiente di Dice sulle parole.
 *
 *     2 · |comuni| / (|a| + |b|)
 *
 * La misura ovvia sarebbe «comuni sul più corto dei due», e **è sbagliata**:
 * un test l'ha smascherata subito. «Review & approval CD» e «Review & approval
 * RIBA 3» condividono due parole su tre del più corto — 0,67, sopra soglia —
 * e si sarebbero abbinate, scrivendo la data di una revisione sull'altra.
 * Quella misura premia il prefisso generico e ignora proprio la parte che
 * distingue.
 *
 * Dice conta anche quello che NON è in comune, su entrambi i lati: le stesse
 * due frasi scendono a 0,57 e restano separate, mentre «Concept Design (CD)»
 * e «Concept design + review» stanno a 0,67 e si abbinano. È la differenza fra
 * «si somigliano» e «sono la stessa cosa scritta in due modi».
 *
 * Il contenimento resta come rinforzo per il caso opposto — un nome che è
 * letteralmente dentro l'altro, «Handover» in «Handover (fine cantiere)» —
 * dove Dice penalizza a torto la brevità.
 */
export function somiglianza(a: string, b: string): number {
  const pa = parole(a);
  const pb = parole(b);
  if (pa.length === 0 || pb.length === 0) return 0;

  const na = normalizza(a);
  const nb = normalizza(b);
  if (na === nb) return 1;

  const insieme = new Set(pb);
  const comuni = pa.filter((p) => insieme.has(p)).length;
  const punteggio = (2 * comuni) / (pa.length + pb.length);

  if (punteggio > 0 && (na.includes(nb) || nb.includes(na))) {
    return Math.min(1, punteggio + 0.15);
  }
  return punteggio;
}

/**
 * Sotto questa soglia non si propone niente.
 *
 * 0.6 significa «più di metà delle parole significative coincidono». Sotto,
 * l'abbinamento è un'ipotesi, e un'ipotesi che scrive date è un danno.
 */
export const SOGLIA = 0.6;

export interface RigaFile {
  nome: string;
  inizio: string | null;
  fine: string | null;
}

export interface Abbinamento {
  riga: RigaFile;
  /** L'attività che il file aggiornerebbe, se ne è stata trovata una. */
  attivitaId: string | null;
  attivitaNome: string | null;
  punteggio: number;
}

/**
 * Abbina le righe del file alle attività esistenti.
 *
 * Un'attività non si fa abbinare due volte: se due righe puntano alla stessa,
 * vince quella col punteggio migliore e l'altra resta libera. Senza questa
 * regola un file con «Construction» e «Construction start» aggiornerebbe due
 * volte la stessa riga, e l'ultima scritta vincerebbe a caso.
 */
export function abbina(
  righe: RigaFile[],
  attivita: Array<{ id: string; nome: string }>
): Abbinamento[] {
  const candidati = righe.flatMap((riga, i) =>
    attivita.map((a) => ({ i, a, p: somiglianza(riga.nome, a.nome) }))
  );

  candidati.sort((x, y) => y.p - x.p);

  const rigaPresa = new Set<number>();
  const attivitaPresa = new Set<string>();
  const esito = new Map<number, { id: string; nome: string; p: number }>();

  for (const c of candidati) {
    if (c.p < SOGLIA) break;
    if (rigaPresa.has(c.i) || attivitaPresa.has(c.a.id)) continue;
    rigaPresa.add(c.i);
    attivitaPresa.add(c.a.id);
    esito.set(c.i, { id: c.a.id, nome: c.a.nome, p: c.p });
  }

  return righe.map((riga, i) => {
    const m = esito.get(i);
    return {
      riga,
      attivitaId: m?.id ?? null,
      attivitaNome: m?.nome ?? null,
      punteggio: m?.p ?? 0,
    };
  });
}

// ── Lettura dell'XLSX ─────────────────────────────────────────────────────

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Una data come la scrivono i fogli di calcolo, in ISO.
 *
 * `cellDates: true` fa arrivare i `Date` veri; quello che resta testo si legge
 * all'italiana (giorno prima del mese), che è la convenzione di tutti i file
 * con cui lavoriamo.
 */
export function dataDaCella(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return [
      v.getFullYear(),
      String(v.getMonth() + 1).padStart(2, "0"),
      String(v.getDate()).padStart(2, "0"),
    ].join("-");
  }

  const s = String(v ?? "").trim();
  if (!s) return null;
  if (ISO.test(s)) return s;

  const m = s.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (!m) return null;

  const giorno = Number(m[1]);
  const mese = Number(m[2]);
  let anno = Number(m[3]);
  if (anno < 100) anno += anno < 70 ? 2000 : 1900;
  if (mese < 1 || mese > 12 || giorno < 1 || giorno > 31) return null;

  const d = new Date(anno, mese - 1, giorno, 12);
  if (d.getFullYear() !== anno || d.getMonth() !== mese - 1 || d.getDate() !== giorno) return null;

  return [anno, String(mese).padStart(2, "0"), String(giorno).padStart(2, "0")].join("-");
}

/**
 * Da una matrice di celle alle righe del file.
 *
 * Si scartano le righe senza nome e quelle senza nessuna data: una voce senza
 * date non porta niente, e farla comparire nella revisione vorrebbe dire
 * chiedere al PM di leggere rumore.
 */
export function righeDaMatrice(matrice: unknown[][]): RigaFile[] {
  const out: RigaFile[] = [];

  for (const r of matrice) {
    if (!Array.isArray(r)) continue;
    const nome = String(r[0] ?? "").trim();
    if (nome.length < 3) continue;
    // L'intestazione del foglio non è un'attività.
    if (/^(attivit|activity|task|nome|name)/i.test(nome) && r.length <= 4) continue;

    const date = r.slice(1).map(dataDaCella).filter((d): d is string => !!d);
    if (date.length === 0) continue;

    let inizio = date[0];
    let fine = date[1] ?? null;
    if (fine && fine < inizio) [inizio, fine] = [fine, inizio];
    if (fine === inizio) fine = null;

    out.push({ nome: nome.replace(/\s+/g, " "), inizio, fine });
  }

  return out;
}

export async function leggiXlsx(file: File): Promise<RigaFile[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const foglio = wb.Sheets[wb.SheetNames[0]];
  const matrice = XLSX.utils.sheet_to_json<unknown[]>(foglio, { header: 1, raw: false });
  return righeDaMatrice(matrice as unknown[][]);
}

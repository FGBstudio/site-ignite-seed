/**
 * Leggere una fattura passiva dal suo PDF.
 *
 * Non è riconoscimento documentale: è una lettura del testo con qualche regola
 * su come le fatture italiane scrivono le cose. Indovina il numero, le date e
 * gli importi, e li PROPONE — chi registra li conferma o li corregge.
 *
 * La differenza conta: un'estrazione presentata come certa fa registrare
 * l'importo sbagliato senza che nessuno riguardi il documento. Una proposta
 * evidente da rivedere fa risparmiare la digitazione senza togliere il
 * controllo.
 *
 * `indoviniDaTesto` è pura e testata; `testoDaPdf` è l'unica parte che tocca il
 * file.
 */

export interface Indovinati {
  numero?: string;
  dataEmissione?: string;
  imponibile?: number;
  tassa?: number;
  totale?: number;
}

/** «1.234,56» → 1234.56 · «1,234.56» → 1234.56 */
function numeroItaliano(s: string): number | undefined {
  const pulito = s.replace(/[^\d.,]/g, "");
  if (!pulito) return undefined;
  // L'ultimo separatore è quello dei decimali: è l'unica regola che funziona
  // sia con 1.234,56 sia con 1,234.56, e le fatture arrivano in entrambi i modi.
  const ultimaVirgola = pulito.lastIndexOf(",");
  const ultimoPunto = pulito.lastIndexOf(".");
  const taglio = Math.max(ultimaVirgola, ultimoPunto);

  let n: number;
  if (taglio < 0) {
    n = Number(pulito);
  } else {
    const intero = pulito.slice(0, taglio).replace(/[.,]/g, "");
    const decimali = pulito.slice(taglio + 1);
    // Tre cifre dopo l'ultimo separatore non sono decimali: è un migliaio.
    n = decimali.length === 3 ? Number(intero + decimali) : Number(`${intero}.${decimali}`);
  }
  return Number.isFinite(n) ? n : undefined;
}

/** «12/03/2026» o «12-03-26» → «2026-03-12» */
function dataIso(g: string, m: string, a: string): string | undefined {
  const anno = a.length === 2 ? `20${a}` : a;
  const gg = g.padStart(2, "0");
  const mm = m.padStart(2, "0");
  if (Number(mm) < 1 || Number(mm) > 12 || Number(gg) < 1 || Number(gg) > 31) return undefined;
  return `${anno}-${mm}-${gg}`;
}

/** Il primo numero che segue una di queste parole. */
function dopoEtichetta(testo: string, parole: string[]): number | undefined {
  for (const p of parole) {
    const re = new RegExp(
      `${p}[^\\d\\n]{0,40}?([\\d.,]+\\d)`,
      "i",
    );
    const m = testo.match(re);
    if (m) {
      const n = numeroItaliano(m[1]);
      if (n !== undefined && n > 0) return n;
    }
  }
  return undefined;
}

export function indoviniDaTesto(testo: string): Indovinati {
  const out: Indovinati = {};
  const piatto = testo.replace(/\s+/g, " ");

  // ── Il numero ──
  // Si cerca dopo le parole che lo annunciano, non il primo numero del foglio:
  // in cima a una fattura ci sono partite IVA, CAP e numeri civici.
  //
  // L'abbreviazione fra la parola e il valore («n.», «nr», «numero») va
  // consumata esplicitamente, altrimenti la cattura si prende la «n» e la
  // scambia per il numero del documento.
  // «n.», «nr», «numero», «No.»: le fatture le usano tutte, e in inglese «No.»
  // è la forma normale.
  const ABBR = "(?:n(?:umero|r|o)?\\s*[.°]?\\s*)?";
  const VALORE = "([A-Za-z0-9][A-Za-z0-9/_-]{0,20}\\d[A-Za-z0-9/_-]{0,20}|\\d[\\w/-]*)";
  for (const inizio of [`(?:fattura|invoice|documento)\\s*${ABBR}[:#]?\\s*`, `\\bn(?:umero|r)?\\s*[.°]\\s*`]) {
    const m = piatto.match(new RegExp(inizio + VALORE, "i"));
    // Serve almeno una cifra: «Fattura elettronica» non è un numero.
    if (m && /\d/.test(m[1])) {
      out.numero = m[1].replace(/[.,;:]$/, "");
      break;
    }
  }

  // ── La data ──
  const data = piatto.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (data) {
    const iso = dataIso(data[1], data[2], data[3]);
    if (iso) out.dataEmissione = iso;
  }

  // ── Gli importi ──
  out.imponibile = dopoEtichetta(piatto, ["imponibile", "taxable", "subtotale", "totale imponibile"]);
  out.tassa = dopoEtichetta(piatto, ["iva", "vat", "imposta", "tax"]);
  out.totale = dopoEtichetta(piatto, [
    "totale documento",
    "totale fattura",
    "totale a pagare",
    "total amount",
    "totale",
    "total",
  ]);

  // Se il totale manca ma ci sono le due parti, si somma: è una deduzione
  // sicura, non un'invenzione.
  if (out.totale === undefined && out.imponibile !== undefined && out.tassa !== undefined) {
    out.totale = Math.round((out.imponibile + out.tassa) * 100) / 100;
  }
  // E viceversa: totale meno imposta dà l'imponibile.
  if (out.imponibile === undefined && out.totale !== undefined && out.tassa !== undefined) {
    out.imponibile = Math.round((out.totale - out.tassa) * 100) / 100;
  }

  return out;
}

/**
 * Il testo di un PDF, letto nel browser.
 *
 * `pdfjs-dist` è già nel progetto. Il worker si carica dal pacchetto stesso:
 * puntarlo a una CDN lo renderebbe una dipendenza di rete per una cosa che
 * funziona benissimo in locale.
 */
export async function testoDaPdf(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pezzi: string[] = [];
  // Le prime tre pagine bastano: numero, date e totali stanno lì. Leggere un
  // allegato di quaranta pagine per trovarli sarebbe tempo speso male.
  for (let p = 1; p <= Math.min(doc.numPages, 3); p++) {
    const pagina = await doc.getPage(p);
    const contenuto = await pagina.getTextContent();
    pezzi.push(
      contenuto.items.map((i) => ("str" in i ? i.str : "")).join(" "),
    );
  }
  return pezzi.join("\n");
}

/**
 * Import della PROJECT TIMELINE da file — v1.1 §5.
 *
 * Tre strade, una per formato: xlsx si legge direttamente (niente OCR), un PDF
 * con layer di testo si analizza come testo, un'immagine o un PDF scansionato
 * passano dall'OCR. In tutti i casi il risultato e' lo stesso: una tabella di
 * attivita' candidate che il PM rivede, corregge e conferma. L'estrazione e'
 * un acceleratore — se fallisce o e' parziale, il PM prosegue a mano, mai
 * bloccato dal risultato.
 *
 * Le librerie pesanti (pdfjs, tesseract) si caricano solo quando servono: chi
 * non importa mai un file non ne scarica un byte.
 */

import { riconosciAncora } from "@/lib/projectTimelineTemplates";
import type { CronoAncora } from "@/types/cronoprogramma";

export interface AttivitaCandidata {
  nome: string;
  /** ISO yyyy-mm-dd, se il file la dice. */
  inizio: string | null;
  fine: string | null;
  /** Durata in mesi, quando il file parla per durate e non per date (§5.2). */
  durata_mesi: number | null;
  /** L'ancora FGB proposta dal riconoscimento dei nomi. Il PM la conferma o la cambia. */
  ancora_proposta: CronoAncora | null;
}

export interface EsitoEstrazione {
  attivita: AttivitaCandidata[];
  /** Vero quando il file parla per durate: serve la data di ancoraggio (§5.2). */
  richiedeAncoraggio: boolean;
  /** Un suggerimento per la data di ancoraggio, se il file ne lascia intravedere una. */
  ancoraggioSuggerito: string | null;
  /** Cosa e' successo, per il PM: "12 attivita' da 3 pagine", oppure il perche' di un vuoto. */
  diario: string;
}

export async function estraiTimeline(file: File): Promise<EsitoEstrazione> {
  const nome = file.name.toLowerCase();
  if (nome.endsWith(".xlsx") || nome.endsWith(".xls")) return estraiXlsx(file);
  if (nome.endsWith(".pdf")) return estraiPdf(file);
  if (/\.(png|jpe?g|webp)$/.test(nome)) return estraiImmagine(file);
  return {
    attivita: [],
    richiedeAncoraggio: false,
    ancoraggioSuggerito: null,
    diario: "Formato non riconosciuto: accetto xlsx, PDF e immagini (png/jpg).",
  };
}

// ── xlsx: parsing diretto, niente OCR ──────────────────────────────────────
async function estraiXlsx(file: File): Promise<EsitoEstrazione> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const attivita: AttivitaCandidata[] = [];
  let durate = 0;
  let dateAssolute = 0;
  let ancoraggioSuggerito: string | null = null;

  for (const nomeFoglio of wb.SheetNames) {
    const righe: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[nomeFoglio], {
      header: 1,
      raw: true,
      blankrows: false,
    });

    // La prima cella data-seriale dell'intestazione e' spesso il mese di
    // partenza del gantt: buon suggerimento per l'ancoraggio, niente di piu'.
    for (const cella of righe[0] ?? []) {
      if (typeof cella === "number" && cella > 40000 && cella < 60000) {
        ancoraggioSuggerito = serialeExcel(cella);
        break;
      }
    }

    let dentroLegenda = false;
    for (const r of righe) {
      const nome = typeof r?.[0] === "string" ? r[0].trim() : "";
      if (!nome) continue;
      if (/^legend/i.test(nome)) dentroLegenda = true;
      if (dentroLegenda) continue;
      if (/^(project stages?|attivit|fase|task|wbs|duration|durata)/i.test(nome) && r.length <= 2) continue;

      // Date esplicite sulla riga? Due seriali = inizio e fine.
      const seriali = r
        .slice(1)
        .filter((c): c is number => typeof c === "number" && c > 40000 && c < 60000);
      if (seriali.length >= 1) {
        attivita.push({
          nome,
          inizio: serialeExcel(seriali[0]),
          fine: seriali.length > 1 ? serialeExcel(seriali[seriali.length - 1]) : null,
          durata_mesi: null,
          ancora_proposta: riconosciAncora(nome),
        });
        dateAssolute += 1;
        continue;
      }

      // Altrimenti: durata in mesi nella seconda colonna (la fixture greca).
      const durata = typeof r?.[1] === "number" && r[1] > 0 && r[1] < 120 ? r[1] : null;
      if (durata !== null) {
        attivita.push({
          nome,
          inizio: null,
          fine: null,
          durata_mesi: durata,
          ancora_proposta: riconosciAncora(nome),
        });
        durate += 1;
      }
    }
  }

  const richiedeAncoraggio = durate > 0 && dateAssolute === 0;
  return {
    attivita,
    richiedeAncoraggio,
    ancoraggioSuggerito,
    diario:
      attivita.length === 0
        ? "Nessuna attivita' riconosciuta nel foglio: prosegui a mano."
        : richiedeAncoraggio
        ? `${attivita.length} attivita' con durate in mesi: serve una data di ancoraggio da cui calcolare le altre.`
        : `${attivita.length} attivita' estratte dal foglio.`,
  };
}

function serialeExcel(seriale: number): string {
  const ms = Math.round((seriale - 25569) * 86400 * 1000);
  return new Date(ms).toISOString().slice(0, 10);
}

// ── PDF con layer di testo ─────────────────────────────────────────────────
async function estraiPdf(file: File): Promise<EsitoEstrazione> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const righe: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const pagina = await doc.getPage(p);
    const testo = await pagina.getTextContent();
    // Gli item si raggruppano per riga usando la y: un gantt tabellare ha il
    // nome dell'attivita' e le sue date sulla stessa riga visiva.
    const perRiga = new Map<number, { x: number; s: string }[]>();
    for (const item of testo.items as any[]) {
      if (!item.str?.trim()) continue;
      const y = Math.round(item.transform[5] / 3) * 3;
      if (!perRiga.has(y)) perRiga.set(y, []);
      perRiga.get(y)!.push({ x: item.transform[4], s: item.str });
    }
    const ordinate = Array.from(perRiga.entries()).sort((a, b) => b[0] - a[0]);
    for (const [, celle] of ordinate) {
      righe.push(
        celle
          .sort((a, b) => a.x - b.x)
          .map((c) => c.s)
          .join(" ")
          .replace(/\s{2,}/g, "  ")
          .trim()
      );
    }
  }

  let attivita = candidateDaRighe(righe);
  const hadText = righe.join("").length > 40;
  if (!hadText) {
    // Niente layer di testo: e' una scansione. Si passa all'OCR sulla prima pagina.
    return estraiPdfComeImmagine(file, doc);
  }

  // Secondo passaggio: alcuni export (MS Project ruotato, come il Grand
  // Vespucci) mettono tutte le date di inizio su una riga e tutte le fini su
  // un'altra. I nomi sono concatenati senza separatori e non si recuperano:
  // le candidate escono come "Attivita' N" con le date giuste, e il PM le
  // rinomina in revisione — meglio venti date vere senza nome che niente.
  let daColonne = false;
  if (attivita.length < 3) {
    const parallele = colonneParallele(righe);
    if (parallele.length > attivita.length) {
      attivita = parallele;
      daColonne = true;
    }
  }

  return {
    attivita,
    richiedeAncoraggio: false,
    ancoraggioSuggerito: null,
    diario:
      attivita.length === 0
        ? `Il PDF ha testo (${doc.numPages} pagine) ma nessuna riga nome+data riconoscibile: prosegui a mano o correggi qui sotto.`
        : daColonne
        ? `${attivita.length} coppie inizio/fine estratte dalle colonne del gantt. I nomi non erano ricostruibili: rinominale qui sotto.`
        : `${attivita.length} attivita' estratte da ${doc.numPages} pagine.`,
  };
}

/** Le righe "Inizio … Fine …" degli export tabellari: si accoppiano per posizione. */
function colonneParallele(righe: string[]): AttivitaCandidata[] {
  const trova = (re: RegExp) => {
    const r = righe.find((x) => re.test(x) && dateInRiga(x).length >= 3);
    return r ? dateInRiga(r) : null;
  };
  const inizi = trova(/^(inizio|start)\b/i);
  const fini = trova(/^(fine|finish|end)\b/i);
  if (!inizi || !fini) return [];
  const n = Math.min(inizi.length, fini.length);
  const out: AttivitaCandidata[] = [];
  for (let i = 0; i < n; i++) {
    if (fini[i] < inizi[i]) continue;
    out.push({
      nome: `Attivita' ${i + 1}`,
      inizio: inizi[i],
      fine: fini[i] === inizi[i] ? null : fini[i],
      durata_mesi: null,
      ancora_proposta: null,
    });
  }
  return out;
}

async function estraiPdfComeImmagine(file: File, doc: any): Promise<EsitoEstrazione> {
  const pagina = await doc.getPage(1);
  const viewport = pagina.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await pagina.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
  const esito = await ocr(canvas);
  return { ...esito, diario: `PDF senza layer di testo: OCR sulla prima pagina. ${esito.diario}` };
}

// ── Immagine: OCR ──────────────────────────────────────────────────────────
async function estraiImmagine(file: File): Promise<EsitoEstrazione> {
  return ocr(file);
}

async function ocr(sorgente: File | HTMLCanvasElement): Promise<EsitoEstrazione> {
  const { createWorker } = await import("tesseract.js");
  // Italiano e inglese insieme: i cronoprogrammi veri sono in entrambe.
  const worker = await createWorker(["ita", "eng"]);
  try {
    const { data } = await worker.recognize(sorgente as any);
    const righe = data.text.split("\n").map((r) => r.trim()).filter(Boolean);
    const attivita = candidateDaRighe(righe);
    return {
      attivita,
      richiedeAncoraggio: false,
      ancoraggioSuggerito: null,
      diario:
        attivita.length === 0
          ? "L'OCR ha letto il file ma non ha riconosciuto righe nome+data: prosegui a mano."
          : `${attivita.length} attivita' riconosciute dall'OCR — controlla le date una per una: l'OCR sbaglia i numeri piu' volentieri delle parole.`,
    };
  } finally {
    await worker.terminate();
  }
}

// ── Da righe di testo a candidate ──────────────────────────────────────────
//
// Multilingua IT/EN: mesi scritti per esteso o abbreviati, date numeriche coi
// tre separatori comuni. Ogni riga con un nome e almeno una data diventa una
// candidata; con due date, la seconda e' la fine.
const MESI: Record<string, number> = {
  gen: 1, feb: 2, mar: 3, apr: 4, mag: 5, giu: 6, lug: 7, ago: 8, set: 9, ott: 10, nov: 11, dic: 12,
  jan: 1, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, dec: 12,
};

const DATA_NUM = /\b([0-3]?\d)[./-]([01]?\d)[./-](\d{2,4})\b/g;
const DATA_TESTO = /\b([0-3]?\d)\s+(gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic|jan|may|jun|jul|aug|sep|oct|dec)[a-z]*\.?\s+(\d{2,4})\b/gi;

function dateInRiga(riga: string): string[] {
  const out: string[] = [];
  for (const m of riga.matchAll(DATA_NUM)) {
    const [, gg, mm, aa] = m;
    const anno = aa.length === 2 ? `20${aa}` : aa;
    const g = Number(gg), mese = Number(mm), a = Number(anno);
    if (g >= 1 && g <= 31 && mese >= 1 && mese <= 12 && a >= 2015 && a <= 2040) {
      out.push(`${anno}-${String(mese).padStart(2, "0")}-${String(g).padStart(2, "0")}`);
    }
  }
  for (const m of riga.matchAll(DATA_TESTO)) {
    const [, gg, mesTxt, aa] = m;
    const mese = MESI[mesTxt.toLowerCase().slice(0, 3)];
    const anno = aa.length === 2 ? `20${aa}` : aa;
    if (mese) out.push(`${anno}-${String(mese).padStart(2, "0")}-${String(Number(gg)).padStart(2, "0")}`);
  }
  return out;
}

function candidateDaRighe(righe: string[]): AttivitaCandidata[] {
  const out: AttivitaCandidata[] = [];
  for (const riga of righe) {
    const date = dateInRiga(riga);
    if (date.length === 0) continue;
    // Il nome e' cio' che precede la prima data, ripulito dei numeri di riga.
    const nome = riga
      .slice(0, indicePrimaData(riga))
      .replace(/^[\d.\s F]{0,6}/, "")
      .replace(/[|:;·]+$/, "")
      .trim();
    if (nome.length < 3 || nome.length > 90) continue;
    const ordinate = [...date].sort();
    out.push({
      nome,
      inizio: ordinate[0],
      fine: ordinate.length > 1 ? ordinate[ordinate.length - 1] : null,
      durata_mesi: null,
      ancora_proposta: riconosciAncora(nome),
    });
  }
  // Dedup sul nome: nei PDF tabellari la stessa riga compare su piu' pagine.
  const visti = new Set<string>();
  return out.filter((a) => {
    const k = a.nome.toLowerCase();
    if (visti.has(k)) return false;
    visti.add(k);
    return true;
  });
}

function indicePrimaData(riga: string): number {
  DATA_NUM.lastIndex = 0;
  DATA_TESTO.lastIndex = 0;
  const a = DATA_NUM.exec(riga)?.index ?? Infinity;
  const b = DATA_TESTO.exec(riga)?.index ?? Infinity;
  return Math.min(a, b, riga.length);
}

/**
 * Dalle durate alle date — §5.2. La prima attivita' parte dall'ancoraggio e
 * le successive si accodano; e' un'approssimazione dichiarata (i gantt veri
 * hanno sovrapposizioni) che il PM corregge nella revisione, dove ogni riga
 * derivata resta marcata come tale.
 */
export function applicaAncoraggio(
  attivita: AttivitaCandidata[],
  ancoraggio: string
): AttivitaCandidata[] {
  let cursore = ancoraggio;
  return attivita.map((a) => {
    if (a.durata_mesi === null) return a;
    const inizio = cursore;
    const fine = aggiungiMesi(inizio, a.durata_mesi);
    cursore = fine;
    return { ...a, inizio, fine };
  });
}

function aggiungiMesi(iso: string, mesi: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const interi = Math.trunc(mesi);
  d.setUTCMonth(d.getUTCMonth() + interi);
  d.setUTCDate(d.getUTCDate() + Math.round((mesi - interi) * 30.4));
  return d.toISOString().slice(0, 10);
}

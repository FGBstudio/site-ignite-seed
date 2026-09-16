/**
 * Import della PROJECT TIMELINE da file — flusso v2 §2.3.
 *
 * Tre strade, una per formato: xlsx si legge direttamente, un PDF con layer di
 * testo si analizza **per coordinate**, un'immagine o un PDF scansionato
 * passano dall'OCR. In tutti i casi il risultato e' lo stesso: una tabella di
 * attivita' candidate **con le loro date**, che il PM rivede e conferma.
 *
 * Il v2 e' esplicito: «l'estrazione che non popola le date e' un difetto, non
 * un comportamento accettabile». Da qui la scelta di leggere i PDF per
 * colonne invece che a espressioni regolari su righe appiattite — un gantt
 * tabellare ha il nome a un'ascissa e le date a un'altra, e appiattire la riga
 * perde proprio l'informazione che serve.
 *
 * Due letture, non una: i cronoprogrammi esportati da MS Project sono spesso
 * **ruotati**, e allora ogni attivita' e' una colonna invece che una riga. Si
 * provano entrambe e vince quella che estrae piu' record completi.
 *
 * Le librerie pesanti (pdfjs, tesseract) si caricano solo quando servono.
 */

import type { CronoAncora } from "@/types/cronoprogramma";

export interface AttivitaCandidata {
  nome: string;
  inizio: string | null;
  fine: string | null;
  /** Durata in mesi, quando il file parla per durate e non per date (§2.3 passo 1). */
  durata_mesi: number | null;
  ancora_proposta: CronoAncora | null;
}

export interface EsitoEstrazione {
  attivita: AttivitaCandidata[];
  richiedeAncoraggio: boolean;
  ancoraggioSuggerito: string | null;
  /** Cosa e' successo, detto al PM: «22 attivita' da 1 pagina», o il perche' di un vuoto. */
  diario: string;
}

export async function estraiTimeline(file: File): Promise<EsitoEstrazione> {
  const nome = file.name.toLowerCase();
  if (nome.endsWith(".xlsx") || nome.endsWith(".xls")) return estraiXlsx(file);
  if (nome.endsWith(".pdf")) return estraiPdf(file);
  if (/\.(png|jpe?g|webp)$/.test(nome)) return ocr(file);
  return {
    attivita: [],
    richiedeAncoraggio: false,
    ancoraggioSuggerito: null,
    diario: "Formato non riconosciuto: accetto xlsx, PDF e immagini (png/jpg).",
  };
}

// ── Riconoscere date, durate, nomi ────────────────────────────────────────

const MESI: Record<string, number> = {
  gen: 1, feb: 2, mar: 3, apr: 4, mag: 5, giu: 6, lug: 7, ago: 8, set: 9, ott: 10, nov: 11, dic: 12,
  jan: 1, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, dec: 12,
};
const GIORNI = /^(lun|mar|mer|gio|ven|sab|dom|mon|tue|wed|thu|fri|sat|sun)\b/i;

/** Tutte le date ISO contenute in un frammento di testo. */
function dateIn(testo: string): string[] {
  const out: string[] = [];
  for (const m of testo.matchAll(/\b([0-3]?\d)[./-]([01]?\d)[./-](\d{2,4})\b/g)) {
    const [, gg, mm, aa] = m;
    const anno = aa.length === 2 ? `20${aa}` : aa;
    const g = Number(gg), mese = Number(mm), a = Number(anno);
    if (g >= 1 && g <= 31 && mese >= 1 && mese <= 12 && a >= 2015 && a <= 2045) {
      out.push(`${anno}-${String(mese).padStart(2, "0")}-${String(g).padStart(2, "0")}`);
    }
  }
  for (const m of testo.matchAll(
    /\b([0-3]?\d)\s+(gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic|jan|may|jun|jul|aug|sep|oct|dec)[a-z]*\.?\s+(\d{2,4})\b/gi
  )) {
    const [, gg, mesTxt, aa] = m;
    const mese = MESI[mesTxt.toLowerCase().slice(0, 3)];
    const anno = aa.length === 2 ? `20${aa}` : aa;
    if (mese) out.push(`${anno}-${String(mese).padStart(2, "0")}-${String(Number(gg)).padStart(2, "0")}`);
  }
  return out;
}

/**
 * Un frammento e' il nome di un'attivita'?
 *
 * Si escludono le cose che in un gantt somigliano a un nome ma non lo sono:
 * durate («31 g», «84 g?»), codici di precedenza («14II+10 g»), tacche di
 * mese e trimestre, numeri di riga, nomi di giorno isolati.
 */
function eNome(s: string): boolean {
  const t = s.trim();
  if (t.length < 4) return false;
  if (dateIn(t).length > 0) return false;
  if (/^\d+\s*g\??$/i.test(t)) return false;
  if (/^\d+\s*[IF]{1,2}\s*[+-]?\s*\d*\s*g?\??$/i.test(t)) return false;
  if (/^tri\s*\d/i.test(t)) return false;
  if (/^(gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s*\d{0,4}$/i.test(t)) return false;
  if (GIORNI.test(t) && t.length < 8) return false;
  if (/^[\d\s.,/-]+$/.test(t)) return false;
  // Deve avere qualche lettera vera.
  return (t.match(/\p{L}/gu) ?? []).length >= 3;
}

interface Frammento {
  x: number;
  y: number;
  s: string;
}

/**
 * Da un gruppo di frammenti (una riga, o una colonna se il foglio e' ruotato)
 * a una candidata: il nome piu' lungo fra i frammenti ammissibili — a parita',
 * quello piu' a sinistra, perche' le etichette ripetute sulle barre del gantt
 * stanno sempre a destra della tabella — e le date che il gruppo contiene.
 */
function candidataDaGruppo(gruppo: Frammento[]): AttivitaCandidata | null {
  const date = Array.from(new Set(gruppo.flatMap((f) => dateIn(f.s)))).sort();
  if (date.length === 0) return null;

  const nomi = gruppo.filter((f) => eNome(f.s));
  if (nomi.length === 0) return null;
  nomi.sort((a, b) => b.s.trim().length - a.s.trim().length || a.x - b.x);
  const nome = nomi[0].s.trim().replace(/\s{2,}/g, " ");
  if (nome.length > 110) return null;

  const inizio = date[0];
  const fine = date.length > 1 && date[date.length - 1] !== inizio ? date[date.length - 1] : null;
  return { nome, inizio, fine, durata_mesi: null, ancora_proposta: null };
}

function raggruppa(frammenti: Frammento[], asse: "x" | "y", tolleranza: number): Frammento[][] {
  const mappa = new Map<number, Frammento[]>();
  for (const f of frammenti) {
    const k = Math.round(f[asse] / tolleranza) * tolleranza;
    if (!mappa.has(k)) mappa.set(k, []);
    mappa.get(k)!.push(f);
  }
  return Array.from(mappa.entries())
    .sort((a, b) => (asse === "y" ? b[0] - a[0] : a[0] - b[0]))
    .map(([, v]) => v);
}

function dedup(c: AttivitaCandidata[]): AttivitaCandidata[] {
  const visti = new Set<string>();
  return c.filter((a) => {
    const k = `${a.nome.toLowerCase()}|${a.inizio}`;
    if (visti.has(k)) return false;
    visti.add(k);
    return true;
  });
}

// ── PDF con layer di testo ────────────────────────────────────────────────

async function estraiPdf(file: File): Promise<EsitoEstrazione> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const frammenti: Frammento[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const pagina = await doc.getPage(p);
    const testo = await pagina.getTextContent();
    for (const item of testo.items as any[]) {
      if (!item.str?.trim()) continue;
      // La pagina si impila in verticale: senza l'offset, due pagine diverse
      // finirebbero sulla stessa riga.
      frammenti.push({ x: item.transform[4], y: item.transform[5] - p * 10000, s: item.str });
    }
  }

  if (frammenti.length < 5) {
    // Niente layer di testo: e' una scansione, si passa all'OCR.
    return estraiPdfComeImmagine(doc, frammenti.length);
  }

  // Due letture. Un gantt tabellare rende per righe; un export ruotato di MS
  // Project rende per colonne. Vince quella che estrae piu' record completi.
  const perRiga = dedup(
    raggruppa(frammenti, "y", 3).map(candidataDaGruppo).filter(Boolean) as AttivitaCandidata[]
  );
  const perColonna = dedup(
    raggruppa(frammenti, "x", 8).map(candidataDaGruppo).filter(Boolean) as AttivitaCandidata[]
  );
  const ruotato = perColonna.length > perRiga.length;
  const attivita = ruotato ? perColonna : perRiga;

  return {
    attivita,
    richiedeAncoraggio: false,
    ancoraggioSuggerito: null,
    diario:
      attivita.length === 0
        ? `Il PDF ha testo (${doc.numPages} ${doc.numPages === 1 ? "pagina" : "pagine"}) ma nessuna attività con date riconoscibili: correggi qui sotto o prosegui a mano.`
        : `${attivita.length} attività estratte con le loro date${ruotato ? " (foglio ruotato: letto per colonne)" : ""}.`,
  };
}

async function estraiPdfComeImmagine(doc: any, quantiFrammenti: number): Promise<EsitoEstrazione> {
  const pagina = await doc.getPage(1);
  const viewport = pagina.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await pagina.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
  const esito = await ocr(canvas);
  return {
    ...esito,
    diario: `PDF senza layer di testo (${quantiFrammenti} frammenti): OCR sulla prima pagina. ${esito.diario}`,
  };
}

// ── OCR ───────────────────────────────────────────────────────────────────

async function ocr(sorgente: File | HTMLCanvasElement): Promise<EsitoEstrazione> {
  const { createWorker } = await import("tesseract.js");
  // Italiano e inglese insieme: i cronoprogrammi veri sono in entrambe.
  const worker = await createWorker(["ita", "eng"]);
  try {
    const { data } = await worker.recognize(sorgente as any);
    // L'OCR restituisce parole con la loro posizione: si riusa la stessa
    // lettura per coordinate del PDF, invece di ricadere sulle righe.
    const parole: Frammento[] = [];
    for (const blocco of (data as any).blocks ?? []) {
      for (const par of blocco.paragraphs ?? []) {
        for (const riga of par.lines ?? []) {
          const b = riga.bbox;
          parole.push({ x: b.x0, y: -b.y0, s: riga.text.trim() });
        }
      }
    }
    const frammenti = parole.length
      ? parole
      : data.text.split("\n").map((t, i) => ({ x: 0, y: -i * 10, s: t.trim() }));

    const attivita = dedup(
      raggruppa(frammenti, "y", 12).map(candidataDaGruppo).filter(Boolean) as AttivitaCandidata[]
    );
    return {
      attivita,
      richiedeAncoraggio: false,
      ancoraggioSuggerito: null,
      diario:
        attivita.length === 0
          ? "L'OCR ha letto il file ma non ha riconosciuto attività con date: inseriscile a mano qui sotto."
          : `${attivita.length} attività riconosciute dall'OCR — controlla le date una per una: l'OCR sbaglia i numeri più volentieri delle parole.`,
    };
  } finally {
    await worker.terminate();
  }
}

// ── xlsx: parsing diretto, niente OCR ─────────────────────────────────────

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

    // La prima data-seriale dell'intestazione e' spesso il mese di partenza
    // del gantt: buon suggerimento per l'ancoraggio, niente di piu'.
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

      const seriali = r.slice(1).filter((c): c is number => typeof c === "number" && c > 40000 && c < 60000);
      if (seriali.length >= 1) {
        attivita.push({
          nome,
          inizio: serialeExcel(seriali[0]),
          fine: seriali.length > 1 ? serialeExcel(seriali[seriali.length - 1]) : null,
          durata_mesi: null,
          ancora_proposta: null,
        });
        dateAssolute += 1;
        continue;
      }

      const durata = typeof r?.[1] === "number" && r[1] > 0 && r[1] < 120 ? r[1] : null;
      if (durata !== null) {
        attivita.push({ nome, inizio: null, fine: null, durata_mesi: durata, ancora_proposta: null });
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
        ? "Nessuna attività riconosciuta nel foglio: prosegui a mano."
        : richiedeAncoraggio
        ? `${attivita.length} attività con durate in mesi: serve la data di ancoraggio della prima fase per calcolare tutte le altre.`
        : `${attivita.length} attività estratte dal foglio con le loro date.`,
  };
}

function serialeExcel(seriale: number): string {
  const ms = Math.round((seriale - 25569) * 86400 * 1000);
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Dalle durate alle date — §2.3 passo 1. La prima attivita' parte
 * dall'ancoraggio e le successive si accodano; e' un'approssimazione
 * dichiarata (i gantt veri hanno sovrapposizioni) che il PM corregge nella
 * revisione, dove ogni riga derivata resta marcata come tale.
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

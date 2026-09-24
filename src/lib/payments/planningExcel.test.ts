import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { aggiungiFogliPlanning } from "./planningExcel";
import { costruisciPlanning } from "./planning";
import type { Settimana } from "./wbs";
import type { CashEvent, ProgettoTempi } from "@/types/payments";

/**
 * Il foglio si genera e si rilegge.
 *
 * Un export non si verifica guardandolo: si scrive, si riapre e si controlla che
 * le celle dicano quello che devono. Gli errori di un foglio Excel — una colonna
 * spostata di uno, un totale in fondo alla riga sbagliata — non si vedono finché
 * qualcuno non ci lavora sopra, e a quel punto ci ha già lavorato.
 */

const SETTIMANE: Settimana[] = [
  { inizio: null, chiave: "pregresso", etichetta: "Pregresso", sotto: "prima", pregresso: true, senzaData: false, corrente: false },
  { inizio: "2026-09-07", chiave: "2026-09-07", etichetta: "S37", sotto: "7 set", pregresso: false, senzaData: false, corrente: true },
  { inizio: "2026-09-14", chiave: "2026-09-14", etichetta: "S38", sotto: "14 set", pregresso: false, senzaData: false, corrente: false },
  { inizio: null, chiave: "senza_data", etichetta: "Senza data", sotto: "da definire", pregresso: false, senzaData: true, corrente: false },
];

let n = 0;
function ev(p: Partial<CashEvent>): CashEvent {
  n += 1;
  return {
    id: `e${n}`, verso: "entrata", corsia: "cliente", gruppo: "Ciclo attivo",
    data: null, settimana: null, data_evento: null, data_documento: null,
    importo_eur: 0, importo_valuta: null, valuta: "EUR", cambio: 1,
    certezza: null, fonte: "senza_data", fonte_evento: null, natura: "cassa",
    categoria: "Energy", commessa_id: null, commessa: "Fendi Energy 2024",
    certification_id: null, progetto: null, brand: null, brand_progetto: null,
    citta: null, etichetta: null, riferimento: null, stato: null,
    ordine_tranche: null, origine: "tranche", sottogruppo: null,
    progetto_canonico: null,
    ...p,
  } as CashEvent;
}

const TEMPI: ProgettoTempi[] = [
  {
    certification_id: "c1", commessa_id: null, progetto: "Wuhan Heartland 66",
    citta: null, data_materiali: null, data_installazione: "2026-09-08",
    installazione_prevista: null, primo_incasso: null, ultimo_incasso: null,
    tranche_totali: 2, tranche_incassate: 1,
  },
  {
    certification_id: "c2", commessa_id: null, progetto: "Beijing Sanlitun",
    citta: null, data_materiali: null, data_installazione: null,
    installazione_prevista: "2026-09-15", primo_incasso: null, ultimo_incasso: null,
    tranche_totali: 2, tranche_incassate: 1,
  },
];

const EVENTI: CashEvent[] = [
  ev({ certification_id: "c1", progetto: "Wuhan Heartland 66", importo_eur: 4440, certezza: "reale", data: "2026-09-07", settimana: "2026-09-07" }),
  ev({ certification_id: "c1", progetto: "Wuhan Heartland 66", importo_eur: 2960, certezza: "prevista", data: "2026-09-14", settimana: "2026-09-14" }),
  ev({ certification_id: "c2", progetto: "Beijing Sanlitun", importo_eur: 5580, certezza: "reale", data: "2026-08-01" }),
  ev({ verso: "uscita", corsia: "fornitore", gruppo: "Acquisto materiali", importo_eur: -1300, data: "2026-09-07", settimana: "2026-09-07" }),
  ev({ verso: "uscita", corsia: "installatore", gruppo: "Installatori", importo_eur: -800, data: "2026-09-14", settimana: "2026-09-14" }),
];

async function foglio() {
  const p = costruisciPlanning(EVENTI, TEMPI, SETTIMANE, "Totale commesse energia (inviluppo)");
  const wb = new ExcelJS.Workbook();
  aggiungiFogliPlanning(wb, p, {
    titolo: "Planning",
    inizioPeriodo: "2026-09-07",
    selezione: "tutte le commesse",
    oggi: new Date("2026-09-24T00:00:00Z"),
  });
  const buf = await wb.xlsx.writeBuffer();
  const riletto = new ExcelJS.Workbook();
  await riletto.xlsx.load(buf as ArrayBuffer);
  return { wb: riletto, planning: p };
}

/** Il testo di una cella, senza stile. */
const testo = (ws: ExcelJS.Worksheet, r: number, c: number) => {
  const v = ws.getCell(r, c).value;
  return v == null ? "" : String(v);
};

/** Trova la riga la cui prima cella contiene un testo. */
function cerca(ws: ExcelJS.Worksheet, frammento: string): number {
  for (let r = 1; r <= ws.rowCount; r++) {
    if (testo(ws, r, 1).includes(frammento)) return r;
  }
  return -1;
}

describe("il foglio del planning", () => {
  it("ha i due fogli, con i nomi che il file dell'amministrazione ha", async () => {
    const { wb } = await foglio();
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      "Planning settimanale",
      "Grafico inviluppo",
    ]);
  });

  it("apre con il titolo e la data di inizio periodo modificabile", async () => {
    const { wb } = await foglio();
    const ws = wb.getWorksheet("Planning settimanale")!;
    expect(testo(ws, 1, 1)).toContain("PLANNING SETTIMANALE");
    expect(testo(ws, 2, 1)).toContain("Inizio periodo");
    // Una data vera, non una stringa: si cambia e si ricalcola.
    expect(ws.getCell("B2").value).toBeInstanceOf(Date);
  });

  it("mette l'asse in riga 5, coi tre raccoglitori e il totale in coda", async () => {
    const { wb, planning } = await foglio();
    const ws = wb.getWorksheet("Planning settimanale")!;
    expect(testo(ws, 5, 1)).toBe("ATTIVITA'");
    expect(testo(ws, 5, 2)).toBe("Prima del periodo");
    expect(testo(ws, 5, 3)).toBe("Sett. 37");
    expect(testo(ws, 5, 4)).toBe("Sett. 38");
    expect(testo(ws, 5, 5)).toBe("Dopo il periodo");
    expect(testo(ws, 5, 6)).toBe("Senza data");
    expect(testo(ws, 5, planning.asse.length + 2)).toBe("Totale");
  });

  it("gli incassi avvenuti e previsti stanno su due righe diverse", async () => {
    const { wb } = await foglio();
    const ws = wb.getWorksheet("Planning settimanale")!;
    const rAvv = cerca(ws, "Incassi avvenuti");
    const rPre = cerca(ws, "Incassi previsti");
    expect(rAvv).toBeGreaterThan(0);
    expect(rPre).toBe(rAvv + 1);
    // 4.440 in settimana 37, 5.580 prima del periodo: colonne 3 e 2.
    expect(ws.getCell(rAvv, 3).value).toBe(4440);
    expect(ws.getCell(rAvv, 2).value).toBe(5580);
    expect(ws.getCell(rPre, 4).value).toBe(2960);
  });

  it("scrive il passivo positivo e il saldo come differenza", async () => {
    const { wb } = await foglio();
    const ws = wb.getWorksheet("Planning settimanale")!;
    const rMat = cerca(ws, "Produzione monitor");
    const rInst = cerca(ws, "Installatore");
    const rSaldo = cerca(ws, "SALDO (incassi");
    expect(ws.getCell(rMat, 3).value).toBe(1300);
    expect(ws.getCell(rInst, 4).value).toBe(800);
    // Settimana 37: 4.440 di incassi − 1.300 di materiali = 3.140.
    expect(ws.getCell(rSaldo, 3).value).toBe(3140);
    // Settimana 38: 2.960 previsti − 800 di installatore = 2.160.
    expect(ws.getCell(rSaldo, 4).value).toBe(2160);
  });

  it("il saldo cumulato è progressivo e parte da «Prima del periodo»", async () => {
    const { wb } = await foglio();
    const ws = wb.getWorksheet("Planning settimanale")!;
    const r = cerca(ws, "SALDO CUMULATO");
    expect(ws.getCell(r, 2).value).toBe(5580);
    expect(ws.getCell(r, 3).value).toBe(5580 + 3140);
    expect(ws.getCell(r, 4).value).toBe(5580 + 3140 + 2160);
  });

  it("il conteggio delle installazioni non è formattato in euro", async () => {
    const { wb } = await foglio();
    const ws = wb.getWorksheet("Planning settimanale")!;
    const r = cerca(ws, "Installazioni (n°)");
    expect(ws.getCell(r, 3).value).toBe(1);
    expect(ws.getCell(r, 3).numFmt).toBe("0");
    // E l'incasso accanto sì, o un foglio di numeri nudi non si legge.
    const rAvv = cerca(ws, "Incassi avvenuti");
    expect(ws.getCell(rAvv, 3).numFmt).toContain("€");
  });

  it("il dettaglio per progetto è ordinato per installazione e dice se è prevista", async () => {
    const { wb, planning } = await foglio();
    const ws = wb.getWorksheet("Planning settimanale")!;
    const rTesta = cerca(ws, "Progetto");
    expect(rTesta).toBeGreaterThan(0);

    const prima = testo(ws, rTesta + 1, 1);
    const seconda = testo(ws, rTesta + 2, 1);
    expect(prima).toContain("Wuhan Heartland 66");
    expect(seconda).toContain("Beijing Sanlitun");

    // Wuhan è installata l'08/09 e incassa nella stessa settimana: la cella
    // tiene il numero e il cantiere passa sul fondo, così non si perde nulla.
    expect(ws.getCell(rTesta + 1, 3).value).toBe(4440);
    const fondo = ws.getCell(rTesta + 1, 3).fill as ExcelJS.FillPattern;
    expect(fondo?.fgColor?.argb).toBe("FFF7EBE1");
    // Sanlitun ha solo una previsione al 15/09, e quella settimana è libera:
    // lì c'è la parola, e dice che è una previsione.
    expect(testo(ws, rTesta + 2, 4)).toBe("prevista");

    const colTot = planning.asse.length + 2;
    expect(testo(ws, rTesta, colTot + 1)).toBe("Sett. installazione");
    expect(testo(ws, rTesta + 1, colTot + 1)).toBe("2026-W37");
  });

  it("il foglio del grafico porta quattro colonne pulite", async () => {
    const { wb, planning } = await foglio();
    const ws = wb.getWorksheet("Grafico inviluppo")!;
    expect(["Settimana", "Incassi", "Uscite", "Saldo cumulato"].map((_, i) => testo(ws, 3, i + 1)))
      .toEqual(["Settimana", "Incassi", "Uscite", "Saldo cumulato"]);
    expect(testo(ws, 4, 1)).toBe("Prima del periodo");
    expect(ws.getCell(5, 2).value).toBe(4440);
    expect(ws.getCell(5, 3).value).toBe(1300);
    // Una riga per colonna dell'asse, niente di più e niente di meno.
    expect(testo(ws, 3 + planning.asse.length, 1)).toBe("Senza data");
  });

  it("spiega come si legge, in fondo", async () => {
    const { wb } = await foglio();
    const ws = wb.getWorksheet("Planning settimanale")!;
    expect(cerca(ws, "Come si legge")).toBeGreaterThan(0);
    expect(cerca(ws, "Il passivo è scritto positivo")).toBeGreaterThan(0);
  });
});

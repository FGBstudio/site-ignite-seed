import { describe, expect, it } from "vitest";
import type { CashEvent } from "@/types/payments";
import {
  costruisciScadenzario,
  csvScadenzario,
  nomeFile,
  type OpzioniExport,
} from "./scadenzario";
import { bufferScadenzarioExcel } from "./scadenzarioExcel";

/**
 * Lo scadenzario si verifica generandolo davvero.
 *
 * Un foglio Excel non è un oggetto in memoria: è uno ZIP di XML, e i modi di
 * scriverlo sbagliato — una formula che punta al foglio inesistente, una data
 * che arriva come numero seriale, un totale hardcoded — non si vedono in
 * compilazione. Qui il file si scrive e si rilegge.
 */

const OGGI = new Date("2026-09-22T00:00:00Z");

const CONTESTO = {
  oggi: OGGI,
  finestra: { da: "2026-08-24", a: "2027-01-10" },
  etichettaFinestra: "S35 (24 ago) → S1 (4 gen)",
  selezione: "tutte le commesse",
};

const base: CashEvent = {
  id: "x", verso: "entrata", corsia: "cliente", gruppo: "Ciclo attivo",
  categoria: "Energy", data: null, settimana: null, data_evento: null,
  data_documento: null, importo_eur: 0, importo_valuta: 0, valuta: "EUR", cambio: 1,
  certezza: null, fonte: null,
  fonte_evento: null, natura: "cassa", commessa_id: "k-fendi", commessa: "Fendi Energy 2024",
  certification_id: null, progetto: null, brand: "FENDI", citta: null,
  etichetta: null, riferimento: null, stato: null, ordine_tranche: null,
  origine: "tranche",
};

const ev = (p: Partial<CashEvent>): CashEvent => ({ ...base, ...p });

const EVENTI: CashEvent[] = [
  // Incasso fatturato, termini 30 giorni.
  ev({
    id: "in-1", data: "2026-10-21", settimana: "2026-10-19",
    data_documento: "2026-09-21", importo_eur: 1000, certezza: "contrattuale",
    fonte: "scadenza_fattura", fonte_evento: "milestone_chiusa",
    etichetta: "Additional call out", progetto: "Hangzhou, MixC",
  }),
  // Incasso ancora da fatturare.
  ev({
    id: "in-2", data: "2026-10-10", settimana: "2026-10-05",
    importo_eur: 3000, certezza: "prevista", fonte: "da_evento",
    fonte_evento: "installazione", etichetta: "50% al primo dato",
    commessa_id: "k-bou", commessa: "Boucheron Energy 2025", brand: "BOUCHERON",
  }),
  // Incasso già avvenuto: sparisce con «solo da fare».
  ev({
    id: "in-3", data: "2026-08-16", settimana: "2026-08-10",
    importo_eur: 9600, certezza: "reale", fonte: "incasso",
    etichetta: "Incasso commessa Lucan Lodge", commessa_id: "k-lucan", commessa: "Lucan Lodge", brand: "BAY",
  }),
  // Pagamento fornitore con documento: emissione ad aprile, cassa a settembre.
  ev({
    id: "out-1", verso: "uscita", corsia: "fornitore", gruppo: "Acquisto materiali",
    data: "2026-09-30", settimana: "2026-09-28", data_documento: "2026-04-17",
    importo_eur: -1872.11, certezza: "contrattuale", fonte: "contratto",
    fonte_evento: "ordine", natura: "cassa", brand: "FoSensor", commessa_id: null,
    commessa: "Non attribuite · FoSensor ordine 17/04/2026",
    etichetta: "FoSensor · Quota 260417FS01 · 30% deposito",
    riferimento: "260417FS01", stato: "prevista", origine: "uscita",
  }),
  // Pagamento installatore.
  ev({
    id: "out-2", verso: "uscita", corsia: "installatore", gruppo: "Installatori",
    data: "2026-10-20", settimana: "2026-10-19", importo_eur: -6865.99,
    certezza: "contrattuale", fonte: "contratto", brand: "Kai Cheng",
    etichetta: "Kai Cheng · Saldo a conclusione installazioni 40%",
    riferimento: "Installazioni Fendi", stato: "prevista", origine: "uscita",
  }),
  // Uscita vincolata a un evento che non è ancora successo.
  ev({
    id: "out-3", verso: "uscita", corsia: "fornitore", gruppo: "Acquisto materiali",
    data: "2026-11-15", settimana: "2026-11-09", importo_eur: -145.13,
    certezza: "stimata", fonte: "stima", fonte_evento: "ricezione",
    brand: "FoSensor", commessa_id: "k-ripa", commessa: "Ripa89 WELL",
    etichetta: "FoSensor · Quota 260417FS01 · 30% a 45 gg dalla ricezione",
    riferimento: "260417FS01", stato: "prevista", origine: "uscita",
  }),
  // Uscita già pagata.
  ev({
    id: "out-4", verso: "uscita", corsia: "fornitore", gruppo: "Acquisto materiali",
    data: "2026-09-08", settimana: "2026-09-07", data_documento: "2026-09-01",
    importo_eur: -645, certezza: "reale", fonte: "reale", fonte_evento: "ordine",
    brand: "FoSensor", etichetta: "FoSensor · Fattura 260901FS01 · R&D CO2-CO",
    riferimento: "260901FS01", stato: "pagata", origine: "uscita",
  }),
  // Senza data: va nel foglio dedicato, mai in agenda.
  ev({
    id: "nd-1", importo_eur: 2960, certezza: null, fonte: "senza_data",
    fonte_evento: "primo_dato", etichetta: "40% al primo dato",
    progetto: "Wuhan, Heartland 66",
  }),
  // Le quote non sono cassa: non devono comparire da nessuna parte.
  ev({
    id: "q-1", verso: "uscita", natura: "quota", data: "2026-10-01",
    settimana: "2026-09-28", importo_eur: -44242.58, brand: "Centrica",
    etichetta: "Centrica · Acquisto materiali", origine: "uscita",
  }),
];

const opzioni = (p: Partial<OpzioniExport> = {}): OpzioniExport => ({
  perimetro: "tutto", contenuto: "tutto", formato: "xlsx", ...p,
});

describe("costruisciScadenzario", () => {
  it("tiene fuori le quote e separa le righe senza data", () => {
    const s = costruisciScadenzario(EVENTI, opzioni(), CONTESTO);
    expect(s.righe.map((r) => r.id)).not.toContain("q-1");
    expect(s.righe.map((r) => r.id)).not.toContain("nd-1");
    expect(s.senzaData.map((r) => r.id)).toEqual(["nd-1"]);
    expect(s.senzaData[0].cosaManca).toBe("Manca: primo dato di telemetria");
  });

  it("ordina l'agenda per data, non per settimana", () => {
    const s = costruisciScadenzario(EVENTI, opzioni(), CONTESTO);
    const date = s.righe.map((r) => r.data);
    expect(date).toEqual([...date].sort());
  });

  it("con «solo da fare» toglie l'incassato e il pagato", () => {
    const s = costruisciScadenzario(EVENTI, opzioni({ contenuto: "da_fare" }), CONTESTO);
    const ids = s.righe.map((r) => r.id);
    expect(ids).not.toContain("in-3");
    expect(ids).not.toContain("out-4");
  });

  it("scrive la catena della causale con documento e termini", () => {
    const s = costruisciScadenzario(EVENTI, opzioni(), CONTESTO);
    const incasso = s.righe.find((r) => r.id === "in-1")!;
    expect(incasso.perche).toBe(
      "Additional call out · fattura emessa il 21/09/2026 · termini 30 gg",
    );
    const uscita = s.righe.find((r) => r.id === "out-1")!;
    expect(uscita.perche).toContain("Quota 260417FS01 · 30% deposito");
    expect(uscita.perche).toContain("termini 166 gg dall'emissione");
    // La commessa non attribuita scende nella causale e lascia vuota la colonna.
    expect(uscita.perche).toContain("FoSensor ordine 17/04/2026");
    expect(uscita.commessa).toBe("");
  });

  it("il valore da pagare è tutto ciò che non è già uscito", () => {
    const s = costruisciScadenzario(EVENTI, opzioni(), CONTESTO);
    const per = (id: string) => s.righe.find((r) => r.id === id)!;
    expect(per("out-1").daPagare).toBeCloseTo(1872.11, 2);
    expect(per("out-2").daPagare).toBeCloseTo(6865.99, 2);
    // Una settimana in deficit non cancella il debito: il pagamento resta nel
    // totale, ed è «Da eseguire?» a dire che si può spostare.
    expect(per("out-1").daEseguire).toContain("Valutare — posticipabile a");
    // Una consegna che deve ancora arrivare sposta il quando, non il quanto.
    expect(per("out-3").daEseguire).toBe("Sì — vincolato a ricezione a Shanghai");
    expect(per("out-3").daPagare).toBeCloseTo(145.13, 2);
    // Quello che è già uscito no: sarebbe contato due volte.
    expect(per("out-4").daEseguire).toBe("No — già pagato");
    expect(per("out-4").daPagare).toBe(0);
    // Gli incassi non hanno un «da pagare».
    expect(per("in-1").daPagare).toBe(0);
  });

  it("non scrive nomi interni nella causale", () => {
    const s = costruisciScadenzario(
      [ev({ id: "s", data: "2026-10-01", settimana: "2026-09-28", importo_eur: 5,
            fonte_evento: "senza_data", etichetta: "Saldo" })],
      opzioni(),
      CONTESTO,
    );
    expect(s.righe[0].perche).toBe("Saldo");
  });

  it("il perimetro «prossime 4 settimane» taglia davanti e dietro", () => {
    const s = costruisciScadenzario(EVENTI, opzioni({ perimetro: "quattro_settimane" }), CONTESTO);
    const ids = s.righe.map((r) => r.id);
    expect(ids).toContain("out-1"); // 30/09
    expect(ids).toContain("in-2"); // 10/10
    expect(ids).not.toContain("out-3"); // 15/11, oltre le quattro settimane
    expect(ids).not.toContain("in-3"); // agosto, dietro
  });

  it("il nome del file porta data e perimetro", () => {
    const s = costruisciScadenzario(EVENTI, opzioni(), CONTESTO);
    expect(nomeFile(s, opzioni(), OGGI)).toBe("scadenzario_2026-09-22_tutto.xlsx");
    expect(nomeFile(s, opzioni({ formato: "csv", perimetro: "selezione" }), OGGI)).toBe(
      "scadenzario_2026-09-22_tutte.csv",
    );
  });
});

describe("csvScadenzario", () => {
  it("usa il punto e virgola, la virgola decimale e include le righe senza data", () => {
    const righe = csvScadenzario(costruisciScadenzario(EVENTI, opzioni(), CONTESTO)).split("\r\n");
    expect(righe[0].startsWith("Data;Sett.;Tipo;Importo")).toBe(true);
    expect(righe.some((r) => r.includes(";-6865,99;"))).toBe(true);
    // L'ultima è la riga senza data: data vuota e il dato mancante in causale.
    expect(righe[righe.length - 1].startsWith(";—;Incasso;2960,00;")).toBe(true);
    expect(righe[righe.length - 1]).toContain("Manca: primo dato di telemetria");
  });

  it("protegge i campi che contengono il separatore", () => {
    const s = costruisciScadenzario(
      [ev({ id: "v", data: "2026-10-01", settimana: "2026-09-28", importo_eur: 1, etichetta: "a;b" })],
      opzioni(),
      CONTESTO,
    );
    expect(csvScadenzario(s)).toMatch(/"a;b[^"]*"/);
  });
});

describe("bufferScadenzarioExcel", () => {
  it("scrive i quattro fogli, con i totali in formula e le date come date", async () => {
    const s = costruisciScadenzario(EVENTI, opzioni(), CONTESTO);
    const buf = await bufferScadenzarioExcel(s);
    expect(buf.byteLength).toBeGreaterThan(5000);

    const XLSX = await import("xlsx");
    const wb = XLSX.read(buf, { type: "array", cellFormula: true, cellDates: true });
    expect(wb.SheetNames).toEqual(["Scadenzario", "Per commessa", "Da incassare", "Da pagare", "Senza data"]);

    const agenda = wb.Sheets["Scadenzario"];
    // Il riepilogo è calcolato, non scritto: se qualcuno cancella righe il
    // totale deve seguirle.
    expect(agenda["C5"]?.f).toContain("SUM('Da incassare'!C");
    expect(agenda["C6"]?.f).toContain("SUM('Da pagare'!N");
    expect(agenda["C7"]?.f).toContain("-");

    // Intestazioni dell'agenda alla riga 11, dati dalla 12.
    const testa = ["Data", "Sett.", "Tipo", "Importo", "Controparte", "Commessa"];
    testa.forEach((t, i) => {
      expect(agenda[XLSX.utils.encode_cell({ r: 10, c: i })]?.v).toBe(t);
    });
    expect(agenda["G11"]?.v).toBe("Progetto");
    expect(agenda["J11"]?.v).toBe("Da pagare");

    // La prima riga di dati porta una data vera, non una stringa.
    expect(agenda["A12"]?.t).toBe("d");

    const pagare = wb.Sheets["Da pagare"];
    expect(pagare["A6"]?.v).toBe("Data scadenza");
    expect(pagare["N6"]?.v).toBe("Da pagare (effettivo)");
    expect(pagare["C6"]?.v).toBe("Riferimento");
    expect(pagare["F6"]?.v).toBe("Progetto");
    expect(pagare["G6"]?.v).toBe("Importo valuta");
    expect(pagare["J4"]?.f).toContain("SUM(J7:");
    expect(pagare["N4"]?.f).toContain("SUM(N7:");

    const senza = wb.Sheets["Senza data"];
    expect(senza["G6"]?.v).toBe("Cosa manca per datarlo");
    expect(senza["G7"]?.v).toBe("Manca: primo dato di telemetria");
  });

  it("regge un perimetro che non seleziona niente senza rompere le formule", async () => {
    const s = costruisciScadenzario([], opzioni(), CONTESTO);
    const buf = await bufferScadenzarioExcel(s);
    const XLSX = await import("xlsx");
    const wb = XLSX.read(buf, { type: "array", cellFormula: true });
    expect(wb.SheetNames).toHaveLength(5);
    expect(wb.Sheets["Da incassare"]["C4"]?.f).toBe("SUM(C7:C7)");
  });
});

describe("riepilogo per commessa", () => {
  it("somma incassi e uscite della stessa commessa e mette il peggiore in cima", () => {
    const s = costruisciScadenzario(EVENTI, opzioni(), CONTESTO);
    const per = (nome: string) => s.perCommessa.find((c) => c.nome === nome)!;

    // Fendi: l'incasso dell'Additional call out contro il saldo installatore.
    expect(per("Fendi Energy 2024").daIncassare).toBeCloseTo(1000, 2);
    expect(per("Fendi Energy 2024").daPagare).toBeCloseTo(6865.99, 2);
    expect(per("Fendi Energy 2024").saldo).toBeCloseTo(-5865.99, 2);
    expect(per("Fendi Energy 2024").primaUscita).toBe("2026-10-20");

    // Boucheron incassa e non paga nulla: si copre da sola.
    expect(per("Boucheron Energy 2025").saldo).toBeCloseTo(3000, 2);

    // Chi sta peggio sta in cima, e non è un ordine alfabetico.
    expect(s.perCommessa[0].saldo).toBeLessThanOrEqual(s.perCommessa[1].saldo);
    expect(s.perCommessa[0].nome).toBe("Fendi Energy 2024");
  });

  it("i totali del riepilogo coincidono con quelli dell'agenda", () => {
    const s = costruisciScadenzario(EVENTI, opzioni(), CONTESTO);
    const n = (x: number) => Math.round(x * 100) / 100;
    expect(n(s.perCommessa.reduce((t, c) => t + c.daIncassare, 0))).toBe(s.totali.daIncassare);
    expect(n(s.perCommessa.reduce((t, c) => t + c.daPagare, 0))).toBe(s.totali.daPagare);
    expect(n(s.perCommessa.reduce((t, c) => t + c.saldo, 0))).toBe(s.totali.saldo);
  });

  it("chi non ha commessa si raggruppa sotto il progetto, non in un mucchio", () => {
    const s = costruisciScadenzario(EVENTI, opzioni(), CONTESTO);
    expect(s.perCommessa.map((c) => c.nome)).toContain("FoSensor ordine 17/04/2026");
  });

  it("il foglio «Per commessa» ha il saldo in formula", async () => {
    const s = costruisciScadenzario(EVENTI, opzioni(), CONTESTO);
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await bufferScadenzarioExcel(s), { type: "array", cellFormula: true });
    const ws = wb.Sheets["Per commessa"];
    expect(ws["A6"]?.v).toBe("Commessa o progetto");
    expect(ws["E6"]?.v).toBe("Saldo atteso");
    expect(ws["E7"]?.f).toBe("C7-D7");
    expect(ws["C4"]?.f).toContain("SUM(C7:");
    expect(ws["E4"]?.f).toContain("SUM(E7:");
  });
});

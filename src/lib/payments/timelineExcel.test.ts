import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { aggiungiFoglioTimeline } from "./timelineExcel";
import type { Riga, Settimana } from "./wbs";

/**
 * Il foglio si genera e si rilegge.
 *
 * Un export non si verifica guardandolo: si scrive, si riapre e si controlla
 * che le celle dicano quello che devono. Gli errori di un foglio Excel — una
 * colonna spostata di uno, un livello di raggruppamento sbagliato — non si
 * vedono finché qualcuno non ci lavora sopra.
 */

const SETTIMANE: Settimana[] = [
  { inizio: null, chiave: "pregresso", etichetta: "Pregresso", sotto: "prima della finestra", pregresso: true, senzaData: false, corrente: false },
  { inizio: "2026-09-21", chiave: "2026-09-21", etichetta: "S39", sotto: "21 set", pregresso: false, senzaData: false, corrente: true },
  { inizio: "2026-09-28", chiave: "2026-09-28", etichetta: "S40", sotto: "28 set", pregresso: false, senzaData: false, corrente: false },
  { inizio: null, chiave: "senza_data", etichetta: "Senza data", sotto: "da definire", pregresso: false, senzaData: true, corrente: false },
];

const N = SETTIMANE.length;
const zeri = () => Array.from({ length: N }, () => 0);

function riga(p: Partial<Riga> & { chiave: string; nome: string; livello: number; tipo: Riga["tipo"] }): Riga {
  return {
    sotto: undefined,
    corsia: undefined,
    netto: zeri(),
    entrate: zeri(),
    uscite: zeri(),
    totale: 0,
    quote: 0,
    milestones: [],
    elementi: [],
    barre: [],
    altezza: 28,
    ...p,
  };
}

const ALBERO: Riga[] = [
  riga({
    chiave: "master",
    nome: "Cassa di tutte le commesse",
    livello: 0,
    tipo: "master",
    netto: [1000, -400, 250, 0],
    entrate: [1000, 0, 250, 0],
    uscite: [0, -400, 0, 0],
    totale: 850,
    cumulato: [1000, 600, 850, 850],
    figli: [
      riga({
        chiave: "k:Fendi",
        nome: "Fendi Energy 2024",
        livello: 2,
        tipo: "commessa",
        netto: [1000, -400, 0, 0],
        entrate: [1000, 0, 0, 0],
        uscite: [0, -400, 0, 0],
        totale: 600,
        quote: 44242.58,
        figli: [
          riga({
            chiave: "k:Fendi:attivo",
            nome: "Ciclo attivo",
            livello: 3,
            tipo: "voce",
            corsia: "cliente",
            netto: [1000, 0, 0, 0],
            entrate: [1000, 0, 0, 0],
            totale: 1000,
          }),
          riga({
            chiave: "k:Fendi:forn",
            nome: "Acquisto materiali",
            livello: 3,
            tipo: "voce",
            corsia: "fornitore",
            netto: [0, -400, 0, 0],
            uscite: [0, -400, 0, 0],
            totale: -400,
          }),
        ],
      }),
    ],
  }),
];

async function generaEriapri() {
  const wb = new ExcelJS.Workbook();
  aggiungiFoglioTimeline(wb, ALBERO, SETTIMANE, {
    titolo: "Cassa di tutte le commesse",
    etichettaFinestra: "S39 (21 set) → S40 (28 set)",
    selezione: "tutte le commesse",
    oggi: new Date("2026-09-23T00:00:00Z"),
  });
  const buf = await wb.xlsx.writeBuffer();

  const riletto = new ExcelJS.Workbook();
  await riletto.xlsx.load(buf as ArrayBuffer);
  return riletto.getWorksheet("Timeline")!;
}

describe("foglio Timeline", () => {
  it("scrive le settimane a partire dalla sesta colonna", async () => {
    const ws = await generaEriapri();
    // Cinque colonne fisse: Voce, Entrate, Uscite, Saldo, Quote.
    expect(ws.getCell(6, 1).value).toBe("Voce");
    expect(ws.getCell(6, 5).value).toBe("Quote");
    expect(ws.getCell(5, 6).value).toBe("Pregresso");
    expect(ws.getCell(5, 7).value).toBe("S39");
    expect(ws.getCell(5, 9).value).toBe("Senza data");
  });

  it("mette il saldo progressivo sopra l'albero", async () => {
    const ws = await generaEriapri();
    expect(ws.getCell(7, 1).value).toBe("Saldo progressivo");
    expect(ws.getCell(7, 6).value).toBe(1000);
    expect(ws.getCell(7, 8).value).toBe(850);
  });

  it("porta il netto di ogni riga nella colonna della sua settimana", async () => {
    const ws = await generaEriapri();
    // Riga 9 è il master: saldo progressivo su 7, riga vuota su 8.
    expect(ws.getCell(9, 1).value).toBe("Cassa di tutte le commesse");
    expect(ws.getCell(9, 6).value).toBe(1000);
    expect(ws.getCell(9, 7).value).toBe(-400);
    expect(ws.getCell(9, 8).value).toBe(250);
  });

  it("rientra i figli e li raggruppa al loro livello", async () => {
    const ws = await generaEriapri();
    const commessa = ws.getRow(10);
    expect(String(commessa.getCell(1).value)).toMatch(/^ {4}Fendi Energy 2024$/);
    expect(commessa.outlineLevel).toBe(2);

    const attivo = ws.getRow(11);
    expect(String(attivo.getCell(1).value)).toMatch(/^ {8}Ciclo attivo$/);
    expect(attivo.outlineLevel).toBe(3);
  });

  it("tiene le quote in una colonna loro, fuori dalle somme", async () => {
    const ws = await generaEriapri();
    const commessa = ws.getRow(10);
    expect(commessa.getCell(5).value).toBe(44242.58);
    // Il saldo resta quello della cassa: le quote non ci entrano.
    expect(commessa.getCell(4).value).toBe(600);
  });

  it("lascia vuote le celle a zero invece di riempirle di zeri", async () => {
    const ws = await generaEriapri();
    // Il ciclo attivo non ha movimenti nella seconda settimana.
    expect(ws.getRow(11).getCell(7).value).toBeNull();
  });

  it("non raggruppa il master, o si chiuderebbe tutto il foglio", async () => {
    const ws = await generaEriapri();
    expect(ws.getRow(9).outlineLevel).toBe(0);
  });
});

import type { Riga, Settimana } from "./wbs";
import {
  EURO,
  FASCIA,
  GRIGIO_TENUE,
  INK,
  MUTO,
  ROSSO,
  RUGGINE,
  TEAL_TENUE,
  VERDE,
} from "./excelStile";

/**
 * La timeline della WBS su un foglio Excel.
 *
 * Non è un secondo scadenzario: quello elenca le scadenze una per riga, questo
 * è la griglia — commesse sulle righe, settimane sulle colonne — che è il modo
 * in cui si guarda quando la domanda non è «cosa scade» ma «com'è messa la
 * cassa nei prossimi mesi».
 *
 * Tre scelte che vale la pena spiegare.
 *
 *  1. **Si esporta l'albero intero, non quello che è aperto a schermo.** Un
 *     file che dipende da quali nodi erano espansi quando si è premuto Esporta
 *     è un file che nessuno riesce a rifare uguale. La gerarchia non si perde:
 *     diventa il raggruppamento nativo di Excel, con i più/meno nel margine, e
 *     si apre già chiusa ai livelli alti.
 *
 *  2. **La cella è il netto della settimana, non un simbolo.** Le frecce della
 *     griglia dicono direzione e certezza; su un foglio la direzione la dice il
 *     segno e il colore, e la certezza non sta in una cella — sta nelle due
 *     colonne di sintesi, dove si legge quanto del saldo è ancora una
 *     previsione. Una cella resta un numero: si somma, si filtra, si grafica.
 *
 *  3. **Il saldo progressivo è una riga a sé, in alto.** È la lettura per cui
 *     la griglia esiste — dove la cassa va sotto zero — e cercarla in fondo a
 *     settanta righe vorrebbe dire non trovarla.
 */

type Ws = import("exceljs").Worksheet;

export interface ContestoTimeline {
  titolo: string;
  etichettaFinestra: string;
  selezione: string;
  oggi: Date;
}

/** Larghezza delle due colonne fisse e di ciascuna settimana. */
const W_ETICHETTA = 46;
const W_NUMERO = 14;
const W_SETTIMANA = 13;

/** Quante colonne prima che comincino le settimane. */
const FISSE = 5;

const COLONNE_FISSE: ReadonlyArray<readonly [string, number]> = [
  ["Voce", W_ETICHETTA],
  ["Entrate", W_NUMERO],
  ["Uscite", W_NUMERO],
  ["Saldo", W_NUMERO],
  ["Quote", W_NUMERO],
];

/**
 * Il colore di una riga secondo cosa rappresenta.
 *
 * Il ciclo attivo è verde, i fornitori rossi, gli installatori ruggine: è la
 * stessa codifica della griglia, e qui serve ancora di più perché su un foglio
 * non ci sono le frecce a dire da che parte va il denaro.
 */
function coloreDi(r: Riga): string {
  if (r.corsia === "cliente") return VERDE;
  if (r.corsia === "installatore") return RUGGINE;
  if (r.corsia === "fornitore") return ROSSO;
  return INK;
}

/** Il rientro si fa con gli spazi, non con l'indentazione di Excel: sopravvive
 *  al copia-incolla in un'altra tabella, che è quello che poi succede. */
const rientro = (r: Riga) => "    ".repeat(Math.max(0, r.livello - 1)) + r.nome;

export function aggiungiFoglioTimeline(
  wb: import("exceljs").Workbook,
  albero: Riga[],
  settimane: Settimana[],
  ctx: ContestoTimeline,
): void {
  const ws = wb.addWorksheet("Timeline", {
    views: [{ showGridLines: false, state: "frozen", xSplit: FISSE, ySplit: 6 }],
    // I totali stanno sopra i dettagli, come nella griglia: senza questo Excel
    // cerca il riepilogo sotto il gruppo e mette i più/meno sulla riga
    // sbagliata.
    properties: { outlineLevelRow: 0, outlineLevelCol: 0 },
  });
  ws.properties.outlineProperties = { summaryBelow: false, summaryRight: false };

  ws.columns = [
    ...COLONNE_FISSE.map(([, w]) => ({ width: w })),
    ...settimane.map(() => ({ width: W_SETTIMANA })),
  ];

  /* ── Intestazione ──────────────────────────────────────────────────────── */

  scrivi(ws, "A1", ctx.titolo, { bold: true, size: 15 });
  scrivi(
    ws,
    "A2",
    `Finestra ${ctx.etichettaFinestra} · ${ctx.selezione} · estratto il ${ctx.oggi.toLocaleDateString("it-IT")}`,
    { size: 9, color: MUTO },
  );
  scrivi(
    ws,
    "A3",
    "Importi in euro. Il valore di una cella è il movimento netto di quella settimana: positivo incassi, negativo uscite.",
    { size: 9, color: MUTO },
  );

  // Riga 5-6: l'intestazione a due piani, come la griglia.
  const rEtichetta = 5;
  const rSotto = 6;

  COLONNE_FISSE.forEach(([nome], i) => {
    const c = ws.getCell(rSotto, i + 1);
    c.value = nome;
    c.font = { name: "Arial", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FASCIA } };
    c.alignment = { vertical: "middle", horizontal: i === 0 ? "left" : "right" };
  });

  settimane.forEach((s, i) => {
    const col = FISSE + i + 1;

    const alto = ws.getCell(rEtichetta, col);
    alto.value = s.etichetta;
    alto.font = {
      name: "Arial",
      size: 9,
      bold: true,
      color: { argb: s.corrente ? VERDE : INK },
    };
    alto.alignment = { horizontal: "center" };

    const basso = ws.getCell(rSotto, col);
    basso.value = s.sotto;
    basso.font = { name: "Arial", size: 8, bold: true, color: { argb: "FFFFFFFF" } };
    basso.fill = {
      type: "pattern",
      pattern: "solid",
      // Pregresso e Senza data non sono settimane: sono i due raccoglitori
      // agli estremi, e vanno distinti anche qui o si leggono come tempo.
      fgColor: { argb: s.pregresso || s.senzaData ? MUTO : FASCIA },
    };
    basso.alignment = { horizontal: "center" };
  });

  /* ── Saldo progressivo ─────────────────────────────────────────────────── */

  const master = albero[0];
  let riga = rSotto + 1;

  if (master?.cumulato) {
    const r = ws.getRow(riga);
    scrivi(ws, `A${riga}`, "Saldo progressivo", { bold: true, size: 10 });
    master.cumulato.forEach((v, i) => {
      const c = r.getCell(FISSE + i + 1);
      c.value = v;
      c.numFmt = EURO;
      c.font = {
        name: "Arial",
        size: 10,
        bold: true,
        color: { argb: v < 0 ? ROSSO : VERDE },
      };
      // Sotto zero la cella si accende: è l'unica informazione della riga per
      // cui vale la pena aprire il file, e non deve richiedere di leggere i
      // numeri uno per uno.
      if (v < 0) {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFBE9E7" } };
      }
    });
    r.height = 18;
    riga += 2;
  }

  /* ── L'albero ──────────────────────────────────────────────────────────── */

  const scendi = (r: Riga) => {
    const row = ws.getRow(riga);
    const colore = coloreDi(r);
    const forte = r.tipo === "master" || r.tipo === "categoria" || r.tipo === "commessa";

    const etichetta = row.getCell(1);
    etichetta.value = rientro(r);
    etichetta.font = { name: "Arial", size: 10, bold: forte, color: { argb: colore } };
    etichetta.alignment = { vertical: "middle" };

    const somme: Array<[number, number, string]> = [
      [2, r.entrate.reduce((s, v) => s + v, 0), VERDE],
      [3, r.uscite.reduce((s, v) => s + v, 0), ROSSO],
      [4, r.totale, r.totale < 0 ? ROSSO : VERDE],
      // Le quote non entrano in nessuna somma, ma senza una colonna che le
      // dica una riga con zero di cassa e 44.000 di ripartizione sembra un
      // errore invece che due cose diverse.
      [5, r.quote, MUTO],
    ];
    for (const [col, valore, tinta] of somme) {
      const c = row.getCell(col);
      c.value = valore === 0 ? null : valore;
      c.numFmt = EURO;
      c.font = { name: "Arial", size: 10, bold: forte, color: { argb: tinta } };
    }

    r.netto.forEach((v, i) => {
      const c = row.getCell(FISSE + i + 1);
      if (v === 0) return;
      c.value = v;
      c.numFmt = EURO;
      c.font = {
        name: "Arial",
        size: 10,
        bold: forte,
        color: { argb: v < 0 ? colore === VERDE ? ROSSO : colore : VERDE },
      };
    });

    if (forte) {
      for (let col = 1; col <= FISSE + settimane.length; col++) {
        row.getCell(col).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: r.tipo === "commessa" ? TEAL_TENUE : GRIGIO_TENUE },
        };
      }
    }

    // Il livello zero non esiste in Excel: il master resta fuori dai gruppi,
    // altrimenti si potrebbe chiudere l'intero foglio in un colpo solo.
    if (r.livello > 0) row.outlineLevel = Math.min(r.livello, 7);
    row.height = 16;

    riga += 1;
    r.figli?.forEach(scendi);
  };

  albero.forEach(scendi);

  /* ── Legenda ───────────────────────────────────────────────────────────── */

  riga += 1;
  scrivi(ws, `A${riga}`, "Come si legge", { bold: true, size: 10 });
  riga += 1;
  const note = [
    "Ogni cella è il movimento netto di quella settimana, in euro: positivo se entra, negativo se esce.",
    "Verde il ciclo attivo, rosso i fornitori, ruggine gli installatori — la stessa codifica della griglia a schermo.",
    "«Quote» sono ripartizioni per progetto: si vedono, non entrano in nessuna somma, e non vanno sommate a «Uscite».",
    "«Pregresso» raccoglie tutto ciò che sta prima della finestra; «Senza data» ciò che una data non ce l'ha ancora.",
    "I più e i meno nel margine sinistro aprono e chiudono la gerarchia, come nella vista.",
  ];
  for (const n of note) {
    scrivi(ws, `A${riga}`, "· " + n, { size: 9, color: MUTO });
    riga += 1;
  }
}

function scrivi(
  ws: Ws,
  rif: string,
  valore: string,
  stile: { bold?: boolean; size?: number; color?: string },
) {
  const c = ws.getCell(rif);
  c.value = valore;
  c.font = {
    name: "Arial",
    size: stile.size ?? 10,
    bold: stile.bold ?? false,
    color: { argb: stile.color ?? INK },
  };
}

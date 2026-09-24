import type { Blocco, ColonnaPlanning, Misura, Planning } from "./planning";
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
  VERDE_TENUE,
} from "./excelStile";

/**
 * Il planning settimanale su Excel.
 *
 * Stessa cassa della timeline, letta al contrario: là le righe sono le commesse
 * e le celle il netto, qui le righe sono le *misure* — quanto è entrato, quanto
 * si aspetta, quanti cantieri, quanto costa — e ogni commessa è un blocco.
 * Serve all'amministrazione, che non chiede «com'è messa la commessa X» ma
 * «cosa succede in settimana 41».
 *
 * Tre scelte di forma che vengono dal contenuto.
 *
 *  1. **Nessun raggruppamento Excel.** La timeline usa i più e i meno nel
 *     margine perché ha un albero da comprimere; qui la gerarchia è due livelli
 *     — inviluppo e commesse — e ogni blocco ha nove righe. Un foglio che si
 *     apre già tutto leggibile non ha bisogno di essere aperto.
 *
 *  2. **Avvenuto e previsto in due verdi diversi.** Sono righe adiacenti con lo
 *     stesso segno: con lo stesso colore si sommano a occhio, e la somma di un
 *     incasso e di una speranza è il numero che manda fuori strada un
 *     previsionale.
 *
 *  3. **Il saldo cumulato solo sull'inviluppo.** Su una singola commessa
 *     sarebbe una curva di cassa che non esiste: la banca è una, e il saldo
 *     progressivo di mezzo mondo non si somma commessa per commessa.
 */

type Ws = import("exceljs").Worksheet;

export interface ContestoPlanning {
  titolo: string;
  /** Il lunedì da cui parte la finestra: la cella che si cambia per spostarla. */
  inizioPeriodo: string | null;
  selezione: string;
  oggi: Date;
}

const W_ETICHETTA = 44;
const W_COLONNA = 13;

/**
 * Il fondo di una cella che porta un incasso e, sotto, un'installazione.
 *
 * Serve perché una cella ha un valore solo: quando la settimana dell'incasso è
 * anche quella del cantiere — e succede spesso, la fattura si emette il giorno
 * dell'installazione — il numero resta e il cantiere si vede dal colore.
 */
const RUGGINE_TENUE = "FFF7EBE1";

/** Il colore di una misura, e se va in grassetto. */
function stileDi(m: Misura): { colore: string; forte: boolean } {
  switch (m.genere) {
    case "incassi_avvenuti": return { colore: VERDE, forte: false };
    case "incassi_previsti": return { colore: VERDE_TENUE, forte: false };
    case "totale_incassi": return { colore: VERDE, forte: true };
    case "installazioni": return { colore: RUGGINE, forte: false };
    case "materiali":
    case "servizi": return { colore: ROSSO, forte: false };
    case "installatore": return { colore: RUGGINE, forte: false };
    case "totale_passivo": return { colore: ROSSO, forte: true };
    case "saldo": return { colore: INK, forte: true };
    case "cumulato": return { colore: INK, forte: true };
  }
}

export function aggiungiFogliPlanning(
  wb: import("exceljs").Workbook,
  p: Planning,
  ctx: ContestoPlanning,
): void {
  const n = p.asse.length;
  const ultima = 1 + n;

  const ws = wb.addWorksheet("Planning settimanale", {
    views: [{ showGridLines: false, state: "frozen", xSplit: 1, ySplit: 6 }],
  });
  ws.columns = [{ width: W_ETICHETTA }, ...p.asse.map(() => ({ width: W_COLONNA }))];

  /* ── Intestazione ──────────────────────────────────────────────────────── */

  scrivi(ws, "A1", "PLANNING SETTIMANALE INCASSI / INSTALLAZIONI", { bold: true, size: 15 });

  scrivi(ws, "A2", "Inizio periodo (lunedì)", { size: 9, bold: true, color: MUTO });
  const cellaInizio = ws.getCell("B2");
  cellaInizio.value = ctx.inizioPeriodo ? new Date(ctx.inizioPeriodo) : null;
  cellaInizio.numFmt = "dd/mm/yyyy";
  cellaInizio.font = { name: "Arial", size: 9, bold: true, color: { argb: INK } };
  scrivi(ws, "C2", `${ctx.selezione} · estratto il ${ctx.oggi.toLocaleDateString("it-IT")}`, {
    size: 9, color: MUTO,
  });

  // La legenda sta in alto perché il foglio si legge a colori: i numeri sono
  // tutti positivi, il passivo si riconosce solo dal rosso e dalla sua riga.
  scrivi(ws, "A3", "Legenda:", { size: 9, bold: true, color: MUTO });
  const legenda: Array<[string, string]> = [
    ["Incasso avvenuto", VERDE],
    ["Incasso previsto", VERDE_TENUE],
    ["Installazione", RUGGINE],
    ["Costo", ROSSO],
  ];
  legenda.forEach(([testo, colore], i) => {
    const c = ws.getCell(3, 2 + i * 2);
    c.value = testo;
    c.font = { name: "Arial", size: 9, bold: true, color: { argb: colore } };
  });

  /* ── L'asse ────────────────────────────────────────────────────────────── */

  const rEtichetta = 5;
  const rData = 6;

  const testa = ws.getCell(rEtichetta, 1);
  testa.value = "ATTIVITA'";
  testa.font = { name: "Arial", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
  testa.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FASCIA } };

  p.asse.forEach((col, i) => {
    const alto = ws.getCell(rEtichetta, i + 2);
    alto.value = col.etichetta;
    alto.font = {
      name: "Arial", size: 9, bold: true,
      color: { argb: "FFFFFFFF" },
    };
    alto.fill = {
      type: "pattern", pattern: "solid",
      // I tre raccoglitori non sono settimane: distinguerli anche qui evita di
      // leggerli come tempo e di cercarci una data.
      fgColor: { argb: col.coda ? MUTO : col.corrente ? VERDE : FASCIA },
    };
    alto.alignment = { horizontal: "center", wrapText: true };

    const basso = ws.getCell(rData, i + 2);
    if (col.lunedi) {
      basso.value = new Date(col.lunedi);
      basso.numFmt = "dd/mm";
    }
    basso.font = { name: "Arial", size: 8, bold: col.corrente, color: { argb: MUTO } };
    basso.alignment = { horizontal: "center" };
  });

  // La colonna del totale, in coda a tutto.
  const colTotale = n + 2;
  ws.getColumn(colTotale).width = W_COLONNA + 2;
  const cTot = ws.getCell(rEtichetta, colTotale);
  cTot.value = "Totale";
  cTot.font = { name: "Arial", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
  cTot.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FASCIA } };
  cTot.alignment = { horizontal: "center" };

  /* ── I blocchi ─────────────────────────────────────────────────────────── */

  let riga = rData + 2;

  const scriviMisura = (m: Misura, rientro: boolean) => {
    const row = ws.getRow(riga);
    const { colore, forte } = stileDi(m);

    const et = row.getCell(1);
    et.value = (rientro ? "    " : "") + m.nome;
    et.font = { name: "Arial", size: 10, bold: forte, color: { argb: colore } };

    m.serie.forEach((v, i) => {
      if (v === 0) return;
      const c = row.getCell(i + 2);
      c.value = v;
      c.numFmt = m.conteggio ? "0" : EURO;
      c.font = {
        name: "Arial", size: 10, bold: forte,
        color: { argb: m.genere === "saldo" || m.genere === "cumulato" ? (v < 0 ? ROSSO : VERDE) : colore },
      };
      // Il cumulato sotto zero si accende: è l'unica informazione del foglio
      // per cui vale la pena aprirlo, e non deve richiedere di leggere i
      // numeri uno per uno.
      if (m.genere === "cumulato" && v < 0) {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFBE9E7" } };
      }
    });

    if (m.totale !== 0) {
      const c = row.getCell(colTotale);
      c.value = m.totale;
      c.numFmt = m.conteggio ? "0" : EURO;
      c.font = {
        name: "Arial", size: 10, bold: true,
        color: { argb: m.genere === "saldo" ? (m.totale < 0 ? ROSSO : VERDE) : colore },
      };
    }
    row.height = 15;
    riga += 1;
  };

  const scriviSezione = (testo: string) => {
    scrivi(ws, `A${riga}`, testo, { size: 8, bold: true, color: MUTO });
    riga += 1;
  };

  const scriviBlocco = (b: Blocco) => {
    const row = ws.getRow(riga);
    const et = row.getCell(1);
    et.value = b.inviluppo ? b.nome.toUpperCase() : b.nome;
    et.font = { name: "Arial", size: 11, bold: true, color: { argb: INK } };
    for (let c = 1; c <= colTotale; c++) {
      row.getCell(c).fill = {
        type: "pattern", pattern: "solid",
        fgColor: { argb: b.inviluppo ? GRIGIO_TENUE : TEAL_TENUE },
      };
    }
    row.height = 18;
    riga += 1;

    scriviSezione("ATTIVO");
    b.attivo.forEach((m) => scriviMisura(m, true));
    scriviSezione("PASSIVO");
    b.passivo.forEach((m) => scriviMisura(m, true));
    scriviMisura(b.saldo, false);
    if (b.cumulato) scriviMisura(b.cumulato, false);
    riga += 1;
  };

  p.blocchi.forEach(scriviBlocco);

  /* ── Il dettaglio per progetto ─────────────────────────────────────────── */

  // Sullo stesso foglio, sotto i blocchi: è la spiegazione dei blocchi, e in un
  // foglio a parte costringerebbe a saltare avanti e indietro per capire da
  // dove viene una settimana.
  riga += 1;
  scrivi(ws, `A${riga}`, "DETTAGLIO PER PROGETTO (ordinato per data installazione)", {
    bold: true, size: 10,
  });
  riga += 1;

  const rTesta = riga;
  const intestazioni: Array<[number, string]> = [
    [1, "Progetto"],
    ...p.asse.map((c, i) => [i + 2, c.etichetta] as [number, string]),
    [colTotale, "Da incassare"],
    [colTotale + 1, "Sett. installazione"],
    [colTotale + 2, "Sett. pag. previsto"],
    [colTotale + 3, "Sett. pag. effettivo"],
  ];
  for (const [col, testo] of intestazioni) {
    const c = ws.getCell(rTesta, col);
    c.value = testo;
    c.font = { name: "Arial", size: 8, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FASCIA } };
    c.alignment = { horizontal: col === 1 ? "left" : "center", wrapText: true };
  }
  [colTotale + 1, colTotale + 2, colTotale + 3].forEach((c) => {
    ws.getColumn(c).width = 16;
  });
  riga += 1;

  for (const pr of p.progetti) {
    const row = ws.getRow(riga);

    const et = row.getCell(1);
    et.value = `${pr.commessa} – ${pr.progetto}`;
    et.font = { name: "Arial", size: 9, color: { argb: INK } };

    pr.incassi.forEach((v, i) => {
      if (v === 0) return;
      const c = row.getCell(i + 2);
      c.value = v;
      c.numFmt = EURO;
      c.font = { name: "Arial", size: 9, color: { argb: VERDE } };
    });

    // L'installazione non è un importo: è una parola nella sua settimana, e
    // dice anche se è già avvenuta — «Installaz.» oppure «prevista», perché un
    // cantiere fatto e un cantiere sperato non valgono lo stesso.
    if (pr.colonnaInstallazione != null) {
      const c = row.getCell(pr.colonnaInstallazione + 2);
      if (c.value == null) {
        c.value = pr.installazioneReale ? "Installaz." : "prevista";
        c.font = {
          name: "Arial", size: 8, bold: pr.installazioneReale,
          italic: !pr.installazioneReale,
          color: { argb: RUGGINE },
        };
        c.alignment = { horizontal: "center" };
      } else {
        // Quella settimana porta già un incasso, e una cella ha un valore solo.
        // Il numero resta un numero — si somma, si grafica — e il cantiere passa
        // sul fondo: nessuna delle due informazioni si perde, e succede spesso,
        // perché la fattura si emette il giorno dell'installazione.
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: RUGGINE_TENUE } };
      }
    }

    if (pr.rimanente !== 0) {
      const c = row.getCell(colTotale);
      c.value = pr.rimanente;
      c.numFmt = EURO;
      c.font = { name: "Arial", size: 9, bold: true, color: { argb: VERDE_TENUE } };
    }

    const code: Array<[number, string | null]> = [
      [colTotale + 1, pr.settInstallazione],
      [colTotale + 2, pr.settPagPrevisto],
      [colTotale + 3, pr.settPagEffettivo],
    ];
    for (const [col, valore] of code) {
      const c = row.getCell(col);
      c.value = valore ?? "—";
      c.font = { name: "Arial", size: 8, color: { argb: valore ? MUTO : "FFC9CCC9" } };
      c.alignment = { horizontal: "center" };
    }

    row.height = 14;
    riga += 1;
  }

  /* ── Come si legge ─────────────────────────────────────────────────────── */

  riga += 1;
  scrivi(ws, `A${riga}`, "Come si legge", { bold: true, size: 10 });
  riga += 1;
  const note = [
    "Il passivo è scritto positivo e si sottrae: SALDO = totale incassi − totale passivo.",
    "«Incassi avvenuti» è denaro in banca; «previsti» è tutto il resto, dal contratto alla stima.",
    "«Prima del periodo» e «Dopo il periodo» sono fuori finestra ma contano nel saldo; «Senza data» è ciò che una data non ce l'ha ancora — ed è anche la lista di cosa andare a chiedere.",
    "Le installazioni si contano, non si sommano: sono la riga che spiega gli incassi previsti, perché la seconda tranche scatta all'installazione.",
    "Le quote di progetto non compaiono: sono la ripartizione di spese già contate, e sommarle gonfierebbe il passivo.",
    "Il saldo cumulato c'è solo sull'inviluppo: la banca è una, e non si somma commessa per commessa.",
  ];
  for (const t of note) {
    scrivi(ws, `A${riga}`, "· " + t, { size: 9, color: MUTO });
    riga += 1;
  }

  /* ── Il foglio del grafico ─────────────────────────────────────────────── */

  // Quattro colonne e niente formattazione: serve a essere selezionato e
  // trasformato in grafico in due clic. Un foglio bello da vedere qui sarebbe
  // un foglio da ripulire prima di usarlo.
  const wg = wb.addWorksheet("Grafico inviluppo", { views: [{ showGridLines: false }] });
  wg.columns = [{ width: 22 }, { width: 16 }, { width: 16 }, { width: 18 }];
  scrivi(wg, "A1", "INVILUPPO — dati per il grafico", { bold: true, size: 12 });

  ["Settimana", "Incassi", "Uscite", "Saldo cumulato"].forEach((t, i) => {
    const c = wg.getCell(3, i + 1);
    c.value = t;
    c.font = { name: "Arial", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FASCIA } };
  });

  const inv = p.blocchi[0];
  const incassi = inv?.attivo.find((m) => m.genere === "totale_incassi");
  const passivo = inv?.passivo.find((m) => m.genere === "totale_passivo");
  const cum = inv?.cumulato;

  p.asse.forEach((col, i) => {
    const r = wg.getRow(4 + i);
    r.getCell(1).value = col.etichetta;
    const valori: Array<[number, number | undefined]> = [
      [2, incassi?.serie[i]],
      [3, passivo?.serie[i]],
      [4, cum?.serie[i]],
    ];
    for (const [c, v] of valori) {
      const cella = r.getCell(c);
      cella.value = v ?? 0;
      cella.numFmt = EURO;
    }
  });
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

/**
 * Il file completo, pronto da scaricare.
 *
 * Sta qui e non nella pagina perché ExcelJS pesa quasi un megabyte: la pagina
 * importa questo modulo solo quando qualcuno esporta davvero.
 */
export async function esportaPlanningExcel(
  p: Planning,
  nome: string,
  ctx: ContestoPlanning,
): Promise<void> {
  const { caricaExcelJS, scarica } = await import("./excelStile");
  const ExcelJS = await caricaExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = "FGB Engine Room";
  wb.created = ctx.oggi;
  aggiungiFogliPlanning(wb, p, ctx);
  const buf = await wb.xlsx.writeBuffer();
  scarica(
    new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    nome,
  );
}

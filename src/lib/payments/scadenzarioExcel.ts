import type { RigaScadenza, Scadenzario } from "./scadenzario";

/**
 * Lo scadenzario su un foglio Excel.
 *
 * Perché ExcelJS e non `xlsx`, che pure è già in casa: SheetJS community non
 * scrive gli stili di cella — riempimenti, font e colori sono funzione della
 * versione Pro. Qui il colore non è decorazione: verde, rosso e ruggine sono
 * la stessa codifica della griglia, e un foglio tutto grigio costringerebbe a
 * rileggere ogni riga per sapere da che parte va il denaro.
 *
 * Tre regole di costruzione:
 *
 *  1. I totali sono formule, mai numeri cotti. Chi riceve il foglio cancella
 *     righe, e un totale hardcoded diventa una bugia al primo filtro.
 *
 *  2. Le colonne dei fogli di dettaglio sono quelle del riferimento, nello
 *     stesso ordine e con le stesse larghezze: il file va confrontato a vista
 *     con quello approvato.
 *
 *  3. L'ultima colonna dei pagamenti è «Da pagare», non la copertura di cassa.
 *     Serve il valore effettivo che esce da conto, non un commento sul
 *     deficit: il deficit è già detto in «Da eseguire?», dove è azionabile.
 */

const INK = "FF18201C";
const MUTO = "FF6B746E";
const VERDE = "FF1F7A56";
const ROSSO = "FFC0392B";
const RUGGINE = "FFB4632C";
const AMBRA = "FFB07A26";
const FASCIA = "FF16201C";
const TEAL_TENUE = "FFE4F1ED";

// Coi centesimi. Il file di riferimento arrotondava all'euro, ma su una
// ripartizione per progetto i centesimi sono il punto: «1.650,00 RMB
// (208,86 €)» e «€ 209» non sono lo stesso numero, e il secondo non si
// riconcilia con la fattura del fornitore.
const EURO = '"€ "#,##0.00;"−€ "#,##0.00';
const EURO_POS = '"€ "#,##0.00';
const DATA = "dd/mm/yyyy";

/**
 * Il formato di un importo nella sua valuta.
 *
 * Il simbolo sta dentro il formato numerico e non nel testo: così la cella
 * resta un numero — si somma, si filtra, si ordina — e continua a dire di che
 * valuta è. Scriverci «RMB 12.434» come stringa la renderebbe inutilizzabile.
 */
const FORMATO_VALUTA: Record<string, string> = {
  EUR: EURO,
  CNY: '"RMB "#,##0.00;"−RMB "#,##0.00',
  USD: '"$ "#,##0.00;"−$ "#,##0.00',
  GBP: '"£ "#,##0.00;"−£ "#,##0.00',
};

const formatoDi = (valuta: string) => FORMATO_VALUTA[valuta] ?? EURO;

/** Quale numero finisce in colonna «Importo», secondo il modo scelto. */
function importoScelto(s: Scadenzario, r: RigaScadenza): { v: number; fmt: string } {
  return s.valuta === "originale" && r.valuta !== "EUR"
    ? { v: r.importoValuta, fmt: formatoDi(r.valuta) }
    : { v: r.importo, fmt: EURO };
}

type Cella = { value: unknown; numFmt?: string; wrap?: boolean };

/** Il tipo deciso in `scadenzario.ts`, tradotto in parole e in colore. */
const TIPO: Record<RigaScadenza["tipo"], { testo: string; colore: string }> = {
  incasso: { testo: "Incasso", colore: VERDE },
  pagamento_fornitore: { testo: "Pagamento · Fornitore", colore: ROSSO },
  pagamento_installatore: { testo: "Pagamento · Installatore", colore: RUGGINE },
};

const giornoExcel = (iso: string | null) =>
  iso ? new Date(iso + "T00:00:00Z") : "";

export async function esportaScadenzarioExcel(
  s: Scadenzario,
  nomeFile: string,
): Promise<void> {
  scarica(
    new Blob([await bufferScadenzarioExcel(s)], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    nomeFile,
  );
}

/** Il foglio, senza il download: separato perché è la parte verificabile. */
export async function bufferScadenzarioExcel(s: Scadenzario): Promise<ArrayBuffer> {
  const mod = await import("exceljs");
  // ExcelJS esporta di default in CJS e come namespace in ESM: il bundler può
  // consegnare l'uno o l'altro, e sbagliare qui fallisce a runtime e non in
  // compilazione.
  const ExcelJS = ((mod as unknown as { default?: unknown }).default ?? mod) as typeof import("exceljs");

  const wb = new ExcelJS.Workbook();
  wb.creator = "FGB Engine Room";

  // I fogli si creano nell'ordine in cui vanno letti — l'agenda per prima,
  // perché è quella che si apre — e si riempiono dopo: i nomi sono costanti,
  // quindi le formule del riepilogo possono puntarli prima che esistano le
  // righe che sommano.
  const wsAgenda = nuovoFoglio(wb, "Scadenzario", COL_AGENDA, 11);
  const wsCommesse = nuovoFoglio(wb, NOMI.commesse, COL_COMMESSE, 6);
  const wsIncassi = nuovoFoglio(wb, NOMI.incassi, COL_INCASSI, 6);
  const wsPagamenti = nuovoFoglio(wb, NOMI.pagamenti, COL_PAGAMENTI, 6);
  const wsSenza = nuovoFoglio(wb, NOMI.senzaData, COL_SENZA, 6);

  agenda(wsAgenda, s);
  foglioCommesse(wsCommesse, s);
  foglioIncassi(wsIncassi, s);
  foglioPagamenti(wsPagamenti, s);
  foglioSenzaData(wsSenza, s);

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

/* ── Foglio 1 · l'agenda ──────────────────────────────────────────────────── */

const COL_AGENDA = [
  ["Data", 11],
  ["Sett.", 6],
  ["Tipo", 24],
  ["Importo", 12],
  ["Controparte", 20],
  ["Commessa", 22],
  ["Progetto", 26],
  ["Perché (causale contrattuale)", 46],
  ["Stato", 28],
  ["Da pagare", 14],
] as const;

const NOMI = {
  commesse: "Per commessa",
  incassi: "Da incassare",
  pagamenti: "Da pagare",
  senzaData: "Senza data",
} as const;

function agenda(ws: Ws, s: Scadenzario) {
  titolo(ws, "A1", "SCADENZARIO PAGAMENTI E INCASSI");
  sottotitolo(
    ws,
    "A2",
    `WBS di Cassa · Payments · esportato il ${s.intestazione.generatoIl}` +
      ` · selezione: ${s.intestazione.selezione}` +
      ` · perimetro: ${s.intestazione.perimetro}` +
      ` · finestra: ${s.intestazione.finestra}` +
      (s.valuta === "originale"
        ? " · importi nella valuta del contratto; i totali restano in euro"
        : " · tutti gli importi in euro"),
  );

  // Riepilogo. I quattro numeri sono formule sui fogli di dettaglio: è il
  // quinto criterio di accettazione, e serve perché il foglio resti vero dopo
  // che qualcuno ci ha messo le mani.
  const inc = `SUM('${NOMI.incassi}'!C7:C100000)`;
  const pag = `SUM('${NOMI.pagamenti}'!N7:N100000)`;
  const voci: Array<[string, string, number, string]> = [
    ["Da incassare", inc, s.totali.daIncassare, VERDE],
    ["Da pagare", pag, s.totali.daPagare, ROSSO],
    ["Saldo atteso", `${inc}-${pag}`, s.totali.saldo, INK],
    ["Senza data", `SUM('${NOMI.senzaData}'!B7:B100000)`, s.totali.senzaData, AMBRA],
  ];
  voci.forEach(([nome, formula, risultato, colore], i) => {
    const r = 5 + i;
    cella(ws, `A${r}`, nome, { bold: true, size: 11, color: colore });
    formulaCella(ws, `C${r}`, formula, risultato, colore, EURO);
  });
  cella(
    ws,
    "D8",
    "movimenti non ancora databili — vedi foglio dedicato",
    { size: 9, color: MUTO },
  );
  cella(ws, "D6", "quanto esce davvero: esclude il già pagato", { size: 9, color: MUTO });
  cella(
    ws,
    "D7",
    `commessa per commessa, con chi non si copre da sola, nel foglio «${NOMI.commesse}»`,
    { size: 9, color: MUTO },
  );

  cella(ws, "A10", "AGENDA CRONOLOGICA — tutti i movimenti attesi, in ordine di data", {
    bold: true,
    size: 11,
    color: INK,
  });

  intestazioni(ws, 11, COL_AGENDA.map(([t]) => t));

  s.righe.forEach((r, i) => {
    const y = 12 + i;
    const t = TIPO[r.tipo];
    const imp = importoScelto(s, r);
    scriviRiga(ws, y, [
      { value: giornoExcel(r.data), numFmt: DATA },
      { value: r.settimana },
      { value: t.testo },
      { value: imp.v, numFmt: imp.fmt },
      { value: r.controparte },
      { value: r.commessa },
      { value: r.progetto ?? "" },
      { value: r.perche, wrap: true },
      { value: r.stato },
      { value: r.daPagare || "", numFmt: EURO_POS },
    ]);
    ws.getCell(y, 3).font = { name: "Arial", size: 10, bold: true, color: { argb: t.colore } };
    ws.getCell(y, 4).font = { name: "Arial", size: 10, bold: true, color: { argb: t.colore } };
    // Gli incassi su fondo teal: scorrendo la colonna si vede dove entra
    // denaro senza dover leggere il tipo riga per riga.
    if (r.tipo === "incasso") {
      for (let c = 1; c <= COL_AGENDA.length; c++) {
        ws.getCell(y, c).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: TEAL_TENUE },
        };
      }
    }
  });
}

/* ── Foglio 2 · per commessa ──────────────────────────────────────────────── */

/**
 * La stessa cassa, girata di novanta gradi.
 *
 * L'agenda risponde a «cosa devo fare lunedì»; questo foglio a «questa
 * commessa si paga da sola o devo metterci dei fondi». Sono due domande
 * diverse e nessuna delle due si risponde guardando l'altra: l'agenda mescola
 * le commesse per data — giusto per programmare i bonifici, inutile per
 * decidere dove servono i soldi.
 *
 * Le commesse peggiori stanno in cima, non in ordine alfabetico: chi ha
 * bisogno di fondi si deve vedere, non si deve cercare.
 */
const COL_COMMESSE = [
  ["Commessa o progetto", 40],
  ["Categoria", 14],
  ["Da incassare", 14],
  ["Da pagare", 14],
  ["Saldo atteso", 14],
  ["1º incasso", 12],
  ["1ª uscita", 12],
  ["Mov.", 7],
] as const;

function foglioCommesse(ws: Ws, s: Scadenzario) {
  titolo(ws, "A1", "PER COMMESSA — quanto rientra, quanto esce");
  sottotitolo(
    ws,
    "A2",
    "Saldo atteso = incassi previsti meno uscite da pagare, sullo stesso perimetro dell'agenda. " +
      "In rosso le commesse che nel periodo non si coprono da sole: sono quelle per cui servono fondi. " +
      "Chi non ha ancora una commessa è raggruppato sotto il progetto.",
  );

  const ultima = 6 + Math.max(1, s.perCommessa.length);
  cella(ws, "A4", "Totale", { bold: true, size: 11, color: INK });
  formulaCella(ws, "C4", `SUM(C7:C${ultima})`, s.totali.daIncassare, VERDE, EURO_POS);
  formulaCella(ws, "D4", `SUM(D7:D${ultima})`, s.totali.daPagare, ROSSO, EURO_POS);
  formulaCella(ws, "E4", `SUM(E7:E${ultima})`, s.totali.saldo, INK, EURO);

  intestazioni(ws, 6, COL_COMMESSE.map(([t]) => t));

  s.perCommessa.forEach((c, i) => {
    const y = 7 + i;
    scriviRiga(ws, y, [
      { value: c.nome },
      { value: c.categoria },
      { value: c.daIncassare || "", numFmt: EURO_POS },
      { value: c.daPagare || "", numFmt: EURO_POS },
      // Il saldo è una formula: chi cancella una riga vuole vedere il totale
      // muoversi, non restare fermo su un numero cotto.
      { value: { formula: `C${y}-D${y}`, result: c.saldo }, numFmt: EURO },
      { value: c.primoIncasso ? new Date(c.primoIncasso + "T00:00:00Z") : "", numFmt: DATA },
      { value: c.primaUscita ? new Date(c.primaUscita + "T00:00:00Z") : "", numFmt: DATA },
      { value: c.movimenti },
    ]);
    ws.getCell(y, 1).font = { name: "Arial", size: 10, bold: true, color: { argb: INK } };
    ws.getCell(y, 3).font = { name: "Arial", size: 10, color: { argb: VERDE } };
    ws.getCell(y, 4).font = { name: "Arial", size: 10, color: { argb: ROSSO } };
    ws.getCell(y, 5).font = {
      name: "Arial", size: 10, bold: true,
      color: { argb: c.saldo < 0 ? ROSSO : VERDE },
    };
    // Una commessa che non si copre da sola è la riga per cui questo foglio
    // esiste: si vede senza doverla cercare nella colonna dei numeri.
    if (c.saldo < 0) {
      for (let col = 1; col <= COL_COMMESSE.length; col++) {
        ws.getCell(y, col).fill = {
          type: "pattern", pattern: "solid", fgColor: { argb: "FFFBE9EC" },
        };
      }
    }
  });
}

/* ── Foglio 3 · da incassare ──────────────────────────────────────────────── */

const COL_INCASSI = [
  ["Data attesa", 11],
  ["Sett.", 6],
  ["Importo", 12],
  ["Cliente", 22],
  ["Commessa", 22],
  ["Progetto", 26],
  ["Riferimento", 24],
  ["Perché (tranche contrattuale)", 46],
  ["Stato", 28],
] as const;

function foglioIncassi(ws: Ws, s: Scadenzario) {
  titolo(ws, "A1", "DA INCASSARE");
  totale(
    ws,
    4,
    `SUM(C7:C${6 + Math.max(1, s.incassi.length)})`,
    s.totali.daIncassare,
    VERDE,
  );
  intestazioni(ws, 6, COL_INCASSI.map(([t]) => t));

  s.incassi.forEach((r, i) =>
    scriviRiga(ws, 7 + i, [
      { value: giornoExcel(r.data), numFmt: DATA },
      { value: r.settimana },
      { value: r.importo, numFmt: EURO_POS },
      { value: r.controparte },
      { value: r.commessa },
      { value: r.progetto ?? "" },
      { value: r.riferimento },
      { value: r.perche, wrap: true },
      { value: r.stato },
    ]),
  );
}

/* ── Foglio 3 · da pagare ─────────────────────────────────────────────────── */

/**
 * Il foglio dei pagamenti è il più largo, e non per vezzo.
 *
 * Una riga qui è già la ripartizione: le fatture FoSensor arrivano spezzate
 * per progetto, e ogni pezzo porta il suo numero di fattura. Con Riferimento e
 * Progetto in colonna, una tabella pivot ricostruisce la fattura intera in due
 * clic — mentre un layout annidato, con il totale sopra e le quote sotto,
 * sarebbe bello da guardare e impossibile da filtrare.
 *
 * L'importo compare due volte, in valuta e in euro, perché sono due numeri
 * diversi: «9.325,50 RMB» è quello scritto sul documento e quello su cui il
 * fornitore discute; l'euro è una conseguenza del cambio, che infatti è
 * scritto accanto.
 */
const COL_PAGAMENTI = [
  ["Data scadenza", 12],
  ["Sett.", 6],
  ["Riferimento", 16],
  ["Beneficiario · Tipo", 24],
  ["Commessa", 22],
  ["Progetto", 26],
  ["Importo valuta", 14],
  ["Val.", 7],
  ["Cambio", 9],
  ["Importo €", 12],
  ["Perché (tranche contrattuale)", 40],
  ["Stato", 24],
  ["Da eseguire?", 28],
  ["Da pagare (effettivo)", 16],
] as const;

function foglioPagamenti(ws: Ws, s: Scadenzario) {
  titolo(ws, "A1", "DA PAGARE");
  sottotitolo(
    ws,
    "A2",
    "Una riga per progetto servito: «Riferimento» è la fattura, e più righe con lo stesso riferimento la compongono. " +
      "«Importo €» è quanto dice il documento; «Da pagare» è quanto esce davvero da conto — zero su ciò che è già uscito.",
  );
  const ultima = 6 + Math.max(1, s.pagamenti.length);
  const fatturato =
    Math.round(s.pagamenti.reduce((t, r) => t + Math.abs(r.importo), 0) * 100) / 100;
  cella(ws, "A4", "Totale", { bold: true, size: 11, color: INK });
  formulaCella(ws, "J4", `SUM(J7:J${ultima})`, fatturato, ROSSO, EURO_POS);
  cella(ws, "L4", "di cui da pagare davvero", { size: 9, color: MUTO });
  formulaCella(ws, "N4", `SUM(N7:N${ultima})`, s.totali.daPagare, ROSSO, EURO_POS);

  intestazioni(ws, 6, COL_PAGAMENTI.map(([t]) => t));

  s.pagamenti.forEach((r, i) => {
    const y = 7 + i;
    scriviRiga(ws, y, [
      { value: giornoExcel(r.data), numFmt: DATA },
      { value: r.settimana },
      { value: r.riferimento },
      { value: `${r.controparte} · ${r.tipo === "pagamento_installatore" ? "Installatore" : "Fornitore"}` },
      { value: r.commessa },
      { value: r.progetto ?? "" },
      { value: Math.abs(r.importoValuta), numFmt: "#,##0.00" },
      { value: r.valuta },
      { value: r.valuta === "EUR" ? "" : r.cambio, numFmt: "0.000000" },
      { value: Math.abs(r.importo), numFmt: EURO_POS },
      { value: r.perche, wrap: true },
      { value: r.stato },
      { value: r.daEseguire },
      { value: r.daPagare || "", numFmt: EURO_POS },
    ]);
    const colore = TIPO[r.tipo].colore;
    ws.getCell(y, 10).font = { name: "Arial", size: 10, bold: true, color: { argb: colore } };
    ws.getCell(y, 14).font = { name: "Arial", size: 10, bold: true, color: { argb: colore } };
    // Quello che si può rimandare si legge come tale: è l'unica decisione che
    // questo foglio chiede di prendere.
    if (r.daEseguire.startsWith("Valutare")) {
      ws.getCell(y, 13).font = { name: "Arial", size: 10, bold: true, color: { argb: AMBRA } };
    }
  });
}

/* ── Foglio 4 · senza data ────────────────────────────────────────────────── */

const COL_SENZA = [
  ["Tipo", 24],
  ["Importo", 12],
  ["Controparte", 20],
  ["Commessa", 22],
  ["Progetto", 26],
  ["Perché (tranche contrattuale)", 40],
  ["Cosa manca per datarlo", 42],
] as const;

function foglioSenzaData(ws: Ws, s: Scadenzario) {
  titolo(ws, "A1", "SENZA DATA — movimenti attesi non ancora databili");
  sottotitolo(
    ws,
    "A2",
    "Ogni riga indica il dato mancante per collocare il movimento nello scadenzario.",
  );
  totale(
    ws,
    4,
    `SUM(B7:B${6 + Math.max(1, s.senzaData.length)})`,
    s.totali.senzaData,
    AMBRA,
    "B",
  );
  intestazioni(ws, 6, COL_SENZA.map(([t]) => t));

  s.senzaData.forEach((r, i) => {
    const y = 7 + i;
    scriviRiga(ws, y, [
      { value: TIPO[r.tipo].testo },
      { value: r.importo, numFmt: EURO },
      { value: r.controparte },
      { value: r.commessa },
      { value: r.progetto ?? "" },
      { value: r.perche, wrap: true },
      { value: r.cosaManca },
    ]);
    ws.getCell(y, 1).font = {
      name: "Arial",
      size: 10,
      bold: true,
      color: { argb: TIPO[r.tipo].colore },
    };
    ws.getCell(y, 7).font = { name: "Arial", size: 9, color: { argb: AMBRA } };
  });
}

/* ── Mattoni ──────────────────────────────────────────────────────────────── */

type Ws = import("exceljs").Worksheet;

/** Griglia spenta, intestazioni congelate, larghezze del riferimento. */
function nuovoFoglio(
  wb: import("exceljs").Workbook,
  nome: string,
  colonne: readonly (readonly [string, number])[],
  congela: number,
): Ws {
  const ws = wb.addWorksheet(nome, {
    views: [{ showGridLines: false, state: "frozen", ySplit: congela }],
  });
  ws.columns = colonne.map(([, w]) => ({ width: w }));
  return ws;
}

function cella(
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

const titolo = (ws: Ws, rif: string, testo: string) =>
  cella(ws, rif, testo, { bold: true, size: 15, color: INK });

const sottotitolo = (ws: Ws, rif: string, testo: string) =>
  cella(ws, rif, testo, { size: 9, color: MUTO });

/**
 * Una cella calcolata, col suo risultato già dentro.
 *
 * La formula è la verità — cancella una riga e il totale la segue — ma senza
 * un valore in cache il foglio si apre vuoto ovunque non ricalcoli da solo:
 * anteprime, Google Sheets, LibreOffice al primo caricamento. Servono
 * entrambi.
 */
function formulaCella(
  ws: Ws,
  rif: string,
  formula: string,
  risultato: number,
  colore: string,
  fmt: string,
) {
  const c = ws.getCell(rif);
  c.value = { formula, result: risultato } as never;
  c.font = { name: "Arial", size: 13, bold: true, color: { argb: colore } };
  c.numFmt = fmt;
  c.alignment = { horizontal: "left" };
}

function totale(
  ws: Ws,
  riga: number,
  formula: string,
  risultato: number,
  colore: string,
  colonna = "C",
) {
  cella(ws, `A${riga}`, "Totale", { bold: true, size: 11, color: INK });
  formulaCella(ws, `${colonna}${riga}`, formula, risultato, colore, EURO);
}

/** La fascia scura: bianco su #16201C, maiuscoletto, come nel riferimento. */
function intestazioni(ws: Ws, riga: number, testi: readonly string[]) {
  testi.forEach((t, i) => {
    const c = ws.getCell(riga, i + 1);
    c.value = t;
    c.font = { name: "Arial", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FASCIA } };
    c.alignment = { vertical: "middle", wrapText: true };
  });
  ws.getRow(riga).height = 22;
}

function scriviRiga(ws: Ws, riga: number, celle: Cella[]) {
  celle.forEach((v, i) => {
    const c = ws.getCell(riga, i + 1);
    c.value = v.value as never;
    if (v.numFmt) c.numFmt = v.numFmt;
    c.font = { name: "Arial", size: 10, color: { argb: INK } };
    // La causale è l'unica colonna che va a capo: è lunga per costruzione, e
    // tagliarla toglierebbe proprio il «perché» per cui esiste.
    c.alignment = { vertical: "top", wrapText: v.wrap ?? false };
  });
}

export function scarica(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

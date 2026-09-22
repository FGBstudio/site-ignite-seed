import type { CashEvent } from "@/types/payments";
import { lunedi } from "./wbs";

/**
 * Lo scadenzario: quando incassiamo, quando dobbiamo pagare, e se il pagamento
 * va davvero eseguito.
 *
 * Solo calcolo — nessun Excel, nessun React, nessun accesso al database. Qui si
 * decide *cosa* dice ogni riga; come venga disegnata su un foglio è un'altra
 * questione, e sta in `scadenzarioExcel.ts`.
 *
 * Tre scelte che reggono tutto il resto:
 *
 *  1. Una riga è un movimento, mai un aggregato. La griglia raggruppa perché
 *     deve stare in una settimana larga 104px; un foglio no, e chi lo riceve
 *     deve poter spuntare voce per voce.
 *
 *  2. Le quote non ci sono. Non sono denaro che si muove: sono la ripartizione
 *     di una spesa già contata, e in uno scadenzario diventerebbero un secondo
 *     pagamento dello stesso hardware.
 *
 *  3. Senza data non vuol dire «in fondo all'elenco»: vuol dire un foglio a
 *     parte, dove accanto all'importo c'è scritto *cosa manca* per datarlo.
 *     Mescolarli all'agenda farebbe sembrare completa un'agenda che non lo è.
 */

export type Perimetro = "selezione" | "quattro_settimane" | "tutto";
export type Contenuto = "da_fare" | "tutto";
export type Formato = "xlsx" | "pdf" | "csv";

/**
 * Come si leggono gli importi.
 *
 * `euro` converte tutto: si somma, si confronta, si porta in banca. `originale`
 * lascia ogni movimento nella valuta in cui è pattuito — gli incassi sono in
 * euro comunque, le uscite cinesi in RMB, quelle americane in dollari — ed è
 * la forma in cui il fornitore riconosce la sua fattura.
 *
 * I totali restano in euro in entrambi i casi, perché sommare valute diverse
 * non dà un numero.
 */
export type ModoValuta = "euro" | "originale";

export interface OpzioniExport {
  perimetro: Perimetro;
  contenuto: Contenuto;
  formato: Formato;
  valuta: ModoValuta;
}

export type TipoRigaScadenza = "incasso" | "pagamento_fornitore" | "pagamento_installatore";

/** Una riga dell'agenda: quanto, quando, perché. */
export interface RigaScadenza {
  id: string;
  tipo: TipoRigaScadenza;
  /** ISO. Nullo solo sulle righe senza data, che vivono in un foglio a parte. */
  data: string | null;
  settimana: string;
  /** Col segno: entrate positive, uscite negative. */
  importo: number;
  /** Lo stesso importo com'è scritto sul documento, in che valuta e a che cambio. */
  importoValuta: number;
  valuta: string;
  cambio: number;
  /**
   * Il valore effettivo da pagare: quanto esce davvero da conto a quella data.
   *
   * Non è l'importo della fattura. È zero sugli incassi, zero su quello che è
   * già uscito, e zero su un'uscita ancora vincolata a un evento che non è
   * successo — perché una somma di importi fatturati non dice quanto serve in
   * banca, e quella è l'unica domanda a cui questa colonna deve rispondere.
   */
  daPagare: number;
  controparte: string;
  commessa: string;
  progetto: string | null;
  categoria: string;
  /** Sotto cosa si raggruppa: la commessa se c'è, altrimenti il progetto. */
  afferenza: string;
  riferimento: string;
  perche: string;
  stato: string;
  /** Solo sui pagamenti. */
  daEseguire: string;
  /** Solo sulle righe senza data. */
  cosaManca: string;
}

/**
 * Una commessa vista come richiesta di fondi: quanto esce, quanto rientra,
 * e quando.
 *
 * È la domanda per cui lo scadenzario viene aperto — «questa commessa si paga
 * da sola o devo mettere soldi?» — e l'agenda cronologica da sola non ci
 * risponde: mescola le commesse per data, che è giusto per programmare i
 * bonifici e inutile per decidere dove servono i fondi.
 */
export interface RiepilogoCommessa {
  nome: string;
  categoria: string;
  daIncassare: number;
  daPagare: number;
  saldo: number;
  primoIncasso: string | null;
  primaUscita: string | null;
  movimenti: number;
}

export interface Scadenzario {
  righe: RigaScadenza[];
  senzaData: RigaScadenza[];
  incassi: RigaScadenza[];
  pagamenti: RigaScadenza[];
  perCommessa: RiepilogoCommessa[];
  /** In che valuta vanno scritti i singoli movimenti. */
  valuta: ModoValuta;
  totali: { daIncassare: number; daPagare: number; saldo: number; senzaData: number };
  intestazione: { generatoIl: string; selezione: string; finestra: string; perimetro: string };
}

/* ── Date e settimane ─────────────────────────────────────────────────────── */

const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

export function numeroSettimana(giorno: string): number {
  const d = new Date(giorno + "T00:00:00Z");
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() + 4 - ((x.getUTCDay() + 6) % 7));
  const capodanno = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return Math.ceil(((x.getTime() - capodanno.getTime()) / 86400000 + 1) / 7);
}

const sigla = (giorno: string | null) => (giorno ? "S" + numeroSettimana(giorno) : "—");

export const itaData = (giorno: string) => {
  const [a, m, g] = giorno.split("-");
  return `${g}/${m}/${a}`;
};

const giorniFra = (da: string, a: string) =>
  Math.round(
    (new Date(a + "T00:00:00Z").getTime() - new Date(da + "T00:00:00Z").getTime()) / 86400000,
  );

/* ── Le parole ────────────────────────────────────────────────────────────── */

/** «FoSensor · Fattura 260417FS01 · 30% deposito» → senza il fornitore, che sta
 *  già nella sua colonna e ripeterlo mangia larghezza alla causale. */
function senzaFornitore(etichetta: string | null): string {
  if (!etichetta) return "movimento";
  const i = etichetta.indexOf(" · ");
  return i >= 0 ? etichetta.slice(i + 3) : etichetta;
}

/**
 * L'evento che innesca il pagamento, in parole.
 *
 * `senza_data` non c'è di proposito: non è un evento, è l'assenza di uno, e
 * scriverlo produrrebbe frasi come «attesa da senza_data» — che è il modo in
 * cui un nome interno finisce sotto gli occhi di un cliente.
 */
const TRIGGER: Record<string, string> = {
  ordine: "emissione dell'ordine",
  spedizione: "spedizione della merce",
  ricezione: "ricezione a Shanghai",
  installazione: "installazione",
  primo_dato: "primo dato di telemetria",
  milestone_chiusa: "chiusura della milestone",
  ordine_hardware: "ordine hardware",
  stima: "piano di commessa",
};

const trigger = (f: string | null | undefined): string | null =>
  (f && TRIGGER[f]) || null;

/**
 * La catena leggibile della causale: cosa si paga, su quale documento, con
 * quali termini.
 *
 * L'obiettivo è che chi riceve il foglio non debba aprire l'applicazione per
 * capire una riga — che è anche il secondo criterio di accettazione.
 */
function causale(ev: CashEvent): string {
  const parti: string[] = [senzaFornitore(ev.etichetta)];

  if (ev.verso === "entrata") {
    if (ev.data_documento) {
      parti.push(`fattura emessa il ${itaData(ev.data_documento)}`);
      if (ev.data) parti.push(`termini ${giorniFra(ev.data_documento, ev.data)} gg`);
    } else {
      const t = trigger(ev.fonte_evento);
      if (t) parti.push(`attesa da ${t}`);
    }
  } else {
    if (ev.data_documento && ev.data) {
      parti.push(`termini ${giorniFra(ev.data_documento, ev.data)} gg dall'emissione`);
    }
    const t = trigger(ev.fonte_evento);
    if (t && (ev.fonte === "evento" || ev.fonte === "stima")) parti.push(`vincolato a ${t}`);
  }

  // Senza commessa la riga resterebbe senza contesto: quello che c'è —
  // il progetto, o l'ordine da cui viene — scende qui, dove è una spiegazione
  // e non finge di essere una commessa.
  if (!ev.commessa_id) {
    const ripiego = ev.commessa?.startsWith("Non attribuite · ")
      ? ev.commessa.slice("Non attribuite · ".length)
      : (ev.progetto ?? ev.commessa);
    if (ripiego) parti.push(ripiego);
  }
  if (ev.certezza === "stimata") parti.push("data stimata");

  return parti.filter(Boolean).join(" · ");
}

function statoDi(ev: CashEvent): string {
  if (ev.verso === "entrata") {
    switch (ev.fonte) {
      case "incasso": return "Incassato";
      case "scadenza_fattura":
      case "fattura_emessa": return "Fatturato";
      case "pagamento_previsto": return "Fatturato — data dichiarata dal cliente";
      case "da_evento": return "Previsto — fattura da emettere";
      case "da_evento_stimato": return "Previsto — data stimata";
      default: return "Previsto";
    }
  }
  switch (ev.stato) {
    case "pagata": return "Pagato";
    case "approvata": return "Approvato";
    case "congelata": return "Congelato — trattenuto al controllo qualità";
    case "annullata": return "Annullato";
    default: return ev.certezza === "stimata" ? "Previsto — data stimata" : "Previsto";
  }
}

/**
 * Se il pagamento va eseguito, e con quale riserva.
 *
 * Non è un giudizio automatico sul merito: è il riassunto di quello che si sa.
 * Un'uscita vincolata a un evento che non è ancora successo non si esegue
 * perché è in scadenza — si esegue quando l'evento succede.
 */
/**
 * Se quel denaro deve uscire davvero, a quella data.
 *
 * Non si esce da conto per quello che è già uscito, per quello che è stato
 * annullato o per quello che è trattenuto al controllo qualità. Tutto il resto
 * è dovuto, e resta dovuto anche se la settimana è in deficit o se la data
 * dipende ancora da una consegna: il deficit è un problema di copertura, non
 * un motivo per cui il debito sparisce, e una data incerta sposta il *quando*,
 * non il *quanto*. Toglierli dal totale vorrebbe dire consegnare un fabbisogno
 * di cassa più basso del vero — l'errore peggiore che questo foglio possa
 * fare.
 */
function dovuto(ev: CashEvent): boolean {
  return ev.stato !== "pagata" && ev.stato !== "annullata" && ev.stato !== "congelata";
}

function daEseguire(
  ev: CashEvent,
  deficit: Set<string>,
  primaCoperta: (settimana: string) => string | null,
): string {
  if (ev.stato === "pagata") return "No — già pagato";
  if (ev.stato === "annullata") return "No — annullato";
  if (ev.stato === "congelata") return "No — trattenuto fino al controllo qualità";

  const t = trigger(ev.fonte_evento);
  if (t && (ev.fonte === "evento" || ev.fonte === "stima")) return `Sì — vincolato a ${t}`;
  if (ev.stato === "approvata") return "Sì";

  const sett = ev.settimana;
  if (sett && deficit.has(sett)) {
    const dove = primaCoperta(sett);
    return dove ? `Valutare — posticipabile a ${dove}` : "Valutare — settimana in deficit";
  }
  return "Sì — in scadenza";
}

/**
 * Cosa manca per datare un movimento.
 *
 * La domanda a cui questo foglio serve a rispondere è «a chi devo chiedere
 * cosa», quindi la risposta nomina l'evento mancante, non lo stato interno.
 */
function cosaManca(ev: CashEvent): string {
  const t = trigger(ev.fonte_evento);
  if (t) return `Manca: ${t}`;
  return ev.verso === "entrata"
    ? "Manca: data prevista di incasso"
    : "Manca: data di scadenza del pagamento";
}

/* ── Il perimetro ─────────────────────────────────────────────────────────── */

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Quali movimenti entrano nel foglio.
 *
 * `selezione` rispetta la finestra già visibile a schermo: chi esporta si
 * aspetta il foglio di quello che sta guardando. Le altre due sono scorciatoie
 * per le due domande ricorrenti — «cosa devo fare adesso» e «dammi tutto».
 */
function dentroPerimetro(
  ev: CashEvent,
  perimetro: Perimetro,
  finestra: { da: string; a: string },
  oggi: Date,
): boolean {
  if (perimetro === "tutto") return true;
  if (!ev.data) return true; // le righe senza data non hanno un perimetro: sono sempre aperte
  if (perimetro === "quattro_settimane") {
    const fine = new Date(oggi);
    fine.setUTCDate(fine.getUTCDate() + 28);
    return ev.data >= iso(lunedi(oggi)) && ev.data <= iso(fine);
  }
  return ev.data >= finestra.da && ev.data <= finestra.a;
}

const ETICHETTA_PERIMETRO: Record<Perimetro, string> = {
  selezione: "selezione corrente",
  quattro_settimane: "prossime 4 settimane",
  tutto: "tutto lo storico e il previsto",
};

/* ── Il costruttore ───────────────────────────────────────────────────────── */

export function costruisciScadenzario(
  eventi: CashEvent[],
  opzioni: OpzioniExport,
  contesto: {
    oggi: Date;
    finestra: { da: string; a: string };
    etichettaFinestra: string;
    selezione: string;
  },
): Scadenzario {
  const { oggi, finestra } = contesto;

  // Le somme settimanali servono a dire se un'uscita è posticipabile, e vanno
  // calcolate su *tutti* gli eventi di cassa: il deficit di una settimana non
  // cambia perché il foglio ne mostra solo una parte.
  const nettoSettimana = new Map<string, number>();
  for (const ev of eventi) {
    if (ev.natura !== "cassa" || !ev.settimana) continue;
    nettoSettimana.set(ev.settimana, (nettoSettimana.get(ev.settimana) ?? 0) + ev.importo_eur);
  }
  const deficit = new Set(
    [...nettoSettimana.entries()].filter(([, v]) => v < 0).map(([k]) => k),
  );
  const settimaneOrdinate = [...nettoSettimana.keys()].sort();
  const primaCoperta = (settimana: string): string | null => {
    const i = settimaneOrdinate.indexOf(settimana);
    for (let j = i + 1; j < settimaneOrdinate.length; j++) {
      if ((nettoSettimana.get(settimaneOrdinate[j]) ?? 0) >= 0) return sigla(settimaneOrdinate[j]);
    }
    return null;
  };

  const scelti = eventi.filter((ev) => {
    if (ev.natura !== "cassa") return false;
    if (ev.importo_eur === 0) return false;
    if (!dentroPerimetro(ev, opzioni.perimetro, finestra, oggi)) return false;
    if (opzioni.contenuto === "da_fare") {
      if (ev.stato === "pagata" || ev.stato === "annullata") return false;
      if (ev.fonte === "incasso") return false;
    }
    return true;
  });

  const righe: RigaScadenza[] = scelti.map((ev) => {
    const uscita = ev.verso === "uscita";
    const esecuzione = uscita ? daEseguire(ev, deficit, primaCoperta) : "";
    return {
      id: ev.id,
      tipo: !uscita
        ? "incasso"
        : ev.corsia === "installatore"
          ? "pagamento_installatore"
          : "pagamento_fornitore",
      data: ev.data,
      settimana: sigla(ev.data),
      importo: ev.importo_eur,
      importoValuta: ev.importo_valuta ?? ev.importo_eur,
      valuta: ev.valuta ?? "EUR",
      cambio: ev.cambio ?? 1,
      daPagare: uscita && dovuto(ev) ? Math.abs(ev.importo_eur) : 0,
      // Chi sta dall'altra parte del denaro: il cliente quando entra, il
      // fornitore quando esce. La vista lo dà già nel verso giusto.
      controparte: ev.brand ?? ev.commessa,
      // Commessa solo se ce n'è davvero una. La vista, quando manca, ripiega
      // sul nome del progetto o su quello dell'ordine: comodo in griglia,
      // falso in un foglio dove la colonna si chiama «Commessa» e qualcuno la
      // userà per sommare. Il ripiego è finito nella causale.
      commessa: ev.commessa_id ? (ev.commessa ?? "") : "",
      progetto: ev.progetto,
      categoria: ev.categoria ?? "Non attribuite",
      // Chi non ha una commessa si raggruppa lo stesso, sotto il progetto:
      // lasciarlo in un unico mucchio «non attribuito» nasconderebbe proprio
      // le voci da attribuire, che sono quelle da guardare.
      afferenza:
        (ev.commessa_id ? ev.commessa : null) ??
        ev.progetto ??
        (ev.commessa?.startsWith("Non attribuite · ")
          ? ev.commessa.slice("Non attribuite · ".length)
          : "Non attribuito"),
      riferimento:
        ev.riferimento ??
        (ev.data_documento ? `fattura emessa il ${itaData(ev.data_documento)}` : "—"),
      perche: causale(ev),
      stato: statoDi(ev),
      daEseguire: esecuzione,
      cosaManca: ev.data ? "" : cosaManca(ev),
    };
  });

  // Per data, poi per documento, poi per importo. Il documento in mezzo non è
  // un vezzo: le fatture dei fornitori cinesi arrivano spezzate per progetto,
  // e senza questo ordinamento le quote della stessa fattura finiscono sparse
  // fra le altre — proprio mentre chi legge sta cercando di ricomporla.
  const datate = righe
    .filter((r) => r.data)
    .sort(
      (a, b) =>
        a.data!.localeCompare(b.data!) ||
        a.riferimento.localeCompare(b.riferimento) ||
        Math.abs(b.importo) - Math.abs(a.importo),
    );
  const senzaData = righe.filter((r) => !r.data);

  const somma = (xs: RigaScadenza[], f: (r: RigaScadenza) => number) =>
    Math.round(xs.reduce((s, r) => s + f(r), 0) * 100) / 100;

  const incassi = datate.filter((r) => r.tipo === "incasso");
  const pagamenti = datate.filter((r) => r.tipo !== "incasso");

  // ── Il riepilogo per commessa ────────────────────────────────────────────
  // Si costruisce sulle stesse righe dell'agenda, non su una seconda query:
  // due strade verso lo stesso numero divergono al primo cambio di regola, e
  // il foglio comincia a contraddirsi da solo.
  const conti = new Map<string, RiepilogoCommessa>();
  for (const r of datate) {
    let c = conti.get(r.afferenza);
    if (!c) {
      c = {
        nome: r.afferenza,
        categoria: r.categoria,
        daIncassare: 0,
        daPagare: 0,
        saldo: 0,
        primoIncasso: null,
        primaUscita: null,
        movimenti: 0,
      };
      conti.set(r.afferenza, c);
    }
    c.movimenti += 1;
    if (r.tipo === "incasso") {
      c.daIncassare += r.importo;
      if (!c.primoIncasso || r.data! < c.primoIncasso) c.primoIncasso = r.data;
    } else {
      c.daPagare += r.daPagare;
      if (r.daPagare > 0 && (!c.primaUscita || r.data! < c.primaUscita)) c.primaUscita = r.data;
    }
  }
  const perCommessa = [...conti.values()]
    .map((c) => ({
      ...c,
      daIncassare: Math.round(c.daIncassare * 100) / 100,
      daPagare: Math.round(c.daPagare * 100) / 100,
      saldo: Math.round((c.daIncassare - c.daPagare) * 100) / 100,
    }))
    // Il peggiore in cima: chi ha bisogno di fondi si deve vedere per primo,
    // non si deve cercare.
    .sort((a, b) => a.saldo - b.saldo || a.nome.localeCompare(b.nome));

  return {
    righe: datate,
    senzaData,
    incassi,
    pagamenti,
    perCommessa,
    totali: {
      daIncassare: somma(incassi, (r) => r.importo),
      daPagare: somma(pagamenti, (r) => r.daPagare),
      // Quello che resta se incasso quello che aspetto e pago quello che devo
      // davvero. Non è la somma algebrica degli importi: un'uscita ancora
      // vincolata a una consegna non pesa sul saldo atteso di questa finestra.
      saldo: somma(incassi, (r) => r.importo) - somma(pagamenti, (r) => r.daPagare),
      senzaData: somma(senzaData, (r) => r.importo),
    },
    valuta: opzioni.valuta,
    intestazione: {
      generatoIl: itaData(iso(oggi)),
      selezione: contesto.selezione,
      finestra: contesto.etichettaFinestra,
      perimetro: ETICHETTA_PERIMETRO[opzioni.perimetro],
    },
  };
}

/* ── CSV ──────────────────────────────────────────────────────────────────── */

const TESTA_CSV = [
  "Data", "Sett.", "Tipo", "Importo", "Valuta", "Importo valuta",
  "Controparte", "Commessa", "Progetto", "Riferimento", "Perché", "Stato", "Da pagare",
];

const TIPO_CSV: Record<TipoRigaScadenza, string> = {
  incasso: "Incasso",
  pagamento_fornitore: "Pagamento · Fornitore",
  pagamento_installatore: "Pagamento · Installatore",
};

/** Il punto e virgola separa, la virgola è decimale: è il CSV che Excel in
 *  italiano apre senza chiedere niente. */
const campo = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const numero = (v: number) => v.toFixed(2).replace(".", ",");

/**
 * Solo l'agenda, una riga per movimento.
 *
 * Le righe senza data ci sono lo stesso, in coda e con la data vuota: in un
 * foglio Excel vivono su una scheda a parte, ma un CSV ha una tabella sola e
 * ometterle vorrebbe dire consegnare un totale che non torna.
 */
export function csvScadenzario(s: Scadenzario): string {
  const riga = (r: RigaScadenza) =>
    [
      r.data ? itaData(r.data) : "",
      r.settimana,
      TIPO_CSV[r.tipo],
      numero(r.importo),
      r.valuta,
      numero(r.importoValuta),
      r.controparte,
      r.commessa,
      r.progetto ?? "",
      r.riferimento,
      r.data ? r.perche : `${r.perche} · ${r.cosaManca}`,
      r.stato,
      r.daPagare ? numero(r.daPagare) : "",
    ]
      .map((v) => campo(String(v)))
      .join(";");

  return [TESTA_CSV.join(";"), ...s.righe.map(riga), ...s.senzaData.map(riga)].join("\r\n");
}

/** `scadenzario_2026-09-22_tutte.xlsx` */
export function nomeFile(s: Scadenzario, opzioni: OpzioniExport, oggi: Date): string {
  const coda =
    opzioni.perimetro === "quattro_settimane"
      ? "4-settimane"
      : opzioni.perimetro === "tutto"
        ? "tutto"
        : s.intestazione.selezione.toLowerCase().includes("tutte")
          ? "tutte"
          : "selezione";
  return `scadenzario_${iso(oggi)}_${coda}.${opzioni.formato}`;
}

export const etichettaMese = (giorno: string) => {
  const d = new Date(giorno + "T00:00:00Z");
  return `${d.getUTCDate()} ${MESI[d.getUTCMonth()]}`;
};

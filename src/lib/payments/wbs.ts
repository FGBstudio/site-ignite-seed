import type { CashEvent, Certezza, Commessa, ProgettoTempi } from "@/types/payments";

/**
 * La WBS di cassa — solo calcolo, nessun React e nessun accesso al database.
 *
 * Il prototipo approvato non è una griglia di celle: è una traccia su cui gli
 * elementi stanno a una posizione. Qui si calcolano quindi *elementi
 * posizionati*, non somme per casella: le somme restano, ma servono al
 * rendiconto e alla striscia di cassa.
 *
 * Le regole che decidono se i numeri sono difendibili:
 *
 *  1. Il saldo cumulato parte da «Pregresso», che raccoglie tutto quello che
 *     sta prima della finestra visibile. Un lotto pagato a settembre 2025 pesa
 *     sul saldo di oggi anche se non si vede più.
 *
 *  2. Un evento senza data non sparisce: finisce nell'ultima colonna, che è
 *     anche la lista di cosa andare a chiedere.
 *
 *  3. Le quote di progetto si vedono ma non si sommano. I flussi veri vivono
 *     sulle righe dei cicli; le righe di progetto sono la ripartizione dello
 *     stesso denaro, e contarle due volte gonfierebbe ogni totale.
 *
 *  4. Più si sale, più si raggruppa. Su una riga di sintesi non servono i
 *     singoli movimenti: servono le cadenze. Il dettaglio sta sempre un
 *     livello sotto, ed è lì che uno va a cercarlo.
 */

export interface Settimana {
  inizio: string | null;
  chiave: string;
  etichetta: string;
  sotto: string;
  pregresso: boolean;
  senzaData: boolean;
  corrente: boolean;
}

/**
 * Quattro colori in tutta la vista, mai un quinto: verde per quello che entra,
 * il rosso più scuro per i fornitori, la terracotta per gli installatori, il
 * grigio per le durate — che sono tempo, non denaro.
 */
export type Lane = "in" | "forn" | "inst" | "po";

/** Un movimento singolo, con importo e titolo scritti accanto al marker. */
export interface Milestone {
  id: string;
  colonna: number;
  lane: Lane;
  importo: number;
  /** Lo stesso importo com'è scritto sul contratto, e in che valuta. */
  importoValuta: number;
  valuta: string;
  titolo: string;
  dettaglio: string;
  stato: string;
  quota: boolean;
  /** Non è cassa: è la fattura, non il denaro. Grigio, nessun segno. */
  documentale: boolean;
  /**
   * Da che parte sta il documento.
   *
   * Una fattura che emettiamo e una che riceviamo sono due fatti opposti — una
   * la decidiamo noi, l'altra ci arriva — e sulla traccia devono distinguersi
   * senza leggere l'etichetta.
   */
  documento?: "emessa" | "ricevuta";
  /** La data da mostrare, quando non è quella di cassa dell'evento. */
  giorno?: string | null;
  flag?: "STIMA" | "EXTRA";
  certezza: Certezza | null;
  progetto: string | null;
  percorso: string;
}

/** Una cadenza: più movimenti della stessa settimana, sommati. */
export interface Aggregato {
  chiave: string;
  colonna: number;
  lane: Lane;
  importo: number;
  quanti: number;
  etichetta: string;
  /** Le prime voci per importo, per l'elenco dentro la nuvoletta. */
  voci: Array<{ titolo: string; importo: number }>;
  /**
   * La valuta comune, se ce n'è una.
   *
   * Nulla quando il gruppo ne mescola più d'una: la somma esiste solo in euro,
   * perché sommare renminbi e dollari non dà un numero, dà un errore.
   */
  valuta: string | null;
  importoValuta: number;
  /** Da che parte stanno i documenti, se stanno tutti dalla stessa. */
  documento: "emessa" | "ricevuta" | null;
  /** Vero solo se lo sono tutti: una somma di quote non è cassa. */
  quota: boolean;
  /**
   * La certezza del pezzo meno certo che contiene.
   *
   * Aggregare non rende certo niente: se dentro c'è anche un solo movimento
   * previsto, il totale è previsto e va tratteggiato. Pieno vuol dire
   * «questo denaro si è mosso», e di un totale misto non è vero.
   */
  certezza: Certezza | null;
}

/** Cosa sta sulla traccia in quel punto: o un movimento, o una cadenza. */
export type Elemento =
  | { tipo: "singola"; posto: number; m: Milestone }
  | { tipo: "gruppo"; posto: number; a: Aggregato };

export interface Barra {
  colonna: number;
  durata: number;
  lane: Lane;
  testo: string;
  dettaglio: string;
  stimata: boolean;
}

export interface Inviluppo {
  da: number;
  a: number;
  segmenti: Array<{ da: number; durata: number }>;
}

export type TipoRiga = "master" | "categoria" | "commessa" | "gruppo" | "voce" | "progetto";

export interface Riga {
  chiave: string;
  nome: string;
  sotto?: string;
  livello: number;
  tipo: TipoRiga;
  corsia?: "cliente" | "fornitore" | "installatore";
  netto: number[];
  entrate: number[];
  uscite: number[];
  totale: number;
  /**
   * Le quote che passano da questa riga, tenute fuori da ogni somma.
   *
   * Servono perché una riga può avere zero di cassa e un marker da 44.000:
   * senza un posto dove dirlo, quei due numeri si leggono come una
   * contraddizione invece che come due cose diverse.
   */
  quote: number;
  cumulato?: number[];
  /** Tutti i movimenti del sottoalbero: serve al pannello, non al disegno. */
  milestones: Milestone[];
  /** Cosa disegnare, già raggruppato secondo il livello della riga. */
  elementi: Elemento[];
  barre: Barra[];
  inviluppo?: Inviluppo;
  vita?: { da: number; a: number };
  altezza: number;
  figli?: Riga[];
  scarto?: number | null;
  valoreDichiarato?: number | null;
  /** Solo sulle commesse: saldo diviso entrate. */
  resa?: number | null;
  /** Solo sulle categorie: quante commesse sono accese su quante esistono. */
  conteggio?: { viste: number; totali: number };
  /** Solo sulle commesse: serve alle azioni Isola e Nascondi. */
  commessa?: string;
}

const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

export function lunedi(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

function numeroSettimana(d: Date): number {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() + 4 - ((x.getUTCDay() + 6) % 7));
  const capodanno = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return Math.ceil(((x.getTime() - capodanno.getTime()) / 86400000 + 1) / 7);
}

/** Pregresso, N settimane centrate su oggi, Senza data. */
export function costruisciSettimane(oggi: Date, indietro = 4, avanti = 16): Settimana[] {
  const base = lunedi(oggi);
  const oggiLun = iso(base);

  const centro: Settimana[] = [];
  for (let i = -indietro; i < avanti; i++) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + i * 7);
    centro.push({
      inizio: iso(d),
      chiave: iso(d),
      etichetta: "S" + numeroSettimana(d),
      sotto: `${d.getUTCDate()} ${MESI[d.getUTCMonth()]}`,
      pregresso: false,
      senzaData: false,
      corrente: iso(d) === oggiLun,
    });
  }

  return [
    { inizio: null, chiave: "pregresso", etichetta: "Pregresso", sotto: "prima della finestra", pregresso: true, senzaData: false, corrente: false },
    ...centro,
    { inizio: null, chiave: "senza_data", etichetta: "Senza data", sotto: "da definire", pregresso: false, senzaData: true, corrente: false },
  ];
}

/**
 * In quale colonna cade una data.
 *
 * Prima della finestra finisce in Pregresso; dopo la finestra nell'ultima
 * settimana visibile, perché un incasso previsto fra otto mesi conta lo stesso
 * sul saldo finale anche se non merita una colonna sua.
 */
export function colonnaDi(giorno: string | null, settimane: Settimana[]): number {
  const senzaData = settimane.length - 1;
  if (!giorno) return senzaData;

  const prima = settimane[1]?.inizio;
  const ultima = settimane[settimane.length - 2]?.inizio;
  if (!prima || !ultima) return senzaData;

  if (giorno < prima) return 0;
  for (let i = settimane.length - 2; i >= 1; i--) {
    const ini = settimane[i].inizio;
    if (ini && ini <= giorno) return i;
  }
  return 0;
}

const zeri = (n: number) => Array.from({ length: n }, () => 0);

function nuovaRiga(chiave: string, nome: string, livello: number, tipo: TipoRiga, n: number, sotto?: string): Riga {
  return {
    chiave, nome, sotto, livello, tipo,
    netto: zeri(n), entrate: zeri(n), uscite: zeri(n),
    totale: 0, quote: 0, milestones: [], elementi: [], barre: [], altezza: 44,
  };
}

function somma(dest: Riga, src: Riga) {
  src.netto.forEach((v, i) => {
    dest.netto[i] += v;
    dest.entrate[i] += src.entrate[i];
    dest.uscite[i] += src.uscite[i];
  });
  dest.quote += src.quote;
}

const chiudi = (r: Riga) => { r.totale = r.netto.reduce((s, v) => s + v, 0); };

export function cumulato(netto: number[]): number[] {
  let run = 0;
  return netto.map((v) => (run += v));
}

/* ── Traduzione evento → milestone ────────────────────────────────────────── */

const LANE_DI_CORSIA: Record<string, Lane> = {
  cliente: "in",
  fornitore: "forn",
  installatore: "inst",
};

/** «FoSensor · 40% prima della spedizione» → «40% prima della spedizione». */
function titoloBreve(etichetta: string | null, ripiego: string): string {
  if (!etichetta) return ripiego;
  const i = etichetta.indexOf(" · ");
  return i >= 0 ? etichetta.slice(i + 3) : etichetta;
}

/**
 * Un evento diventa un marker.
 *
 * `quota` arriva sia dal chiamante — le righe di progetto mostrano quote per
 * costruzione — sia dal dato stesso: una spesa ripartita su una commessa è
 * marcata così in database, e va rispettata a prescindere da dove la si
 * disegna.
 */
function milestoneDa(ev: CashEvent, settimane: Settimana[], percorso: string, quota: boolean): Milestone {
  return {
    id: ev.id,
    colonna: colonnaDi(ev.settimana ?? ev.data, settimane),
    lane: LANE_DI_CORSIA[ev.corsia] ?? "forn",
    importo: ev.importo_eur,
    importoValuta: ev.importo_valuta ?? ev.importo_eur,
    valuta: ev.valuta ?? "EUR",
    titolo: titoloBreve(ev.etichetta, ev.gruppo),
    dettaglio: [ev.progetto ?? ev.brand, ev.data ?? "senza data"].filter(Boolean).join(" · "),
    stato: ev.stato ?? "previsto",
    quota: quota || ev.natura === "quota",
    documentale: false,
    flag: ev.certezza === "stimata" ? "STIMA" : undefined,
    certezza: ev.certezza,
    progetto: ev.progetto,
    percorso,
  };
}

/**
 * Il segno grigio dell'emissione.
 *
 * Una fattura emessa non è un'uscita: è il momento in cui parte il conto alla
 * rovescia dei termini. Tenerla sulla stessa data del pagamento — come faceva
 * questa griglia fino a ieri — vuol dire dire una cosa falsa due volte: che la
 * fattura sia denaro, e che il denaro sia uscito quando è stata scritta.
 *
 * Esce solo se cade in una settimana diversa dalla cassa: quando coincidono,
 * un secondo marker nello stesso punto non aggiunge niente e toglie spazio.
 */
function documentoDa(
  ev: CashEvent,
  settimane: Settimana[],
  percorso: string,
  suffisso = "doc",
): Milestone | null {
  if (ev.natura !== "cassa" || !ev.data_documento) return null;
  const col = colonnaDi(ev.data_documento, settimane);
  if (col === colonnaDi(ev.settimana ?? ev.data, settimane)) return null;
  return {
    id: `${ev.id}:${suffisso}`,
    colonna: col,
    lane: "po",
    importo: ev.importo_eur,
    importoValuta: ev.importo_valuta ?? ev.importo_eur,
    valuta: ev.valuta ?? "EUR",
    titolo: ev.verso === "entrata" ? "Fattura emessa" : "Fattura ricevuta",
    dettaglio: [ev.etichetta, ev.data_documento].filter(Boolean).join(" · "),
    stato: "emessa",
    quota: false,
    documentale: true,
    documento: ev.verso === "entrata" ? "emessa" : "ricevuta",
    certezza: null,
    progetto: ev.progetto,
    percorso,
    giorno: ev.data_documento,
  };
}

function accumula(r: Riga, ev: CashEvent, col: number) {
  // Una quota non è denaro che si muove: è la fetta di una spesa già contata
  // altrove. Sta da parte, e si dice che c'è.
  if (ev.natura !== "cassa") {
    r.quote += ev.importo_eur;
    return;
  }
  if (ev.importo_eur >= 0) r.entrate[col] += ev.importo_eur;
  else r.uscite[col] += ev.importo_eur;
  r.netto[col] += ev.importo_eur;
}

/* ── Disposizione sulla traccia ───────────────────────────────────────────── */

/**
 * Quanti marker può portare una settimana, su qualunque riga.
 *
 * Tre, e sono le tre controparti: chi paga, chi fornisce, chi installa. Oltre
 * questo numero la colonna smette di essere leggibile a colpo d'occhio, ed è
 * esattamente il punto in cui un totale vale più di un elenco.
 */
const MAX_MARKER = 3;

/** Verde a sinistra, poi i due rossi: l'ordine è fisso, così l'occhio sa dove
 *  guardare senza rileggere il colore ogni volta. */
const ORDINE_LANE: Lane[] = ["in", "forn", "inst", "po"];

/**
 * In quale fila va un marker.
 *
 * Il documento sta per conto suo, in fondo e in grigio: non è denaro, e
 * metterlo in fila con le frecce lo farebbe contare come tale. Per il resto il
 * verso decide prima della corsia — un accredito da un fornitore resta
 * comunque un'entrata.
 */
const direzione = (m: Milestone): Lane =>
  m.documentale ? "po" : m.importo > 0 ? "in" : m.lane === "inst" ? "inst" : "forn";

/**
 * Cosa entra nel disegno.
 *
 * `sintesi` è la cassa e basta; `quote` è la ripartizione e basta — sono due
 * cose che non vanno mai sommate insieme, e tenerle su righe diverse è il modo
 * di garantirlo per costruzione. `dettaglio` mostra quello che c'è.
 */
export type Modo = "sintesi" | "quote" | "dettaglio";

/**
 * Cosa disegnare in ogni settimana.
 *
 * Due regole, e nessuna soglia da indovinare:
 *
 *  • Sulle righe di sintesi c'è sempre un marker per fila, col totale. Chi
 *    guarda «Cassa di tutte le commesse» vuole sapere quanto entra e quanto
 *    esce quella settimana, non quali ottanta movimenti lo compongono: la
 *    composizione sta nella nuvoletta, che è dove si va a cercarla.
 *
 *  • Sulle righe di dettaglio i movimenti restano singoli finché stanno in
 *    tre. Dal quarto in poi la colonna collassa sui totali di fila, perché è
 *    lì che una pila di frecce smette di dire qualcosa.
 *
 * «Pregresso» non è una settimana: è tutto quello che sta prima della
 * finestra, e va riassunto ovunque — anche su una riga di dettaglio, dove
 * altrimenti diventerebbe la fila di frecce che la colonna esiste per evitare.
 *
 * Le quote non sono cassa. Sulle righe di sintesi non si disegnano affatto:
 * il loro posto è la riga inviluppo e le righe di progetto, dove sono il
 * contenuto e non un doppione.
 */
export function disponi(ms: Milestone[], prefisso: string, modo: Modo): Elemento[] {
  // I documenti passano in tutte e tre le modalità: una fattura non è né
  // cassa né quota, è il fatto che sta prima di entrambe, e toglierla dalla
  // riga inviluppo faceva sparire l'emissione proprio sulle commesse a
  // progetto unico, dove l'inviluppo *è* il progetto.
  const scelti =
    modo === "sintesi" ? ms.filter((m) => !m.quota || m.documentale)
      : modo === "quote" ? ms.filter((m) => m.quota || m.documentale)
        : ms;
  const vivi = scelti.filter((m) => m.importo !== 0);

  const perColonna = new Map<number, Map<Lane, Milestone[]>>();
  for (const m of vivi) {
    if (!perColonna.has(m.colonna)) perColonna.set(m.colonna, new Map());
    const file = perColonna.get(m.colonna)!;
    const d = direzione(m);
    if (!file.has(d)) file.set(d, []);
    file.get(d)!.push(m);
  }

  const out: Elemento[] = [];

  for (const [col, file] of perColonna) {
    // Il documento non conta verso la soglia: sta nella sua fila e non
    // toglie spazio alle frecce, quindi non è lui a farle collassare.
    const quanti = [...file.entries()].reduce(
      (s, [lane, l]) => s + (lane === "po" ? 0 : l.length),
      0,
    );
    const singoli = modo === "dettaglio" && col !== 0 && quanti <= MAX_MARKER;
    let posto = 0;

    for (const lane of ORDINE_LANE) {
      const lista = file.get(lane);
      if (!lista?.length) continue;
      lista.sort((a, b) => Math.abs(b.importo) - Math.abs(a.importo));

      // Raggruppare un movimento solo non nasconde niente e costa il suo
      // titolo: sotto quella soglia il marker resta il movimento.
      if (singoli || lista.length === 1) {
        lista.forEach((m) => out.push({ tipo: "singola", posto: posto++, m }));
      } else {
        out.push({ tipo: "gruppo", posto: posto++, a: aggrega(lista, lane, col, prefisso) });
      }
    }
  }

  return out.sort((a, b) => colonnaDi_(a) - colonnaDi_(b) || a.posto - b.posto);
}

/**
 * Quanto è certo un totale: quanto il suo elemento meno certo.
 *
 * Prima prendevo la certezza comune quando tutti concordavano e niente
 * altrimenti — e «niente» finiva disegnato pieno. Risultato: una settimana con
 * dentro un pagamento avvenuto e tre previsti si leggeva come tutta avvenuta.
 * Una somma non è più sicura del suo pezzo più incerto, mai.
 */
const RANGO: Record<string, number> = { reale: 0, contrattuale: 1, prevista: 2, stimata: 3 };

function aggrega(lista: Milestone[], lane: Lane, col: number, prefisso: string): Aggregato {
  const prima = lista.reduce<Certezza | null>((peggio, m) => {
    const r = m.certezza ? RANGO[m.certezza] : 3;
    const p = peggio ? RANGO[peggio] : -1;
    return r > p ? m.certezza : peggio;
  }, null);
  // Una valuta sola per tutti, oppure nessuna: un totale in «renminbi e
  // dollari insieme» non e' un numero.
  const unaSola = lista.every((m) => m.valuta === lista[0].valuta) ? lista[0].valuta : null;
  return {
    chiave: `${prefisso}:${col}:${lane}`,
    colonna: col,
    lane,
    importo: lista.reduce((s, m) => s + m.importo, 0),
    quanti: lista.length,
    etichetta: NOME_CORSIA[lane],
    voci: lista.slice(0, 4).map((m) => ({ titolo: m.titolo, importo: m.importo })),
    valuta: unaSola,
    importoValuta: unaSola ? lista.reduce((s, m) => s + m.importoValuta, 0) : 0,
    documento: lista.every((m) => m.documento === lista[0].documento)
      ? (lista[0].documento ?? null)
      : null,
    quota: lista.every((m) => m.quota),
    certezza: lista.every((m) => m.certezza === prima) ? prima : null,
  };
}

const colonnaDi_ = (e: Elemento) => (e.tipo === "singola" ? e.m.colonna : e.a.colonna);

const NOME_CORSIA: Record<string, string> = {
  in: "incassi cliente",
  forn: "uscite fornitori",
  inst: "uscite installatori",
  // Neutro: se emesse o ricevute lo dice il marker, che sa da che parte sta.
  po: "fatture",
};

/**
 * L'altezza della riga.
 *
 * Le frecce stanno affiancate, ma i loro importi scendono uno sotto l'altro:
 * una colonna larga 104px non regge due «− € 7.355» sulla stessa riga. La riga
 * deve quindi essere alta quanto la settimana con più marker — al massimo tre.
 * Sotto quella soglia vale il minimo del pattern: 64px con la striscia, 46
 * senza.
 */
function altezzaPerPila(elementi: Elemento[], conStriscia: boolean): number {
  const quanti = Math.max(0, ...elementi.map((e) => e.posto + 1));
  const minimo = conStriscia ? 64 : 46;
  if (quanti <= 1) return minimo;
  const ancoraggio = conStriscia ? 15 : 4;
  return Math.max(minimo, 12 + ancoraggio + 18 + 13 * quanti + 4);
}

const CORSIA_DI_GRUPPO: Record<string, Riga["corsia"]> = {
  "Ciclo attivo": "cliente",
  "Acquisto materiali": "fornitore",
  Installatori: "installatore",
  Servizi: "fornitore",
};

const ORDINE_PASSIVO = ["Acquisto materiali", "Installatori", "Servizi"];

/* ── Le serie per commessa, indipendenti dal filtro ───────────────────────── */

export interface SerieCommessa {
  cumulato: number[];
  entrate: number;
  uscite: number;
  saldo: number;
  categoria: string;
  brand: string | null;
}

/**
 * L'andamento di ogni commessa, calcolato su *tutti* gli eventi.
 *
 * Serve alle mini-strisce del filtro, che devono mostrare anche le commesse
 * spente: prenderle dall'albero — che è costruito sui soli eventi accesi —
 * le farebbe sparire proprio quando servono per decidere se riaccenderle.
 */
export function serieCommesse(
  eventi: CashEvent[],
  settimane: Settimana[],
): Map<string, SerieCommessa> {
  const n = settimane.length;
  const out = new Map<string, SerieCommessa>();
  for (const ev of eventi) {
    let s = out.get(ev.commessa);
    if (!s) {
      s = { cumulato: zeri(n), entrate: 0, uscite: 0, saldo: 0, categoria: ev.categoria, brand: ev.brand };
      out.set(ev.commessa, s);
    }
    if (ev.natura !== "cassa") continue;
    s.cumulato[colonnaDi(ev.settimana ?? ev.data, settimane)] += ev.importo_eur;
    if (ev.importo_eur >= 0) s.entrate += ev.importo_eur;
    else s.uscite += ev.importo_eur;
  }
  out.forEach((s) => {
    s.cumulato = cumulato(s.cumulato);
    s.saldo = s.entrate + s.uscite;
  });
  return out;
}

/* ── L'albero ─────────────────────────────────────────────────────────────── */

export function costruisciAlbero(
  eventi: CashEvent[],
  commesse: Commessa[],
  tempi: ProgettoTempi[],
  settimane: Settimana[],
  totaliPerCategoria: Record<string, number> = {},
): Riga[] {
  const n = settimane.length;
  const perNome = new Map(commesse.map((k) => [k.nome, k]));
  const tempiPerCert = new Map(tempi.map((t) => [t.certification_id, t]));

  const perCategoria = new Map<string, Map<string, CashEvent[]>>();
  for (const ev of eventi) {
    const cat = ev.categoria ?? "Non attribuite";
    if (!perCategoria.has(cat)) perCategoria.set(cat, new Map());
    const m = perCategoria.get(cat)!;
    const k = ev.commessa ?? "Senza commessa";
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(ev);
  }

  const categorie: Riga[] = [];

  for (const [nomeCategoria, commesseMap] of perCategoria) {
    const rigaCat = nuovaRiga("cat:" + nomeCategoria, nomeCategoria, 1, "categoria", n);
    const figliCommessa: Riga[] = [];

    for (const [nomeCommessa, lista] of commesseMap) {
      const meta = perNome.get(nomeCommessa);
      const percorsoK = `${nomeCategoria} › ${nomeCommessa}`;
      const rigaK = nuovaRiga(`k:${nomeCommessa}`, nomeCommessa, 2, "commessa", n,
        [meta?.contratto_cliente, meta?.anno ? String(meta.anno) : null].filter(Boolean).join(" · ") || undefined);
      rigaK.commessa = nomeCommessa;

      // ── Le voci: ciclo attivo e le voci del passivo ──
      const voci = new Map<string, Riga>();
      for (const ev of lista) {
        const g = ev.gruppo ?? (ev.verso === "entrata" ? "Ciclo attivo" : "Acquisto materiali");
        if (!voci.has(g)) {
          const r = nuovaRiga(`k:${nomeCommessa}:g:${g}`, g, 4, "voce", n);
          r.corsia = CORSIA_DI_GRUPPO[g] ?? "fornitore";
          voci.set(g, r);
        }
        const r = voci.get(g)!;
        accumula(r, ev, colonnaDi(ev.settimana ?? ev.data, settimane));
        r.milestones.push(milestoneDa(ev, settimane, `${percorsoK} › ${g}`, false));
        const doc = documentoDa(ev, settimane, `${percorsoK} › ${g}`);
        if (doc) r.milestones.push(doc);
      }
      // Sui cicli il singolo movimento ha ancora un senso: si vede da chi
      // viene e quanto vale. È dal quarto che serve un totale.
      voci.forEach((r) => {
        chiudi(r);
        r.elementi = disponi(r.milestones, r.chiave, "dettaglio");
        r.altezza = altezzaPerPila(r.elementi, false);
      });

      const attivo = voci.get("Ciclo attivo") ?? (() => {
        const r = nuovaRiga(`k:${nomeCommessa}:g:Ciclo attivo`, "Ciclo attivo", 3, "voce", n);
        r.corsia = "cliente";
        return r;
      })();
      attivo.livello = 3;
      attivo.sotto = "inviluppo degli incassi di tutti i siti";

      const passivo = nuovaRiga(`k:${nomeCommessa}:passivo`, "Ciclo passivo", 3, "gruppo", n);
      passivo.figli = ORDINE_PASSIVO.map((g) => voci.get(g)).filter(Boolean) as Riga[];
      passivo.figli.forEach((v) => somma(passivo, v));
      chiudi(passivo);
      // I costi si vedono anche a contenitore chiuso: sono la risposta alla
      // domanda «quanto ci costa», e non deve servire un clic per averla.
      passivo.milestones = passivo.figli.flatMap((v) => v.milestones);
      passivo.elementi = disponi(passivo.milestones, passivo.chiave, "sintesi");
      passivo.altezza = altezzaPerPila(passivo.elementi, false);
      passivo.sotto = passivo.figli.map((v) => v.nome.toLowerCase()).join(" · ") || "nessun costo registrato";

      // ── Elenco progetti ──
      const progetti = new Map<string, Riga>();
      for (const ev of lista) {
        if (!ev.certification_id) continue;
        let r = progetti.get(ev.certification_id);
        if (!r) {
          r = nuovaRiga(`k:${nomeCommessa}:p:${ev.certification_id}`, ev.progetto ?? "—", 4, "progetto", n, ev.citta ?? undefined);
          const t = tempiPerCert.get(ev.certification_id);
          if (t?.data_materiali) {
            r.barre.push({ colonna: colonnaDi(t.data_materiali, settimane), durata: 1, lane: "po", testo: "Merce", dettaglio: `Acquisto materiali · ${t.data_materiali}`, stimata: false });
          }
          if (t?.data_installazione) {
            r.barre.push({ colonna: colonnaDi(t.data_installazione, settimane), durata: 1, lane: "inst", testo: "Installazione", dettaglio: `Installazione · ${t.data_installazione}`, stimata: false });
          }
          progetti.set(ev.certification_id, r);
        }
        accumula(r, ev, colonnaDi(ev.settimana ?? ev.data, settimane));
        r.milestones.push(milestoneDa(ev, settimane, `${percorsoK} › ${r.nome}`, true));
        // Anche sul singolo sito si vede quando la fattura è uscita o
        // arrivata: è la riga su cui si va a cercare perché un incasso
        // tarda, e senza il documento manca proprio il primo anello.
        const doc = documentoDa(ev, settimane, `${percorsoK} › ${r.nome}`, "doc-p");
        if (doc) r.milestones.push(doc);
      }
      progetti.forEach((r) => {
        chiudi(r);
        r.elementi = disponi(r.milestones, r.chiave, "dettaglio");
        const xs = [
          ...r.barre.map((b) => b.colonna),
          ...r.barre.map((b) => b.colonna + b.durata - 1),
          ...r.milestones.map((m) => m.colonna),
        ].filter((v) => v < n - 1);
        if (xs.length > 1) r.vita = { da: Math.min(...xs), a: Math.max(...xs) };
        r.altezza = altezzaPerPila(r.elementi, false);
      });

      // Con un solo progetto l'elenco è un contenitore attorno a niente: la
      // riga «1 sito» e la riga del sito dicono la stessa cosa due volte, e
      // costringono a un clic per arrivare a un livello che non aggiunge
      // nulla. Allora l'elenco *è* quel progetto, e sale di un gradino.
      const soloUno = progetti.size === 1;
      const elenco = nuovaRiga(
        `k:${nomeCommessa}:progetti`,
        soloUno ? [...progetti.values()][0].nome : "Elenco progetti",
        3,
        "gruppo",
        n,
      );
      const siti = [...progetti.values()].sort((a, b) => a.nome.localeCompare(b.nome));
      // I figli si mostrano solo quando sono più d'uno; i conti si fanno
      // comunque su tutti, altrimenti la commessa a progetto unico perderebbe
      // la sua banda di installazione e i suoi marker.
      elenco.figli = soloUno ? [] : siti;
      elenco.sotto = soloUno
        ? (siti[0].sotto ?? "installazioni e quote del sito")
        : `${siti.length} siti · installazioni e quote`;
      siti.forEach((p) => somma(elenco, p));
      chiudi(elenco);

      const tuttiX = siti.flatMap((p) => [
        ...p.barre.map((b) => b.colonna),
        ...p.milestones.map((m) => m.colonna),
      ]).filter((v) => v < n - 1);
      if (tuttiX.length) {
        elenco.inviluppo = {
          da: Math.min(...tuttiX),
          a: Math.max(...tuttiX),
          segmenti: siti
            .flatMap((p) => p.barre.filter((b) => b.lane === "inst"))
            .map((b) => ({ da: b.colonna, durata: b.durata })),
        };
      }
      elenco.milestones = siti.flatMap((p) => p.milestones);
      // L'inviluppo è una riga di sintesi come le altre: un marker per fila,
      // col totale. Ma quello che riassume sono quote, non cassa — qui la
      // ripartizione *è* il punto della riga — e restano marcate come tali,
      // così si vede il totale senza che possa finire in una somma.
      elenco.elementi = disponi(elenco.milestones, elenco.chiave, "quote");
      // Banda sopra, etichette sotto: la riga deve contenerle entrambe senza
      // che l'una finisca addosso all'altra.
      elenco.altezza = altezzaPerPila(elenco.elementi, false);

      rigaK.figli = [attivo, passivo, ...(siti.length ? [elenco] : [])];
      somma(rigaK, attivo);
      somma(rigaK, passivo);
      chiudi(rigaK);
      rigaK.cumulato = cumulato(rigaK.netto);
      rigaK.milestones = [...attivo.milestones, ...passivo.milestones];
      rigaK.elementi = disponi(rigaK.milestones, rigaK.chiave, "sintesi");
      rigaK.altezza = altezzaPerPila(rigaK.elementi, true);

      const entrateK = rigaK.entrate.reduce((s, v) => s + v, 0);
      rigaK.resa = entrateK > 0 ? rigaK.totale / entrateK : null;

      rigaK.valoreDichiarato = meta?.valore_dichiarato ?? null;
      rigaK.scarto = meta?.valore_dichiarato != null
        ? Math.round((meta.valore_dichiarato - entrateK) * 100) / 100
        : null;

      figliCommessa.push(rigaK);
      somma(rigaCat, rigaK);
    }

    figliCommessa.sort((a, b) => Math.abs(b.totale) - Math.abs(a.totale));
    rigaCat.figli = figliCommessa;
    const totali = totaliPerCategoria[nomeCategoria] ?? figliCommessa.length;
    rigaCat.conteggio = { viste: figliCommessa.length, totali };
    rigaCat.sotto =
      figliCommessa.length === totali
        ? `${totali} commesse`
        : `${figliCommessa.length} di ${totali} commesse`;
    chiudi(rigaCat);
    rigaCat.cumulato = cumulato(rigaCat.netto);
    rigaCat.milestones = figliCommessa.flatMap((k) => k.milestones);
    rigaCat.elementi = disponi(rigaCat.milestones, rigaCat.chiave, "sintesi");
    rigaCat.altezza = altezzaPerPila(rigaCat.elementi, true);
    categorie.push(rigaCat);
  }

  const peso = (s: string) => (s === "Energy" ? 0 : s === "Air" ? 1 : s === "Non attribuite" ? 9 : 5);
  categorie.sort((a, b) => peso(a.nome) - peso(b.nome) || a.nome.localeCompare(b.nome));

  const master = nuovaRiga("master", "Cassa di tutte le commesse", 0, "master", n);
  categorie.forEach((c) => somma(master, c));
  chiudi(master);
  master.cumulato = cumulato(master.netto);
  master.milestones = categorie.flatMap((c) => c.milestones);
  master.elementi = disponi(master.milestones, master.chiave, "sintesi");
  master.altezza = altezzaPerPila(master.elementi, true);
  master.figli = categorie;

  return [master];
}

export function rendiconto(master: Riga) {
  return {
    entrate: master.entrate,
    uscite: master.uscite,
    netto: master.netto,
    saldo: cumulato(master.netto),
  };
}

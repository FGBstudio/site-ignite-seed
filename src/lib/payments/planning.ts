import type { CashEvent, ProgettoTempi } from "@/types/payments";
import { numeroSettimana, type Settimana } from "./wbs";

/**
 * Il planning settimanale — solo calcolo, nessun React, nessun ExcelJS.
 *
 * È la seconda lettura della stessa cassa. La WBS mette le commesse sulle
 * righe e chiede «com'è messa la cassa»; il planning mette le *misure* sulle
 * righe e chiede «cosa succede settimana per settimana»: quanto è già entrato,
 * quanto ci si aspetta, quante installazioni, quanto costa. Sono due domande
 * diverse, e l'amministrazione lavora sulla seconda.
 *
 * Tre scelte che vale la pena difendere.
 *
 *  1. **«Dopo il periodo» è una colonna sua.** La griglia a schermo appoggia
 *     tutto ciò che sta oltre la finestra sull'ultima settimana visibile: lì va
 *     bene, perché quella colonna è il bordo dello schermo e non una data. Su un
 *     foglio no — l'ultima settimana sembrerebbe enorme e ci si chiederebbe cosa
 *     ci sia dentro. Un incasso fra otto mesi conta sul saldo finale e non
 *     appartiene a novembre.
 *
 *  2. **Avvenuto e previsto sono due righe, non due colori.** Sommarli e
 *     colorarli diversamente funziona a schermo, dove si può passare sopra col
 *     mouse. Su un foglio che finisce in una riunione servono due numeri
 *     leggibili separatamente: «ho incassato X, mi aspetto Y» è la frase che
 *     quel foglio deve dire.
 *
 *  3. **Le installazioni si contano, non si sommano.** Sono l'unica riga che
 *     non è denaro, e proprio per questo è quella che spiega le altre: la
 *     seconda tranche scatta all'installazione, quindi la riga degli incassi
 *     previsti è leggibile solo accanto a quella dei cantieri.
 */

/* ── L'asse ────────────────────────────────────────────────────────────────── */

export interface ColonnaPlanning {
  chiave: string;
  etichetta: string;
  /** Il lunedì della settimana, quando è una settimana vera. */
  lunedi: string | null;
  /** Vero per i tre raccoglitori: prima, dopo, senza data. */
  coda: boolean;
  corrente: boolean;
}

export const PRIMA = "prima";
export const DOPO = "dopo";
export const SENZA_DATA = "senza_data";

/**
 * L'asse del planning, ricavato dalle settimane della vista.
 *
 * Le settimane sono le stesse — così il foglio e lo schermo non discordano su
 * quale sia la finestra — ma i raccoglitori diventano tre invece di due: prima,
 * dopo, senza data.
 */
export function asseDi(settimane: Settimana[]): ColonnaPlanning[] {
  const vere = settimane.filter((s) => !s.pregresso && !s.senzaData);
  return [
    { chiave: PRIMA, etichetta: "Prima del periodo", lunedi: null, coda: true, corrente: false },
    ...vere.map((s) => ({
      chiave: s.chiave,
      etichetta: s.inizio ? `Sett. ${numeroSettimana(new Date(s.inizio))}` : s.etichetta,
      lunedi: s.inizio,
      coda: false,
      corrente: s.corrente,
    })),
    { chiave: DOPO, etichetta: "Dopo il periodo", lunedi: null, coda: true, corrente: false },
    { chiave: SENZA_DATA, etichetta: "Senza data", lunedi: null, coda: true, corrente: false },
  ];
}

/** In quale colonna del planning cade una data. */
export function colonnaPlanning(giorno: string | null, asse: ColonnaPlanning[]): number {
  if (!giorno) return asse.length - 1;
  const vere = asse.filter((c) => !c.coda);
  if (!vere.length) return asse.length - 1;

  const prima = vere[0].lunedi!;
  if (giorno < prima) return 0;

  for (let i = vere.length - 1; i >= 0; i--) {
    if (vere[i].lunedi! <= giorno) {
      // L'ultima settimana vera copre solo i suoi sette giorni: oltre, è «dopo».
      if (i === vere.length - 1) {
        const fine = new Date(vere[i].lunedi!);
        fine.setUTCDate(fine.getUTCDate() + 7);
        if (giorno >= fine.toISOString().slice(0, 10)) return asse.length - 2;
      }
      return i + 1;
    }
  }
  return 0;
}

/** «2026-W43»: la settimana come la scrive l'amministrazione nei suoi fogli. */
export function settimanaIso(giorno: string | null): string | null {
  if (!giorno) return null;
  const d = new Date(giorno);
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() + 4 - ((x.getUTCDay() + 6) % 7));
  return `${x.getUTCFullYear()}-W${String(numeroSettimana(d)).padStart(2, "0")}`;
}

/* ── Le misure ─────────────────────────────────────────────────────────────── */

export type Genere =
  | "incassi_avvenuti"
  | "incassi_previsti"
  | "totale_incassi"
  | "installazioni"
  | "materiali"
  | "installatore"
  | "servizi"
  | "totale_passivo"
  | "saldo"
  | "cumulato";

export interface Misura {
  genere: Genere;
  nome: string;
  serie: number[];
  totale: number;
  /** Le installazioni sono un conteggio: non vanno formattate come euro. */
  conteggio: boolean;
}

export interface Blocco {
  nome: string;
  /** L'inviluppo è la somma di tutti: è l'unico che porta il saldo cumulato. */
  inviluppo: boolean;
  attivo: Misura[];
  passivo: Misura[];
  saldo: Misura;
  cumulato?: Misura;
}

export interface RigaProgetto {
  progetto: string;
  commessa: string;
  /** Quello che resta da incassare: la ragione per cui il progetto è in lista. */
  rimanente: number;
  /** Gli incassi per colonna, avvenuti e previsti insieme. */
  incassi: number[];
  colonnaInstallazione: number | null;
  /** Falso quando la data è una previsione: il cantiere non c'è ancora stato. */
  installazioneReale: boolean;
  settInstallazione: string | null;
  settPagPrevisto: string | null;
  settPagEffettivo: string | null;
}

export interface Planning {
  asse: ColonnaPlanning[];
  blocchi: Blocco[];
  progetti: RigaProgetto[];
}

/**
 * Da che riga del passivo passa un'uscita.
 *
 * I nomi sono quelli del foglio dell'amministrazione, i gruppi quelli della
 * vista di cassa: la traduzione sta scritta qui una volta, invece di essere
 * indovinata due volte.
 */
const RIGA_PASSIVA: Record<string, Genere> = {
  "Acquisto materiali": "materiali",
  Installatori: "installatore",
  Servizi: "servizi",
};

const NOME_MISURA: Record<Genere, string> = {
  incassi_avvenuti: "Incassi avvenuti",
  incassi_previsti: "Incassi previsti",
  totale_incassi: "Totale incassi (avvenuti + previsti)",
  installazioni: "Installazioni (n°)",
  materiali: "Produzione monitor",
  installatore: "Installatore",
  servizi: "Servizi e R&D",
  totale_passivo: "Totale passivo",
  saldo: "SALDO (incassi − passivo)",
  cumulato: "SALDO CUMULATO",
};

const zeri = (n: number) => Array.from({ length: n }, () => 0);

function misura(genere: Genere, n: number): Misura {
  return {
    genere,
    nome: NOME_MISURA[genere],
    serie: zeri(n),
    totale: 0,
    conteggio: genere === "installazioni",
  };
}

const chiudi = (m: Misura): Misura => {
  m.totale = m.serie.reduce((s, v) => s + v, 0);
  return m;
};

/** Somma di più serie, posizione per posizione. */
const sommaSerie = (serie: number[][], n: number): number[] =>
  serie.reduce((acc, s) => acc.map((v, i) => v + (s[i] ?? 0)), zeri(n));

function cumula(serie: number[]): number[] {
  let run = 0;
  return serie.map((v) => (run += v));
}

interface Grezzo {
  avvenuti: number[];
  previsti: number[];
  materiali: number[];
  installatore: number[];
  servizi: number[];
  installazioni: number[];
}

const nuovoGrezzo = (n: number): Grezzo => ({
  avvenuti: zeri(n),
  previsti: zeri(n),
  materiali: zeri(n),
  installatore: zeri(n),
  servizi: zeri(n),
  installazioni: zeri(n),
});

function bloccoDa(nome: string, g: Grezzo, n: number, inviluppo: boolean): Blocco {
  const avvenuti = chiudi({ ...misura("incassi_avvenuti", n), serie: g.avvenuti });
  const previsti = chiudi({ ...misura("incassi_previsti", n), serie: g.previsti });
  const totIncassi = chiudi({
    ...misura("totale_incassi", n),
    serie: sommaSerie([g.avvenuti, g.previsti], n),
  });
  const installazioni = chiudi({ ...misura("installazioni", n), serie: g.installazioni });

  const materiali = chiudi({ ...misura("materiali", n), serie: g.materiali });
  const installatore = chiudi({ ...misura("installatore", n), serie: g.installatore });
  const servizi = chiudi({ ...misura("servizi", n), serie: g.servizi });
  const totPassivo = chiudi({
    ...misura("totale_passivo", n),
    serie: sommaSerie([g.materiali, g.installatore, g.servizi], n),
  });

  const saldo = chiudi({
    ...misura("saldo", n),
    serie: totIncassi.serie.map((v, i) => v - totPassivo.serie[i]),
  });

  const blocco: Blocco = {
    nome,
    inviluppo,
    attivo: [avvenuti, previsti, totIncassi, installazioni],
    passivo: [materiali, installatore, servizi, totPassivo],
    saldo,
  };

  // Il saldo cumulato solo sull'inviluppo. Su una singola commessa sarebbe una
  // curva di cassa che non esiste: la banca è una, e il saldo di mezzo mondo
  // non si somma commessa per commessa.
  if (inviluppo) {
    const c = { ...misura("cumulato", n), serie: cumula(saldo.serie) };
    c.totale = c.serie[c.serie.length - 1] ?? 0;
    blocco.cumulato = c;
  }

  return blocco;
}

/**
 * Il planning, dagli eventi di cassa.
 *
 * `titoloInviluppo` è il nome del primo blocco — «TOTALE COMMESSE ENERGIA
 * (inviluppo)» — perché dipende da cosa si è filtrato, che è cosa questa
 * funzione non sa e non deve sapere.
 */
export function costruisciPlanning(
  eventi: CashEvent[],
  tempi: ProgettoTempi[],
  settimane: Settimana[],
  titoloInviluppo: string,
): Planning {
  const asse = asseDi(settimane);
  const n = asse.length;

  const totale = nuovoGrezzo(n);
  const perCommessa = new Map<string, Grezzo>();
  const grezzoDi = (k: string) => {
    let g = perCommessa.get(k);
    if (!g) perCommessa.set(k, (g = nuovoGrezzo(n)));
    return g;
  };

  /* ── Il denaro ─────────────────────────────────────────────────────────── */

  for (const ev of eventi) {
    // Le quote non sono cassa: sono la fetta di una spesa già contata. Nel
    // planning non hanno posto — un saldo che le comprendesse sarebbe falso —
    // e il loro posto è la WBS, dove si vedono senza entrare in una somma.
    if (ev.natura !== "cassa") continue;

    const col = colonnaPlanning(ev.settimana ?? ev.data, asse);
    const g = grezzoDi(ev.commessa ?? "Senza commessa");

    if (ev.verso === "entrata") {
      const dove = ev.certezza === "reale" ? "avvenuti" : "previsti";
      g[dove][col] += ev.importo_eur;
      totale[dove][col] += ev.importo_eur;
      continue;
    }

    const riga = RIGA_PASSIVA[ev.gruppo ?? ""] ?? "materiali";
    const chiave = riga as "materiali" | "installatore" | "servizi";
    // Le uscite arrivano col segno negativo; il passivo è una grandezza
    // positiva che si sottrae, o il «SALDO (incassi − passivo)» sarebbe una
    // somma travestita da sottrazione.
    g[chiave][col] += -ev.importo_eur;
    totale[chiave][col] += -ev.importo_eur;
  }

  /* ── I cantieri ────────────────────────────────────────────────────────── */

  // Solo i progetti delle commesse che hanno eventi: altrimenti comparirebbero
  // installazioni di commesse che il filtro ha escluso.
  const commessePerCert = new Map<string, string>();
  for (const ev of eventi) {
    if (ev.certification_id && ev.commessa) commessePerCert.set(ev.certification_id, ev.commessa);
  }

  for (const t of tempi) {
    const k = commessePerCert.get(t.certification_id);
    if (!k) continue;
    const quando = t.data_installazione ?? t.installazione_prevista;
    if (!quando) continue;
    const col = colonnaPlanning(quando, asse);
    grezzoDi(k).installazioni[col] += 1;
    totale.installazioni[col] += 1;
  }

  /* ── I blocchi ─────────────────────────────────────────────────────────── */

  const blocchi: Blocco[] = [
    bloccoDa(titoloInviluppo, totale, n, true),
    ...[...perCommessa.entries()]
      .map(([nome, g]) => bloccoDa(nome, g, n, false))
      // Per saldo decrescente: la commessa che porta più margine sta in alto,
      // e quella che sta perdendo si trova in fondo — dove si va a guardare.
      .sort((a, b) => b.saldo.totale - a.saldo.totale),
  ];

  /* ── Il dettaglio per progetto ─────────────────────────────────────────── */

  const incassiPerCert = new Map<string, number[]>();
  const rimanentePerCert = new Map<string, number>();
  const effettivoPerCert = new Map<string, string>();
  const previstoPerCert = new Map<string, string>();

  for (const ev of eventi) {
    if (ev.natura !== "cassa" || ev.verso !== "entrata" || !ev.certification_id) continue;
    const col = colonnaPlanning(ev.settimana ?? ev.data, asse);
    let serie = incassiPerCert.get(ev.certification_id);
    if (!serie) incassiPerCert.set(ev.certification_id, (serie = zeri(n)));
    serie[col] += ev.importo_eur;

    if (ev.certezza === "reale") {
      // L'ultimo incasso avvenuto: è la data da cui si misura il ritardo.
      const attuale = effettivoPerCert.get(ev.certification_id);
      if (ev.data && (!attuale || ev.data > attuale)) {
        effettivoPerCert.set(ev.certification_id, ev.data);
      }
    } else {
      rimanentePerCert.set(
        ev.certification_id,
        (rimanentePerCert.get(ev.certification_id) ?? 0) + ev.importo_eur,
      );
      // Il primo previsto: è il prossimo che deve arrivare.
      const attuale = previstoPerCert.get(ev.certification_id);
      if (ev.data && (!attuale || ev.data < attuale)) {
        previstoPerCert.set(ev.certification_id, ev.data);
      }
    }
  }

  const progetti: RigaProgetto[] = [];
  for (const t of tempi) {
    const k = commessePerCert.get(t.certification_id);
    if (!k) continue;
    const reale = t.data_installazione != null;
    const quando = t.data_installazione ?? t.installazione_prevista;
    progetti.push({
      progetto: t.progetto,
      commessa: k,
      rimanente: rimanentePerCert.get(t.certification_id) ?? 0,
      incassi: incassiPerCert.get(t.certification_id) ?? zeri(n),
      colonnaInstallazione: quando ? colonnaPlanning(quando, asse) : null,
      installazioneReale: reale,
      settInstallazione: settimanaIso(quando),
      settPagPrevisto: settimanaIso(previstoPerCert.get(t.certification_id) ?? null),
      settPagEffettivo: settimanaIso(effettivoPerCert.get(t.certification_id) ?? null),
    });
  }

  // Ordinati per data di installazione, i senza data in fondo: è l'ordine in
  // cui il lavoro arriva, quindi l'ordine in cui va letto.
  progetti.sort((a, b) => {
    const x = a.colonnaInstallazione ?? Number.MAX_SAFE_INTEGER;
    const y = b.colonnaInstallazione ?? Number.MAX_SAFE_INTEGER;
    return x - y || a.progetto.localeCompare(b.progetto);
  });

  return { asse, blocchi, progetti };
}

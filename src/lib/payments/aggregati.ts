import type { Currency, EntityCode, InvoiceRow } from "@/types/payments";

/**
 * I numeri della sezione Payments, calcolati una volta sola.
 *
 * Il residuo di una fattura NON si calcola qui: arriva gia' fatto dalla vista
 * `v_invoices`, che e' la sua unica fonte. Qui si sommano righe. La distinzione
 * e' la ragione per cui questo file puo' esistere senza violare la regola «mai
 * due implementazioni della stessa formula»: sommare non e' calcolare il
 * residuo, e se un giorno la formula del residuo cambiasse, cambierebbe in SQL
 * e questi totali seguirebbero da soli.
 *
 * Tutto quello che sta qui e' puro: nessun accesso al database, nessun React.
 */

/** Le fatture che hanno ancora qualcosa da incassare. */
const aperta = (f: InvoiceRow) => f.residual > 0 && f.lifecycle_state !== "closed";

/**
 * Somma in euro.
 *
 * Valute diverse non si sommano mai direttamente: si passa dal tasso registrato
 * sulla fattura. Usare un tasso di oggi farebbe cambiare il fatturato dell'anno
 * scorso ogni volta che si apre la pagina.
 */
const somma = (righe: InvoiceRow[], quale: (f: InvoiceRow) => number) =>
  righe.reduce((t, f) => t + quale(f), 0);

export interface KpiPortafoglio {
  /** Quanto resta da incassare su tutte le fatture aperte. */
  residuoCrediti: number;
  /** La parte di residuo che sta su fatture gia' pagate in parte. */
  residuoParziali: number;
  /** Quante sono quelle parziali: il numero conta quanto l'importo. */
  fattureParziali: number;
  /** Fatture passate a recupero. Le write-off restano tracciate ma fuori dai crediti. */
  insoluto: number;
  fattureInsolute: number;
  /** Fatture scadute con ancora qualcosa da incassare. */
  scadute: number;
}

export function kpiPortafoglio(righe: InvoiceRow[]): KpiPortafoglio {
  const aperte = righe.filter(aperta);
  const parziali = aperte.filter((f) => f.payment_status === "partial");
  // La write-off e' chiusa e tracciata: contarla fra gli insoluti gonfierebbe
  // un numero che serve a decidere quanto si sta ancora inseguendo.
  const insolute = aperte.filter(
    (f) => f.lifecycle_state === "insoluto" && f.recovery_state !== "write_off",
  );

  return {
    residuoCrediti: somma(aperte, (f) => f.residual_eur),
    residuoParziali: somma(parziali, (f) => f.residual_eur),
    fattureParziali: parziali.length,
    insoluto: somma(insolute, (f) => f.residual_eur),
    fattureInsolute: insolute.length,
    scadute: aperte.filter((f) => f.days_late > 0).length,
  };
}

export interface KpiAnno {
  /** Tutto quello che e' stato emesso nell'anno. */
  lordo: number;
  /** Quanto e' stato stornato con note di credito emesse. */
  noteCredito: number;
  /** Lordo meno note di credito: il numero «Contabilizzato». */
  netto: number;
  fatture: number;
}

/** Il fatturato di un anno solare, per data di emissione. */
export function kpiAnno(righe: InvoiceRow[], anno: number): KpiAnno {
  const dellAnno = righe.filter((f) => new Date(f.issue_date).getFullYear() === anno);
  const lordo = somma(dellAnno, (f) => f.total_eur);
  // Le NC si contano sulla fattura che correggono: una nota emessa quest'anno
  // su una fattura dell'anno scorso appartiene all'anno della fattura, o il
  // fatturato di un anno chiuso cambierebbe a posteriori.
  const nc = somma(dellAnno, (f) => f.credited_amount * f.exch_rate);
  return { lordo, noteCredito: nc, netto: lordo - nc, fatture: dellAnno.length };
}

/**
 * Il lunedì della settimana di una data.
 *
 * Settimana ISO, lunedì–domenica: «fatturato questa settimana» deve voler dire
 * la stessa cosa per tutti, e in Italia la settimana non comincia di domenica.
 */
export function lunediDi(d: Date): Date {
  const g = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  // getDay(): 0 è domenica. Per l'ISO la domenica è il settimo giorno, non il primo.
  const giorno = (g.getDay() + 6) % 7;
  g.setDate(g.getDate() - giorno);
  return g;
}

/** Quanto è stato emesso nella settimana che contiene `oggi`. */
export function fatturatoSettimana(righe: InvoiceRow[], oggi = new Date()) {
  const da = lunediDi(oggi);
  const a = new Date(da);
  a.setDate(a.getDate() + 7);
  const dentro = righe.filter((f) => {
    const e = new Date(f.issue_date);
    return e >= da && e < a;
  });
  return { importo: somma(dentro, (f) => f.total_eur), fatture: dentro.length };
}

/** Tiene solo le fatture di una societa' emittente. `null` = consolidato. */
export function perEntita(righe: InvoiceRow[], entita: EntityCode | null): InvoiceRow[] {
  return entita ? righe.filter((f) => f.entity_code === entita) : righe;
}

/* ── Il futuro: cosa c'è ancora da fatturare ──────────────────────────────── */

export interface Tranche {
  id: string;
  certification_id: string | null;
  name: string | null;
  amount: number | null;
  tranche_state: "pending" | "due" | "invoiced";
  /** La data attesa dell'evento che la rende esigibile, quando si sa. */
  data_attesa?: string | null;
}

export interface Quotazione {
  id: string;
  name: string | null;
  client: string | null;
  status: string;
  total_fees: number | null;
  /** Quando ci si aspetta che si chiuda, per collocarla nel previsionale. */
  data_attesa?: string | null;
}

/**
 * Quanto vale una quotazione ancora da approvare.
 *
 * Una quotazione inviata non è fatturato: è una probabilità. Ponderarla evita
 * il previsionale che somma tutto quello che si spera, che è il modo più rapido
 * di costruire un numero in cui nessuno crede.
 *
 * Le probabilità sono per stato ed esplicite: un default unico nascosto darebbe
 * lo stesso numero a una quotazione mandata ieri e a una che il cliente sta per
 * firmare.
 */
export const PROBABILITA: Record<string, number> = {
  quotation: 0.4,
  potential: 0.15,
};
export const PROBABILITA_DEFAULT = 0.25;

export function probabilitaDi(stato: string): number {
  return PROBABILITA[stato] ?? PROBABILITA_DEFAULT;
}

export interface KpiFunnel {
  /** Quotazioni inviate e non ancora approvate, a valore pieno. */
  potenziale: number;
  potenzialeQuotazioni: number;
  /** Lo stesso valore pesato per la probabilità di chiusura. */
  potenzialePonderato: number;
  /** Tranche di quotazioni approvate non ancora fatturate. */
  daContabilizzare: number;
  daContabilizzarePezzi: number;
  /** Di quelle, quante sono già esigibili. */
  dueOra: number;
  dueOraPezzi: number;
}

export function kpiFunnel(quotazioni: Quotazione[], tranche: Tranche[]): KpiFunnel {
  const aperte = quotazioni.filter((q) => q.total_fees);
  const daFare = tranche.filter((t) => t.tranche_state !== "invoiced");
  const due = daFare.filter((t) => t.tranche_state === "due");

  return {
    potenziale: aperte.reduce((t, q) => t + (q.total_fees ?? 0), 0),
    potenzialeQuotazioni: aperte.length,
    potenzialePonderato: aperte.reduce(
      (t, q) => t + (q.total_fees ?? 0) * probabilitaDi(q.status),
      0,
    ),
    daContabilizzare: daFare.reduce((t, x) => t + (x.amount ?? 0), 0),
    daContabilizzarePezzi: daFare.length,
    dueOra: due.reduce((t, x) => t + (x.amount ?? 0), 0),
    dueOraPezzi: due.length,
  };
}

/* ── IVA ──────────────────────────────────────────────────────────────────── */

export interface MeseIva {
  mese: number;
  importo: number;
  /** Un mese futuro è una stima, e va detto: si disegna tratteggiato con «~». */
  stimato: boolean;
}

/**
 * L'IVA a debito, mese per mese.
 *
 * Riguarda **solo** l'entità italiana: le altre società non hanno IVA italiana,
 * e includerle produrrebbe un numero da versare che non esiste.
 *
 * Dichiaratamente lordo: è l'IVA sulle fatture emesse, senza detrarre quella
 * sugli acquisti. Serve a sapere l'ordine di grandezza da accantonare, non a
 * compilare la dichiarazione.
 */
export function ivaPerMese(righe: InvoiceRow[], anno: number, oggi = new Date()): MeseIva[] {
  const italiane = righe.filter((f) => f.entity_code === "it");
  const meseCorrente = oggi.getFullYear() === anno ? oggi.getMonth() : 11;

  return Array.from({ length: 12 }, (_, m) => {
    const dentro = italiane.filter((f) => {
      const d = new Date(f.issue_date);
      return d.getFullYear() === anno && d.getMonth() === m;
    });
    return {
      mese: m,
      importo: dentro.reduce((t, f) => t + f.vat_amount * f.exch_rate, 0),
      stimato: m > meseCorrente,
    };
  });
}

/** Il 16 del mese successivo: il termine di versamento. */
export function scadenzaIva(anno: number, mese: number): Date {
  return new Date(mese === 11 ? anno + 1 : anno, mese === 11 ? 0 : mese + 1, 16);
}

/* ── Previsionale ─────────────────────────────────────────────────────────── */

export interface MesePrevisione {
  mese: number;
  /** Fatturato davvero, al netto delle note di credito. */
  emesso: number;
  /** Tranche già previste ma non ancora fatturate. */
  pianificato: number;
  /** Quotazioni aperte, pesate per probabilità. */
  potenziale: number;
  /** La somma dei tre, cumulata da gennaio. */
  cumulato: number;
}

/**
 * Il previsionale dell'anno, a tre strati.
 *
 * I tre strati non si mescolano perché non hanno lo stesso peso: l'emesso è un
 * fatto, il pianificato è un impegno, il potenziale è una speranza pesata.
 * Sommarli in un numero solo darebbe una cifra che sembra certa e non lo è.
 *
 * Uno slittamento di fine costruzione sposta la tranche nel mese nuovo: il
 * forecast si aggiorna da solo perché legge la data attesa dell'evento, non una
 * previsione scritta da qualcuno mesi fa.
 */
export function previsioneAnno(
  righe: InvoiceRow[],
  tranche: Tranche[],
  quotazioni: Quotazione[],
  anno: number,
): MesePrevisione[] {
  const mesi: MesePrevisione[] = Array.from({ length: 12 }, (_, m) => ({
    mese: m,
    emesso: 0,
    pianificato: 0,
    potenziale: 0,
    cumulato: 0,
  }));

  for (const f of righe) {
    const d = new Date(f.issue_date);
    if (d.getFullYear() !== anno) continue;
    mesi[d.getMonth()].emesso += (f.total - f.credited_amount) * f.exch_rate;
  }

  for (const t of tranche) {
    if (t.tranche_state === "invoiced" || !t.amount) continue;
    // Senza una data attesa la tranche non si sa dove mettere: finisce a
    // dicembre, che è il posto più prudente — non gonfia i mesi vicini.
    const d = t.data_attesa ? new Date(t.data_attesa) : null;
    const m = d && d.getFullYear() === anno ? d.getMonth() : 11;
    mesi[m].pianificato += t.amount;
  }

  for (const q of quotazioni) {
    if (!q.total_fees) continue;
    const d = q.data_attesa ? new Date(q.data_attesa) : null;
    const m = d && d.getFullYear() === anno ? d.getMonth() : 11;
    mesi[m].potenziale += q.total_fees * probabilitaDi(q.status);
  }

  let corsa = 0;
  for (const m of mesi) {
    corsa += m.emesso + m.pianificato + m.potenziale;
    m.cumulato = corsa;
  }
  return mesi;
}

/* ── Il registro clienti ──────────────────────────────────────────────────── */

export interface SchedaCliente {
  /** L'identità del cliente quando c'è; altrimenti il nome, per non perdere righe. */
  chiave: string;
  nome: string;
  /** Quanto gli è stato fatturato, al lordo delle note di credito. */
  fatturato: number;
  noteCredito: number;
  /** Fatturato meno note di credito: quello che gli abbiamo davvero chiesto. */
  netto: number;
  incassato: number;
  /** Quanto deve ancora: è la domanda che fanno più spesso. */
  aperto: number;
  insoluto: number;
  /** Quotazioni non ancora approvate: quanto potremmo fatturargli. */
  potenziale: number;
  fatture: InvoiceRow[];
  progetti: string[];
  /** L'ultima fattura emessa: dice se il cliente è ancora attivo. */
  ultima: string | null;
}

/** Due nomi che differiscono per maiuscole o spazi sono lo stesso cliente. */
const normalizza = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Tutto quello che riguarda un cliente, in una riga.
 *
 * Risponde alle tre domande che arrivano sempre insieme: quanto gli abbiamo
 * fatturato, quanto deve ancora, quanto potremmo fatturargli. Tenerle separate
 * costringerebbe a incrociare tre schermate a mano, che è il modo in cui
 * nascono i numeri sbagliati nelle riunioni.
 *
 * Il potenziale arriva dalle quotazioni aperte abbinate per nome: le fatture
 * puntano a una società in anagrafica, le quotazioni portano il nome del
 * cliente come testo, e non esiste un legame fra le due. L'abbinamento è
 * dichiarato approssimativo per questo.
 */
export function registroClienti(
  righe: InvoiceRow[],
  quotazioni: Quotazione[] = [],
): SchedaCliente[] {
  const per = new Map<string, SchedaCliente>();

  for (const f of righe) {
    const nome = f.client_name ?? "— senza cliente —";
    const chiave = f.client_contact_id ?? normalizza(nome);
    const s =
      per.get(chiave) ??
      {
        chiave,
        nome,
        fatturato: 0,
        noteCredito: 0,
        netto: 0,
        incassato: 0,
        aperto: 0,
        insoluto: 0,
        potenziale: 0,
        fatture: [],
        progetti: [],
        ultima: null,
      };

    s.fatturato += f.total_eur;
    s.noteCredito += f.credited_amount * f.exch_rate;
    s.incassato += f.paid_amount * f.exch_rate;
    if (f.residual > 0 && f.lifecycle_state !== "closed") s.aperto += f.residual_eur;
    if (f.lifecycle_state === "insoluto" && f.recovery_state !== "write_off") {
      s.insoluto += f.residual_eur;
    }
    s.fatture.push(f);
    if (f.project_name && !s.progetti.includes(f.project_name)) s.progetti.push(f.project_name);
    if (!s.ultima || f.issue_date > s.ultima) s.ultima = f.issue_date;

    per.set(chiave, s);
  }

  // Il potenziale si abbina per nome: è l'unico aggancio disponibile.
  const perNome = new Map<string, SchedaCliente>();
  for (const s of per.values()) perNome.set(normalizza(s.nome), s);

  for (const q of quotazioni) {
    if (!q.total_fees || !q.client) continue;
    const s = perNome.get(normalizza(q.client));
    if (s) {
      s.potenziale += q.total_fees;
    } else {
      // Un cliente a cui non abbiamo mai fatturato ma che ha quotazioni aperte
      // è un cliente a tutti gli effetti: nasconderlo darebbe un potenziale
      // che non torna con quello della dashboard.
      const chiave = normalizza(q.client);
      const nuovo: SchedaCliente = {
        chiave,
        nome: q.client,
        fatturato: 0,
        noteCredito: 0,
        netto: 0,
        incassato: 0,
        aperto: 0,
        insoluto: 0,
        potenziale: q.total_fees,
        fatture: [],
        progetti: [],
        ultima: null,
      };
      per.set(chiave, nuovo);
      perNome.set(chiave, nuovo);
    }
  }

  for (const s of per.values()) {
    s.netto = s.fatturato - s.noteCredito;
    // Dalla più recente: su una scheda cliente si guarda prima cosa è successo
    // ultimamente, non come è cominciata.
    s.fatture.sort((a, b) => b.issue_date.localeCompare(a.issue_date));
  }

  return [...per.values()].sort((a, b) => b.netto - a.netto || b.potenziale - a.potenziale);
}

const SIMBOLO: Record<Currency, string> = {
  EUR: "€",
  GBP: "£",
  CNY: "¥",
  USD: "$",
};

/**
 * Un importo come si scrive su un documento italiano.
 *
 * Il simbolo e' quello della valuta della fattura, non quello del consolidato:
 * una fattura in sterline resta in sterline anche in una tabella che altrove
 * mostra euro, altrimenti il totale sembrerebbe sbagliato di un fattore
 * qualunque.
 */
export function importo(valore: number, valuta: Currency = "EUR", decimali = 0): string {
  return `${SIMBOLO[valuta]} ${cifre(valore, decimali)}`;
}

/**
 * Le cifre, sempre raggruppate.
 *
 * In italiano `Intl` non raggruppa i numeri di quattro cifre — «5737» ma
 * «12.345» — perché il CLDR chiede almeno due gruppi. È corretto in tipografia
 * e pessimo in una colonna di importi: due righe vicine finiscono scritte in
 * due modi diversi e un migliaio si legge a occhio come una cifra di troppo.
 * `useGrouping: "always"` è l'unico valore che lo forza; `true` non basta, ed
 * è l'errore che questa funzione aveva prima.
 */
export function cifre(valore: number, decimali = 0): string {
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: decimali,
    maximumFractionDigits: decimali,
    // `"always"` è ES2023 e i tipi di questo progetto dichiarano ancora solo
    // il booleano. Il valore è valido a runtime su ogni browser che serviamo;
    // il cast dice che lo sappiamo, invece di far finta che sia `true`.
    useGrouping: "always" as unknown as boolean,
  }).format(valore);
}

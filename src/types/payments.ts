/**
 * Payments — le forme che arrivano dal database.
 *
 * `src/integrations/supabase/types.ts` e' generato e indietro rispetto allo
 * schema, quindi le tabelle nuove si dichiarano qui e si leggono con
 * `.from("invoices" as any)`, come tutto il resto del progetto.
 */

/** Le societa' che emettono. L'IVA riguarda solo l'Italia. */
export type EntityCode = "uk" | "it" | "cn";

export type Currency = "EUR" | "GBP" | "CNY" | "USD";

/**
 * Lo stato di CICLO della fattura: dove si trova nel suo percorso.
 *
 * Non dice niente su quanto e' stata pagata — quello e' `PaymentStatus`, ed e'
 * un'altra dimensione. Una fattura puo' essere `in_recall` e `partial` insieme:
 * tenerli separati e' l'unico modo di raccontarle entrambe.
 */
export type LifecycleState = "issued" | "in_recall" | "blocked" | "insoluto" | "closed";

/** Lo stato di PAGAMENTO: calcolato, mai scritto. */
export type PaymentStatus = "unpaid" | "partial" | "paid" | "credited";

/** Rosso: scaduta. Giallo: bonifico disposto, vale 30 giorni. */
export type RecallStatus = "red" | "yellow";

export type RecoveryState = "in_gestione" | "legale" | "write_off";

/** Una riga della vista `v_invoices`: la fattura con i suoi numeri gia' fatti. */
export interface InvoiceRow {
  id: string;
  number: string;
  /** Il numero nel gestionale del commercialista, quando esiste. */
  external_number: string | null;

  issuer_contact_id: string;
  entity_code: EntityCode | null;
  issuer_name: string | null;

  client_contact_id: string | null;
  client_name: string | null;

  certification_id: string | null;
  project_name: string | null;
  tranche_id: string | null;

  currency: Currency;
  exch_rate: number;
  total: number;
  vat_amount: number;

  issue_date: string;
  payment_terms_days: number;
  /** Calcolata dal database: emissione + termini. */
  due_date: string;

  lifecycle_state: LifecycleState;
  recall_status: RecallStatus | null;
  yellow_until: string | null;
  reminders_count: number;
  last_reminder_date: string | null;
  next_reminder_date: string | null;
  recovery_state: RecoveryState | null;
  notes: string | null;
  created_at: string;

  // ── I derivati. Nessuno di questi e' una colonna scrivibile ────────────────
  paid_amount: number;
  credited_amount: number;
  residual: number;
  payment_status: PaymentStatus;
  /** Zero se la fattura e' chiusa: una saldata in ritardo non e' in ritardo. */
  days_late: number;
  total_eur: number;
  residual_eur: number;
}

export interface InvoicePayment {
  id: string;
  invoice_id: string;
  date: string;
  amount: number;
  method: string | null;
  bank_ref: string | null;
}

export interface CreditNote {
  id: string;
  number: string;
  invoice_id: string;
  date: string;
  amount: number;
  kind: "total" | "partial";
  reason: string | null;
  /** Una bozza non tocca nessun aggregato. */
  state: "draft" | "issued";
}

export interface InvoiceReminder {
  id: string;
  invoice_id: string;
  date: string;
  channel: "email" | "pec" | "phone";
  note: string | null;
}

/** Lo stato della tranche su `cert_payment_milestones`. */
export type TrancheState = "pending" | "due" | "invoiced";

export interface Supplier {
  id: string;
  name: string;
  default_currency: Currency;
  default_terms_days: number;
  vat_number: string | null;
}

/* ── La WBS di cassa ──────────────────────────────────────────────────────── */

/**
 * Quanto fidarsi di una data.
 *
 * Non è un dettaglio da nascondere in un tooltip: un incasso avvenuto e una
 * stima dedotta da un evento non valgono uguale, e una griglia che li disegna
 * uguali fa prendere decisioni sbagliate con la faccia sicura.
 */
export type Certezza = "reale" | "contrattuale" | "prevista" | "stimata";

/**
 * Da quale gradino della scala viene la data di cassa.
 *
 * I primi sei valori arrivano dalle tranche, gli ultimi cinque dalle uscite:
 * due vocabolari diversi perché le due scale lo sono — un incasso si registra,
 * un'uscita si contrattualizza.
 */
export type FonteData =
  | "incasso"
  | "scadenza_fattura"
  | "pagamento_previsto"
  | "fattura_emessa"
  | "da_evento"
  | "da_evento_stimato"
  | "telemetria_scartata"
  | "reale"
  | "contratto"
  | "evento"
  | "stima"
  | "senza_data";

/** Quale fatto genera il pagamento. Anche qui i due lati parlano diverso. */
export type FonteEvento =
  | "milestone_chiusa"
  | "ordine_hardware"
  | "installazione"
  | "primo_dato"
  | "telemetria_scartata"
  | "ordine"
  | "spedizione"
  | "ricezione"
  | "stima"
  | "senza_data";

/** Una riga di `v_cash_events`: un movimento, da qualunque lato arrivi. */
export interface CashEvent {
  id: string;
  verso: "entrata" | "uscita";
  corsia: "cliente" | "fornitore" | "installatore";
  /** La voce dentro la commessa: Ciclo attivo, Acquisto materiali, Installatori. */
  gruppo: string;
  /** La macro-categoria: Energy, Air, Non attribuite. */
  categoria: string;
  /**
   * La data di cassa: quando il denaro si muove davvero.
   *
   * Nulla quando nessuna fonte ha saputo dire quando. La riga resta, in fondo.
   */
  data: string | null;
  settimana: string | null;
  /** Quando è successo il fatto che innesca il pagamento: installazione,
   *  ricezione merce, chiusura di una milestone. */
  data_evento: string | null;
  /**
   * Quando la fattura è stata emessa.
   *
   * È il terzo anello, e non va confuso con la cassa: una fattura emessa il
   * 17 aprile e pagata il 30 settembre sono due momenti diversi, e sulla
   * traccia devono restare due segni diversi.
   */
  data_documento: string | null;
  /** Già in euro, già col segno: le uscite arrivano negative. */
  importo_eur: number;
  /**
   * Lo stesso importo nella valuta in cui è stato pattuito, stesso segno.
   *
   * Sulle fatture cinesi è il numero su cui si discute: «9.325,50 RMB» è
   * quello che sta sul documento, l'euro è una conseguenza del cambio.
   */
  importo_valuta: number;
  valuta: string;
  cambio: number;
  certezza: Certezza | null;
  fonte: FonteData | null;
  fonte_evento: FonteEvento | null;
  /** Solo `cassa` entra nelle somme. */
  natura: "cassa" | "documento" | "quota";
  commessa_id: string | null;
  commessa: string;
  certification_id: string | null;
  progetto: string | null;
  brand: string | null;
  citta: string | null;
  etichetta: string | null;
  /** Il numero del documento: fattura fornitore, PO. Nullo sulle entrate,
   *  dove un numero fattura non esiste ancora. */
  riferimento: string | null;
  stato: string | null;
  ordine_tranche: number | null;
  origine: "tranche" | "uscita";
  /**
   * Una lavorazione distinta dentro la stessa commessa.
   *
   * La riconfigurazione Schneider sta dentro Fendi Energy 2024 — stesso
   * contratto, stessi totali — ma è un lavoro suo, con hardware suo. Nella
   * WBS diventa una sezione in coda all'elenco progetti invece di disperdersi
   * fra gli altri cinquantadue siti.
   */
  sottogruppo: string | null;
}

/**
 * Una riga di `v_progetti_tempi`: quanto dura un progetto.
 *
 * Non è cassa. È la striscia che va dall'acquisto dei materiali
 * all'installazione fino all'ultimo incasso — «quanto ci mettiamo a
 * rientrare», che è una domanda diversa da «quando esce un euro».
 */
export interface ProgettoTempi {
  certification_id: string;
  commessa_id: string | null;
  progetto: string;
  citta: string | null;
  data_materiali: string | null;
  data_installazione: string | null;
  primo_incasso: string | null;
  ultimo_incasso: string | null;
  tranche_totali: number;
  tranche_incassate: number;
}

export interface Commessa {
  id: string;
  nome: string;
  servizio: string | null;
  anno: number | null;
  /** Dichiarato, non sommato dai progetti: lo scarto fra i due è un controllo. */
  valore_dichiarato: number | null;
  valuta: Currency;
  cambio_budget: number;
  contratto_cliente: string | null;
  stato: "aperta" | "chiusa" | "on_hold";
  note: string | null;
}

export interface PassiveInvoice {
  id: string;
  number: string;
  supplier_id: string;
  received_date: string;
  issue_date: string | null;
  terms_days: number;
  /** Calcolata: ricezione + termini. */
  due_date: string;
  taxable: number;
  tax: number;
  total: number;
  currency: Currency;
  state: "to_pay" | "paid" | "overdue";
  paid_date: string | null;
  pdf_path: string | null;
  /* ── L'aggancio all'ordine (Fase 7) ── */
  po_id: string | null;
  po_condizione_id: string | null;
  stato_verifica: "da_verificare" | "verificata" | "contestata";
  verificata_il: string | null;
  note_verifica: string | null;
  descrizione: string | null;
}

/* ── Richiesta di Fornitura ───────────────────────────────────────────────── */

/**
 * Il ciclo della richiesta, distinto da `status` che è la logistica.
 *
 * Sono due storie parallele sullo stesso ordine: una dice a che punto è
 * l'autorizzazione a spendere, l'altra dove sta la merce. Tenerle nella stessa
 * colonna vorrebbe dire non poter avere un ordine approvato e non ancora
 * spedito, che è lo stato in cui gli ordini passano più tempo.
 */
export type StatoRichiesta = "bozza" | "inviata" | "approvata" | "rifiutata";

/** La corsia di cassa della spesa. Stesso vocabolario di `uscite_previste`. */
export type CorsiaUscita = "merce" | "installazione" | "servizi";

/**
 * L'evento da cui una rata conta i suoi giorni.
 *
 * `ordine` e `ricezione` non sono sinonimi di date: sono gradini di una catena
 * che il motore percorre — ordine, fine produzione, spedizione, ricezione —
 * e spostare la data dell'ordine sposta tutti i gradini a valle.
 */
export type EventoCondizione =
  | "ordine"
  | "fine_produzione"
  | "spedizione"
  | "ricezione"
  | "installazione"
  | "collaudo"
  | "manuale";

export interface RichiestaFornitura {
  id: string;
  po_number: string | null;
  supplier: string | null;
  supplier_id: string | null;
  commessa_id: string | null;
  certification_id: string | null;
  corsia: CorsiaUscita;
  descrizione: string | null;
  po_cost: number | null;
  currency: Currency;
  cambio: number;
  /** Generata: costo per cambio. Non si scrive. */
  importo_eur: number | null;
  category: string | null;
  status: string | null;
  data_ordine: string | null;
  po_issued_date: string | null;
  consegna_prevista: string | null;
  lead_time_giorni: number | null;
  stato_richiesta: StatoRichiesta;
  richiesta_il: string | null;
  approvata_il: string | null;
  note_condizioni: string | null;
  /** Il nome con cui `site_energy_records.po_number` chiama questo ordine. */
  po_monitoring: string | null;
}

/** Una rata delle condizioni negoziate col fornitore. */
export interface CondizionePO {
  id: string;
  po_id: string;
  ordine: number;
  nome: string;
  /** L'una o l'altro: la percentuale sul totale, oppure l'importo secco. */
  pct: number | null;
  importo: number | null;
  evento: EventoCondizione;
  giorni: number;
  /** Falso per R&D, stampi, call-out: costi dell'ordine, non della fornitura. */
  ripartita: boolean;
  /** Falso sulle rate ricostruite dal pregresso: il generatore non le tocca. */
  rigenerabile: boolean;
  note: string | null;
}

/** A quale progetto va quale fetta dell'ordine. */
export interface AllocazionePO {
  id: string;
  po_id: string;
  certification_id: string | null;
  etichetta: string | null;
  pct: number | null;
  importo: number | null;
  note: string | null;
}

/** Una riga del controllo «pay when paid». */
export interface EsitoPayWhenPaid {
  uscita_id: string;
  descrizione: string | null;
  data_uscita: string;
  importo_eur: number;
  primo_incasso: string | null;
  incassato_a_quella_data: number;
  uscito_a_quella_data: number;
  saldo: number;
  esito:
    | "ok"
    | "paghiamo prima di incassare"
    | "cassa in rosso a quella data"
    | "nessun incasso atteso";
}

/** Una proposta di abbinamento fra una fattura ricevuta e una rata d'ordine. */
export interface PropostaAbbinamento {
  po_id: string;
  po_number: string | null;
  condizione_id: string;
  rata: string;
  atteso: number;
  valuta: Currency;
  scarto: number;
  gia_coperta: boolean;
  confidenza: string;
}

/** Un controllo di congruenza fra fattura e ordine. */
export interface ControlloCongruenza {
  controllo: string;
  esito: "ok" | "tollerato" | "discorde" | "assente";
  dettaglio: string;
}

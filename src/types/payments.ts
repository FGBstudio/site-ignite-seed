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
}

// ── Invoice domain types (mockup parity, no DB) ─────────────────────────────
export type Currency = "EUR" | "GBP" | "USD" | "CHF" | "JPY" | "TWD" | "HKD";
export type Entity = "FGB UK" | "FGB Italy" | "FGB China";
export type InvoiceState = "Unpaid" | "Partial" | "Paid" | "Overdue";

export interface Invoice {
  id: string;
  date: string;
  clientEntity: string;
  invoiceNumber: string;
  projectActivity: string;
  activity: string;
  currency: Currency;
  exchangeRate: string;
  totPaid: number;
  vat: string;
  paymentMethod: string;
  dueDate: string;
  notPaid: number;
  notPaidVat: number;
  dateOfPayment: string;
  paymentDay: string;
  state: InvoiceState;
  refOrderPO: string;
  totCommessa: number;
  percFatturato: string;
  percProgressivo: string;
  entrateVere: number;
  emailRef: string;
  decurtBancarie: number;
  recall: string;
  statementOfAccount: string;
  entity: Entity;
  dpo: string;
}

export type Priority = "Low" | "Medium" | "High";

export interface DaEmettere {
  id: string;
  brand: string;
  project: string;
  step: string;
  value: number;
  priority: Priority;
  entity: Entity;
  eoc: string;
  problem: string;
  solution: string;
}

export type SollecitoStatus = "attivo" | "pagato" | "bloccato";

export interface Sollecito {
  id: string;
  client: string;
  invNum: string;
  date: string;
  dueDate: string;
  project: string;
  amount: number;
  n: number;
  lastDate: string;
  email: string;
  note: string;
  status: SollecitoStatus;
}

export type BloccatoType = "legale" | "contratto" | "tecnico" | "altro";
export type BloccatoSeverity = "normal" | "critical";

export interface Bloccato {
  id: string;
  invNum: string;
  project: string;
  client: string;
  amount: number;
  type: BloccatoType;
  severity: BloccatoSeverity;
  cause: string;
  solution: string;
}

export type InsolutoStatus = "aperto" | "in_verifica" | "coperto" | "chiuso";

export interface Insoluto {
  id: string;
  year: string;
  invNum: string;
  date: string;
  client: string;
  project: string;
  dueDate: string;
  amount: number;
  status: InsolutoStatus;
  note: string;
}

export type NCStatus = "da_fare" | "emessa" | "in_attesa";

export interface NotaCredito {
  id: string;
  invNum: string;
  client: string;
  project: string;
  amount: number;
  ncNum: string;
  status: NCStatus;
  reason: string;
  note: string;
}

export type CollectionKey =
  | "invoices"
  | "daEmettere"
  | "solleciti"
  | "bloccati"
  | "insoluti"
  | "nc";

export type AnyRow =
  | Invoice
  | DaEmettere
  | Sollecito
  | Bloccato
  | Insoluto
  | NotaCredito;

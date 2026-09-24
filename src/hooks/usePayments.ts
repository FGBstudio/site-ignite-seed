import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  CreditNote,
  Currency,
  EntityCode,
  InvoicePayment,
  InvoiceRow,
  PassiveInvoice,
  Supplier,
} from "@/types/payments";
import type { Quotazione, Tranche } from "@/lib/payments/aggregati";

/**
 * I dati della sezione Payments.
 *
 * Si legge sempre da `v_invoices`, mai dalla tabella `invoices`: la vista porta
 * residuo, incassato, creditato e stato di pagamento già calcolati dal
 * database. Leggere la tabella nuda vorrebbe dire rifare quei conti qui, e
 * averne due versioni che prima o poi non coincidono.
 *
 * Un registro, molte viste: le schermate non hanno query proprie, filtrano
 * queste righe.
 */

export function useFatture() {
  return useQuery({
    queryKey: ["payments", "invoices"],
    queryFn: async (): Promise<InvoiceRow[]> => {
      const { data, error } = await (supabase as any)
        .from("v_invoices")
        .select("*")
        .order("issue_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as InvoiceRow[];
    },
  });
}

/** Gli incassi di una fattura, per la riga espandibile. */
export function useIncassi(invoiceId: string | null) {
  return useQuery({
    queryKey: ["payments", "incassi", invoiceId],
    enabled: !!invoiceId,
    queryFn: async (): Promise<InvoicePayment[]> => {
      const { data, error } = await (supabase as any)
        .from("invoice_payments")
        .select("*")
        .eq("invoice_id", invoiceId)
        .order("date");
      if (error) throw error;
      return (data ?? []) as InvoicePayment[];
    },
  });
}

/** Le note di credito collegate a una fattura. */
export function useNoteCredito(invoiceId: string | null) {
  return useQuery({
    queryKey: ["payments", "nc", invoiceId],
    enabled: !!invoiceId,
    queryFn: async (): Promise<CreditNote[]> => {
      const { data, error } = await (supabase as any)
        .from("credit_notes")
        .select("*")
        .eq("invoice_id", invoiceId)
        .order("date");
      if (error) throw error;
      return (data ?? []) as CreditNote[];
    },
  });
}

/** Le società che emettono, per il selettore entità. */
export function useEntita() {
  return useQuery({
    queryKey: ["contacts", "entita-emittenti"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("id, company_name, entity_code")
        .eq("kind", "issuer")
        .order("company_name");
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        company_name: string;
        entity_code: EntityCode | null;
      }>;
    },
  });
}

/**
 * Le commesse su cui si puo' emettere, con quello che si sa gia'.
 *
 * Emettere una fattura partendo dalla commessa evita di ridigitare cliente,
 * importo e termini: sono dati che il sistema ha gia' e che riscritti a mano
 * diventerebbero una seconda verita'.
 */
export function useCommesseFatturabili() {
  return useQuery({
    queryKey: ["payments", "commesse-fatturabili"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("certifications")
        .select(
          `id, name, client, status, total_fees, currency, billing_contact_id,
           sites ( id, name, brand_id )`,
        )
        .in("status", ["quotation_approved", "da_configurare", "in_corso", "certificato"])
        .order("name");
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        name: string | null;
        client: string | null;
        status: string;
        total_fees: number | null;
        currency: string | null;
        billing_contact_id: string | null;
        sites: { id: string; name: string | null; brand_id: string | null } | null;
      }>;
    },
  });
}

/** Le tranche gia' esigibili di una commessa: sono il «da emettere». */
/**
 * I termini di pagamento concordati sulla commessa a cui il progetto appartiene.
 *
 * Nascono in offerta e vivono su `commesse.termini_giorni`. La fattura li
 * eredita invece di ripartire da un default: un accordo scritto due volte
 * prima o poi discorda, e qui a discordare sarebbe una scadenza.
 */
export function useTerminiDiCommessa(certId: string | null) {
  return useQuery({
    queryKey: ["payments", "termini-commessa", certId],
    enabled: !!certId,
    queryFn: async (): Promise<number | null> => {
      const { data, error } = await (supabase as any)
        .from("commessa_progetti")
        .select("commesse ( termini_giorni )")
        .eq("certification_id", certId)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      const t = (data as { commesse?: { termini_giorni?: number | null } } | null)?.commesse;
      return t?.termini_giorni ?? null;
    },
  });
}

export function useTrancheDue(certId: string | null) {
  return useQuery({
    queryKey: ["payments", "tranche-due", certId],
    enabled: !!certId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("cert_payment_milestones")
        .select("id, name, amount, tranche_pct, tranche_order, tranche_state")
        .eq("certification_id", certId)
        .eq("tranche_state", "due")
        .order("tranche_order");
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        name: string | null;
        amount: number | null;
        tranche_pct: number | null;
        tranche_order: number | null;
      }>;
    },
  });
}

/** Le societa' clienti di un brand, per la tendina del destinatario. */
export function useClientiDelBrand(brandId: string | null | undefined) {
  return useQuery({
    queryKey: ["contacts", "clienti-brand", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("id, company_name, vat_number")
        .eq("brand_id", brandId!)
        .eq("kind", "client")
        .order("company_name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; company_name: string; vat_number: string | null }>;
    },
  });
}

/**
 * Emettere.
 *
 * Il numero non si sceglie e non si passa: lo assegna il database nella stessa
 * transazione in cui nasce la riga. Due emissioni simultanee si mettono in
 * fila invece di prendere lo stesso progressivo.
 */
export function useEmettiFattura() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      issuer_contact_id: string;
      total: number;
      issue_date: string;
      payment_terms_days: number;
      client_contact_id?: string | null;
      certification_id?: string | null;
      tranche_id?: string | null;
      currency?: string;
      exch_rate?: number;
      vat_amount?: number;
      external_number?: string | null;
      notes?: string | null;
    }) => {
      const { data, error } = await (supabase as any).rpc("fn_emetti_fattura", {
        p_issuer_contact_id: v.issuer_contact_id,
        p_total: v.total,
        p_issue_date: v.issue_date,
        p_payment_terms_days: v.payment_terms_days,
        p_client_contact_id: v.client_contact_id ?? null,
        p_certification_id: v.certification_id ?? null,
        p_tranche_id: v.tranche_id ?? null,
        p_currency: v.currency ?? "EUR",
        p_exch_rate: v.exch_rate ?? 1,
        p_vat_amount: v.vat_amount ?? 0,
        p_external_number: v.external_number ?? null,
        p_notes: v.notes ?? null,
      });
      if (error) throw error;
      return data as InvoiceRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payments"] }),
  });
}

/* ── Dashboard, IVA, previsionale ─────────────────────────────────────────── */

/** Le quotazioni inviate e non ancora approvate: il potenziale. */
export function useQuotazioniAperte() {
  return useQuery({
    queryKey: ["payments", "quotazioni-aperte"],
    queryFn: async (): Promise<Quotazione[]> => {
      const { data, error } = await (supabase as any)
        .from("certifications")
        .select("id, name, client, status, total_fees, handover_date, quotation_sent_date")
        .in("status", ["quotation", "potential"])
        .not("total_fees", "is", null)
        .order("total_fees", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as any[]).map((q) => ({
        id: q.id,
        name: q.name,
        client: q.client,
        status: q.status,
        total_fees: q.total_fees,
        // Quando ci si aspetta che si chiuda: l'handover è la data più vicina a
        // un impegno che una quotazione abbia.
        data_attesa: q.handover_date ?? null,
      }));
    },
  });
}

/**
 * Le tranche ancora da fatturare, con la data in cui ci si aspetta l'evento.
 *
 * La data arriva dalla milestone collegata per `step_id`, non da una previsione
 * scritta sulla tranche: è così che uno slittamento di fine costruzione sposta
 * il ricavo nel mese nuovo senza che nessuno aggiorni un forecast a mano.
 */
export function useTrancheAperte() {
  return useQuery({
    queryKey: ["payments", "tranche-aperte"],
    queryFn: async (): Promise<Tranche[]> => {
      const [tr, ms] = await Promise.all([
        (supabase as any)
          .from("cert_payment_milestones")
          .select("id, certification_id, name, amount, tranche_state, due_date, step_id")
          .neq("tranche_state", "invoiced"),
        (supabase as any)
          .from("certification_milestones")
          .select("certification_id, step_id, due_date, override_date")
          .not("step_id", "is", null),
      ]);
      if (tr.error) throw tr.error;
      if (ms.error) throw ms.error;

      const quando = new Map<string, string>();
      for (const m of (ms.data ?? []) as any[]) {
        const d = m.override_date ?? m.due_date;
        if (d) quando.set(`${m.certification_id}:${m.step_id}`, d);
      }

      return ((tr.data ?? []) as any[]).map((t) => ({
        id: t.id,
        certification_id: t.certification_id,
        name: t.name,
        amount: t.amount,
        tranche_state: t.tranche_state,
        data_attesa:
          (t.step_id ? quando.get(`${t.certification_id}:${t.step_id}`) : null) ?? t.due_date ?? null,
      }));
    },
  });
}

/** Gli incassi di un anno: l'incassato YTD si conta per data di incasso. */
export function useIncassiAnno(anno: number) {
  return useQuery({
    queryKey: ["payments", "incassi-anno", anno],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("invoice_payments")
        .select("amount, date, invoice_id")
        .gte("date", `${anno}-01-01`)
        .lte("date", `${anno}-12-31`);
      if (error) throw error;
      return (data ?? []) as Array<{ amount: number; date: string; invoice_id: string }>;
    },
  });
}

/** Gli alert aperti che riguardano Payments: le azioni richieste. */
export function useAlertPayments() {
  return useQuery({
    queryKey: ["payments", "alert"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("task_alerts")
        .select("id, alert_type, title, description, created_at, certification_id, invoice_id")
        .eq("is_resolved", false)
        .in("alert_type", [
          "quotation_to_payments",
          "billing_due",
          "invoice_paid",
          "recall_yellow_expired",
          "extra_canone",
          "project_on_hold",
        ])
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        alert_type: string;
        title: string;
        description: string | null;
        created_at: string;
        certification_id: string | null;
        invoice_id: string | null;
      }>;
    },
  });
}

/**
 * Chiudere un alert a mano.
 *
 * Solo per quelli che il sistema non puo' vedere compiuti: un extra-canone
 * valutato non lascia tracce nel database. `resolved_kind` tiene la differenza
 * fra «il lavoro risulta fatto» e «qualcuno ha tolto la notifica».
 */
export function useChiudiAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const utente = (await supabase.auth.getUser()).data.user;
      const { error } = await (supabase as any)
        .from('task_alerts')
        .update({
          is_resolved: true,
          resolved_at: new Date().toISOString(),
          resolved_by: utente?.id ?? null,
          resolved_kind: 'user',
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payments'] }),
  });
}

/* ── Ciclo passivo ────────────────────────────────────────────────────────── */

export function useFornitori() {
  return useQuery({
    queryKey: ["payments", "fornitori"],
    queryFn: async (): Promise<Supplier[]> => {
      const { data, error } = await (supabase as any)
        .from("suppliers")
        .select("*")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Supplier[];
    },
  });
}

export function useFatturePassive() {
  return useQuery({
    queryKey: ["payments", "passive"],
    queryFn: async (): Promise<PassiveInvoice[]> => {
      const { data, error } = await (supabase as any)
        .from("passive_invoices")
        .select("*")
        .order("due_date");
      if (error) throw error;
      return (data ?? []) as PassiveInvoice[];
    },
  });
}

export function useSalvaFornitore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      id?: string;
      name: string;
      default_currency: Currency;
      default_terms_days: number;
      vat_number?: string | null;
    }) => {
      const utente = (await supabase.auth.getUser()).data.user;
      const { data, error } = await (supabase as any)
        .from("suppliers")
        .upsert({ ...v, created_by: utente?.id ?? null })
        .select()
        .single();
      if (error) throw error;
      return data as Supplier;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payments"] }),
  });
}

/**
 * Registrare una fattura ricevuta.
 *
 * `terms_days` si copia dal fornitore al momento della registrazione e poi vive
 * sulla fattura: cambiare l'accordo con un fornitore non deve spostare le
 * scadenze dei documenti già in casa, che sono nati sotto i termini di allora.
 */
export function useRegistraFatturaPassiva() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      number: string;
      supplier_id: string;
      received_date: string;
      issue_date?: string | null;
      terms_days: number;
      taxable: number;
      tax: number;
      total: number;
      currency: Currency;
      pdf_path?: string | null;
    }) => {
      const utente = (await supabase.auth.getUser()).data.user;
      const { data, error } = await (supabase as any)
        .from("passive_invoices")
        .insert({ ...v, created_by: utente?.id ?? null })
        .select()
        .single();
      if (error) throw error;
      return data as PassiveInvoice;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payments"] }),
  });
}

export function usePagaFatturaPassiva() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; data?: string }) => {
      const { error } = await (supabase as any).rpc("fn_paga_fattura_passiva", {
        p_id: v.id,
        p_data: v.data ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payments"] }),
  });
}

/** Carica il PDF nell'archivio e restituisce il percorso da salvare sulla riga. */
export async function caricaPdfPassiva(file: File, fornitore: string): Promise<string> {
  if (file.type !== "application/pdf") {
    throw new Error("L'archivio accetta solo PDF.");
  }
  const pulito = fornitore.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
  // Il percorso porta anno e fornitore: un archivio fiscale si sfoglia anche
  // dal pannello dello storage, e nomi casuali lo renderebbero inservibile.
  const percorso = `${new Date().getFullYear()}/${pulito}/${Date.now()}-${file.name}`;
  const { error } = await supabase.storage.from("fatture-passive").upload(percorso, file);
  if (error) throw error;
  return percorso;
}

/** Un link temporaneo per riscaricare il PDF: il bucket è privato. */
export async function linkPdfPassiva(percorso: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from("fatture-passive")
    .createSignedUrl(percorso, 300);
  if (error) throw error;
  return data.signedUrl;
}

/* ── Note sulla fattura ───────────────────────────────────────────────────── */

/** Cosa ha detto il cliente, in ordine dal più recente. */
export function useNoteFattura(invoiceId: string | null) {
  return useQuery({
    queryKey: ["payments", "note", invoiceId],
    enabled: !!invoiceId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("invoice_notes")
        .select("id, date, text, created_at")
        .eq("invoice_id", invoiceId)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        date: string;
        text: string;
        created_at: string;
      }>;
    },
  });
}

/**
 * Annotare un aggiornamento.
 *
 * Si impila, non si sovrascrive: due promesse mancate raccontano una storia che
 * una promessa sola non racconta, e quando si decide se mandare una pratica al
 * legale è esattamente quella storia che serve.
 */
export function useAggiungiNota() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { invoice_id: string; text: string; date?: string }) => {
      const utente = (await supabase.auth.getUser()).data.user;
      const { error } = await (supabase as any).from("invoice_notes").insert({
        invoice_id: v.invoice_id,
        text: v.text.trim(),
        date: v.date ?? new Date().toISOString().slice(0, 10),
        created_by: utente?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["payments", "note", v.invoice_id] });
      qc.invalidateQueries({ queryKey: ["payments", "note-tutte"] });
    },
  });
}

/** Quante note ha ogni fattura: serve a segnalare dove c'è qualcosa da leggere. */
export function useConteggioNote() {
  return useQuery({
    queryKey: ["payments", "note-tutte"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("invoice_notes")
        .select("invoice_id, date, text")
        .order("date", { ascending: false });
      if (error) throw error;
      const m = new Map<string, { quante: number; ultima: string; testo: string }>();
      for (const n of (data ?? []) as any[]) {
        const p = m.get(n.invoice_id);
        // La prima che incontro è la più recente: l'ordine della query lo garantisce.
        m.set(n.invoice_id, {
          quante: (p?.quante ?? 0) + 1,
          ultima: p?.ultima ?? n.date,
          testo: p?.testo ?? n.text,
        });
      }
      return m;
    },
  });
}

/* ── Note di credito ──────────────────────────────────────────────────────── */

/** Tutte le note di credito. Si uniscono alle fatture già in memoria. */
export function useTutteLeNoteCredito() {
  return useQuery({
    queryKey: ["payments", "note-credito"],
    queryFn: async (): Promise<CreditNote[]> => {
      const { data, error } = await (supabase as any)
        .from("credit_notes")
        .select("*")
        .order("date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CreditNote[];
    },
  });
}

/**
 * Emettere una nota di credito, o prepararne una bozza.
 *
 * Il numero lo assegna il database, e solo all'emissione: una bozza non consuma
 * un progressivo perché potrebbe non diventare mai un documento.
 */
export function useEmettiNotaCredito() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      invoice_id: string;
      amount: number;
      kind: "total" | "partial";
      reason?: string | null;
      date?: string | null;
      bozza?: boolean;
    }) => {
      const { data, error } = await (supabase as any).rpc("fn_emetti_nota_credito", {
        p_invoice_id: v.invoice_id,
        p_amount: v.amount,
        p_kind: v.kind,
        p_reason: v.reason ?? null,
        p_date: v.date ?? null,
        p_bozza: v.bozza ?? false,
      });
      if (error) throw error;
      return data as CreditNote;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payments"] }),
  });
}

/** Trasforma una bozza in documento: prende il numero e comincia a contare. */
export function useEmettiBozzaNC() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await (supabase as any).rpc("fn_emetti_bozza_nota_credito", {
        p_credit_note_id: id,
      });
      if (error) throw error;
      return data as CreditNote;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payments"] }),
  });
}

/* ── Recall: solleciti, proroghe, blocchi ─────────────────────────────────── */

/** I solleciti fatti su una fattura, per vedere cosa è già stato tentato. */
export function useSolleciti(invoiceId: string | null) {
  return useQuery({
    queryKey: ["payments", "solleciti", invoiceId],
    enabled: !!invoiceId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("invoice_reminders")
        .select("*")
        .eq("invoice_id", invoiceId)
        .order("date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        date: string;
        channel: "email" | "pec" | "phone";
        note: string | null;
      }>;
    },
  });
}

/**
 * I progetti fermi per mancato pagamento.
 *
 * Si filtra sulla causa e non solo su `on_hold`: un progetto fermo per ragioni
 * operative non è affare di Payments, e mostrarlo qui farebbe sembrare che il
 * credito sia il problema quando non lo è.
 */
export function useProgettiBloccati() {
  return useQuery({
    queryKey: ["payments", "bloccati"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("certifications")
        .select("id, name, client, on_hold_reason, on_hold_at, on_hold_by, on_hold_previous_status")
        .eq("on_hold", true)
        .eq("on_hold_cause", "unpaid")
        .order("on_hold_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        name: string | null;
        client: string | null;
        on_hold_reason: string | null;
        on_hold_at: string | null;
        on_hold_by: string | null;
        on_hold_previous_status: string | null;
      }>;
    },
  });
}

/** Un'azione del recall: la scrive il database, qui si chiede solo. */
function azionePayments<T>(nome: string, argomenti: (v: T) => Record<string, unknown>) {
  return function useAzione() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: async (v: T) => {
        const { error } = await (supabase as any).rpc(nome, argomenti(v));
        if (error) throw error;
      },
      onSuccess: () => qc.invalidateQueries({ queryKey: ["payments"] }),
    });
  };
}

export const useRegistraSollecito = azionePayments<{
  invoice_id: string;
  channel: "email" | "pec" | "phone";
  note?: string | null;
  prossimo?: string | null;
}>("fn_registra_sollecito", (v) => ({
  p_invoice_id: v.invoice_id,
  p_canale: v.channel,
  p_nota: v.note ?? null,
  p_prossimo: v.prossimo ?? null,
}));

export const useBonificoDisposto = azionePayments<{ invoice_id: string; giorni?: number }>(
  "fn_bonifico_disposto",
  (v) => ({ p_invoice_id: v.invoice_id, p_giorni: v.giorni ?? 30 }),
);

export const useBloccaProgetto = azionePayments<{ invoice_id: string; motivo?: string | null }>(
  "fn_blocca_per_insoluto",
  (v) => ({ p_invoice_id: v.invoice_id, p_motivo: v.motivo ?? null }),
);

export const usePortaAInsoluto = azionePayments<{
  invoice_id: string;
  recupero: 'in_gestione' | 'legale' | 'write_off';
  nota?: string | null;
}>('fn_porta_a_insoluto', (v) => ({
  p_invoice_id: v.invoice_id,
  p_recupero: v.recupero,
  p_nota: v.nota ?? null,
}));

export const useRiportaDaInsoluto = azionePayments<{ invoice_id: string }>(
  'fn_riporta_da_insoluto',
  (v) => ({ p_invoice_id: v.invoice_id }),
);

export const useSbloccaProgetto = azionePayments<{ certification_id: string }>(
  "fn_sblocca_progetto",
  (v) => ({ p_certification_id: v.certification_id }),
);

/**
 * Registrare un incasso.
 *
 * Non si tocca nessuno stato: si scrive il fatto — questo giorno sono arrivati
 * questi soldi — e il resto succede da solo. Il database ricalcola il residuo,
 * e se non resta niente chiude la fattura, la toglie dal recall e avvisa chi
 * stava sollecitando.
 */
export function useRegistraIncasso() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      invoice_id: string;
      date: string;
      amount: number;
      method?: string | null;
      bank_ref?: string | null;
    }) => {
      const utente = (await supabase.auth.getUser()).data.user;
      const { error } = await (supabase as any).from("invoice_payments").insert({
        ...v,
        created_by: utente?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["payments", "incassi", v.invoice_id] });
    },
  });
}

export interface AmmancoAperto {
  certification_id: string;
  progetto: string | null;
  commessa: string | null;
  importo: number;
  quanti: number;
  /** I numeri delle fatture su cui l'ammanco è nato. */
  fatture: string | null;
  dal: string | null;
}

/**
 * Gli ammanchi ancora da recuperare su un progetto.
 *
 * Serve a chi emette la fattura successiva: l'ammanco è già dentro il residuo
 * delle tranche, ma nessuno lo aggiungerebbe all'importo se non gli venisse
 * detto — e diciannove euro e cinquanta, per quanto piccoli, non si perdono
 * perché nessuno li ha ricordati.
 */
export function useAmmanchiAperti(certId: string | null) {
  return useQuery({
    queryKey: ["payments", "ammanchi", certId],
    enabled: !!certId,
    queryFn: async (): Promise<AmmancoAperto[]> => {
      const { data, error } = await (supabase as any)
        .from("v_ammanchi_aperti")
        .select("*")
        .eq("certification_id", certId);
      if (error) throw error;
      return (data ?? []) as AmmancoAperto[];
    },
  });
}

/** Le causali ammesse, nell'ordine in cui capitano. */
export const CAUSALI_DECURTAZIONE = [
  { valore: "spese_bancarie", etichetta: "Spese bancarie" },
  { valore: "ritenuta_fiscale", etichetta: "Ritenuta fiscale" },
  { valore: "differenza_cambio", etichetta: "Differenza cambio" },
  { valore: "arrotondamento", etichetta: "Arrotondamento" },
  { valore: "altro", etichetta: "Altro (spiega nella nota)" },
] as const;

/**
 * Registrare una decurtazione: quello che non arriverà.
 *
 * Distinta dall'incasso perché non è denaro entrato, e dalla nota di credito
 * perché non è un credito a cui rinunciamo — il cliente ha pagato tutto, a
 * trattenerne un pezzo è stato un terzo. Riduce il residuo, e quando il residuo
 * finisce la fattura si chiude come si chiuderebbe con un incasso: esce dal
 * recall, i solleciti si spengono.
 */
export function useRegistraDecurtazione() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      invoice_id: string;
      date: string;
      amount: number;
      causale: string;
      note?: string | null;
      /** Se non lo si dice, si recupera: un default che perde denaro è sbagliato. */
      destino?: "da_recuperare" | "assorbito";
    }) => {
      const utente = (await supabase.auth.getUser()).data.user;
      const { error } = await (supabase as any).from("invoice_decurtazioni").insert({
        ...v,
        created_by: utente?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["payments", "incassi", v.invoice_id] });
    },
  });
}

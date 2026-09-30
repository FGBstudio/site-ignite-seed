import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Currency, EntityCode, TipoNota } from "@/types/payments";

/**
 * Il prospetto del venerdì.
 *
 * Due domande che sembrano una sola: «quanto mi aspetto a novembre» guarda le
 * fatture e il mese lo decide la promessa del cliente; «quanto è entrato a
 * settembre» guarda gli incassi e il mese lo decide il bonifico. Per questo
 * sono due viste e non una con un interruttore.
 */

export interface FollowupFattura {
  id: string;
  number: string;
  issue_date: string;
  client_name: string | null;
  project_name: string | null;
  commessa: string | null;
  entity_code: EntityCode | null;
  issuer_name: string | null;
  currency: Currency;
  imponibile: number;
  vat_amount: number;
  total: number;
  paid_amount: number;
  residual: number;
  due_date: string;
  days_late: number;
  lifecycle_state: string;
  recall_status: string | null;
  payment_status: string;
  ammanco_da_recuperare: number;
  data_incasso_attesa: string | null;
  data_incasso_attesa_fonte: string | null;
  /** `YYYY-MM`. Nullo quando nessuno ha promesso niente: è il filtro stesso. */
  mese_previsto: string | null;
  in_recall: boolean;
  primo_sollecito: string | null;
  giorni_in_recall: number | null;
  reminders_count: number;
  ultima_nota: string | null;
  ultima_nota_il: string | null;
  ultima_nota_tipo: TipoNota | null;
  quante_note: number;
  ultimo_incasso: string | null;
}

export interface FollowupIncasso {
  incasso_id: string;
  invoice_id: string;
  incassato_il: string;
  mese_incasso: string;
  incassato: number;
  method: string | null;
  bank_ref: string | null;
  number: string;
  issue_date: string;
  client_name: string | null;
  project_name: string | null;
  commessa: string | null;
  entity_code: EntityCode | null;
  issuer_name: string | null;
  currency: Currency;
  imponibile: number;
  vat_amount: number;
  total: number;
  due_date: string;
  outstanding: number;
  ammanco_da_recuperare: number;
  giorni_per_incassare: number;
  reminders_count: number;
  ultima_nota: string | null;
}

/** Le fatture con una promessa: il previsionale. */
export function useFollowupPrevisionale() {
  return useQuery({
    queryKey: ["payments", "followup", "previsionale"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_followup_fatture")
        .select("*")
        .order("data_incasso_attesa", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as FollowupFattura[];
    },
  });
}

/** Gli incassi arrivati: il definitivo. */
export function useFollowupDefinitivo() {
  return useQuery({
    queryKey: ["payments", "followup", "definitivo"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_followup_incassi")
        .select("*")
        .order("incassato_il", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FollowupIncasso[];
    },
  });
}

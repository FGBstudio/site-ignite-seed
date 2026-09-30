import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Currency, EntityCode, PaymentStatus } from "@/types/payments";

/**
 * Quanto è stato quotato, quanto fatturato, quanto incassato — per progetto.
 *
 * È l'«Elenco Progetti» che Francesca tiene a mano. Nessuno di questi numeri è
 * scritto da qualche parte: sono rapporti fra righe che esistono già, e per
 * questo non possono divergere.
 */

export interface ProgettoFatturazione {
  id: string;
  progetto: string;
  brand: string | null;
  intestatario: string | null;
  intestatario_id: string | null;
  city: string | null;
  country: string | null;
  cert_type: string | null;
  cert_rating: string | null;
  cert_level: string | null;
  project_subtype: string | null;
  cert_version: string | null;
  status: string;
  currency: Currency;
  entity_code: EntityCode | null;
  emittente: string | null;
  pm: string | null;
  quotation_sent_date: string | null;
  quotation_approved_at: string | null;
  handover_date: string | null;
  listino: number | null;
  /** Nullo quando la quotazione non è mai stata registrata. */
  quotato: number | null;
  tranche_totali: number;
  quante_tranche: number;
  tranche_fatturate: number;
  fatturato: number;
  incassato: number;
  /** Nullo quando non c'è un quotato a cui confrontarlo. */
  da_fatturare: number | null;
  da_incassare: number;
  pct_fatturazione: number | null;
  /** Fatturato senza che la quotazione sia stata caricata: un buco da colmare. */
  quotazione_mancante: boolean;
}

export interface TrancheFatturazione {
  tranche_id: string;
  certification_id: string;
  tranche_order: number | null;
  tranche: string | null;
  tranche_pct: number | null;
  importo_previsto: number | null;
  trigger_event: string | null;
  payment_scheme: string | null;
  data_prevista: string | null;
  tranche_state: string | null;
  invoice_id: string | null;
  fattura: string | null;
  emessa_il: string | null;
  scade_il: string | null;
  fatturato: number | null;
  incassato: number | null;
  residuo: number | null;
  currency: Currency | null;
  lifecycle_state: string | null;
  payment_status: PaymentStatus | null;
  days_late: number | null;
  data_incasso_attesa: string | null;
  ultima_nota: string | null;
  fatturata: boolean;
}

export function useProgettiFatturazione() {
  return useQuery({
    queryKey: ["payments", "progetti-fatturazione"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_progetti_fatturazione")
        .select("*")
        .order("fatturato", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProgettoFatturazione[];
    },
  });
}

/** Le tranche di un progetto, con la loro fattura quando c'è. */
export function useTrancheProgetto(certificationId: string | null) {
  return useQuery({
    enabled: !!certificationId,
    queryKey: ["payments", "tranche-progetto", certificationId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_tranche_fatturazione")
        .select("*")
        .eq("certification_id", certificationId)
        .order("tranche_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TrancheFatturazione[];
    },
  });
}

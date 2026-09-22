import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CashEvent, Commessa, ProgettoTempi } from "@/types/payments";

/**
 * I dati della WBS di cassa.
 *
 * Si legge da `v_cash_events`, che unifica due alimentatori diversi —
 * `cert_payment_milestones` per gli incassi, `uscite_previste` per le uscite —
 * in una forma sola. La griglia non deve sapere da dove arriva una riga: deve
 * sapere che in settimana X entrano o escono N euro e con che certezza.
 *
 * Fare qui la union invece che in database vorrebbe dire due query, due
 * normalizzazioni e due occasioni di farle divergere.
 */

export function useCashEvents() {
  return useQuery({
    queryKey: ["payments", "cash-events"],
    queryFn: async (): Promise<CashEvent[]> => {
      const { data, error } = await (supabase as any)
        .from("v_cash_events")
        .select("*")
        .order("data", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as CashEvent[];
    },
  });
}

/**
 * I tempi dei progetti: materiali, installazione, incassi.
 *
 * Query separata perché è un'altra domanda: `v_cash_events` dice quando si
 * muove un euro, questa dice quanto tempo passa fra il primo esborso e
 * l'ultimo rientro. Mescolarle costringerebbe a sommare durate.
 */
export function useProgettiTempi() {
  return useQuery({
    queryKey: ["payments", "progetti-tempi"],
    queryFn: async (): Promise<ProgettoTempi[]> => {
      const { data, error } = await (supabase as any).from("v_progetti_tempi").select("*");
      if (error) throw error;
      return (data ?? []) as ProgettoTempi[];
    },
  });
}

export function useCommesse() {
  return useQuery({
    queryKey: ["payments", "commesse"],
    queryFn: async (): Promise<Commessa[]> => {
      const { data, error } = await (supabase as any)
        .from("commesse")
        .select("*")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as Commessa[];
    },
  });
}

/* ── Le azioni sul singolo movimento ──────────────────────────────────────── */

function giorniDopo(data: string, giorni: number): string {
  const d = new Date(data + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + giorni);
  return d.toISOString().slice(0, 10);
}

/**
 * Sposta un movimento avanti o indietro di una settimana.
 *
 * Lato incassi si scrive su `data_pagamento_prevista` e non su
 * `data_prevista`: quella è calcolata da `fn_ricalcola_date_tranche`, e
 * scriverci sopra a mano vorrebbe dire vedersi annullare lo spostamento al
 * primo ricalcolo. La colonna giusta è quella che alimenta la scala.
 */
export function useSpostaMovimento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; origine: "tranche" | "uscita"; data: string; giorni: number }) => {
      const nuova = giorniDopo(v.data, v.giorni);
      const tabella = v.origine === "tranche" ? "cert_payment_milestones" : "uscite_previste";
      const campo = v.origine === "tranche" ? "data_pagamento_prevista" : "data_prevista";
      const { error } = await (supabase as any)
        .from(tabella)
        .update({ [campo]: nuova })
        .eq("id", v.id);
      if (error) throw error;
      if (v.origine === "tranche") {
        const { error: e2 } = await (supabase as any).rpc("fn_ricalcola_date_tranche", { p_solo_prova: false });
        if (e2) throw e2;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments", "cash-events"] });
      qc.invalidateQueries({ queryKey: ["payments", "progetti-tempi"] });
    },
  });
}

/** Segna un movimento come avvenuto: incassato se entrata, pagato se uscita. */
export function useSegnaAvvenuto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; origine: "tranche" | "uscita"; data: string }) => {
      if (v.origine === "tranche") {
        const { error } = await (supabase as any)
          .from("cert_payment_milestones")
          .update({ payment_received_date: v.data, status: "Paid", tranche_state: "invoiced" })
          .eq("id", v.id);
        if (error) throw error;
        const { error: e2 } = await (supabase as any).rpc("fn_ricalcola_date_tranche", { p_solo_prova: false });
        if (e2) throw e2;
      } else {
        const { error } = await (supabase as any)
          .from("uscite_previste")
          .update({ stato: "pagata", data_effettiva: v.data })
          .eq("id", v.id);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payments", "cash-events"] }),
  });
}

/** Approva un'uscita: da «prevista» a «approvata». Solo lato passivo. */
export function useApprovaUscita() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("uscite_previste")
        .update({ stato: "approvata" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payments", "cash-events"] }),
  });
}

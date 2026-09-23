import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  AllocazionePO,
  CondizionePO,
  ControlloCongruenza,
  Currency,
  EsitoPayWhenPaid,
  PropostaAbbinamento,
  RichiestaFornitura,
} from "@/types/payments";

/**
 * La Richiesta di Fornitura e ciò che ne discende.
 *
 * Il principio è che il previsionale di cassa non si scrive: si genera. Il PM
 * dichiara l'ordine, il fornitore, e a quali condizioni è stato negoziato; il
 * database ne ricava le uscite, una per rata e per progetto servito. Per
 * questo qui non c'è quasi nessuna mutazione che tocchi `uscite_previste`:
 * si scrivono le condizioni, e i flag si spostano da soli.
 *
 * L'unica eccezione volontaria è l'approvazione, che è un gesto e non un dato:
 * passa da `stato_richiesta`, e il trigger fa il resto.
 */

const CHIAVE = ["fornitura"];

/* ── Lettura ──────────────────────────────────────────────────────────────── */

export function useRichiesteFornitura() {
  return useQuery({
    queryKey: [...CHIAVE, "ordini"],
    queryFn: async (): Promise<RichiestaFornitura[]> => {
      const { data, error } = await (supabase as any)
        .from("ops_purchase_orders")
        .select("*")
        .order("data_ordine", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as RichiestaFornitura[];
    },
  });
}

export function useCondizioni(poId: string | null) {
  return useQuery({
    queryKey: [...CHIAVE, "condizioni", poId],
    enabled: !!poId,
    queryFn: async (): Promise<CondizionePO[]> => {
      const { data, error } = await (supabase as any)
        .from("po_condizioni")
        .select("*")
        .eq("po_id", poId)
        .order("ordine");
      if (error) throw error;
      return (data ?? []) as CondizionePO[];
    },
  });
}

export function useAllocazioni(poId: string | null) {
  return useQuery({
    queryKey: [...CHIAVE, "allocazioni", poId],
    enabled: !!poId,
    queryFn: async (): Promise<AllocazionePO[]> => {
      const { data, error } = await (supabase as any)
        .from("po_allocazioni")
        .select("*")
        .eq("po_id", poId);
      if (error) throw error;
      return (data ?? []) as AllocazionePO[];
    },
  });
}

/**
 * Il controllo «pay when paid», letto e non calcolato qui.
 *
 * Sta nel database perché deve confrontare le uscite di quest'ordine con gli
 * incassi attesi dell'intera commessa, che arrivano dalle tranche: farlo nel
 * browser vorrebbe dire scaricare due mondi per rispondere a una domanda sola.
 */
export function usePayWhenPaid(poId: string | null) {
  return useQuery({
    queryKey: [...CHIAVE, "pwp", poId],
    enabled: !!poId,
    queryFn: async (): Promise<EsitoPayWhenPaid[]> => {
      const { data, error } = await (supabase as any).rpc("fn_verifica_pay_when_paid", {
        p_po: poId,
      });
      if (error) throw error;
      return (data ?? []) as EsitoPayWhenPaid[];
    },
  });
}

/* ── Scrittura ────────────────────────────────────────────────────────────── */

export function useSalvaRichiesta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: Partial<RichiestaFornitura> & { id?: string }) => {
      const { id, importo_eur, ...campi } = v as any;
      // `importo_eur` è generata dal database: mandarla indietro sarebbe un errore.
      if (id) {
        const { error } = await (supabase as any)
          .from("ops_purchase_orders")
          .update(campi)
          .eq("id", id);
        if (error) throw error;
        return id as string;
      }
      const { data, error } = await (supabase as any)
        .from("ops_purchase_orders")
        .insert(campi)
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CHIAVE });
      qc.invalidateQueries({ queryKey: ["payments"] });
    },
  });
}

export function useSalvaCondizione() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: Partial<CondizionePO> & { po_id: string }) => {
      const { id, ...campi } = v as any;
      if (id) {
        const { error } = await (supabase as any)
          .from("po_condizioni")
          .update(campi)
          .eq("id", id);
        if (error) throw error;
        return;
      }
      const { error } = await (supabase as any).from("po_condizioni").insert(campi);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CHIAVE });
      qc.invalidateQueries({ queryKey: ["payments"] });
    },
  });
}

export function useEliminaCondizione() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("po_condizioni").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CHIAVE });
      qc.invalidateQueries({ queryKey: ["payments"] });
    },
  });
}

export function useSalvaAllocazione() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: Partial<AllocazionePO> & { po_id: string }) => {
      const { id, ...campi } = v as any;
      if (id) {
        const { error } = await (supabase as any)
          .from("po_allocazioni")
          .update(campi)
          .eq("id", id);
        if (error) throw error;
        return;
      }
      const { error } = await (supabase as any).from("po_allocazioni").insert(campi);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CHIAVE });
      qc.invalidateQueries({ queryKey: ["payments"] });
    },
  });
}

export function useEliminaAllocazione() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("po_allocazioni").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CHIAVE });
      qc.invalidateQueries({ queryKey: ["payments"] });
    },
  });
}

/**
 * Approvare la richiesta.
 *
 * È il momento in cui i flag previsionali compaiono sulla timeline: il
 * trigger sull'ordine chiama il generatore e poi il controllo pay when paid.
 * Da qui non si scrive nessuna uscita a mano.
 */
export function useApprovaRichiesta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; stato: RichiestaFornitura["stato_richiesta"] }) => {
      const { error } = await (supabase as any)
        .from("ops_purchase_orders")
        .update({ stato_richiesta: v.stato })
        .eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CHIAVE });
      qc.invalidateQueries({ queryKey: ["payments"] });
    },
  });
}

/* ── Fattura fornitore ↔ ordine ───────────────────────────────────────────── */

/** Le rate d'ordine che potrebbero corrispondere a un importo ricevuto. */
export function useProponiAbbinamento(
  supplierId: string | null,
  totale: number | null,
  valuta: Currency | null,
) {
  return useQuery({
    queryKey: [...CHIAVE, "proposta", supplierId, totale, valuta],
    enabled: !!supplierId && totale !== null,
    queryFn: async (): Promise<PropostaAbbinamento[]> => {
      const { data, error } = await (supabase as any).rpc("fn_proponi_po_per_fattura", {
        p_supplier: supplierId,
        p_importo: totale,
        p_valuta: valuta,
      });
      if (error) throw error;
      return (data ?? []) as PropostaAbbinamento[];
    },
  });
}

export function useVerificaCongruenza(invoiceId: string | null) {
  return useQuery({
    queryKey: [...CHIAVE, "congruenza", invoiceId],
    enabled: !!invoiceId,
    queryFn: async (): Promise<ControlloCongruenza[]> => {
      const { data, error } = await (supabase as any).rpc("fn_verifica_fattura_po", {
        p_invoice: invoiceId,
      });
      if (error) throw error;
      return (data ?? []) as ControlloCongruenza[];
    },
  });
}

export function useAbbinaFattura() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; po_id: string; condizione_id: string }) => {
      const { error } = await (supabase as any)
        .from("passive_invoices")
        .update({ po_id: v.po_id, po_condizione_id: v.condizione_id })
        .eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CHIAVE });
      qc.invalidateQueries({ queryKey: ["payments"] });
    },
  });
}

/**
 * Approvare la fattura: la rata smette di essere una previsione.
 *
 * Resta tratteggiata — pieno vuol dire avvenuto, e un debito con scadenza non
 * è ancora un bonifico — ma prende la data esatta del documento e non si
 * sposta più da sola.
 */
export function useApprovaFattura() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; scadenza?: string | null }) => {
      const { error } = await (supabase as any).rpc("fn_approva_fattura_passiva", {
        p_invoice: v.id,
        p_scadenza: v.scadenza ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CHIAVE });
      qc.invalidateQueries({ queryKey: ["payments"] });
    },
  });
}

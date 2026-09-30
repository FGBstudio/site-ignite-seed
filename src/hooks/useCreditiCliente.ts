import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Currency } from "@/types/payments";

/**
 * Il credito che resta a un cliente quando un progetto si chiude prima di
 * consumare quello che aveva pagato.
 *
 * «Louis Vuitton cancella il progetto a metà strada. Questi 6.750 mi rimangono a
 * credito e lui mi dice: li useremo per un progetto futuro.» Prima quella frase
 * viveva in una mail, e diciotto mesi dopo, quando si preparava l'offerta nuova,
 * non se la ricordava nessuno.
 *
 * Il saldo non si legge da una colonna: è la somma degli aperti, e la fa il
 * database.
 */

export type StatoCredito = "aperto" | "usato" | "rimborsato" | "perso";

export interface CreditoCliente {
  id: string;
  contact_id: string;
  cliente: string;
  certification_id_origine: string | null;
  progetto_origine: string | null;
  stato_progetto_origine: string | null;
  importo: number;
  valuta: Currency;
  motivo: string;
  stato: StatoCredito;
  usato_su_certification_id: string | null;
  progetto_uso: string | null;
  usato_il: string | null;
  data: string;
  note: string | null;
  created_at: string;
  registrato_da: string | null;
}

export interface SaldoCredito {
  contact_id: string;
  cliente: string;
  valuta: Currency;
  credito_aperto: number | null;
  quanti_aperti: number;
  credito_usato: number | null;
  credito_rimborsato: number | null;
  credito_perso: number | null;
  aperto_piu_recente: string | null;
}

/**
 * Quanto il cliente ha pagato in più di quello che gli è stato consegnato.
 *
 * È la cifra che il dialogo di cancellazione propone. Proposta, non imposta: la
 * parte «nostra» di un progetto interrotto è una trattativa, non una
 * sottrazione.
 */
export interface CreditoDaCancellazione {
  certification_id: string;
  progetto: string;
  status: string;
  valuta: Currency;
  billing_contact_id: string | null;
  incassato: number;
  consegnato: number;
  quante_consegnate: number;
  quante_tranche: number;
  differenza_a_favore: number;
  /** Quello che è già stato registrato su questo progetto: non si registra due volte. */
  credito_gia_registrato: number | null;
}

/** Tutti i crediti, per la sezione clienti. */
export function useCreditiCliente() {
  return useQuery({
    queryKey: ["payments", "crediti"],
    queryFn: async (): Promise<CreditoCliente[]> => {
      const { data, error } = await (supabase as any)
        .from("v_crediti_cliente")
        .select("*")
        .order("data", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CreditoCliente[];
    },
  });
}

/** I crediti aperti di un cliente: quelli che un'offerta nuova deve ricordare. */
export function useCreditiApertiDi(contactId: string | null) {
  return useQuery({
    queryKey: ["payments", "crediti-aperti", contactId],
    enabled: !!contactId,
    queryFn: async (): Promise<CreditoCliente[]> => {
      const { data, error } = await (supabase as any)
        .from("v_crediti_cliente")
        .select("*")
        .eq("contact_id", contactId)
        .eq("stato", "aperto")
        .order("data");
      if (error) throw error;
      return (data ?? []) as CreditoCliente[];
    },
  });
}

/**
 * I crediti aperti delle società di un brand.
 *
 * Il wizard delle quotazioni conosce il brand, non la società che pagherà — la
 * fattura si intesta dopo. Ma un credito di «Louis Vuitton» deve comparire
 * mentre si scrive l'offerta per Louis Vuitton, non dopo: quindi si cercano i
 * crediti di tutte le società di quel brand.
 */
export function useCreditiApertiDelBrand(brandId: string | null | undefined) {
  return useQuery({
    queryKey: ["payments", "crediti-brand", brandId],
    enabled: !!brandId,
    queryFn: async (): Promise<CreditoCliente[]> => {
      const { data: societa, error: e1 } = await supabase
        .from("contacts")
        .select("id")
        .eq("brand_id", brandId!)
        .eq("kind", "client");
      if (e1) throw e1;
      const ids = (societa ?? []).map((c) => c.id);
      if (ids.length === 0) return [];

      const { data, error } = await (supabase as any)
        .from("v_crediti_cliente")
        .select("*")
        .in("contact_id", ids)
        .eq("stato", "aperto")
        .order("data");
      if (error) throw error;
      return (data ?? []) as CreditoCliente[];
    },
  });
}

/** I saldi per cliente: la somma degli aperti. */
export function useSaldiCredito() {
  return useQuery({
    queryKey: ["payments", "saldi-credito"],
    queryFn: async (): Promise<SaldoCredito[]> => {
      const { data, error } = await (supabase as any)
        .from("v_saldo_credito_cliente")
        .select("*")
        .order("credito_aperto", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as SaldoCredito[];
    },
  });
}

/**
 * La proposta di credito per i progetti che si stanno cancellando.
 *
 * Più di uno, perché dal form di Operations si cancella il sito con tutte le sue
 * certificazioni: il conto va sommato su quelle, non letto su una.
 */
export function useCreditoDaCancellazione(certIds: string[]) {
  const chiavi = [...certIds].sort();
  return useQuery({
    queryKey: ["payments", "credito-cancellazione", chiavi.join(",")],
    enabled: chiavi.length > 0,
    queryFn: async (): Promise<CreditoDaCancellazione[]> => {
      const { data, error } = await (supabase as any)
        .from("v_credito_da_cancellazione")
        .select("*")
        .in("certification_id", chiavi);
      if (error) throw error;
      return (data ?? []) as CreditoDaCancellazione[];
    },
  });
}

/**
 * Cancellare un progetto, e decidere cosa resta al cliente.
 *
 * Il credito si registra dentro la stessa transazione della cancellazione: se
 * qualcosa non torna il progetto resta vivo, invece di restare cancellato senza
 * il suo credito.
 */
export function useCancellaProgetto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      certification_id: string;
      credito?: number;
      motivo?: string | null;
      contact_id?: string | null;
      note?: string | null;
    }) => {
      const { data, error } = await (supabase as any).rpc("fn_cancella_progetto", {
        p_certification_id: v.certification_id,
        p_credito: v.credito ?? 0,
        p_motivo: v.motivo ?? null,
        p_contact_id: v.contact_id ?? null,
        p_note: v.note ?? null,
      });
      if (error) throw error;
      return data as string | null;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      // Il progetto ha cambiato stato: le schermate che lo elencano lo sanno solo
      // se glielo si dice.
      qc.invalidateQueries({ queryKey: ["certifications"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

/**
 * Tenere conto di un credito in un'offerta nuova.
 *
 * Segna il collegamento e porta il credito a «usato». **Non scala l'importo
 * dell'offerta**: quello lo scrive chi tratta, e uno sconto deciso da un
 * automatismo è uno sconto che nessuno ha negoziato.
 */
export function useUsaCredito() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { credito_id: string; certification_id: string }) => {
      const { error } = await (supabase as any).rpc("fn_usa_credito", {
        p_credito_id: v.credito_id,
        p_certification_id: v.certification_id,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payments"] }),
  });
}

/** Chiudere un credito: rimborsato, o perso. Mai cancellato. */
export function useChiudiCredito() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      credito_id: string;
      stato: "rimborsato" | "perso";
      note?: string | null;
    }) => {
      const { error } = await (supabase as any).rpc("fn_chiudi_credito", {
        p_credito_id: v.credito_id,
        p_stato: v.stato,
        p_note: v.note ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payments"] }),
  });
}

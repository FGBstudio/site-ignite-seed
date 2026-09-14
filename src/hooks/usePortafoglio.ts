import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Il portafoglio direzionale.
 *
 * I numeri arrivano gia' calcolati da `fn_portafoglio_siti`: gli stessi valori
 * servono al cruscotto, al dettaglio sito e alla riga espandibile, e tre calcoli
 * paralleli in TypeScript diventerebbero tre risposte diverse alla stessa
 * domanda entro il primo mese.
 */
export interface RigaPortafoglio {
  site_id: string;
  sito: string;
  citta: string | null;
  cliente: string | null;
  certificazioni: number;
  /** Tutto quello che c'era e' arrivato in fondo: finito, non incompleto. */
  storico: boolean;
  cronoprogramma_id: string | null;
  fase_corrente: string | null;
  fase_data: string | null;
  /** Contro la baseline contrattuale: serve a negoziare. */
  slittamento_giorni: number | null;
  /** Contro le date correnti: serve a decidere oggi. Si chiude da solo. */
  ritardo_nostro_giorni: number | null;
  prossima_milestone: string | null;
  prossima_data: string | null;
  prossimo_pm: string | null;
  freschezza_giorni: number | null;
  stantio: boolean;
  fine_stimata: string | null;
  scadenza_contratto: string | null;
  a_rischio: boolean;
  mesi_proroga: number | null;
  report_contrattuali: number | null;
  report_proiettati: number | null;
  conferme_in_sospeso: number;
  vincoli_violati: number;
}

export function usePortafoglio(sogliaStantio = 21) {
  return useQuery({
    queryKey: ["portafoglio", sogliaStantio],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("fn_portafoglio_siti", {
        p_soglia_stantio: sogliaStantio,
      });
      if (error) throw error;
      return (data ?? []) as RigaPortafoglio[];
    },
  });
}

/**
 * Le corsie di un sito: il cronoprogramma sopra, le certificazioni sotto.
 *
 * Si carica solo quando la riga si apre. Precaricarle per tutto il portafoglio
 * sarebbero ottocento query per mostrarne una.
 */
export interface CorsieSito {
  eventi: { nome: string; data: string | null }[];
  certificazioni: {
    id: string;
    nome: string;
    pm: string | null;
    milestone: { requirement: string; due_date: string | null; derived_from: string | null; anchor_order: number | null; series_step_order: number | null }[];
  }[];
}

export function useCorsieSito(siteId: string | undefined, cronoId: string | null | undefined, aperto: boolean) {
  return useQuery({
    queryKey: ["portafoglio", "corsie", siteId],
    enabled: !!siteId && aperto,
    queryFn: async (): Promise<CorsieSito> => {
      const eventi = cronoId
        ? (
            await (supabase as any)
              .from("cronoprogramma_eventi")
              .select("nome, data_pianificata, data_effettiva, ordine")
              .eq("cronoprogramma_id", cronoId)
              .order("ordine")
          ).data ?? []
        : [];

      const { data: certs } = await (supabase as any)
        .from("certifications")
        .select("id, name, pm_id")
        .eq("site_id", siteId)
        .not("status", "in", '("canceled","cancelled","potential","quotation")');

      const ids = (certs ?? []).map((c: any) => c.id);
      const { data: ms } = ids.length
        ? await (supabase as any)
            .from("certification_milestones")
            .select("certification_id, requirement, due_date, derived_from, anchor_order, series_step_order, order_index")
            .in("certification_id", ids)
            .eq("milestone_type", "timeline")
            .order("order_index")
        : { data: [] };

      const pmIds = Array.from(new Set((certs ?? []).map((c: any) => c.pm_id).filter(Boolean)));
      const { data: profili } = pmIds.length
        ? await (supabase as any).from("profiles").select("id, full_name, email").in("id", pmIds)
        : { data: [] };
      const nome = new Map<string, string>(
        ((profili ?? []) as any[]).map((p) => [p.id as string, (p.full_name || p.email) as string])
      );

      return {
        eventi: (eventi as any[]).map((e) => ({
          nome: e.nome,
          data: e.data_effettiva ?? e.data_pianificata ?? null,
        })),
        certificazioni: (certs ?? []).map((c: any) => ({
          id: c.id,
          nome: c.name,
          pm: c.pm_id ? nome.get(c.pm_id) ?? null : null,
          milestone: ((ms ?? []) as any[]).filter((m) => m.certification_id === c.id),
        })),
      };
    },
  });
}

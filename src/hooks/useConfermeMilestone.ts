import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Le milestone che aspettano il timbro del PM.
 *
 * La catena era tutta automatica: si chiudeva una milestone agganciata a un
 * passo, la tranche passava a esigibile e **nello stesso istante** partiva
 * l'avviso a Payments, che emetteva. Funziona finché la milestone si chiude
 * perché il lavoro è fatto davvero — ma si chiude anche per scorrimento del
 * tempo, e se la data era stata spostata in avanti senza che nessuno la
 * aggiornasse, la fattura arriva al cliente prima del lavoro.
 *
 * Ora in mezzo c'è una persona. La tranche resta «prevista», che è la verità, e
 * il PM ha due risposte: **è raggiunta** — e solo allora Payments lo viene a
 * sapere — oppure **non lo è**, e sposta la data.
 *
 * La seconda risposta conta quanto la prima: senza di lei l'unico modo di non
 * confermare sarebbe ignorare l'avviso, e un avviso ignorato torna domani
 * identico.
 */

export interface ConfermaMilestone {
  alert_id: string;
  /** La milestone da timbrare, letta dalla chiave di deduplica dell'avviso. */
  milestone_id: string;
  tranche_id: string;
  certification_id: string | null;
  progetto: string | null;
  cliente: string | null;
  titolo: string;
  descrizione: string | null;
  /** La settimana in cui il traguardo era previsto: è lì che il PM lo cerca. */
  quando: string | null;
  aperto_il: string;
}

/**
 * Dalla chiave `milestone_conferma:<milestone>:<tranche>` si leggono i due id.
 *
 * Stanno nella chiave e non in colonne proprie perché `task_alerts` ha un posto
 * solo per un riferimento, e qui ne servono due. La chiave la scrive il trigger:
 * è l'unico punto che la compone, quindi è l'unico punto che la può rompere.
 */
function idDallaChiave(dedup: string): { milestone_id: string; tranche_id: string } | null {
  const p = String(dedup).split(":");
  if (p.length !== 3 || p[0] !== "milestone_conferma") return null;
  return { milestone_id: p[1], tranche_id: p[2] };
}

export function useConfermeMilestone(pmId?: string | null) {
  return useQuery({
    queryKey: ["conferme-milestone", pmId ?? "tutti"],
    queryFn: async (): Promise<ConfermaMilestone[]> => {
      let q = (supabase as any)
        .from("task_alerts")
        .select(
          `id, dedup_key, certification_id, title, description, scheduled_date, created_at,
           certifications!task_alerts_certification_id_fkey ( name, client, pm_id )`,
        )
        .eq("alert_type", "milestone_da_confermare")
        .eq("is_resolved", false)
        .order("scheduled_date", { nullsFirst: false });
      if (pmId) q = q.eq("certifications.pm_id", pmId);

      const { data, error } = await q;
      if (error) throw error;

      return ((data ?? []) as Record<string, any>[])
        .map((r) => {
          const ids = idDallaChiave(r.dedup_key);
          if (!ids) return null;
          return {
            alert_id: String(r.id),
            ...ids,
            certification_id: r.certification_id ?? null,
            progetto: r.certifications?.name ?? null,
            cliente: r.certifications?.client ?? null,
            titolo: String(r.title ?? ""),
            descrizione: r.description ?? null,
            quando: r.scheduled_date ?? null,
            aperto_il: String(r.created_at),
          } as ConfermaMilestone;
        })
        .filter((x): x is ConfermaMilestone => x !== null);
    },
  });
}

/** «È raggiunta»: la tranche diventa esigibile e Payments lo viene a sapere. */
export function useConfermaMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { milestone_id: string; tranche_id?: string | null }) => {
      const { data, error } = await (supabase as any).rpc("fn_conferma_milestone_pagamento", {
        p_milestone_id: v.milestone_id,
        p_tranche_id: v.tranche_id ?? null,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conferme-milestone"] });
      qc.invalidateQueries({ queryKey: ["task-alerts"] });
      qc.invalidateQueries({ queryKey: ["settimana-pm"] });
      // Il «da emettere» di Payments cambia: è il senso di tutto il passaggio.
      qc.invalidateQueries({ queryKey: ["payments"] });
    },
  });
}

/** «Non è raggiunta»: si sposta la data, e la richiesta si chiude. */
export function useRinviaMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { milestone_id: string; nuova_data: string; motivo?: string | null }) => {
      const { error } = await (supabase as any).rpc("fn_rinvia_milestone_pagamento", {
        p_milestone_id: v.milestone_id,
        p_nuova_data: v.nuova_data,
        p_motivo: v.motivo ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conferme-milestone"] });
      qc.invalidateQueries({ queryKey: ["task-alerts"] });
      qc.invalidateQueries({ queryKey: ["settimana-pm"] });
    },
  });
}

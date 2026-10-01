import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { lunediDellaSettimana } from "@/lib/settimane";

/**
 * Cosa succede questa settimana, per il PM che apre la dashboard.
 *
 * La dashboard diceva quanti progetti ci sono e in che stato: informazioni vere e
 * che non cambiano da un giorno all'altro. Quello che manca è la domanda con cui
 * uno apre la pagina il lunedì mattina — **cosa devo fare entro venerdì**.
 *
 * Due cose la compongono, e sono di natura diversa: le milestone che maturano
 * questa settimana, che il sistema sa da sé perché hanno una data; e gli appunti
 * che il PM si è scritto sulla casella della settimana, che il sistema non può
 * sapere. Tenerle separate evita di mescolare un impegno preso con il calendario
 * e un promemoria scritto a mano.
 */

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Il lunedì e la domenica della settimana che contiene `oggi`. */
export function settimanaCorrente(oggi: Date = new Date()): { dal: string; al: string } {
  const lun = lunediDellaSettimana(
    new Date(Date.UTC(oggi.getFullYear(), oggi.getMonth(), oggi.getDate())),
  );
  const dom = new Date(lun);
  dom.setUTCDate(dom.getUTCDate() + 6);
  return { dal: iso(lun), al: iso(dom) };
}

export interface MilestoneDellaSettimana {
  id: string;
  certification_id: string;
  progetto: string | null;
  cliente: string | null;
  requisito: string | null;
  categoria: string | null;
  /** La data che conta: lo spostamento quando c'è, altrimenti quella prevista. */
  data: string;
  /** Vero quando la data è stata spostata a mano: lo si deve vedere. */
  spostata: boolean;
  stato: string | null;
  /**
   * Se chiudendola si sblocca una tranche di pagamento.
   *
   * È l'informazione che cambia il peso della riga: una milestone qualunque è un
   * promemoria, una che apre una fattura è una cosa che il cliente vedrà.
   */
  sblocca_pagamento: boolean;
  importo_tranche: number | null;
  nome_tranche: string | null;
}

/**
 * Le milestone dei miei progetti che maturano in questa settimana.
 *
 * `override_date` vince su `due_date`: quando una data è stata spostata, quella
 * spostata è la vera. Guardare solo `due_date` farebbe comparire fra gli impegni
 * di questa settimana cose già rinviate — ed è lo stesso scollamento che manda
 * una fattura al cliente prima del tempo.
 */
export function useMilestoneDellaSettimana(pmId: string | null | undefined, oggi?: Date) {
  const { dal, al } = settimanaCorrente(oggi);
  return useQuery({
    queryKey: ["settimana-pm", "milestone", pmId ?? "tutti", dal],
    enabled: !!pmId,
    queryFn: async (): Promise<MilestoneDellaSettimana[]> => {
      /**
       * Il filtro sulla data si fa qui, non nella query.
       *
       * La condizione vera è «`override_date` quando c'è, altrimenti `due_date`,
       * dentro la settimana»: in PostgREST diventa un `or` con due `and`
       * annidati, che è esattamente il genere di filtro che smette di funzionare
       * in silenzio. Le milestone di un PM sono poche decine: si prendono e si
       * filtrano, e la condizione resta leggibile.
       */
      const { data, error } = await (supabase as any)
        .from("certification_milestones")
        .select(
          `id, certification_id, category, requirement, status, due_date, override_date, step_id,
           certifications!inner ( name, client, pm_id )`,
        )
        .eq("certifications.pm_id", pmId)
        .neq("status", "achieved")
        .order("due_date");
      if (error) throw error;

      const righe = ((data ?? []) as Record<string, any>[]).filter((r) => {
        const quando = r.override_date ?? r.due_date;
        return quando && quando >= dal && quando <= al;
      });
      const stepIds = [...new Set(righe.map((r) => r.step_id).filter(Boolean))];

      /**
       * Quali di questi passi hanno una tranche attaccata.
       *
       * Si chiede a parte e non con una join: una milestone senza tranche è la
       * maggioranza, e una `inner join` le farebbe sparire tutte.
       */
      const tranche = new Map<string, { nome: string | null; importo: number | null }>();
      if (stepIds.length > 0) {
        const { data: t } = await (supabase as any)
          .from("cert_payment_milestones")
          .select("step_id, name, amount, tranche_state")
          .in("step_id", stepIds)
          .eq("tranche_state", "pending");
        for (const r of (t ?? []) as Record<string, any>[]) {
          tranche.set(String(r.step_id), {
            nome: r.name ?? null,
            importo: r.amount != null ? Number(r.amount) : null,
          });
        }
      }

      return righe.map((r) => {
        const t = r.step_id ? tranche.get(String(r.step_id)) : undefined;
        return {
          id: String(r.id),
          certification_id: String(r.certification_id),
          progetto: r.certifications?.name ?? null,
          cliente: r.certifications?.client ?? null,
          requisito: r.requirement ?? null,
          categoria: r.category ?? null,
          data: String(r.override_date ?? r.due_date),
          spostata: r.override_date != null,
          stato: r.status ?? null,
          sblocca_pagamento: !!t,
          nome_tranche: t?.nome ?? null,
          importo_tranche: t?.importo ?? null,
        };
      });
    },
  });
}

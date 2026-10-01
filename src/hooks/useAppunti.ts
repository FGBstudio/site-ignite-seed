import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { chiaveSettimana } from "@/lib/settimane";

/**
 * Gli appunti di progetto, quelli che si scrivono sulla settimana.
 *
 * Non è una tabella nuova: vivono in `project_tasks` con `task_kind = 'project'`,
 * che è dove il calendario della dashboard li mette già. Cambia come si scrivono
 * — cliccando sulla casella del progetto nella settimana in cui va fatta la cosa,
 * invece di aprire un dialogo e ricompilare progetto e data da zero.
 *
 * La data serve: un appunto senza data non cade in nessuna settimana, e quindi
 * non compare né nella griglia né nell'elenco di quello che c'è da fare. Chi non
 * sa quando, scrive sulla settimana in cui se ne vuole ricordare.
 */

export interface Appunto {
  id: string;
  certification_id: string;
  testo: string;
  descrizione: string | null;
  /** Il giorno a cui è attaccato. La settimana si ricava da qui. */
  due_date: string;
  /** «2026-W40»: la casella in cui va disegnato. */
  settimana: string;
  stato: string;
  priorita: string | null;
  assegnato_a: string | null;
  creato_il: string;
}

const RIGA = "id, certification_id, task_name, title, description, due_date, status, priority, assigned_to, created_at";

function adatta(r: Record<string, unknown>): Appunto {
  const due = String(r.due_date);
  return {
    id: String(r.id),
    certification_id: String(r.certification_id),
    // `title` è la colonna nuova, `task_name` quella storica: le righe vecchie
    // hanno solo la seconda, e un appunto senza testo non si legge.
    testo: String(r.title || r.task_name || "").trim(),
    descrizione: (r.description as string | null) ?? null,
    due_date: due,
    settimana: chiaveSettimana(new Date(`${due}T00:00:00Z`)),
    stato: String(r.status ?? "todo"),
    priorita: (r.priority as string | null) ?? null,
    assegnato_a: (r.assigned_to as string | null) ?? null,
    creato_il: String(r.created_at),
  };
}

/**
 * Gli appunti dei progetti indicati.
 *
 * Si chiedono per progetto e non per periodo: la griglia mostra tutte le
 * settimane dell'arco del progetto, e filtrare per data qui vorrebbe dire
 * ricaricare a ogni scorrimento.
 */
export function useAppunti(certIds: string[]) {
  const chiavi = [...new Set(certIds.filter(Boolean))].sort();
  return useQuery({
    queryKey: ["appunti", chiavi.join(",")],
    enabled: chiavi.length > 0,
    queryFn: async (): Promise<Appunto[]> => {
      const { data, error } = await (supabase as any)
        .from("project_tasks")
        .select(RIGA)
        .eq("task_kind", "project")
        .not("due_date", "is", null)
        .in("certification_id", chiavi)
        .order("due_date");
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map(adatta);
    },
  });
}

/**
 * Gli appunti di una settimana, per tutti i progetti di cui sono responsabile.
 *
 * È l'elenco «cosa devo fare questa settimana»: non si ricava dalla griglia,
 * perché la griglia carica i progetti che si stanno guardando e questo deve
 * valere su tutti.
 */
export function useAppuntiDellaSettimana(dalIso: string, alIso: string, pmId?: string | null) {
  return useQuery({
    queryKey: ["appunti", "settimana", dalIso, alIso, pmId ?? "tutti"],
    enabled: !!dalIso && !!alIso,
    queryFn: async (): Promise<Array<Appunto & { progetto: string | null; cliente: string | null }>> => {
      let q = (supabase as any)
        .from("project_tasks")
        .select(`${RIGA}, certifications!inner ( name, client, pm_id )`)
        .eq("task_kind", "project")
        .gte("due_date", dalIso)
        .lte("due_date", alIso)
        .order("due_date");
      // Il filtro sul PM sta sulla certificazione, non sull'appunto: un appunto
      // appartiene a chi ha il progetto, non a chi l'ha scritto.
      if (pmId) q = q.eq("certifications.pm_id", pmId);

      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as Record<string, any>[]).map((r) => ({
        ...adatta(r),
        progetto: r.certifications?.name ?? null,
        cliente: r.certifications?.client ?? null,
      }));
    },
  });
}

/** Scrivere un appunto su una settimana. */
export function useCreaAppunto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      certification_id: string;
      testo: string;
      due_date: string;
      descrizione?: string | null;
    }) => {
      const testo = v.testo.trim();
      if (!testo) throw new Error("Un appunto senza testo non dice niente");

      const { data: utente } = await supabase.auth.getUser();
      const { data, error } = await (supabase as any)
        .from("project_tasks")
        .insert({
          certification_id: v.certification_id,
          task_kind: "project",
          // Entrambe le colonne: `title` è quella che si legge, `task_name` è
          // NOT NULL e le schermate vecchie guardano ancora lei.
          title: testo,
          task_name: testo,
          description: v.descrizione ?? null,
          due_date: v.due_date,
          status: "todo",
          assigned_to: utente?.user?.id ?? null,
        })
        .select(RIGA)
        .single();
      if (error) throw error;
      return adatta(data as Record<string, unknown>);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["appunti"] }),
  });
}

/** Cambiare il testo, la data o lo stato di un appunto. */
export function useAggiornaAppunto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      id: string;
      testo?: string;
      due_date?: string;
      stato?: string;
    }) => {
      const patch: Record<string, unknown> = {};
      if (v.testo !== undefined) {
        const t = v.testo.trim();
        if (!t) throw new Error("Un appunto senza testo non dice niente");
        patch.title = t;
        patch.task_name = t;
      }
      if (v.due_date !== undefined) patch.due_date = v.due_date;
      if (v.stato !== undefined) patch.status = v.stato;

      const { error } = await (supabase as any)
        .from("project_tasks")
        .update(patch)
        .eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["appunti"] }),
  });
}

/**
 * Togliere un appunto.
 *
 * Qui si cancella per davvero, al contrario delle note sulle fatture: un appunto
 * è un promemoria che uno scrive a se stesso, non la traccia di cosa ha detto un
 * cliente. Quando non serve più, non serve più.
 */
export function useEliminaAppunto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("project_tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["appunti"] }),
  });
}

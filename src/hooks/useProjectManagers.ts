import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Chi può essere messo a capo di un progetto.
 *
 * Non solo chi ha il ruolo PM: anche gli admin seguono progetti in prima
 * persona. Filtrare sul solo ruolo PM lasciava fuori proprio chi ne segue di
 * più — Laura Braghieri, che è admin e non PM, ne ha 199, e l'utenza
 * `monitoring` altri 64. Quei 263 progetti avevano un responsabile che la
 * tendina non sapeva nominare: aprendo il progetto il campo risultava vuoto, e
 * riassegnarlo a lei era impossibile.
 *
 * Le due grafie di ogni ruolo convivono in `user_roles` (legacy minuscolo e
 * corrente maiuscolo), quindi si accettano entrambe.
 */
const ASSIGNABLE_ROLES = ["PM", "pm", "ADMIN", "admin"];

export interface AssignableManager {
  id: string;
  full_name: string;
}

/**
 * Versione senza React, per i componenti che caricano l'elenco a mano dentro
 * un useEffect. Esiste per non avere tre copie della stessa regola in giro:
 * chi può reggere un progetto si decide qui e basta.
 */
export async function fetchAssignableManagers(): Promise<AssignableManager[]> {
  const { data: rolesData, error: rolesError } = await supabase
    .from("user_roles" as any)
    .select("user_id")
    .in("role", ASSIGNABLE_ROLES as any);

  if (rolesError) throw rolesError;
  if (!rolesData || rolesData.length === 0) return [];

  // Chi è insieme PM e admin comparirebbe due volte.
  const ids = [...new Set((rolesData as any[]).map((r) => r.user_id))];

  const { data: profilesData, error: profilesError } = await supabase
    .from("profiles")
    .select("id, full_name, display_name, first_name, last_name, email")
    .in("id", ids);

  if (profilesError) throw profilesError;

  return (profilesData || [])
    .map((p: any) => ({
      id: p.id,
      full_name:
        p.full_name ||
        p.display_name ||
        [p.first_name, p.last_name].filter(Boolean).join(" ") ||
        p.email ||
        "PM",
    }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}

export function useProjectManagers() {
  return useQuery({
    queryKey: ["project-managers"],
    queryFn: fetchAssignableManagers,
  });
}

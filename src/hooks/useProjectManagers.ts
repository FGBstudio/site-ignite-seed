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
  try {
    const { data: rolesData } = await supabase
      .from("user_roles" as any)
      .select("user_id")
      .in("role", ASSIGNABLE_ROLES as any);

    const ids = rolesData && rolesData.length > 0
      ? [...new Set((rolesData as any[]).map((r) => r.user_id))]
      : null;

    let query = supabase
      .from("profiles")
      .select("id, full_name, display_name, first_name, last_name, email");

    if (ids && ids.length > 0) {
      query = query.in("id", ids);
    }

    const { data: profilesData } = await query;
    
    // If no profiles returned from filtered IDs, fallback to all profiles
    let list = profilesData || [];
    if (list.length === 0) {
      const { data: allProfiles } = await supabase
        .from("profiles")
        .select("id, full_name, display_name, first_name, last_name, email");
      list = allProfiles || [];
    }

    return list
      .map((p: any) => ({
        id: p.id,
        full_name:
          p.full_name ||
          p.display_name ||
          [p.first_name, p.last_name].filter(Boolean).join(" ") ||
          p.email ||
          "PM",
      }))
      .filter((p: any) => p.full_name && p.full_name !== "PM")
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  } catch (err) {
    console.error("fetchAssignableManagers fallback triggered:", err);
    const { data: allProfiles } = await supabase
      .from("profiles")
      .select("id, full_name, display_name, first_name, last_name, email");
    return (allProfiles || [])
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
}

export function useProjectManagers() {
  return useQuery({
    queryKey: ["project-managers"],
    queryFn: fetchAssignableManagers,
  });
}

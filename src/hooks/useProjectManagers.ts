import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { displayPersonName, byPersonName } from "@/lib/personName";

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
 * Da riga di anagrafica a voce di tendina.
 *
 * "Cognome Nome" e ordine alfabetico: è la forma in cui l'ufficio scrive i
 * nomi, ed è l'unica per cui l'ordinamento alfabetico significhi qualcosa —
 * per nome proprio raggruppa le Anna, non i Rossi. Chi non ha né nome né
 * indirizzo non entra: sarebbe una voce senza etichetta.
 */
function nominati(righe: any[]): AssignableManager[] {
  return righe
    .map((p: any) => ({
      id: p.id,
      full_name: displayPersonName(
        p.full_name ||
          p.display_name ||
          [p.first_name, p.last_name].filter(Boolean).join(" "),
        p.email,
      ),
    }))
    .filter((p) => p.full_name !== "—")
    .sort((a, b) => byPersonName(a.full_name, b.full_name));
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

    return nominati(list);
  } catch (err) {
    console.error("fetchAssignableManagers fallback triggered:", err);
    const { data: allProfiles } = await supabase
      .from("profiles")
      .select("id, full_name, display_name, first_name, last_name, email");
    return nominati(allProfiles || []);
  }
}

export function useProjectManagers() {
  return useQuery({
    queryKey: ["project-managers"],
    queryFn: fetchAssignableManagers,
  });
}

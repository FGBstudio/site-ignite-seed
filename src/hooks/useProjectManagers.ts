import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useProjectManagers() {
  return useQuery({
    queryKey: ["project-managers"],
    queryFn: async () => {
      // Step 1: Get PM user IDs from user_roles
      const { data: rolesData, error: rolesError } = await supabase
        .from("user_roles" as any)
        .select("user_id")
        .eq("role", "PM");

      if (rolesError) throw rolesError;
      if (!rolesData || rolesData.length === 0) return [];

      const pmIds = (rolesData as any[]).map((r) => r.user_id);

      // Step 2: Fetch profiles for those IDs
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name, display_name, first_name, last_name, email")
        .in("id", pmIds);

      if (profilesError) throw profilesError;

      return (profilesData || []).map((p: any) => ({
        id: p.id,
        full_name:
          p.full_name ||
          p.display_name ||
          [p.first_name, p.last_name].filter(Boolean).join(" ") ||
          p.email ||
          "PM",
      }));
    },
  });
}

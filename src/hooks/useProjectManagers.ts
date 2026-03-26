import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useProjectManagers() {
  return useQuery({
    queryKey: ["project-managers"],
    queryFn: async () => {
      // Join profiles with user_roles to get PM users
      const { data, error } = await supabase
        .from("user_roles" as any)
        .select("user_id, profiles:user_id(id, full_name, email)")
        .eq("role", "PM");
      if (error) throw error;
      // Flatten the join result
      return (data as any[])?.map((r: any) => ({
        id: r.profiles?.id ?? r.user_id,
        full_name: r.profiles?.full_name || r.profiles?.email || "PM",
      })) ?? [];
    },
  });
}

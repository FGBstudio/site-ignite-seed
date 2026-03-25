import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ResourceSaturation {
  user_id: string;
  total_active_tasks: number;
  next_deadline: string | null;
  full_name?: string;
  email?: string;
}

export function useResourceSaturation() {
  return useQuery({
    queryKey: ["resource-saturation"],
    queryFn: async () => {
      // Query the view
      const { data: saturation, error } = await supabase
        .from("view_resource_saturation" as any)
        .select("*");
      if (error) throw error;

      // Enrich with profile data
      const userIds = (saturation || []).map((s: any) => s.user_id).filter(Boolean);
      if (userIds.length === 0) return [];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);

      const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

      return (saturation || []).map((s: any) => ({
        user_id: s.user_id,
        total_active_tasks: Number(s.total_active_tasks),
        next_deadline: s.next_deadline,
        full_name: profileMap.get(s.user_id)?.full_name || "—",
        email: profileMap.get(s.user_id)?.email || "",
      })) as ResourceSaturation[];
    },
  });
}

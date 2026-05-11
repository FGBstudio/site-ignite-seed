import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface MyCertOption {
  id: string;
  name: string | null;
  client: string;
  cert_type: string;
  allocated_hours: number | null;
}

/** Certifications visible to the current user (PM sees own, Admin sees all). */
export function useMyCertifications() {
  const { user, role } = useAuth();
  return useQuery({
    queryKey: ["my-certifications", user?.id, role],
    enabled: !!user?.id,
    queryFn: async () => {
      let q = supabase
        .from("certifications")
        .select("id, name, client, cert_type, allocated_hours, pm_id")
        .order("created_at", { ascending: false });
      if (role !== "ADMIN") {
        q = q.eq("pm_id", user!.id);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as MyCertOption[];
    },
  });
}

export interface MilestoneOption {
  id: string;
  requirement: string;
  allocated_hours: number | null;
  milestone_type: string | null;
}

export function useCertMilestoneOptions(certId: string | null | undefined) {
  return useQuery({
    queryKey: ["cert-milestone-options", certId],
    enabled: !!certId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("certification_milestones")
        .select("id, requirement, allocated_hours, milestone_type")
        .eq("certification_id", certId!)
        .order("order_index", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as MilestoneOption[];
    },
  });
}

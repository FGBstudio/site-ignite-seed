import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CertHoursBurn, MilestoneHoursBurn, UserWeeklySaturation } from "@/types/time-tracking";

/** Burn rate for all certifications (admin) or those the user can see. */
export function useCertHoursBurn() {
  return useQuery({
    queryKey: ["hours-burn", "cert", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("view_cert_hours_burn" as any)
        .select("*");
      if (error) throw error;
      return (data ?? []) as unknown as CertHoursBurn[];
    },
  });
}

/** Burn rate for a single certification. */
export function useCertBurn(certId: string | null | undefined) {
  return useQuery({
    queryKey: ["hours-burn", "cert", certId],
    enabled: !!certId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("view_cert_hours_burn" as any)
        .select("*")
        .eq("certification_id", certId!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as CertHoursBurn | null;
    },
  });
}

/** Per-milestone burn rate for a certification (only milestones with allocated_hours). */
export function useMilestoneBurn(certId: string | null | undefined) {
  return useQuery({
    queryKey: ["hours-burn", "milestones", certId],
    enabled: !!certId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("view_milestone_hours_burn" as any)
        .select("*")
        .eq("certification_id", certId!);
      if (error) throw error;
      return (data ?? []) as unknown as MilestoneHoursBurn[];
    },
  });
}

/** Weekly saturation per user (admin resource monitor). */
export function useResourceUtilization(weekStart?: string) {
  return useQuery({
    queryKey: ["resource-utilization", weekStart ?? "all"],
    queryFn: async () => {
      let q = supabase.from("view_user_weekly_saturation" as any).select("*");
      if (weekStart) q = q.eq("week_start", weekStart);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as UserWeeklySaturation[];
    },
  });
}

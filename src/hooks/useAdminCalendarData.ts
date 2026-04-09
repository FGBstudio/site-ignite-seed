import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PMProject, SetupStatus } from "@/hooks/usePMDashboard";

export interface AdminCalendarProject extends PMProject {
  pm_name: string | null;
}

export function useAdminCalendarData() {
  return useQuery({
    queryKey: ["admin-calendar-certifications"],
    queryFn: async () => {
      // 1. Fetch all certifications with site info and allocations
      const { data: certs, error } = await (supabase as any)
        .from("certifications")
        .select("*, sites!certifications_site_id_fkey(name, city, country), project_allocations!project_allocations_certification_id_fkey(*)")
        .order("handover_date", { ascending: true });
      if (error) throw error;
      if (!certs || certs.length === 0) return [] as AdminCalendarProject[];

      // 2. Fetch PM profiles
      const pmIds = [...new Set((certs as any[]).map((c) => c.pm_id).filter(Boolean))] as string[];
      let profilesMap = new Map<string, string>();
      if (pmIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, display_name")
          .in("id", pmIds);
        if (profiles) {
          for (const p of profiles) {
            profilesMap.set(p.id, p.display_name || p.full_name || p.id);
          }
        }
      }

      // 3. Fetch milestones
      const certIds = (certs as any[]).map((c) => c.id);
      let milestones: any[] = [];
      if (certIds.length > 0) {
        const { data, error: mErr } = await supabase
          .from("certification_milestones")
          .select("*")
          .in("certification_id", certIds);
        if (mErr) throw mErr;
        milestones = data || [];
      }

      // 4. Build result
      const today = new Date().toISOString().slice(0, 10);
      return (certs as any[]).map((c): AdminCalendarProject => {
        const certMilestones = milestones.filter((m) => m.certification_id === c.id);

        const isCertified = c.status === "certificato" ||
          (c.status === "active" && c.issued_date && c.issued_date <= today);

        const timelineMilestones = certMilestones.filter((m: any) => m.milestone_type === "timeline");
        const hasTimeline = timelineMilestones.length > 0;
        const hasScorecard = certMilestones.some((m: any) => m.milestone_type === "scorecard");

        const missing: string[] = [];
        if (!isCertified) {
          if (!hasTimeline) missing.push("Timeline");
          if (!hasScorecard) missing.push("Scorecard");
        }

        let setup_status: SetupStatus;
        if (isCertified) setup_status = "certificato";
        else if (hasTimeline && hasScorecard) setup_status = "in_corso";
        else setup_status = "da_configurare";

        return {
          ...c,
          name: c.name || c.cert_type || "Unnamed",
          certifications: [c],
          certification_milestones: certMilestones,
          project_allocations: c.project_allocations || [],
          setup_status,
          missing,
          pm_name: c.pm_id ? profilesMap.get(c.pm_id) || null : null,
        };
      });
    },
  });
}

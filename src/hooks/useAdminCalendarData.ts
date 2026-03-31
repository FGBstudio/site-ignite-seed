import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PMProject, SetupStatus } from "@/hooks/usePMDashboard";

/**
 * Fetches ALL projects with their certification milestones for the admin calendar.
 * Includes PM profile info for filtering.
 */
export interface AdminCalendarProject extends PMProject {
  pm_name: string | null;
}

export function useAdminCalendarData() {
  return useQuery({
    queryKey: ["admin-calendar-projects"],
    queryFn: async () => {
      // 1. Fetch all projects with site info and allocations
      const { data: projects, error } = await (supabase as any)
        .from("projects")
        .select("*, sites!projects_site_id_fkey(name, city, country), project_allocations(*)")
        .order("handover_date", { ascending: true });
      if (error) throw error;
      if (!projects || projects.length === 0) return [] as AdminCalendarProject[];

      // 2. Fetch PM profiles
      const pmIds = [...new Set((projects as any[]).map((p) => p.pm_id).filter(Boolean))] as string[];
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

      // 3. Fetch certifications for all project sites
      const siteIds = [...new Set((projects as any[]).map((p) => p.site_id).filter(Boolean))] as string[];
      let certifications: any[] = [];
      if (siteIds.length > 0) {
        const { data, error: certErr } = await supabase
          .from("certifications")
          .select("*")
          .in("site_id", siteIds);
        if (certErr) throw certErr;
        certifications = data || [];
      }

      // 4. Fetch milestones
      const certIds = certifications.map((c) => c.id);
      let milestones: any[] = [];
      if (certIds.length > 0) {
        const { data, error: mErr } = await supabase
          .from("certification_milestones")
          .select("*")
          .in("certification_id", certIds);
        if (mErr) throw mErr;
        milestones = data || [];
      }

      // 5. Merge and classify (same logic as usePMDashboard)
      return (projects as any[]).map((p): AdminCalendarProject => {
        const projectCerts = certifications.filter((c) =>
          c.site_id === p.site_id &&
          c.cert_type === p.cert_type &&
          (c.level === p.cert_rating || (!c.level && !p.cert_rating))
        );
        const fallbackCerts = projectCerts.length > 0
          ? projectCerts
          : certifications.filter((c) => c.site_id === p.site_id && c.cert_type === p.cert_type);
        const projectMilestones = milestones.filter((m) =>
          fallbackCerts.some((c: any) => c.id === m.certification_id)
        );

        const today = new Date().toISOString().slice(0, 10);
        const isCertified = projectCerts.some(
          (c: any) => c.status === "active" && c.issued_date && c.issued_date <= today
        );
        const timelineMilestones = projectMilestones.filter((m: any) => m.milestone_type === "timeline");
        const hasTimeline = timelineMilestones.length > 0;
        const hasScorecard = projectMilestones.some((m: any) => m.milestone_type === "scorecard");

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
          ...p,
          certifications: fallbackCerts,
          certification_milestones: projectMilestones,
          setup_status,
          missing,
          pm_name: p.pm_id ? profilesMap.get(p.pm_id) || null : null,
        };
      });
    },
  });
}

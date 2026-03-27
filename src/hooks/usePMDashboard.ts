import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type SetupStatus = "da_configurare" | "in_corso" | "certificato";

export interface PMProject {
  id: string;
  name: string;
  client: string;
  region: string;
  status: string;
  handover_date: string;
  site_id: string | null;
  cert_type: string | null;
  cert_rating: string | null;
  pm_id: string | null;
  created_at: string;
  updated_at: string;
  is_commissioning: boolean | null;
  // Joined
  sites: { name: string; city: string | null; country: string | null } | null;
  certifications: any[];
  project_allocations: any[];
  // Computed
  setup_status: SetupStatus;
  missing: string[];
  certification_milestones: any[];
}

export function usePMDashboard() {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: ["pm-dashboard", userId],
    enabled: !!userId,
    queryFn: async () => {
      // 1. Fetch projects with relations
      const { data: projects, error } = await (supabase as any)
        .from("projects")
        .select("*, sites!projects_site_id_fkey(name, city, country), project_allocations(*)")
        .eq("pm_id", userId)
        .order("handover_date", { ascending: true });
      if (error) throw error;
      if (!projects || projects.length === 0) return [] as PMProject[];

      // 2. Fetch certifications for project sites
      const siteIds = [...new Set(
        (projects as any[]).map((p) => p.site_id).filter(Boolean)
      )] as string[];

      let certifications: any[] = [];
      if (siteIds.length > 0) {
        const { data, error: certErr } = await supabase
          .from("certifications")
          .select("*")
          .in("site_id", siteIds);
        if (certErr) throw certErr;
        certifications = data || [];
      }

      // 3. Fetch milestones for those certifications
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

      // 4. Merge and classify
      return (projects as any[]).map((p): PMProject => {
        const projectCerts = certifications.filter((c) => c.site_id === p.site_id);
        const projectMilestones = milestones.filter((m) =>
          projectCerts.some((c: any) => c.id === m.certification_id)
        );
        const allocations = p.project_allocations || [];

        // Classification logic
        const isCertified =
          projectCerts.some((c: any) => c.status === "active") ||
          p.status === "Completed";

        const hasHardware = allocations.length > 0;
        const hasTimeline = projectMilestones.some(
          (m: any) =>
            m.milestone_type === "timeline" &&
            (m.start_date || m.due_date)
        );
        const hasScorecard = projectMilestones.some(
          (m: any) => m.milestone_type === "scorecard"
        );

        const missing: string[] = [];
        if (!isCertified) {
          if (!hasHardware) missing.push("Hardware");
          if (!hasTimeline) missing.push("Timeline");
          if (!hasScorecard) missing.push("Scorecard");
        }

        let setup_status: SetupStatus;
        if (isCertified) {
          setup_status = "certificato";
        } else if (hasHardware && hasTimeline && hasScorecard) {
          setup_status = "in_corso";
        } else {
          setup_status = "da_configurare";
        }

        return {
          ...p,
          certifications: projectCerts,
          certification_milestones: projectMilestones,
          setup_status,
          missing,
        };
      });
    },
  });
}

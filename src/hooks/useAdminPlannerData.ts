import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { SetupStatus } from "@/hooks/usePMDashboard";
import type { GanttRowData } from "@/components/dashboard/FGBPlanner";

export interface AdminPlannerProject {
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
  project_subtype: string | null;
  setup_status: SetupStatus;
  missing: string[];
  pm_name: string | null;
  brand_name: string | null;
  project_allocations: any[];
  certification_milestones: any[];
  plannerData: GanttRowData;
}

export function useAdminPlannerData() {
  return useQuery({
    queryKey: ["admin-planner-all-projects"],
    queryFn: async () => {
      // 1. Fetch ALL projects
      const { data: projects, error } = await (supabase as any)
        .from("projects")
        .select("*, sites!projects_site_id_fkey(name, city, country, brand_id), project_allocations(*)")
        .order("handover_date", { ascending: true });
      if (error) throw error;
      if (!projects || projects.length === 0) return [] as AdminPlannerProject[];

      // 2. PM profiles
      const pmIds = [...new Set((projects as any[]).map((p) => p.pm_id).filter(Boolean))] as string[];
      const profilesMap = new Map<string, string>();
      if (pmIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, display_name, email")
          .in("id", pmIds);
        if (profiles) {
          for (const p of profiles) {
            profilesMap.set(p.id, p.display_name || p.full_name || p.email || p.id);
          }
        }
      }

      // 3. Brand names
      const brandIds = [...new Set((projects as any[]).map((p) => p.sites?.brand_id).filter(Boolean))] as string[];
      const brandsMap = new Map<string, string>();
      if (brandIds.length > 0) {
        const { data: brands } = await supabase
          .from("brands")
          .select("id, name")
          .in("id", brandIds);
        if (brands) {
          for (const b of brands) brandsMap.set(b.id, b.name);
        }
      }

      // 4. Certifications
      const siteIds = [...new Set((projects as any[]).map((p) => p.site_id).filter(Boolean))] as string[];
      let certifications: any[] = [];
      if (siteIds.length > 0) {
        const { data, error: certErr } = await supabase.from("certifications").select("*").in("site_id", siteIds);
        if (certErr) throw certErr;
        certifications = data || [];
      }

      // 5. Milestones
      const certIds = certifications.map((c) => c.id);
      let milestones: any[] = [];
      if (certIds.length > 0) {
        const { data, error: mErr } = await supabase.from("certification_milestones").select("*").in("certification_id", certIds);
        if (mErr) throw mErr;
        milestones = data || [];
      }

      // 6. Merge (same logic as usePMDashboard)
      const today = new Date().toISOString().slice(0, 10);

      return (projects as any[]).map((p): AdminPlannerProject => {
        const projectCerts = certifications.filter((c) =>
          c.site_id === p.site_id && c.cert_type === p.cert_type &&
          (c.level === p.cert_rating || (!c.level && !p.cert_rating))
        );
        const fallbackCerts = projectCerts.length > 0
          ? projectCerts
          : certifications.filter((c) => c.site_id === p.site_id && c.cert_type === p.cert_type);
        const projectMilestones = milestones.filter((m) =>
          fallbackCerts.some((c: any) => c.id === m.certification_id)
        );
        const allocations = p.project_allocations || [];

        const isCertified = p.status === "certificato" ||
          projectCerts.some((c: any) => c.status === "active" && c.issued_date && c.issued_date.slice(0, 10) <= today);

        const timelineMilestones = projectMilestones.filter((m: any) => m.milestone_type === "timeline");
        const hasTimeline = timelineMilestones.length > 0;
        const hasScorecard = projectMilestones.some((m: any) => m.milestone_type === "scorecard");

        const missing: string[] = [];
        if (!isCertified) {
          if (!hasTimeline) missing.push("Timeline");
          if (!hasScorecard) missing.push("Scorecard");
          if (allocations.length === 0) missing.push("Hardware");
        }

        let setup_status: SetupStatus;
        if (isCertified) setup_status = "certificato";
        else if (hasTimeline && hasScorecard) setup_status = "in_corso";
        else setup_status = "da_configurare";

        // Planner data computation
        const projectLaunchDate = p.created_at.slice(0, 10);
        let planStart = projectLaunchDate;
        let achievedCount = 0;
        const segments: any[] = [];

        if (hasTimeline) {
          const startDates = timelineMilestones.map((m: any) => m.start_date).filter(Boolean).sort();
          if (startDates.length > 0) planStart = startDates[0];
          achievedCount = timelineMilestones.filter((m: any) => m.status === "achieved").length;

          timelineMilestones.forEach((m: any) => {
            if (m.start_date && m.due_date) {
              let displayStatus = m.status;
              if (m.status !== "achieved" && m.due_date < today) displayStatus = "late";
              segments.push({
                start: m.start_date,
                end: m.due_date,
                status: displayStatus,
                progress: m.status === "achieved" ? 100 : m.status === "in_progress" ? 50 : 0,
              });
            }
          });
        }

        const progress = hasTimeline ? Math.round((achievedCount / timelineMilestones.length) * 100) : 0;
        const activeMilestone = timelineMilestones.find((m: any) => m.status === "in_progress");
        const currentActivity = activeMilestone
          ? activeMilestone.requirement
          : (setup_status === "certificato" ? "Completato" : "In attesa");

        let plannerStatus = "pending";
        if (setup_status === "certificato") plannerStatus = "achieved";
        else if (hasTimeline) {
          const hasActive = timelineMilestones.some((m: any) => m.status === "in_progress" || m.status === "achieved");
          if (hasActive) plannerStatus = p.handover_date < today ? "late" : "in_progress";
        }

        const pmName = p.pm_id ? profilesMap.get(p.pm_id) || null : null;

        const plannerData: GanttRowData = {
          id: p.id,
          label: p.name,
          subLabel: pmName ? `${p.client} · PM: ${pmName}` : p.client,
          launchDate: projectLaunchDate,
          currentActivity,
          planStart,
          planEnd: p.handover_date,
          actualStart: plannerStatus !== "pending" ? planStart : null,
          actualEnd: setup_status === "certificato" ? today : null,
          progress,
          status: plannerStatus,
          segments,
          onClickUrl: `/projects/${p.id}`,
        };

        return {
          id: p.id,
          name: p.name,
          client: p.client,
          region: p.region,
          status: p.status,
          handover_date: p.handover_date,
          site_id: p.site_id,
          cert_type: p.cert_type,
          cert_rating: p.cert_rating,
          pm_id: p.pm_id,
          created_at: p.created_at,
          project_subtype: p.project_subtype,
          setup_status,
          missing,
          pm_name: pmName,
          brand_name: p.sites?.brand_id ? brandsMap.get(p.sites.brand_id) || null : null,
          project_allocations: allocations,
          certification_milestones: projectMilestones,
          plannerData,
        };
      });
    },
  });
}

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
  project_subtype: string | null;
  // Joined
  sites: { name: string; city: string | null; country: string | null } | null;
  certifications: any[];
  project_allocations: any[];
  // Computed
  setup_status: SetupStatus;
  missing: string[];
  certification_milestones: any[];
  plannerData?: any;
}

export function usePMDashboard() {
  const { user, role } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: ["pm-dashboard", userId, role],
    enabled: !!userId,
    queryFn: async () => {
      // 1. Fetch certifications (root entity) with site + allocations
      let query = (supabase as any)
        .from("certifications")
        .select("*, sites!certifications_site_id_fkey(name, city, country), project_allocations!project_allocations_certification_id_fkey(*)")
        .order("handover_date", { ascending: true });

      // If not admin, filter by PM
      if (role !== "ADMIN") {
        query = query.eq("pm_id", userId);
      }

      const { data: certs, error } = await query;
      if (error) throw error;
      if (!certs || certs.length === 0) return [] as PMProject[];

      // 2. Fetch milestones for all certifications
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

      // 3. Build result
      return (certs as any[]).map((c): PMProject => {
        const certMilestones = milestones.filter((m) => m.certification_id === c.id);
        const allocations = c.project_allocations || [];
        const today = new Date().toISOString().slice(0, 10);

        const isCertified =
          c.status === "certificato" ||
          (c.status === "active" && c.issued_date && c.issued_date.slice(0, 10) <= today);

        const timelineMilestones = certMilestones.filter((m: any) => m.milestone_type === "timeline");
        const hasTimeline = timelineMilestones.length > 0;
        const hasScorecard = certMilestones.some((m: any) => m.milestone_type === "scorecard");

        const isTimelineConfigured = timelineMilestones.some(
          (m: any) => m.start_date !== null || m.due_date !== null
        );

        const missing: string[] = [];
        if (!isCertified) {
          if (!hasTimeline) missing.push("Timeline");
          else if (!isTimelineConfigured) missing.push("Pianifica Date");
          if (!hasScorecard) missing.push("Scorecard");
          if (allocations.length === 0) missing.push("Hardware");
        }

        let setup_status: SetupStatus;
        if (isCertified) {
          setup_status = "certificato";
        } else if (hasTimeline && hasScorecard && isTimelineConfigured) {
          setup_status = "in_corso";
        } else {
          setup_status = "da_configurare";
        }

        // Planner data
        const launchDate = c.created_at.slice(0, 10);
        let planStart = launchDate;
        let achievedCount = 0;
        const segments: any[] = [];

        if (hasTimeline && isTimelineConfigured) {
          const startDates = timelineMilestones.map((m: any) => m.start_date).filter(Boolean).sort();
          if (startDates.length > 0) planStart = startDates[0];
          achievedCount = timelineMilestones.filter((m: any) => m.status === "achieved").length;

          timelineMilestones.forEach((m: any) => {
            if (m.start_date && m.due_date) {
              let displayStatus = m.status;
              if (m.status !== "achieved" && m.due_date < today) displayStatus = "late";
              segments.push({
                start: m.start_date, end: m.due_date, status: displayStatus,
                progress: m.status === "achieved" ? 100 : m.status === "in_progress" ? 50 : 0
              });
            }
          });
        }

        const progress = (hasTimeline && isTimelineConfigured) ? Math.round((achievedCount / timelineMilestones.length) * 100) : 0;

        const activeMilestone = timelineMilestones.find((m: any) => m.status === "in_progress");
        const currentActivity = activeMilestone
          ? activeMilestone.requirement
          : (setup_status === "certificato" ? "Completato" : "In attesa");

        let plannerStatus = "pending";
        if (setup_status === "certificato") {
          plannerStatus = "achieved";
        } else if (hasTimeline && isTimelineConfigured) {
          const hasActive = timelineMilestones.some((m: any) => m.status === "in_progress" || m.status === "achieved");
          if (hasActive) {
            plannerStatus = c.handover_date < today ? "late" : "in_progress";
          }
        }

        const plannerData = {
          id: c.id,
          label: c.name || c.cert_type || "Unnamed",
          subLabel: c.client,
          launchDate,
          currentActivity,
          planStart,
          planEnd: c.handover_date,
          actualStart: plannerStatus !== "pending" ? planStart : null,
          actualEnd: setup_status === "certificato" ? today : null,
          progress,
          status: plannerStatus,
          segments
        };

        return {
          id: c.id,
          name: c.name || c.cert_type || "Unnamed",
          client: c.client,
          region: c.region,
          status: c.status,
          handover_date: c.handover_date,
          site_id: c.site_id,
          cert_type: c.cert_type,
          cert_rating: c.cert_rating || c.level,
          pm_id: c.pm_id,
          created_at: c.created_at,
          updated_at: c.updated_at,
          is_commissioning: c.is_commissioning,
          project_subtype: c.project_subtype,
          sites: c.sites || null,
          certifications: [c], // The cert itself
          project_allocations: allocations,
          setup_status,
          missing,
          certification_milestones: certMilestones,
          plannerData,
        } as PMProject;
      });
    },
  });
}

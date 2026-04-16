import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { SetupStatus } from "@/hooks/usePMDashboard";
import type { GanttRowData } from "@/components/dashboard/FGBPlanner";
import { computeMacroPhase, type MacroPhase } from "@/data/certificationTemplates";
import { differenceInDays, parseISO } from "date-fns";

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
  macro_phase: MacroPhase;
  is_deadline_critical?: boolean;
  // Quotation fields
  total_fees?: number | null;
  quotation_sent_date?: string | null;
  sqm?: number | null;
  services_fees?: number | null;
  gbci_fees?: number | null;
}

/** Check if any deadline milestone is < 15 days away and not achieved */
function checkDeadlineCritical(milestones: any[], todayStr: string): boolean {
  const deadlineKeywords = ["submission", "certification attainment", "certification", "final review"];
  const today = parseISO(todayStr);

  for (const m of milestones) {
    if (m.milestone_type !== "timeline") continue;
    if (m.status === "achieved") continue;
    if (!m.due_date) continue;

    const name = (m.requirement || "").toLowerCase();
    const isDeadline = deadlineKeywords.some(kw => name.includes(kw));
    if (!isDeadline) continue;

    const daysLeft = differenceInDays(parseISO(m.due_date), today);
    if (daysLeft >= 0 && daysLeft < 15) return true;
  }
  return false;
}

export function useAdminPlannerData() {
  return useQuery({
    queryKey: ["admin-planner-all-certifications"],
    queryFn: async () => {
      // 1. Fetch ALL certifications (root entity) with site + allocations
      const { data: certs, error } = await (supabase as any)
        .from("certifications")
        .select("*, sites!certifications_site_id_fkey(name, city, country, brand_id), project_allocations!project_allocations_certification_id_fkey(*)")
        .order("handover_date", { ascending: true });
      if (error) throw error;
      if (!certs || certs.length === 0) return [] as AdminPlannerProject[];

      // 2. PM profiles
      const pmIds = [...new Set((certs as any[]).map((c) => c.pm_id).filter(Boolean))] as string[];
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
      const brandIds = [...new Set((certs as any[]).map((c) => c.sites?.brand_id).filter(Boolean))] as string[];
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

      // 4. Milestones for all certifications
      const certIds = (certs as any[]).map((c) => c.id);
      let milestones: any[] = [];
      if (certIds.length > 0) {
        const { data, error: mErr } = await supabase.from("certification_milestones").select("*").in("certification_id", certIds);
        if (mErr) throw mErr;
        milestones = data || [];
      }

      // 5. Build result
      const today = new Date().toISOString().slice(0, 10);

      return (certs as any[]).map((c): AdminPlannerProject => {
        const certMilestones = milestones.filter((m) => m.certification_id === c.id);
        const allocations = c.project_allocations || [];

        // Early exit for quotation / canceled
        if (c.status === "quotation") {
          const pmName = c.pm_id ? profilesMap.get(c.pm_id) || null : null;
          return {
            id: c.id, name: c.name || c.cert_type || "Unnamed", client: c.client, region: c.region,
            status: c.status, handover_date: c.handover_date, site_id: c.site_id, cert_type: c.cert_type,
            cert_rating: c.cert_rating || c.level, pm_id: c.pm_id, created_at: c.created_at,
            project_subtype: c.project_subtype, setup_status: "quotation", missing: [], pm_name: pmName,
            brand_name: c.sites?.brand_id ? brandsMap.get(c.sites.brand_id) || null : null,
            project_allocations: allocations, certification_milestones: certMilestones,
            plannerData: { id: c.id, label: c.name || c.cert_type || "Unnamed", subLabel: c.client, launchDate: c.created_at.slice(0,10), currentActivity: "Quotation", planStart: c.created_at.slice(0,10), planEnd: c.handover_date, actualStart: null, actualEnd: null, progress: 0, status: "pending", segments: [], plannedHandoverDate: c.planned_handover_date || null, isDeadlineCritical: false },
            macro_phase: computeMacroPhase(c.status, certMilestones), is_deadline_critical: false,
            total_fees: c.total_fees, quotation_sent_date: c.quotation_sent_date, sqm: c.sqm, services_fees: c.services_fees, gbci_fees: c.gbci_fees,
          };
        }
        if (c.status === "canceled") {
          const pmName = c.pm_id ? profilesMap.get(c.pm_id) || null : null;
          return {
            id: c.id, name: c.name || c.cert_type || "Unnamed", client: c.client, region: c.region,
            status: c.status, handover_date: c.handover_date, site_id: c.site_id, cert_type: c.cert_type,
            cert_rating: c.cert_rating || c.level, pm_id: c.pm_id, created_at: c.created_at,
            project_subtype: c.project_subtype, setup_status: "canceled", missing: [], pm_name: pmName,
            brand_name: c.sites?.brand_id ? brandsMap.get(c.sites.brand_id) || null : null,
            project_allocations: allocations, certification_milestones: certMilestones,
            plannerData: { id: c.id, label: c.name || c.cert_type || "Unnamed", subLabel: c.client, launchDate: c.created_at.slice(0,10), currentActivity: "Canceled", planStart: c.created_at.slice(0,10), planEnd: c.handover_date, actualStart: null, actualEnd: null, progress: 0, status: "pending", segments: [], plannedHandoverDate: c.planned_handover_date || null, isDeadlineCritical: false },
            macro_phase: computeMacroPhase(c.status, certMilestones), is_deadline_critical: false,
          };
        }

        const isCertified = c.status === "certificato" ||
          (c.status === "active" && c.issued_date && c.issued_date.slice(0, 10) <= today);

        const timelineMilestones = certMilestones.filter((m: any) => m.milestone_type === "timeline");
        const hasTimeline = timelineMilestones.length > 0;
        const hasScorecard = certMilestones.some((m: any) => m.milestone_type === "scorecard");

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

        // Deadline critical flag
        const is_deadline_critical = !isCertified && checkDeadlineCritical(certMilestones, today);

        // Planner data
        const launchDate = c.created_at.slice(0, 10);
        let planStart = launchDate;
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
                start: m.start_date, end: m.due_date, status: displayStatus,
                progress: m.status === "achieved" ? 100 : m.status === "in_progress" ? 50 : 0,
              });
            }
          });
        }

        const progress = hasTimeline ? Math.round((achievedCount / timelineMilestones.length) * 100) : 0;
        const activeMilestone = timelineMilestones.find((m: any) => m.status === "in_progress");
        const currentActivity = activeMilestone
          ? activeMilestone.requirement
          : (setup_status === "certificato" ? "Completed" : "Pending");

        let plannerStatus = "pending";
        if (setup_status === "certificato") plannerStatus = "achieved";
        else if (hasTimeline) {
          const hasActive = timelineMilestones.some((m: any) => m.status === "in_progress" || m.status === "achieved");
          if (hasActive) plannerStatus = c.handover_date < today ? "late" : "in_progress";
        }

        // Override for on_hold
        const hasOnHold = timelineMilestones.some((m: any) => m.status === "on_hold");
        if (hasOnHold) plannerStatus = "on_hold";

        const pmName = c.pm_id ? profilesMap.get(c.pm_id) || null : null;

        const plannerData: GanttRowData = {
          id: c.id,
          label: c.name || c.cert_type || "Unnamed",
          subLabel: pmName ? `${c.client} · PM: ${pmName}` : c.client,
          launchDate,
          currentActivity,
          planStart,
          planEnd: c.handover_date,
          actualStart: plannerStatus !== "pending" ? planStart : null,
          actualEnd: setup_status === "certificato" ? today : null,
          progress,
          status: plannerStatus,
          segments,
          onClickUrl: `/projects/${c.id}`,
          plannedHandoverDate: c.planned_handover_date || null,
          isDeadlineCritical: is_deadline_critical,
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
          project_subtype: c.project_subtype,
          setup_status,
          missing,
          pm_name: pmName,
          brand_name: c.sites?.brand_id ? brandsMap.get(c.sites.brand_id) || null : null,
          project_allocations: allocations,
          certification_milestones: certMilestones,
          plannerData,
          macro_phase: computeMacroPhase(c.status, certMilestones),
          is_deadline_critical,
        };
      });
    },
  });
}

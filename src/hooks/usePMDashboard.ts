import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { computeMacroPhase, type MacroPhase } from "@/data/certificationTemplates";
import { differenceInDays, parseISO } from "date-fns";
import type { GanttRowData } from "@/components/dashboard/FGBPlanner";

export type SetupStatus = "quotation" | "da_configurare" | "in_corso" | "certificato" | "canceled";

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
  plannerData?: GanttRowData;
  macro_phase: MacroPhase;
  is_deadline_critical?: boolean;
}

/** Check if any deadline milestone (Submission, Certification) is < 15 days away and not achieved */
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

/** Check 7-day confirmation alert for construction end */
function check7DayAlert(milestones: any[], todayStr: string): { needed: boolean; dueDate: string | null } {
  const constructionKeywords = ["construction end", "handover", "fine lavori"];
  const today = parseISO(todayStr);

  for (const m of milestones) {
    if (m.milestone_type !== "timeline") continue;
    if (m.status === "achieved") continue;
    if (!m.due_date) continue;

    const name = (m.requirement || "").toLowerCase();
    const isConstruction = constructionKeywords.some(kw => name.includes(kw));
    if (!isConstruction) continue;

    const daysLeft = differenceInDays(parseISO(m.due_date), today);
    if (daysLeft >= 0 && daysLeft <= 7) {
      return { needed: true, dueDate: m.due_date };
    }
  }
  return { needed: false, dueDate: null };
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
        .select("*, sites(name, city, country), project_allocations(*)")
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

      const today = new Date().toISOString().slice(0, 10);

      // 3. Check for 7-day alerts and auto-insert if needed
      for (const c of certs as any[]) {
        const certMilestones = milestones.filter((m) => m.certification_id === c.id);
        const alert7Day = check7DayAlert(certMilestones, today);
        if (alert7Day.needed && userId) {
          // Check if alert already exists for this cert recently
          const { data: existing } = await (supabase as any)
            .from("task_alerts")
            .select("id")
            .eq("certification_id", c.id)
            .eq("alert_type", "milestone_deadline")
            .eq("is_resolved", false)
            .like("title", "%Confirm construction end%")
            .limit(1);

          if (!existing || existing.length === 0) {
            await (supabase as any).from("task_alerts").insert({
              certification_id: c.id,
              created_by: userId,
              alert_type: "milestone_deadline",
              title: `Confirm construction end for ${alert7Day.dueDate}? If delayed, indicate issues.`,
              description: `Project: ${c.name || c.cert_type} — Construction end is due in 7 days or less.`,
              escalate_to_admin: false,
            });
          }
        }
      }

      // 4. Build result
      return (certs as any[]).map((c): PMProject => {
        const certMilestones = milestones.filter((m) => m.certification_id === c.id);
        const allocations = c.project_allocations || [];
        const macroPhase = computeMacroPhase(c.status, certMilestones);

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

        // Deadline critical flag
        const is_deadline_critical = !isCertified && checkDeadlineCritical(certMilestones, today);

        // --- ESTRAZIONE DATE SPECIFICHE LEED / WELL (ALLINEATO CON ADMIN) ---
        const getMilestone = (exactName: string) => {
          const target = exactName.toLowerCase().trim();
          return timelineMilestones.find((m: any) => 
            (m.requirement || "").toLowerCase().trim() === target
          );
        };

        const msDesign = getMilestone("fgb design guidelines");
        const designStart = msDesign?.start_date || null;
        const designEnd = msDesign?.due_date || null;

        const msConstrPhase = getMilestone("construction phase");
        const constrStartPlan = msConstrPhase?.start_date || null;
        const constrEndFcst = msConstrPhase?.due_date || null;

        const msHandover = getMilestone("construction end (handover)");
        const constrEndAct = (msHandover?.status === "achieved" || msHandover?.status === "completed") 
          ? (msHandover.completed_date || msHandover.due_date || msHandover.actual_date || null) 
          : null;

        // --- CALCOLO DURATE ---
        let planDuration: number | string = "—";
        if (constrStartPlan && constrEndFcst) {
          planDuration = Math.max(differenceInDays(new Date(constrEndFcst), new Date(constrStartPlan)), 1);
        }

        let actDuration: number | string = "—";
        if (constrStartPlan && constrEndAct) {
          actDuration = Math.max(differenceInDays(new Date(constrEndAct), new Date(constrStartPlan)), 1);
        } else if (constrStartPlan && (macroPhase === "Construction" || macroPhase === "Certification")) {
          actDuration = Math.max(differenceInDays(new Date(), new Date(constrStartPlan)), 1);
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
              
              // Assegna la fase al segmento per i colori del Gantt
              let phase = "Other";
              const req = (m.requirement || "").toLowerCase();
              if (req.includes("design")) phase = "Design";
              else if (req.includes("construction") || req.includes("cantiere") || req.includes("handover")) phase = "Construction";
              else if (req.includes("certif") || req.includes("review")) phase = "Certification";

              segments.push({
                id: m.id, start: m.start_date, end: m.due_date, status: displayStatus,
                progress: m.status === "achieved" ? 100 : m.status === "in_progress" ? 50 : 0,
                phase
              });
            }
          });
        }

        const progress = (hasTimeline && isTimelineConfigured) ? Math.round((achievedCount / timelineMilestones.length) * 100) : 0;

        let plannerStatus = "pending";
        if (setup_status === "certificato") {
          plannerStatus = "Certified"; // Imposto a Certified per attivare la riga verde in FGBPlanner
        } else if (hasTimeline && isTimelineConfigured) {
          const hasActive = timelineMilestones.some((m: any) => m.status === "in_progress" || m.status === "achieved");
          if (hasActive) {
            plannerStatus = c.handover_date < today ? "late" : "in_progress";
          }
        }

        // Override status for on_hold
        const hasOnHold = timelineMilestones.some((m: any) => m.status === "on_hold");
        if (hasOnHold) plannerStatus = "on_hold";

        const plannerData: GanttRowData = {
          id: c.id,
          label: c.name || c.cert_type || "Unnamed",
          subLabel: c.client,
          launchDate,
          designStart,
          designEnd,
          constrStartPlan,
          constrEndFcst,
          constrEndAct,
          planDuration,
          actDuration,
          planStart,
          planEnd: c.handover_date,
          actualStart: plannerStatus !== "pending" ? planStart : null,
          actualEnd: setup_status === "certificato" ? today : null,
          progress,
          status: setup_status === "certificato" ? "Certified" : macroPhase, // Mostra la macro fase o Certified
          segments,
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
          updated_at: c.updated_at,
          is_commissioning: c.is_commissioning,
          project_subtype: c.project_subtype,
          sites: c.sites || null,
          certifications: [c],
          project_allocations: allocations,
          setup_status,
          missing,
          certification_milestones: certMilestones,
          plannerData,
          macro_phase: macroPhase,
          is_deadline_critical,
        } as PMProject;
      });
    },
  });
}

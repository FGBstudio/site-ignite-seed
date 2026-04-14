import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TaskAlert } from "@/hooks/useTaskAlerts";
import type { AppRole } from "@/types/custom-tables";

export interface AdminBoardTask {
  id: string;
  certification_id: string;
  task_name: string;
  assigned_to: string | null;
  end_date: string | null;
  status: string;
  project_name: string;
  pm_name: string;
  isSynthetic?: boolean;
}

type LightweightCertification = {
  id: string;
  name: string | null;
  client: string;
  pm_id: string | null;
  handover_date: string;
  created_at: string | null;
  status: string | null;
  cert_type: string;
  issued_date: string | null;
  project_allocations?: Array<{ id: string }> | null;
};

type LightweightMilestone = {
  certification_id: string;
  milestone_type: string | null;
  start_date: string | null;
  due_date: string | null;
  status: string | null;
};

const sortByEndDate = (a: { end_date: string | null }, b: { end_date: string | null }) => {
  const aTime = a.end_date ? new Date(a.end_date).getTime() : Number.MAX_SAFE_INTEGER;
  const bTime = b.end_date ? new Date(b.end_date).getTime() : Number.MAX_SAFE_INTEGER;
  return aTime - bTime;
};

function computeSetupStatus(certification: LightweightCertification, milestones: LightweightMilestone[]) {
  const today = new Date().toISOString().slice(0, 10);
  const timelineMilestones = milestones.filter((m) => m.milestone_type === "timeline");
  const hasTimeline = timelineMilestones.length > 0;
  const hasScorecard = milestones.some((m) => m.milestone_type === "scorecard");
  const isTimelineConfigured = timelineMilestones.some((m) => m.start_date !== null || m.due_date !== null);
  const isCertified =
    certification.status === "certificato" ||
    (certification.status === "active" && !!certification.issued_date && certification.issued_date.slice(0, 10) <= today);

  if (isCertified) return "certificato" as const;
  if (hasTimeline && hasScorecard && isTimelineConfigured) return "in_corso" as const;
  return "da_configurare" as const;
}

export function useAdminTasksData(role: AppRole | null, userId: string | undefined) {
  return useQuery({
    queryKey: ["admin-task-board", role, userId],
    enabled: role === "ADMIN" && !!userId,
    staleTime: 30_000,
    queryFn: async () => {
      const [tasksResult, alertsResult, certificationsResult] = await Promise.all([
        supabase
          .from("project_tasks" as any)
          .select("id, certification_id, assigned_to, end_date, status, task_name, certifications!project_tasks_certification_id_fkey(name, client)")
          // Rimosso .neq("status", "done") per permettere il download dello storico completato
          .order("end_date", { ascending: true })
          .limit(500), // Limite di sicurezza per lo storico dei task
        (supabase as any)
          .from("task_alerts")
          .select("*, certifications!task_alerts_certification_id_fkey(name, client)")
          // Rimosso .eq("is_resolved", false) per permettere il download degli alert risolti
          .eq("escalate_to_admin", true)
          .order("created_at", { ascending: false })
          .limit(200), // Limite di sicurezza per lo storico degli alert
        (supabase as any)
          .from("certifications")
          .select("id, name, client, pm_id, handover_date, created_at, status, cert_type, issued_date, project_allocations(id)")
          .order("handover_date", { ascending: true }),
      ]);

      if (tasksResult.error) throw tasksResult.error;
      if (alertsResult.error) throw alertsResult.error;
      if (certificationsResult.error) throw certificationsResult.error;

      const tasks = (tasksResult.data || []) as any[];
      const rawAlerts = (alertsResult.data || []) as any[];
      const certifications = (certificationsResult.data || []) as LightweightCertification[];
      const certificationIds = certifications.map((certification) => certification.id);

      let milestones: LightweightMilestone[] = [];
      if (certificationIds.length > 0) {
        const milestonesResult = await supabase
          .from("certification_milestones")
          .select("certification_id, milestone_type, start_date, due_date, status")
          .in("certification_id", certificationIds);

        if (milestonesResult.error) throw milestonesResult.error;
        milestones = (milestonesResult.data || []) as LightweightMilestone[];
      }

      const profileIds = [
        ...new Set(
          [
            ...tasks.map((task) => task.assigned_to),
            ...rawAlerts.map((alert) => alert.created_by),
            ...certifications.map((certification) => certification.pm_id),
          ].filter(Boolean)
        ),
      ] as string[];

      const profileMap = new Map<string, string>();
      if (profileIds.length > 0) {
        const profilesResult = await supabase
          .from("profiles")
          .select("id, full_name, display_name, email")
          .in("id", profileIds);

        if (profilesResult.error) throw profilesResult.error;

        for (const profile of profilesResult.data || []) {
          profileMap.set(profile.id, profile.display_name || profile.full_name || profile.email || profile.id);
        }
      }

      const milestonesByCertification = new Map<string, LightweightMilestone[]>();
      for (const milestone of milestones) {
        const bucket = milestonesByCertification.get(milestone.certification_id) || [];
        bucket.push(milestone);
        milestonesByCertification.set(milestone.certification_id, bucket);
      }

      const realTasks: AdminBoardTask[] = tasks.map((task) => ({
        ...task,
        project_name: task.certifications?.name || "Unknown Project",
        pm_name: task.assigned_to ? profileMap.get(task.assigned_to) || "Unknown PM" : "Unassigned",
      }));

      const syntheticTasks = certifications.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/types/custom-tables";

export type TaskAlertType =
  | "timeline_to_configure"
  | "milestone_deadline"
  | "project_on_hold"
  | "pm_operational"
  | "other_critical";

export interface TaskAlert {
  id: string;
  certification_id: string;
  created_by: string;
  alert_type: TaskAlertType;
  title: string;
  description: string | null;
  is_resolved: boolean;
  escalate_to_admin: boolean;
  created_at: string;
  resolved_at: string | null;
  // joined
  certification_name?: string;
  certification_client?: string;
  pm_name?: string;
}

const ALERT_TYPE_LABELS: Record<TaskAlertType, string> = {
  timeline_to_configure: "Timeline to Configure",
  milestone_deadline: "Milestone Deadline",
  project_on_hold: "Project On Hold",
  pm_operational: "PM Operational",
  other_critical: "Critical Issue",
};

const ALERT_TYPE_COLORS: Record<TaskAlertType, string> = {
  timeline_to_configure: "bg-warning/10 text-warning border-warning/20",
  milestone_deadline: "bg-destructive/10 text-destructive border-destructive/20",
  project_on_hold: "bg-muted text-muted-foreground border-border",
  pm_operational: "bg-primary/10 text-primary border-primary/20",
  other_critical: "bg-destructive/10 text-destructive border-destructive/20",
};

export { ALERT_TYPE_LABELS, ALERT_TYPE_COLORS };

/** Fetch unresolved alerts: Admin sees all escalated, PM sees own */
export function useTaskAlerts(role: AppRole | null, userId: string | undefined) {
  return useQuery({
    queryKey: ["task-alerts", role, userId],
    enabled: !!userId && !!role,
    queryFn: async () => {
      let query = (supabase as any)
        .from("task_alerts")
        .select("*, certifications!task_alerts_certification_id_fkey(name, client), profiles!task_alerts_created_by_fkey(full_name)")
        .eq("is_resolved", false)
        .order("created_at", { ascending: false });

      // Admin sees all escalated; PM sees own
      if (role === "ADMIN") {
        query = query.eq("escalate_to_admin", true);
      }
      // PM policy already filters by created_by = auth.uid()

      const { data, error } = await query;
      if (error) throw error;

      return ((data || []) as any[]).map((a: any) => ({
        ...a,
        certification_name: a.certifications?.name || "—",
        certification_client: a.certifications?.client || "",
        pm_name: a.profiles?.full_name || "—",
      })) as TaskAlert[];
    },
  });
}

/** Count alerts by type */
export function useTaskAlertCounts(role: AppRole | null, userId: string | undefined) {
  const { data: alerts = [], ...rest } = useTaskAlerts(role, userId);

  const counts = alerts.reduce<Record<TaskAlertType, number>>(
    (acc, a) => {
      acc[a.alert_type as TaskAlertType] = (acc[a.alert_type as TaskAlertType] || 0) + 1;
      return acc;
    },
    {
      timeline_to_configure: 0,
      milestone_deadline: 0,
      project_on_hold: 0,
      pm_operational: 0,
      other_critical: 0,
    }
  );

  return { alerts, counts, total: alerts.length, ...rest };
}

/** Create a new alert */
export function useCreateAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (alert: {
      certification_id: string;
      created_by: string;
      alert_type: TaskAlertType;
      title: string;
      description?: string;
      escalate_to_admin: boolean;
    }) => {
      const { data, error } = await (supabase as any)
        .from("task_alerts")
        .insert(alert)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task-alerts"] });
    },
  });
}

/** Resolve an alert */
export function useResolveAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (alertId: string) => {
      const { error } = await (supabase as any)
        .from("task_alerts")
        .update({ is_resolved: true, resolved_at: new Date().toISOString() })
        .eq("id", alertId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task-alerts"] });
    },
  });
}

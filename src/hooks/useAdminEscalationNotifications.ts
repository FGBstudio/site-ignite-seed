import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ALERT_TYPE_LABELS, type TaskAlertType } from "@/hooks/useTaskAlerts";

/**
 * Subscribes admins to live escalations via Supabase Realtime.
 * Fires a sonner toast whenever a new task_alert is inserted (or flipped) with escalate_to_admin=true.
 * Mounted once at the layout level for users with the ADMIN role.
 */
export function useAdminEscalationNotifications() {
  const { role, user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const seenIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (role !== "ADMIN" || !user?.id) return;

    const handleNew = (row: any) => {
      if (!row || !row.id) return;
      if (row.escalate_to_admin !== true) return;
      if (seenIds.current.has(row.id)) return;
      seenIds.current.add(row.id);

      const typeLabel = ALERT_TYPE_LABELS[row.alert_type as TaskAlertType] ?? "Escalation";
      const title = row.title || typeLabel;

      toast(`${typeLabel}: ${title}`, {
        description: row.description ?? undefined,
        action: {
          label: "View",
          onClick: () => navigate("/admin-tasks"),
        },
        duration: 8000,
      });

      qc.invalidateQueries({ queryKey: ["task-alerts"] });
    };

    const channel = supabase
      .channel("admin-escalation-notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "task_alerts" },
        (payload) => handleNew(payload.new),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "task_alerts" },
        (payload) => {
          const newRow: any = payload.new;
          const oldRow: any = payload.old;
          if (newRow?.escalate_to_admin === true && oldRow?.escalate_to_admin !== true) {
            handleNew(newRow);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [role, user?.id, navigate, qc]);
}

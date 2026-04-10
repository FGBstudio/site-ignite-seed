import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useResolveAlert, ALERT_TYPE_LABELS, ALERT_TYPE_COLORS, type TaskAlertType } from "@/hooks/useTaskAlerts";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface ProjectAlertsProps {
  certificationId: string;
}

export function ProjectAlerts({ certificationId }: ProjectAlertsProps) {
  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ["project-alerts", certificationId],
    enabled: !!certificationId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("task_alerts")
        .select("*, profiles!task_alerts_created_by_fkey(full_name)")
        .eq("certification_id", certificationId)
        .eq("is_resolved", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((a: any) => ({
        ...a,
        pm_name: a.profiles?.full_name || "—",
      }));
    },
  });

  const resolveAlert = useResolveAlert();

  if (isLoading) return null;
  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2 mb-4">
      <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" />
        Active Alerts ({alerts.length})
      </h3>
      {alerts.map((alert: any) => (
        <Card key={alert.id} className="border-l-4" style={{ borderLeftColor: "hsl(var(--destructive))" }}>
          <CardContent className="py-3 px-4 flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Badge
                  variant="outline"
                  className={cn("text-xs border", ALERT_TYPE_COLORS[alert.alert_type as TaskAlertType])}
                >
                  {ALERT_TYPE_LABELS[alert.alert_type as TaskAlertType] || alert.alert_type}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(alert.created_at), "dd MMM yyyy")}
                </span>
                {alert.escalate_to_admin && (
                  <Badge variant="destructive" className="text-[10px]">Escalated</Badge>
                )}
              </div>
              <p className="text-sm font-medium text-foreground">{alert.title}</p>
              {alert.description && (
                <p className="text-xs text-muted-foreground mt-0.5">{alert.description}</p>
              )}
              <p className="text-xs text-muted-foreground mt-0.5">PM: {alert.pm_name}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 text-xs gap-1"
              onClick={() => resolveAlert.mutate(alert.id)}
              disabled={resolveAlert.isPending}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Resolve
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

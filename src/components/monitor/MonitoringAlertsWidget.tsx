import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  useTaskAlerts,
  useResolveAlert,
  ALERT_TYPE_LABELS,
  ALERT_TYPE_COLORS,
  type TaskAlert,
  type TaskAlertType,
} from "@/hooks/useTaskAlerts";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Wind,
  Zap,
  Droplet,
  PackageCheck,
  ExternalLink,
  CheckCircle,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const MONITORING_TYPES: TaskAlertType[] = [
  "monitoring_iaq_requested",
  "monitoring_energy_requested",
  "monitoring_water_requested",
  "monitoring_energy_ready_to_assign",
];

const ICONS: Partial<Record<TaskAlertType, typeof Wind>> = {
  monitoring_iaq_requested: Wind,
  monitoring_energy_requested: Zap,
  monitoring_water_requested: Droplet,
  monitoring_energy_ready_to_assign: PackageCheck,
};

interface Props {
  /** Optional: limit to specific monitoring sub-types. Defaults to all four. */
  types?: TaskAlertType[];
  className?: string;
}

export function MonitoringAlertsWidget({ types = MONITORING_TYPES, className }: Props) {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const { data: alerts = [], isLoading } = useTaskAlerts(role, user?.id);
  const resolve = useResolveAlert();

  const active = (alerts as TaskAlert[]).filter(
    (a) => !a.is_resolved && types.includes(a.alert_type),
  );

  if (isLoading) return null;

  return (
    <Card className={cn("border-primary/20", className)}>
      <CardContent className="py-4 px-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Monitoring Alerts</h3>
            <Badge variant="secondary" className="ml-1 text-[10px]">
              {active.length}
            </Badge>
          </div>
        </div>

        {active.length === 0 ? (
          <p className="text-xs text-muted-foreground py-3 text-center">
            No pending monitoring requests.
          </p>
        ) : (
          <div className="space-y-2">
            {active.map((a) => {
              const Icon = ICONS[a.alert_type] ?? ShieldAlert;
              return (
                <div
                  key={a.id}
                  className="flex items-start justify-between gap-3 p-2.5 rounded-md border bg-background/50 hover:bg-background transition-colors"
                >
                  <div className="flex items-start gap-2.5 flex-1 min-w-0">
                    <Icon className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground truncate">
                          {a.title}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn("text-[10px] shrink-0", ALERT_TYPE_COLORS[a.alert_type])}
                        >
                          {ALERT_TYPE_LABELS[a.alert_type]}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                        <span className="truncate">{a.certification_name}</span>
                        <span>·</span>
                        <span>{format(new Date(a.created_at), "dd MMM")}</span>
                      </div>
                      {a.description && (
                        <p className="text-[11px] text-muted-foreground mt-1 italic line-clamp-2">
                          {a.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      title="Open"
                      onClick={() =>
                        navigate(a.target_route || `/projects/${a.certification_id}`)
                      }
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                    {role === "ADMIN" && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-success hover:bg-success/10"
                        title="Resolve"
                        disabled={resolve.isPending}
                        onClick={() => resolve.mutate(a.id)}
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

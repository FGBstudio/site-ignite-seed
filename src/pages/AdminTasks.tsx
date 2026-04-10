import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { useAuth } from "@/contexts/AuthContext";
import {
  useTaskAlerts,
  useResolveAlert,
  ALERT_TYPE_LABELS,
  ALERT_TYPE_COLORS,
  type TaskAlert,
  type TaskAlertType,
} from "@/hooks/useTaskAlerts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle, ExternalLink, Inbox, AlertTriangle, Clock, Pause } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const TYPE_ICONS: Record<TaskAlertType, typeof AlertTriangle> = {
  timeline_to_configure: Clock,
  milestone_deadline: AlertTriangle,
  project_on_hold: Pause,
  pm_operational: Inbox,
  other_critical: AlertTriangle,
};

export default function AdminTasks() {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { data: alerts = [], isLoading } = useTaskAlerts(role, user?.id);
  const resolve = useResolveAlert();
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const filtered = typeFilter === "all" ? alerts : alerts.filter((a) => a.alert_type === typeFilter);

  // Group by PM
  const grouped = filtered.reduce<Record<string, TaskAlert[]>>((acc, a) => {
    const key = a.pm_name || "Unknown";
    if (!acc[key]) acc[key] = [];
    acc[key].push(a);
    return acc;
  }, {});

  return (
    <MainLayout title="Tasks & Alerts" subtitle="Support requests from Project Managers">
      <div className="flex items-center gap-3 mb-6">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="timeline_to_configure">Timeline to Configure</SelectItem>
            <SelectItem value="milestone_deadline">Milestone Deadline</SelectItem>
            <SelectItem value="project_on_hold">Project On Hold</SelectItem>
            <SelectItem value="other_critical">Critical Issue</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="secondary" className="text-xs">
          {filtered.length} open
        </Badge>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <CheckCircle className="h-12 w-12 text-success mx-auto mb-3" />
            <p className="text-lg font-medium text-foreground">No open alerts</p>
            <p className="text-sm text-muted-foreground mt-1">All PM requests have been resolved.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([pmName, pmAlerts]) => (
            <div key={pmName} className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">{pmName}</h3>
              <div className="space-y-2">
                {pmAlerts.map((alert) => {
                  const Icon = TYPE_ICONS[alert.alert_type as TaskAlertType] || AlertTriangle;
                  return (
                    <Card key={alert.id} className="hover:shadow-md transition-all">
                      <CardContent className="py-3 px-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <div className="mt-0.5">
                              <Icon className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm text-foreground truncate">{alert.title}</p>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "text-[10px]",
                                    ALERT_TYPE_COLORS[alert.alert_type as TaskAlertType]
                                  )}
                                >
                                  {ALERT_TYPE_LABELS[alert.alert_type as TaskAlertType]}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {alert.certification_name}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {format(new Date(alert.created_at), "dd MMM yyyy")}
                                </span>
                              </div>
                              {alert.description && (
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                  {alert.description}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 text-xs"
                              onClick={() => navigate(`/projects/${alert.certification_id}`)}
                            >
                              <ExternalLink className="h-3.5 w-3.5 mr-1" />
                              View
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs"
                              disabled={resolve.isPending}
                              onClick={() => resolve.mutate(alert.id)}
                            >
                              <CheckCircle className="h-3.5 w-3.5 mr-1" />
                              Resolve
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </MainLayout>
  );
}

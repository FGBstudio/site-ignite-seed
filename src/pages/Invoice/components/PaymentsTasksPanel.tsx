import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTaskAlerts, ALERT_TYPE_LABELS, ALERT_TYPE_COLORS } from "@/hooks/useTaskAlerts";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Receipt, ExternalLink, CheckCircle } from "lucide-react";
import { useResolveAlert } from "@/hooks/useTaskAlerts";

/**
 * Tasks & Alerts panel scoped to Payments — shows quotation→payments handover items
 * plus billing-related alerts. Lightweight version of AdminTasks for this hub.
 */
export function PaymentsTasksPanel() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const { data: alerts = [], isLoading } = useTaskAlerts(role, user?.id);
  const resolve = useResolveAlert();

  const paymentsAlerts = useMemo(
    () =>
      alerts.filter((a) =>
        ["quotation_to_payments", "billing_due", "extra_canone"].includes(a.alert_type)
      ),
    [alerts]
  );

  const active = paymentsAlerts.filter((a) => !a.is_resolved);
  const resolved = paymentsAlerts.filter((a) => a.is_resolved);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Receipt className="h-4 w-4 text-primary" /> Action required ({active.length})
        </h3>
        {active.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No payment tasks pending — you're all caught up.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {active.map((a) => (
              <Card key={a.id} className="border-primary/20">
                <CardContent className="py-3 px-4 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-medium text-sm">{a.title}</p>
                    {a.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{a.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className={cn("text-[10px]", ALERT_TYPE_COLORS[a.alert_type])}>
                        {ALERT_TYPE_LABELS[a.alert_type]}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(a.created_at), "dd MMM yyyy")}
                      </span>
                      {a.certification_name && (
                        <span className="text-[10px] text-muted-foreground truncate">
                          • {a.certification_name}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    {a.target_route && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 text-xs"
                        onClick={() => navigate(a.target_route!)}
                      >
                        <ExternalLink className="h-3 w-3" /> Open
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1 text-xs"
                      disabled={resolve.isPending}
                      onClick={() => resolve.mutate(a.id)}
                    >
                      <CheckCircle className="h-3 w-3" /> Done
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {resolved.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground mb-2">
            Completed ({resolved.length})
          </h3>
          <div className="space-y-1">
            {resolved.slice(0, 10).map((a) => (
              <div
                key={a.id}
                className="text-xs text-muted-foreground flex items-center justify-between px-3 py-2 rounded-md bg-muted/40"
              >
                <span className="truncate">{a.title}</span>
                <span className="shrink-0 ml-3">
                  {a.resolved_at ? format(new Date(a.resolved_at), "dd MMM") : ""}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

import { AlertTriangle } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useUnallocatedBudgetRisks } from "@/hooks/useSaturationMatrix";

/**
 * CEO-facing panel: projects whose remaining hourly budget cannot be allocated
 * before the deadline (the 40h/week hard cap makes it physically impossible).
 */
export function UnallocatedBudgetPanel() {
  const { data: risks = [], isLoading } = useUnallocatedBudgetRisks();

  return (
    <Card className="border-destructive/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          Unallocated Budget — projects at risk
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Hours assigned by management that cannot fit into the PM calendar before the deadline.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Checking portfolio…</p>
        ) : risks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No structural imbalance: every budget fits before its deadline.
          </p>
        ) : (
          <ul className="space-y-2">
            {risks.map((r) => (
              <li
                key={r.certification_id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate uppercase">{r.label}</p>
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    Budget {r.budget}h · planned {r.planned}h ·{" "}
                    {r.handover_date
                      ? `deadline ${format(parseISO(r.handover_date), "d MMM yyyy")} (${r.weeks_to_deadline}w)`
                      : "no deadline"}
                  </p>
                </div>
                <Badge variant="destructive" className="tabular-nums">
                  {r.unallocated_hours}h impossible to allocate
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

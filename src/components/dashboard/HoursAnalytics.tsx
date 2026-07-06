import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useCertHoursBurn } from "@/hooks/useHoursBudget";
import { useResourceUtilization } from "@/hooks/useHoursBudget";
import { getBudgetStatus } from "@/types/time-tracking";
import { startOfWeek, format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { AlertTriangle, Pencil, Check, X } from "lucide-react";

export function ProjectBurnRate() {
  const { data: rows = [], isLoading } = useCertHoursBurn();
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  // Resolve city per certification via a separate query (view has no site join).
  const { data: cityMap = new Map<string, string | null>() } = useQuery({
    queryKey: ["cert-city-map", rows.map((r) => r.certification_id).sort().join(",")],
    enabled: rows.length > 0,
    queryFn: async () => {
      const ids = rows.map((r) => r.certification_id).filter(Boolean);
      if (ids.length === 0) return new Map<string, string | null>();
      const { data, error } = await supabase
        .from("certifications")
        .select("id, sites ( city )")
        .in("id", ids);
      if (error) throw error;
      const m = new Map<string, string | null>();
      for (const c of (data || []) as any[]) m.set(c.id, c.sites?.city ?? null);
      return m;
    },
  });

  const updateAllocation = useMutation({
    mutationFn: async ({ id, hours }: { id: string; hours: number | null }) => {
      const { error } = await supabase
        .from("certifications")
        .update({ allocated_hours: hours })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hours-burn"] });
      qc.invalidateQueries({ queryKey: ["my-certifications"] });
      toast.success("Budget updated");
      setEditingId(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to update"),
  });

  const sorted = [...rows].sort((a, b) => {
    const pa = a.pct_used ?? -1;
    const pb = b.pct_used ?? -1;
    return pb - pa;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Project Burn Rate</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : sorted.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No certifications yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Allocated</TableHead>
                  <TableHead className="text-right">Consumed</TableHead>
                  <TableHead className="w-[200px]">Progress</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center">Alerts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((r) => {
                  const status = getBudgetStatus(Number(r.consumed_hours), Number(r.allocated_hours));
                  const editing = editingId === r.certification_id;
                  const pct = r.pct_used ?? 0;
                  return (
                    <TableRow key={r.certification_id}>
                      <TableCell className="font-medium">{r.certification_name || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{r.client}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {editing ? (
                          <div className="flex items-center gap-1 justify-end">
                            <Input
                              type="number"
                              min={0}
                              step={1}
                              value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              className="h-7 w-24 text-right"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  const n = Number(draft);
                                  updateAllocation.mutate({ id: r.certification_id, hours: n > 0 ? n : null });
                                } else if (e.key === "Escape") setEditingId(null);
                              }}
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => {
                                const n = Number(draft);
                                updateAllocation.mutate({ id: r.certification_id, hours: n > 0 ? n : null });
                              }}
                            >
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <button
                            className="inline-flex items-center gap-1 hover:underline"
                            onClick={() => {
                              setEditingId(r.certification_id);
                              setDraft(String(r.allocated_hours || ""));
                            }}
                          >
                            {Number(r.allocated_hours) > 0 ? `${r.allocated_hours}h` : <span className="text-muted-foreground italic">set…</span>}
                            <Pencil className="h-3 w-3 text-muted-foreground" />
                          </button>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{Number(r.consumed_hours)}h</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Progress
                            value={Math.min(pct, 100)}
                            className={cn(
                              "h-2",
                              status === "red" && "[&>div]:bg-destructive",
                              status === "yellow" && "[&>div]:bg-amber-500",
                              status === "green" && "[&>div]:bg-emerald-500",
                            )}
                          />
                          <div className="text-[10px] text-muted-foreground text-right tabular-nums">
                            {r.pct_used !== null ? `${r.pct_used}%` : "—"}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <StatusPill status={status} />
                      </TableCell>
                      <TableCell className="text-center">
                        {Number(r.overrun_alerts) > 0 && (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            {r.overrun_alerts}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusPill({ status }: { status: "green" | "yellow" | "red" | "none" }) {
  if (status === "none") return <span className="text-xs text-muted-foreground">—</span>;
  const map = {
    green: { label: "On track", cls: "bg-emerald-500/15 text-emerald-700 border-emerald-300" },
    yellow: { label: "Warning", cls: "bg-amber-500/15 text-amber-700 border-amber-300" },
    red: { label: "Over budget", cls: "bg-destructive/15 text-destructive border-destructive/40" },
  } as const;
  const m = map[status];
  return <Badge variant="outline" className={cn("text-[10px]", m.cls)}>{m.label}</Badge>;
}

export function ResourceMonitor() {
  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const { data: rows = [], isLoading } = useResourceUtilization(weekStart);

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-for-saturation", rows.map((r) => r.user_id).join(",")],
    enabled: rows.length > 0,
    queryFn: async () => {
      const ids = rows.map((r) => r.user_id);
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      if (error) throw error;
      return data ?? [];
    },
  });

  const map = new Map(profiles.map((p: any) => [p.id, p]));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Resource Utilization · Week of {format(new Date(weekStart), "d MMM yyyy")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No hours logged this week.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PM</TableHead>
                <TableHead className="text-right">Hours this week</TableHead>
                <TableHead className="w-[240px]">Saturation (40h)</TableHead>
                <TableHead className="text-right">Active projects</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const p = map.get(r.user_id) as any;
                const pct = (Number(r.total_hours) / 40) * 100;
                const color =
                  pct >= 100
                    ? "[&>div]:bg-destructive"
                    : pct >= 80
                      ? "[&>div]:bg-emerald-500"
                      : "[&>div]:bg-amber-500";
                return (
                  <TableRow key={r.user_id}>
                    <TableCell>
                      <div className="font-medium text-sm">{p?.full_name || "—"}</div>
                      <div className="text-[11px] text-muted-foreground">{p?.email}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{Number(r.total_hours)}h</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Progress value={Math.min(pct, 100)} className={cn("h-2", color)} />
                        <div className="text-[10px] text-muted-foreground text-right tabular-nums">
                          {pct.toFixed(0)}%
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.active_projects}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

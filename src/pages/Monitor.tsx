import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Save, X, Search, Download } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { SiteEnergyRecord, SiteEnergyRecordPatch } from "@/types/site-energy";

const fmtUSD = (n: number | null | undefined) =>
  typeof n === "number" ? n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }) : "—";
const fmtNum = (n: number | null | undefined) =>
  typeof n === "number" ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "—";

export default function Monitor() {
  return (
    <MainLayout title="Monitor" subtitle="Energy & Air monitoring across the portfolio">
      <Tabs defaultValue="energy">
        <TabsList>
          <TabsTrigger value="energy">Energy</TabsTrigger>
          <TabsTrigger value="air">Air</TabsTrigger>
        </TabsList>
        <TabsContent value="energy" className="mt-4">
          <EnergyTable />
        </TabsContent>
        <TabsContent value="air" className="mt-4">
          <Card>
            <CardContent className="py-16 text-center text-sm text-muted-foreground">
              Air monitoring table — coming next.
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </MainLayout>
  );
}

function EnergyTable() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SiteEnergyRecordPatch>({});

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["site-energy-records"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_energy_records" as never)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SiteEnergyRecord[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const matchesSearch =
        !q ||
        [r.project_name, r.brand_name, r.country, r.city, r.po_number, r.installer]
          .some((v) => (v ?? "").toLowerCase().includes(q));
      const matchesStatus = statusFilter === "all" || r.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [rows, search, statusFilter]);

  const kpis = useMemo(() => {
    const sites = filtered.length;
    const sensors = filtered.reduce((s, r) => s + (r.total_sensors ?? 0), 0);
    const bridges = filtered.reduce((s, r) => s + (r.total_bridges ?? 0), 0);
    const totalCost = filtered.reduce((s, r) => s + (r.total_cost ?? 0), 0);
    const rois = filtered.map((r) => r.roi_pct).filter((v): v is number => typeof v === "number");
    const avgRoi = rois.length ? rois.reduce((a, b) => a + b, 0) / rois.length : 0;
    return { sites, sensors, bridges, totalCost, avgRoi };
  }, [filtered]);

  const statuses = useMemo(
    () => Array.from(new Set(rows.map((r) => r.status).filter(Boolean) as string[])),
    [rows],
  );

  const startEdit = (r: SiteEnergyRecord) => {
    setEditingId(r.id);
    setDraft({});
  };
  const cancelEdit = () => {
    setEditingId(null);
    setDraft({});
  };
  const saveEdit = async (id: string) => {
    if (Object.keys(draft).length === 0) {
      cancelEdit();
      return;
    }
    const { error } = await supabase
      .from("site_energy_records" as never)
      .update(draft as never)
      .eq("id", id);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    qc.invalidateQueries({ queryKey: ["site-energy-records"] });
    toast({ title: "Updated" });
    cancelEdit();
  };

  const exportCSV = () => {
    if (filtered.length === 0) return;
    const headers = Object.keys(filtered[0]) as (keyof SiteEnergyRecord)[];
    const lines = [
      headers.join(","),
      ...filtered.map((r) => headers.map((h) => JSON.stringify(r[h] ?? "")).join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "monitor-energy.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const setDraftField = <K extends keyof SiteEnergyRecordPatch>(k: K, v: SiteEnergyRecordPatch[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="Sites" value={fmtNum(kpis.sites)} />
        <Kpi label="Total Sensors" value={fmtNum(kpis.sensors)} />
        <Kpi label="Total Bridges" value={fmtNum(kpis.bridges)} />
        {isAdmin && <Kpi label="Total Cost" value={fmtUSD(kpis.totalCost)} />}
        <Kpi label="Avg ROI" value={`${kpis.avgRoi.toFixed(1)}%`} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search project, brand, country…"
            className="pl-9 w-72"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {statuses.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={exportCSV} className="gap-2">
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4">
          {isLoading ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No energy records yet. They appear here when an Admin confirms a CT Builder quote.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 sticky top-0">
                  <tr className="text-left">
                    {isAdmin && <th className="p-2 w-10"></th>}
                    <th className="p-2">Project</th>
                    <th className="p-2">Brand</th>
                    <th className="p-2">Country</th>
                    <th className="p-2">City</th>
                    <th className="p-2">Status</th>
                    <th className="p-2 text-right">Sensors</th>
                    <th className="p-2 text-right">Bridges</th>
                    <th className="p-2 text-right">PAN-10</th>
                    <th className="p-2 text-right">PAN-12</th>
                    <th className="p-2 text-right">PAN-14</th>
                    {isAdmin && <th className="p-2 text-right">Total Cost</th>}
                    {isAdmin && <th className="p-2 text-right">ROI %</th>}
                    <th className="p-2">Online</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const isEditing = editingId === r.id;
                    const v = <K extends keyof SiteEnergyRecord>(k: K): SiteEnergyRecord[K] =>
                      (isEditing && k in draft ? (draft as Record<string, unknown>)[k as string] : r[k]) as SiteEnergyRecord[K];
                    return (
                      <tr key={r.id} className={cn("border-t border-border", isEditing && "bg-primary/5")}>
                        {isAdmin && (
                          <td className="p-2">
                            {isEditing ? (
                              <div className="flex gap-1">
                                <Button size="icon" variant="ghost" onClick={() => saveEdit(r.id)} className="h-7 w-7">
                                  <Save className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" onClick={cancelEdit} className="h-7 w-7">
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ) : (
                              <Button size="icon" variant="ghost" onClick={() => startEdit(r)} className="h-7 w-7">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </td>
                        )}
                        <td className="p-2">
                          {isEditing ? (
                            <Input
                              value={(v("project_name") as string) ?? ""}
                              onChange={(e) => setDraftField("project_name", e.target.value)}
                              className="h-7 text-xs"
                            />
                          ) : (
                            r.project_name ?? "—"
                          )}
                        </td>
                        <td className="p-2 text-muted-foreground">{r.brand_name ?? "—"}</td>
                        <td className="p-2">{r.country ?? "—"}</td>
                        <td className="p-2">{r.city ?? "—"}</td>
                        <td className="p-2">
                          {isEditing ? (
                            <Input
                              value={(v("status") as string) ?? ""}
                              onChange={(e) => setDraftField("status", e.target.value)}
                              className="h-7 text-xs w-28"
                            />
                          ) : (
                            <Badge variant="outline">{r.status ?? "—"}</Badge>
                          )}
                        </td>
                        <td className="p-2 text-right tabular-nums">{fmtNum(r.total_sensors)}</td>
                        <td className="p-2 text-right tabular-nums">{fmtNum(r.total_bridges)}</td>
                        <td className="p-2 text-right tabular-nums">{fmtNum(r.no_pan10)}</td>
                        <td className="p-2 text-right tabular-nums">{fmtNum(r.no_pan12)}</td>
                        <td className="p-2 text-right tabular-nums">{fmtNum(r.no_pan14)}</td>
                        {isAdmin && (
                          <td className="p-2 text-right tabular-nums">{fmtUSD(r.total_cost)}</td>
                        )}
                        {isAdmin && (
                          <td className="p-2 text-right tabular-nums">
                            {typeof r.roi_pct === "number" ? `${r.roi_pct.toFixed(0)}%` : "—"}
                          </td>
                        )}
                        <td className="p-2">
                          {r.online_status ? <Badge variant="outline">{r.online_status}</Badge> : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold text-foreground tabular-nums mt-1">{value}</div>
    </div>
  );
}

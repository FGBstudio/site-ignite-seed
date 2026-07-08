import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Download, Eye, EyeOff, Loader2, Pencil, Search, X, Zap, Wind, Droplet } from "lucide-react";
import { format, parseISO } from "date-fns";
import { MainLayout } from "@/components/layout/MainLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useMonitorRows, STATUS_OPTIONS, CATEGORY_OPTIONS, type MonitorRow } from "@/hooks/useMonitorRows";
import type { SiteEnergyRecordPatch } from "@/types/site-energy";
import { cn } from "@/lib/utils";
import { MonitoringAlertsWidget } from "@/components/monitor/MonitoringAlertsWidget";
import { AirTable } from "@/components/projects/AirMonitoring/AirTable";

const fmtEUR = (n: number | null | undefined) =>
  typeof n === "number" ? n.toLocaleString("en-US", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }) : "—";
const fmtUSD = (n: number | null | undefined) =>
  typeof n === "number" ? n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }) : "—";
const fmtNum = (n: number | null | undefined) =>
  typeof n === "number" ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "—";
const fmtPct = (n: number | null | undefined) =>
  typeof n === "number" ? `${n.toFixed(1)}%` : "—";
const fmtDate = (s: string | null | undefined) => {
  if (!s) return "—";
  try { return format(parseISO(s), "dd MMM yyyy"); } catch { return s; }
};

const statusTone = (s: string | null | undefined) => {
  switch ((s ?? "").toLowerCase()) {
    case "active": case "online": case "completed": case "installed": return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
    case "to install": case "pending": case "upcoming": return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
    case "offline": case "issue": case "deleted": return "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30";
    default: return "bg-muted text-foreground/70 border-border";
  }
};


export default function Monitor() {
  return (
    <MainLayout title="Monitor" subtitle="Energy & Air monitoring across the portfolio">
      <div className="space-y-4">
        <MonitoringAlertsWidget />
        <Tabs defaultValue="energy">
          <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
            <TabsTrigger value="energy" className="gap-2">
              <Zap className="h-4 w-4" /> Energy
            </TabsTrigger>
            <TabsTrigger value="air" className="gap-2">
              <Wind className="h-4 w-4" /> Air Quality
            </TabsTrigger>
          </TabsList>
          <TabsContent value="energy" className="mt-4">
            <EnergyTable />
          </TabsContent>
          <TabsContent value="air" className="mt-4">
            <AirTable />
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}

const SEC = {
  site:    { head: "bg-slate-100/80 dark:bg-slate-800/40 text-slate-700 dark:text-slate-200" },
  hw:      { head: "bg-sky-100/80 dark:bg-sky-900/30 text-sky-800 dark:text-sky-200" },
  cost:    { head: "bg-amber-100/80 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200" },
  finance: { head: "bg-emerald-100/80 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200" },
  net:     { head: "bg-violet-100/80 dark:bg-violet-900/30 text-violet-800 dark:text-violet-200" },
};

function EnergyTable() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useMonitorRows();

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({
    status: "all", category: "all", pm: "all", package: "all",
    region: "all", country: "all", brand: "all", frequency: "all",
  });
  const [showNetwork, setShowNetwork] = useState(false);

  const uniques = useMemo(() => ({
    pms: Array.from(new Set(rows.map((r) => r.pm_name).filter(Boolean) as string[])),
    regions: Array.from(new Set(rows.map((r) => r.region).filter(Boolean) as string[])),
    countries: Array.from(new Set(rows.map((r) => r.country).filter(Boolean) as string[])),
    brands: Array.from(new Set(rows.map((r) => r.brand_name).filter(Boolean) as string[])),
    frequencies: Array.from(new Set(rows.map((r) => r.frequency).filter((v): v is number => typeof v === "number"))),
  }), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && ![r.project_name, r.brand_name, r.country, r.city, r.installer, ...(r.po_numbers ?? [])]
        .some((v) => (v ?? "").toString().toLowerCase().includes(q))) return false;
      if (filters.status !== "all" && r.status !== filters.status) return false;
      if (filters.category !== "all" && r.category !== filters.category) return false;
      if (filters.pm !== "all" && r.pm_name !== filters.pm) return false;
      if (filters.package !== "all" && (r.package_type ?? "Customized") !== filters.package) return false;
      if (filters.region !== "all" && r.region !== filters.region) return false;
      if (filters.country !== "all" && r.country !== filters.country) return false;
      if (filters.brand !== "all" && r.brand_name !== filters.brand) return false;
      if (filters.frequency !== "all" && String(r.frequency) !== filters.frequency) return false;
      return true;
    });
  }, [rows, search, filters]);

  const update = async (id: string, patch: SiteEnergyRecordPatch, projectName: string | null): Promise<boolean> => {
    const fields = Object.keys(patch);
    const { error } = await supabase.from("site_energy_records" as never).update(patch as never).eq("id", id);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return false;
    }
    toast({
      title: "Row updated",
      description: `${projectName ?? "Row"} — ${fields.length} field${fields.length === 1 ? "" : "s"} changed (${fields.join(", ")}).`,
    });
    await qc.invalidateQueries({ queryKey: ["monitor-energy-rows"] });
    return true;
  };

  const exportCSV = () => {
    if (filtered.length === 0) return;
    const cols: (keyof MonitorRow)[] = [
      "project_name", "brand_name", "region", "country", "city", "status",
      "frequency", "free_software_year", "installation_date", "contracted",
      "pm_name", "handover_date", "category", "installer", "package_type",
      "additional_sensors", "additional_bridge", "no_pan10", "no_pan12", "no_pan14",
      "no_ct", "no_mango", "total_sensors", "total_bridges",
      "live_total_pkg_eur", "live_total_cost", "quotation_value", "live_planned_remaining", "live_profit", "live_roi",
      "online_status",
    ];
    const lines = [
      cols.join(","),
      ...filtered.map((r) => cols.map((c) => JSON.stringify(r[c] ?? "")).join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "monitor-energy.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const COL_SITE = 15;
  const COL_HW = 9;
  const COL_COST = 9;
  const COL_FIN = 9;
  const COL_NET = 8;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search project, brand, PO, installer…" className="pl-9 w-72" />
            </div>
            <FilterSelect label="Status" value={filters.status} onChange={(v) => setFilters({ ...filters, status: v })} options={STATUS_OPTIONS as readonly string[]} />
            <FilterSelect label="Category" value={filters.category} onChange={(v) => setFilters({ ...filters, category: v })} options={CATEGORY_OPTIONS as readonly string[]} />
            <FilterSelect label="PM" value={filters.pm} onChange={(v) => setFilters({ ...filters, pm: v })} options={uniques.pms} />
            <FilterSelect label="Package" value={filters.package} onChange={(v) => setFilters({ ...filters, package: v })} options={["A", "B", "Customized"]} />
            <FilterSelect label="Brand" value={filters.brand} onChange={(v) => setFilters({ ...filters, brand: v })} options={uniques.brands} />
            <FilterSelect label="Region" value={filters.region} onChange={(v) => setFilters({ ...filters, region: v })} options={uniques.regions} />
            <FilterSelect label="Country" value={filters.country} onChange={(v) => setFilters({ ...filters, country: v })} options={uniques.countries} />
            <FilterSelect label="Frequency" value={filters.frequency} onChange={(v) => setFilters({ ...filters, frequency: v })} options={uniques.frequencies.map(String)} />
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowNetwork((s) => !s)} className="gap-2">
                {showNetwork ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />} Network
              </Button>
              <Button variant="outline" size="sm" onClick={exportCSV} className="gap-2">
                <Download className="h-4 w-4" /> Export
              </Button>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground inline-flex items-center gap-1">
            <Pencil className="h-3 w-3" /> Click the pencil on a row to enable editing, change any field, then save to confirm.
          </p>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        {isLoading ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No energy records yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-[11px] w-full border-separate border-spacing-0">
              <thead className="sticky top-0 z-20">
                <tr>
                  <th colSpan={COL_SITE} className={cn("px-3 py-1.5 text-left text-[10px] uppercase tracking-wider font-semibold border-b border-border", SEC.site.head)}>Site Info</th>
                  <th colSpan={COL_HW} className={cn("px-3 py-1.5 text-left text-[10px] uppercase tracking-wider font-semibold border-b border-l border-border", SEC.hw.head)}>Hardware</th>
                  {isAdmin && <th colSpan={COL_COST} className={cn("px-3 py-1.5 text-left text-[10px] uppercase tracking-wider font-semibold border-b border-l border-border", SEC.cost.head)}>Costs</th>}
                  {isAdmin && <th colSpan={COL_FIN} className={cn("px-3 py-1.5 text-left text-[10px] uppercase tracking-wider font-semibold border-b border-l border-border", SEC.finance.head)}>Finance</th>}
                  {showNetwork && <th colSpan={COL_NET} className={cn("px-3 py-1.5 text-left text-[10px] uppercase tracking-wider font-semibold border-b border-l border-border", SEC.net.head)}>Network</th>}
                  <th className="px-3 py-1.5 border-b border-l border-border bg-muted/40" />
                </tr>
                <tr className="bg-background">
                  <Th tone={SEC.site.head}><span className="sr-only">Edit</span></Th>
                  <Th tone={SEC.site.head}>Client</Th>
                  <Th tone={SEC.site.head}>City</Th>
                  <Th sticky tone={SEC.site.head}>Project</Th>
                  <Th tone={SEC.site.head}>Status</Th>
                  <Th tone={SEC.site.head}>Frequency</Th>
                  <Th tone={SEC.site.head}>Free SW yr</Th>
                  <Th tone={SEC.site.head}>Installation</Th>
                  <Th tone={SEC.site.head}>Contracted</Th>
                  <Th tone={SEC.site.head}>PM</Th>
                  <Th tone={SEC.site.head}>Handover</Th>
                  <Th tone={SEC.site.head}>Category</Th>
                  <Th tone={SEC.site.head}>PO</Th>
                  <Th tone={SEC.site.head}>Installer</Th>
                  <Th tone={SEC.site.head}>Package</Th>
 
                  <Th right tone={SEC.hw.head}>Add. Sens</Th>
                  <Th right tone={SEC.hw.head}>Add. Br</Th>
                  <Th right tone={SEC.hw.head}>PAN-10</Th>
                  <Th right tone={SEC.hw.head}>PAN-12</Th>
                  <Th right tone={SEC.hw.head}>PAN-14</Th>
                  <Th right tone={SEC.hw.head}>CT</Th>
                  <Th right tone={SEC.hw.head}>Mango</Th>
                  <Th right tone={SEC.hw.head}>Tot Sens</Th>
                  <Th right tone={SEC.hw.head}>Tot Br</Th>
 
                  {isAdmin && <>
                    <Th right tone={SEC.cost.head}>Bridge $</Th>
                    <Th right tone={SEC.cost.head}>Sensor $</Th>
                    <Th right tone={SEC.cost.head}>Pkg $</Th>
                    <Th right tone={SEC.cost.head}>Pkg €</Th>
                    <Th right tone={SEC.cost.head}>Duty (in)</Th>
                    <Th right tone={SEC.cost.head}>VAT</Th>
                    <Th right tone={SEC.cost.head}>Pickup</Th>
                    <Th right tone={SEC.cost.head}>Shipment</Th>
                    <Th right tone={SEC.cost.head}>Out. Cust</Th>
 
                    <Th right tone={SEC.finance.head}>Installation</Th>
                    <Th right tone={SEC.finance.head}>Quotation</Th>
                    <Th right tone={SEC.finance.head}>Co. 20%</Th>
                    <Th right tone={SEC.finance.head}>FGB res.</Th>
                    <Th right tone={SEC.finance.head}>Total Cost</Th>
                    <Th right tone={SEC.finance.head}>Plan. Rem.</Th>
                    <Th right tone={SEC.finance.head}>Taxes</Th>
                    <Th right tone={SEC.finance.head}>Profit</Th>
                    <Th right tone={SEC.finance.head}>ROI</Th>
                  </>}
 
                  {showNetwork && <>
                    <Th tone={SEC.net.head}>Tracking #</Th>
                    <Th tone={SEC.net.head}>IP cfg</Th>
                    <Th tone={SEC.net.head}>Port</Th>
                    <Th tone={SEC.net.head}>IP addr</Th>
                    <Th tone={SEC.net.head}>Subnet</Th>
                    <Th tone={SEC.net.head}>Gateway</Th>
                    <Th tone={SEC.net.head}>DNS1</Th>
                    <Th tone={SEC.net.head}>DNS2</Th>
                  </>}
                  <Th tone="bg-muted/40">Online</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <Row key={r.id} r={r} idx={i} isAdmin={isAdmin} showNetwork={showNetwork} onUpdate={update} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Th({ children, right, sticky, tone }: { children: React.ReactNode; right?: boolean; sticky?: boolean; tone?: string }) {
  return (
    <th className={cn(
      "px-3 py-2 font-semibold text-[10.5px] uppercase tracking-wide whitespace-nowrap border-b border-border",
      right ? "text-right" : "text-left",
      sticky ? "sticky left-0 z-30 bg-card shadow-[2px_0_4px_-2px_rgba(0,0,0,0.12)]" : tone,
    )}>
      {children}
    </th>
  );
}

interface RowProps {
  r: MonitorRow;
  idx: number;
  isAdmin: boolean;
  showNetwork: boolean;
  onUpdate: (id: string, patch: SiteEnergyRecordPatch, projectName: string | null) => Promise<boolean>;
}

function Row({ r, idx, isAdmin, showNetwork, onUpdate }: RowProps) {
  const isFendi24 = r.category === "Fendi Energy Project 2024";
  const [editing, setEditing] = useState(false);
  const [patch, setPatch] = useState<SiteEnergyRecordPatch>({});
  const [saving, setSaving] = useState(false);

  const zebra = idx % 2 === 0 ? "bg-card" : "bg-muted";
  const rowBg = editing ? "bg-primary/5 ring-1 ring-inset ring-primary/30" : zebra;

  type SK = keyof SiteEnergyRecordPatch;
  function setField<K extends SK>(k: K, v: SiteEnergyRecordPatch[K]) {
    setPatch((p) => ({ ...p, [k]: v }));
  }
  function cur<K extends keyof MonitorRow>(k: K): MonitorRow[K] {
    return (k in patch ? (patch as Record<string, unknown>)[k as string] : r[k]) as MonitorRow[K];
  }

  const dirty = Object.keys(patch).length > 0;

  const startEdit = () => { setPatch({}); setEditing(true); };
  const cancel = () => { setPatch({}); setEditing(false); };
  const save = async () => {
    if (!dirty) { setEditing(false); return; }
    setSaving(true);
    const ok = await onUpdate(r.id, patch, r.project_name);
    setSaving(false);
    if (ok) { setPatch({}); setEditing(false); }
  };

  return (
    <tr className={cn("group transition-colors", rowBg, !editing && "hover:bg-primary/5")}>
      <td className={cn("px-1.5 py-2 border-b border-border align-middle text-center sticky left-0 z-[14]", rowBg)}>
        {editing ? (
          <div className="inline-flex items-center gap-0.5">
            <button
              type="button" onClick={save} disabled={saving}
              className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              title={dirty ? "Save changes" : "No changes"} aria-label="Save"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button" onClick={cancel} disabled={saving}
              className="inline-flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Cancel" aria-label="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button" onClick={startEdit}
            className="opacity-30 group-hover:opacity-100 transition-opacity inline-flex items-center justify-center h-6 w-6 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary"
            title="Edit row" aria-label="Edit row"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </td>
      <td className={cn("px-3 py-2 border-b border-border font-semibold text-foreground min-w-[140px] max-w-[180px]", rowBg)}>
        <div className="truncate">{r.brand_name ?? "—"}</div>
      </td>
      <td className={cn("px-3 py-2 border-b border-border text-muted-foreground min-w-[120px] max-w-[160px]", rowBg)}>
        <div className="truncate">{r.city ?? "—"}</div>
      </td>
      <td className={cn("px-3 py-2 font-medium sticky left-[34px] z-[13] border-b border-border shadow-[2px_0_4px_-2px_rgba(0,0,0,0.12)] min-w-[200px] max-w-[240px]", rowBg)}>
        <div className="truncate">{r.project_name ?? "—"}</div>
        {r.country && <div className="text-[10px] text-muted-foreground font-normal truncate">{r.country}</div>}
      </td>

      <EditCell editing={editing} value={cur("status") as string | null} options={STATUS_OPTIONS as readonly string[]} onChange={(v) => setField("status", v)} minWidth={110}
        render={(v) => <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full border text-[10.5px] font-medium whitespace-nowrap", statusTone(v))}>{v ?? "—"}</span>} />
      <EditCell editing={editing} value={cur("frequency") != null ? String(cur("frequency")) : null} options={["50", "60"]}
        onChange={(v) => setField("frequency", v ? Number(v) : null)} render={(v) => <span>{v ? `${v} Hz` : "—"}</span>} />
      <EditCell editing={editing} value={cur("free_software_year") != null ? String(cur("free_software_year")) : ""} type="number"
        onChange={(v) => setField("free_software_year", v ? Number(v) : null)} />
      <EditCell editing={editing} value={cur("installation_date") as string | null} type="date"
        onChange={(v) => setField("installation_date", v || null)} render={(v) => <span>{fmtDate(v)}</span>} />
      <EditCell editing={editing} value={(cur("contracted") as string | null) ?? "Pending"} options={["yes", "no", "To Verify", "Pending"]}
        onChange={(v) => setField("contracted", v)}
        render={(v) => {
          const val = (v ?? "").toLowerCase();
          const isYes = val === "yes" || val === "true";
          const isVerify = val === "to verify";
          const isPending = val === "pending" || val === "no";
          
          let colorClass = "border-rose-500/40 text-rose-700 dark:text-rose-300";
          if (isYes) colorClass = "border-emerald-500/40 text-emerald-700 dark:text-emerald-300";
          if (isVerify) colorClass = "border-amber-500/40 text-amber-700 dark:text-amber-300";

          return (
            <Badge variant="outline" className={cn("font-normal whitespace-nowrap", colorClass)}>
              {isYes ? "yes" : v ?? "—"}
            </Badge>
          );
        }} />
      <td className="px-3 py-2 whitespace-nowrap border-b border-border">{r.pm_name ?? "—"}</td>
      <EditCell editing={editing} value={cur("handover_date") as string | null} type="date"
        onChange={(v) => setField("handover_date", v || null)} render={(v) => <span>{fmtDate(v)}</span>} />
      <EditCell editing={editing} value={cur("category") as string | null} options={CATEGORY_OPTIONS as readonly string[]}
        onChange={(v) => setField("category", v)} render={(v) => <Badge variant="secondary" className="font-normal">{v ?? "—"}</Badge>} />
      <td className="px-3 py-2 whitespace-nowrap border-b border-border">
        {r.po_numbers.length === 0 ? "—" : r.po_numbers.map((po) => <Badge key={po} variant="outline" className="mr-1 font-mono text-[10px]">{po}</Badge>)}
      </td>
      <EditCell editing={editing} value={cur("installer") as string | null} onChange={(v) => setField("installer", v)} />
      <td className="px-3 py-2 whitespace-nowrap border-b border-border">
        {isFendi24 ? (
          editing ? (
            <Select value={(cur("package_type") as string | null) ?? ""} onValueChange={(v) => setField("package_type", v as "A" | "B")}>
              <SelectTrigger className="h-7 w-20 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="A">A</SelectItem>
                <SelectItem value="B">B</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <Badge variant="outline">{r.package_type ?? "—"}</Badge>
          )
        ) : (
          <Badge variant="outline" className="border-primary/30 text-primary">Customized</Badge>
        )}
      </td>

      <EditCell editing={editing} right type="number" value={cur("additional_sensors") != null ? String(cur("additional_sensors")) : ""} onChange={(v) => setField("additional_sensors", v ? Number(v) : 0)} render={() => <span>{fmtNum(cur("additional_sensors") as number | null)}</span>} />
      <EditCell editing={editing} right type="number" value={cur("additional_bridge") != null ? String(cur("additional_bridge")) : ""} onChange={(v) => setField("additional_bridge", v ? Number(v) : 0)} render={() => <span>{fmtNum(cur("additional_bridge") as number | null)}</span>} />
      <NumCell n={r.no_pan10} />
      <NumCell n={r.no_pan12} />
      <NumCell n={r.no_pan14} />
      <NumCell n={r.no_ct} />
      <NumCell n={r.no_mango} />
      <NumCell n={r.total_sensors} bold />
      <NumCell n={(r.total_bridges ?? 1) + (r.additional_bridge ?? 0)} bold />

      {isAdmin && <>
        <NumCell n={r.live_bridge_cost_usd} fmt={fmtUSD} />
        <NumCell n={r.live_sensor_cost_usd} fmt={fmtUSD} />
        <NumCell n={r.live_total_pkg_usd} fmt={fmtUSD} />
        <NumCell n={r.live_total_pkg_eur} fmt={fmtEUR} />
        <NumCell n={r.inbound.customs_cost} fmt={fmtEUR} />
        <NumCell n={r.inbound.vat} fmt={fmtEUR} />
        <NumCell n={r.inbound.shipping_cost} fmt={fmtEUR} />
        <NumCell n={r.outbound.shipping_cost} fmt={fmtEUR} />
        <NumCell n={r.outbound.customs_cost} fmt={fmtEUR} />

        <EditCell editing={editing} right type="number" value={cur("installation_cost") != null ? String(cur("installation_cost")) : ""} onChange={(v) => setField("installation_cost", v ? Number(v) : null)} render={() => <span>{fmtEUR(cur("installation_cost") as number | null)}</span>} />
        <EditCell editing={editing} right type="number" value={cur("quotation_value") != null ? String(cur("quotation_value")) : ""} onChange={(v) => setField("quotation_value", v ? Number(v) : null)} render={() => <span>{fmtEUR(cur("quotation_value") as number | null)}</span>} />
        <NumCell n={r.live_company_cost} fmt={fmtEUR} />
        <NumCell n={r.live_fgb_resource} fmt={fmtEUR} />
        <NumCell n={r.live_total_cost} fmt={fmtEUR} bold />
        <NumCell n={r.live_planned_remaining} fmt={fmtEUR} />
        <NumCell n={r.live_taxes} fmt={fmtEUR} />
        <NumCell n={r.live_profit} fmt={fmtEUR} bold tone={r.live_profit != null && r.live_profit < 0 ? "text-rose-600" : "text-emerald-600 dark:text-emerald-400"} />
        <NumCell n={r.live_roi} fmt={fmtPct} bold tone={r.live_roi != null && r.live_roi < 0 ? "text-rose-600" : "text-emerald-600 dark:text-emerald-400"} />
      </>}

      {showNetwork && <>
        <td className="px-3 py-2 whitespace-nowrap border-b border-border font-mono text-[10px]">{r.outbound.tracking.join(", ") || "—"}</td>
        <EditCell editing={editing} value={cur("ip_configuration") as string | null} onChange={(v) => setField("ip_configuration", v)} />
        <EditCell editing={editing} value={cur("assigned_port") as string | null} onChange={(v) => setField("assigned_port", v)} />
        <EditCell editing={editing} value={cur("ip_address") as string | null} onChange={(v) => setField("ip_address", v)} mono />
        <EditCell editing={editing} value={cur("subnet_mask") as string | null} onChange={(v) => setField("subnet_mask", v)} mono />
        <EditCell editing={editing} value={cur("gateway") as string | null} onChange={(v) => setField("gateway", v)} mono />
        <EditCell editing={editing} value={cur("dns1") as string | null} onChange={(v) => setField("dns1", v)} mono />
        <EditCell editing={editing} value={cur("dns2") as string | null} onChange={(v) => setField("dns2", v)} mono />
      </>}
      <EditCell editing={editing} value={cur("online_status") as string | null} options={["Online", "Offline", "Pending"]} onChange={(v) => setField("online_status", v)}
        render={(v) => <span className={cn("inline-flex items-center gap-1.5 text-[11px]", (v ?? "").toLowerCase() === "online" ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
          <span className={cn("h-1.5 w-1.5 rounded-full", (v ?? "").toLowerCase() === "online" ? "bg-emerald-500" : "bg-muted-foreground/40")} />{v ?? "—"}
        </span>} />
    </tr>
  );
}

function NumCell({ n, fmt = fmtNum, bold, tone }: { n: number | null | undefined; fmt?: (n: number | null | undefined) => string; bold?: boolean; tone?: string }) {
  return (
    <td className={cn("px-3 py-2 text-right tabular-nums whitespace-nowrap border-b border-border", bold && "font-semibold", tone)}>
      {fmt(n)}
    </td>
  );
}

interface EditCellProps {
  editing: boolean;
  value: string | null | undefined;
  onChange: (v: string) => void;
  type?: "text" | "number" | "date";
  options?: readonly string[];
  right?: boolean;
  mono?: boolean;
  render?: (v: string | null | undefined) => React.ReactNode;
  minWidth?: number;
}

function EditCell({ editing, value, onChange, type = "text", options, right, mono, render, minWidth }: EditCellProps) {
  const style = minWidth ? { minWidth } : undefined;

  if (editing && options) {
    return (
      <td className="px-2 py-1 border-b border-border" style={style}>
        <Select value={value ?? ""} onValueChange={onChange}>
          <SelectTrigger className="h-7 text-xs w-full ring-1 ring-primary/30"><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
      </td>
    );
  }
  if (editing) {
    return (
      <td className={cn("px-2 py-1 border-b border-border", right && "text-right")} style={style}>
        <Input
          type={type} value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className={cn("h-7 text-xs ring-1 ring-primary/30", mono && "font-mono")}
        />
      </td>
    );
  }
  return (
    <td
      style={style}
      className={cn(
        "px-3 py-2 whitespace-nowrap border-b border-border",
        right && "text-right tabular-nums",
        mono && "font-mono text-[10.5px]",
      )}
    >
      {render ? render(value) : (value ?? <span className="text-muted-foreground/60">—</span>)}
    </td>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: readonly string[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-36 h-9 text-xs"><SelectValue placeholder={label} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All {label.toLowerCase()}</SelectItem>
        {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

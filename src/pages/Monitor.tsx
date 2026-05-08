import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Download, Eye, EyeOff, Loader2, Pencil, Search } from "lucide-react";
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
    case "active": case "online": return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
    case "to install": case "pending": return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
    case "offline": case "issue": return "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30";
    default: return "bg-muted text-foreground/70 border-border";
  }
};

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
          <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">Air monitoring — coming next.</CardContent></Card>
        </TabsContent>
      </Tabs>
    </MainLayout>
  );
}

// Section colour palette — subtle pastel banding similar to spreadsheet groups.
const SEC = {
  site:    { head: "bg-slate-100/80 dark:bg-slate-800/40 text-slate-700 dark:text-slate-200",     cell: "bg-slate-50/40 dark:bg-slate-900/20" },
  hw:      { head: "bg-sky-100/80 dark:bg-sky-900/30 text-sky-800 dark:text-sky-200",             cell: "bg-sky-50/40 dark:bg-sky-950/20" },
  cost:    { head: "bg-amber-100/80 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200",     cell: "bg-amber-50/40 dark:bg-amber-950/20" },
  finance: { head: "bg-emerald-100/80 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200", cell: "bg-emerald-50/40 dark:bg-emerald-950/20" },
  net:     { head: "bg-violet-100/80 dark:bg-violet-900/30 text-violet-800 dark:text-violet-200", cell: "bg-violet-50/40 dark:bg-violet-950/20" },
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

  const update = async (id: string, patch: SiteEnergyRecordPatch): Promise<boolean> => {
    const { error } = await supabase.from("site_energy_records" as never).update(patch as never).eq("id", id);
    if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return false; }
    toast({ title: "Saved", description: "Row updated." });
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

  // counts for grouped header colspans
  const COL_SITE = 12; // Project + 11
  const COL_HW = 9;
  const COL_COST = 9;
  const COL_FIN = 9;
  const COL_NET = 8;

  return (
    <div className="space-y-4">
      {/* Filters card */}
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
            <Pencil className="h-3 w-3" /> Click any cell to edit — changes save automatically.
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
                {/* Group row */}
                <tr>
                  <th colSpan={COL_SITE} className={cn("px-3 py-1.5 text-left text-[10px] uppercase tracking-wider font-semibold border-b border-border", SEC.site.head)}>Site Info</th>
                  <th colSpan={COL_HW} className={cn("px-3 py-1.5 text-left text-[10px] uppercase tracking-wider font-semibold border-b border-l border-border", SEC.hw.head)}>Hardware</th>
                  {isAdmin && <th colSpan={COL_COST} className={cn("px-3 py-1.5 text-left text-[10px] uppercase tracking-wider font-semibold border-b border-l border-border", SEC.cost.head)}>Costs</th>}
                  {isAdmin && <th colSpan={COL_FIN} className={cn("px-3 py-1.5 text-left text-[10px] uppercase tracking-wider font-semibold border-b border-l border-border", SEC.finance.head)}>Finance</th>}
                  {showNetwork && <th colSpan={COL_NET} className={cn("px-3 py-1.5 text-left text-[10px] uppercase tracking-wider font-semibold border-b border-l border-border", SEC.net.head)}>Network</th>}
                  <th className="px-3 py-1.5 border-b border-l border-border bg-muted/40" />
                </tr>
                {/* Column row */}
                <tr className="bg-background">
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
      // Sticky cells MUST have an opaque background so non-sticky columns don't show through during horizontal scroll.
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
  onUpdate: (id: string, patch: SiteEnergyRecordPatch) => Promise<boolean>;
}

function Row({ r, idx, isAdmin, showNetwork, onUpdate }: RowProps) {
  const isFendi24 = r.category === "Fendi Energy Project 2024";
  // Use solid backgrounds (no alpha) so the sticky first column doesn't bleed through.
  const zebra = idx % 2 === 0 ? "bg-card" : "bg-muted";

  return (
    <tr className={cn("group transition-colors", zebra, "hover:bg-primary/5")}>
      <td className={cn("px-3 py-2 font-medium sticky left-0 z-[15] whitespace-nowrap border-b border-border shadow-[2px_0_4px_-2px_rgba(0,0,0,0.12)]", zebra, "group-hover:bg-primary/5")}>
        {r.project_name ?? "—"}
        {r.city && <div className="text-[10px] text-muted-foreground font-normal">{r.city}{r.country ? `, ${r.country}` : ""}</div>}
      </td>
      <EditCell value={r.status} options={STATUS_OPTIONS as readonly string[]} onSave={(v) => onUpdate(r.id, { status: v })}
        render={(v) => <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full border text-[10.5px] font-medium", statusTone(v))}>{v ?? "—"}</span>} />
      <EditCell value={r.frequency != null ? String(r.frequency) : null} options={["50", "60"]} onSave={(v) => onUpdate(r.id, { frequency: v ? Number(v) : null })} render={(v) => <span>{v ? `${v} Hz` : "—"}</span>} />
      <EditCell value={r.free_software_year != null ? String(r.free_software_year) : "3"} type="number" onSave={(v) => onUpdate(r.id, { free_software_year: v ? Number(v) : null })} />
      <EditCell value={r.installation_date} type="date" onSave={(v) => onUpdate(r.id, { installation_date: v || null })} render={(v) => <span>{fmtDate(v)}</span>} />
      <EditCell value={r.contracted ?? "yes"} options={["yes", "no"]} onSave={(v) => onUpdate(r.id, { contracted: v })}
        render={(v) => <Badge variant="outline" className={cn("font-normal", v === "yes" ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300" : "border-rose-500/40 text-rose-700 dark:text-rose-300")}>{v ?? "—"}</Badge>} />
      <td className="px-3 py-2 whitespace-nowrap border-b border-border">{r.pm_name ?? "—"}</td>
      <EditCell value={r.handover_date} type="date" onSave={(v) => onUpdate(r.id, { handover_date: v || null })} render={(v) => <span>{fmtDate(v)}</span>} />
      <EditCell value={r.category} options={CATEGORY_OPTIONS as readonly string[]} onSave={(v) => onUpdate(r.id, { category: v })} render={(v) => <Badge variant="secondary" className="font-normal">{v ?? "—"}</Badge>} />
      <td className="px-3 py-2 whitespace-nowrap border-b border-border">
        {r.po_numbers.length === 0 ? "—" : r.po_numbers.map((po) => <Badge key={po} variant="outline" className="mr-1 font-mono text-[10px]">{po}</Badge>)}
      </td>
      <EditCell value={r.installer} onSave={(v) => onUpdate(r.id, { installer: v })} />
      <td className="px-3 py-2 whitespace-nowrap border-b border-border">
        {isFendi24 ? (
          <Select value={r.package_type ?? ""} onValueChange={(v) => onUpdate(r.id, { package_type: v as "A" | "B" })}>
            <SelectTrigger className="h-7 w-20 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="A">A</SelectItem>
              <SelectItem value="B">B</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <Badge variant="outline" className="border-primary/30 text-primary">Customized</Badge>
        )}
      </td>

      {/* Hardware — editable counters */}
      <EditCell right type="number" value={r.additional_sensors != null ? String(r.additional_sensors) : ""} onSave={(v) => onUpdate(r.id, { additional_sensors: v ? Number(v) : 0 })} render={() => <span>{fmtNum(r.additional_sensors)}</span>} />
      <EditCell right type="number" value={r.additional_bridge != null ? String(r.additional_bridge) : ""} onSave={(v) => onUpdate(r.id, { additional_bridge: v ? Number(v) : 0 })} render={() => <span>{fmtNum(r.additional_bridge)}</span>} />
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

        <EditCell right type="number" value={r.installation_cost != null ? String(r.installation_cost) : ""} onSave={(v) => onUpdate(r.id, { installation_cost: v ? Number(v) : null })} render={() => <span>{fmtEUR(r.installation_cost)}</span>} />
        <EditCell right type="number" value={r.quotation_value != null ? String(r.quotation_value) : ""} onSave={(v) => onUpdate(r.id, { quotation_value: v ? Number(v) : null })} render={() => <span>{fmtEUR(r.quotation_value)}</span>} />
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
        <EditCell value={r.ip_configuration} onSave={(v) => onUpdate(r.id, { ip_configuration: v })} />
        <EditCell value={r.assigned_port} onSave={(v) => onUpdate(r.id, { assigned_port: v })} />
        <EditCell value={r.ip_address} onSave={(v) => onUpdate(r.id, { ip_address: v })} mono />
        <EditCell value={r.subnet_mask} onSave={(v) => onUpdate(r.id, { subnet_mask: v })} mono />
        <EditCell value={r.gateway} onSave={(v) => onUpdate(r.id, { gateway: v })} mono />
        <EditCell value={r.dns1} onSave={(v) => onUpdate(r.id, { dns1: v })} mono />
        <EditCell value={r.dns2} onSave={(v) => onUpdate(r.id, { dns2: v })} mono />
      </>}
      <EditCell value={r.online_status} options={["Online", "Offline", "Pending"]} onSave={(v) => onUpdate(r.id, { online_status: v })}
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
  value: string | null | undefined;
  onSave: (v: string) => Promise<boolean> | boolean | void;
  type?: "text" | "number" | "date";
  options?: readonly string[];
  right?: boolean;
  mono?: boolean;
  render?: (v: string | null | undefined) => React.ReactNode;
}

function EditCell({ value, onSave, type = "text", options, right, mono, render }: EditCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(value ?? "");
  }, [editing, value]);

  const commit = async (next: string) => {
    if (next === (value ?? "")) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const ok = await onSave(next);
      if (ok === false) return;
      setSaved(true);
      window.setTimeout(() => setSaved(false), 900);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (editing && options) {
    return (
      <td className="px-2 py-1 border-b border-border">
        <Select value={draft} disabled={saving} onValueChange={(v) => { setDraft(v); void commit(v); }}>
          <SelectTrigger className="h-7 text-xs w-full ring-1 ring-primary/40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
      </td>
    );
  }
  if (editing) {
    return (
      <td className={cn("px-2 py-1 border-b border-border", right && "text-right")}>
        <Input
          type={type} value={draft} autoFocus disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { void commit(draft); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); }
            if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); }
          }}
          className="h-7 text-xs ring-1 ring-primary/40"
        />
      </td>
    );
  }
  return (
    <td
      className={cn(
        "relative px-3 py-2 cursor-text whitespace-nowrap border-b border-border hover:bg-primary/10 hover:ring-1 hover:ring-inset hover:ring-primary/30 transition-colors",
        saved && "bg-primary/10 ring-1 ring-inset ring-primary/30",
        right && "text-right tabular-nums",
        mono && "font-mono text-[10.5px]",
      )}
      onClick={() => { setDraft(value ?? ""); setEditing(true); }}
      title="Click to edit"
    >
      {saving && <Loader2 className="absolute right-1 top-1 h-3 w-3 animate-spin text-primary" />}
      {saved && <Check className="absolute right-1 top-1 h-3 w-3 text-primary" />}
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

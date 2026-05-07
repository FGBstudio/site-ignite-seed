import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Search, Download, Eye, EyeOff } from "lucide-react";
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

  const update = async (id: string, patch: SiteEnergyRecordPatch) => {
    const { error } = await supabase.from("site_energy_records" as never).update(patch as never).eq("id", id);
    if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
    qc.invalidateQueries({ queryKey: ["monitor-energy-rows"] });
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

  return (
    <div className="space-y-4">
      {/* Filters */}
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
        <Button variant="outline" size="sm" onClick={() => setShowNetwork((s) => !s)} className="gap-2">
          {showNetwork ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />} Configuration Specifications
        </Button>
        <Button variant="outline" size="sm" onClick={exportCSV} className="gap-2">
          <Download className="h-4 w-4" /> Export
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4">
          {isLoading ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No energy records yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="text-xs">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    {/* Site */}
                    <Th sticky>Project</Th>
                    <Th>Status</Th>
                    <Th>Frequency</Th>
                    <Th>Free SW yr</Th>
                    <Th>Installation</Th>
                    <Th>Contracted</Th>
                    <Th>PM</Th>
                    <Th>Handover</Th>
                    <Th>Category</Th>
                    <Th>PO</Th>
                    <Th>Installer</Th>
                    <Th>Package</Th>
                    {/* Hardware */}
                    <Th right>Add. Sensors</Th>
                    <Th right>Add. Bridge</Th>
                    <Th right>PAN-10</Th>
                    <Th right>PAN-12</Th>
                    <Th right>PAN-14</Th>
                    <Th right>CT</Th>
                    <Th right>Mango</Th>
                    <Th right>Total Sens</Th>
                    <Th right>Total Br</Th>
                    {/* Costs (admin) */}
                    {isAdmin && <>
                      <Th right>Bridge $</Th>
                      <Th right>Sensor $</Th>
                      <Th right>Pkg $</Th>
                      <Th right>Pkg €</Th>
                      <Th right>Duty (in)</Th>
                      <Th right>VAT</Th>
                      <Th right>Pickup</Th>
                      <Th right>Shipment</Th>
                      <Th right>Out. Custom</Th>
                      <Th right>Installation</Th>
                      <Th right>Quotation</Th>
                      <Th right>Co. cost 20%</Th>
                      <Th right>FGB res.</Th>
                      <Th right>Total Cost</Th>
                      <Th right>Planned Rem.</Th>
                      <Th right>Taxes</Th>
                      <Th right>Profit</Th>
                      <Th right>ROI</Th>
                    </>}
                    {/* Network */}
                    {showNetwork && <>
                      <Th>Tracking #</Th>
                      <Th>IP cfg</Th>
                      <Th>Port</Th>
                      <Th>IP addr</Th>
                      <Th>Subnet</Th>
                      <Th>Gateway</Th>
                      <Th>DNS1</Th>
                      <Th>DNS2</Th>
                    </>}
                    <Th>Online</Th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <Row key={r.id} r={r} isAdmin={isAdmin} showNetwork={showNetwork} onUpdate={update} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Th({ children, right, sticky }: { children: React.ReactNode; right?: boolean; sticky?: boolean }) {
  return (
    <th className={`p-2 font-medium text-muted-foreground whitespace-nowrap ${right ? "text-right" : ""} ${sticky ? "sticky left-0 bg-muted/60 z-10" : ""}`}>
      {children}
    </th>
  );
}

interface RowProps {
  r: MonitorRow;
  isAdmin: boolean;
  showNetwork: boolean;
  onUpdate: (id: string, patch: SiteEnergyRecordPatch) => void;
}

function Row({ r, isAdmin, showNetwork, onUpdate }: RowProps) {
  const isFendi24 = r.category === "Fendi Energy Project 2024";
  return (
    <tr className="border-t border-border hover:bg-muted/30">
      <td className="p-2 font-medium sticky left-0 bg-background z-10 whitespace-nowrap">{r.project_name ?? "—"}</td>
      <EditCell value={r.status} options={STATUS_OPTIONS as readonly string[]} onSave={(v) => onUpdate(r.id, { status: v })} render={(v) => <Badge variant="outline">{v ?? "—"}</Badge>} />
      <EditCell value={r.frequency != null ? String(r.frequency) : null} options={["50", "60"]} onSave={(v) => onUpdate(r.id, { frequency: v ? Number(v) : null })} />
      <EditCell value={r.free_software_year != null ? String(r.free_software_year) : "3"} type="number" onSave={(v) => onUpdate(r.id, { free_software_year: v ? Number(v) : null })} />
      <EditCell value={r.installation_date} type="date" onSave={(v) => onUpdate(r.id, { installation_date: v || null })} render={(v) => <span>{fmtDate(v)}</span>} />
      <EditCell value={r.contracted ?? "yes"} onSave={(v) => onUpdate(r.id, { contracted: v })} />
      <td className="p-2 whitespace-nowrap">{r.pm_name ?? "—"}</td>
      <EditCell value={r.handover_date} type="date" onSave={(v) => onUpdate(r.id, { handover_date: v || null })} render={(v) => <span>{fmtDate(v)}</span>} />
      <EditCell value={r.category} options={CATEGORY_OPTIONS as readonly string[]} onSave={(v) => onUpdate(r.id, { category: v })} render={(v) => <Badge variant="secondary" className="font-normal">{v ?? "—"}</Badge>} />
      <td className="p-2 whitespace-nowrap">
        {r.po_numbers.length === 0 ? "—" : r.po_numbers.map((po) => <Badge key={po} variant="outline" className="mr-1">{po}</Badge>)}
      </td>
      <EditCell value={r.installer} onSave={(v) => onUpdate(r.id, { installer: v })} />
      {/* Package — A/B for Fendi24, fixed Customized otherwise */}
      <td className="p-2 whitespace-nowrap">
        {isFendi24 ? (
          <Select value={r.package_type ?? ""} onValueChange={(v) => onUpdate(r.id, { package_type: v as "A" | "B" })}>
            <SelectTrigger className="h-7 w-20 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="A">A</SelectItem>
              <SelectItem value="B">B</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <Badge variant="outline">Customized</Badge>
        )}
      </td>
      <td className="p-2 text-right tabular-nums">{fmtNum(r.additional_sensors)}</td>
      <td className="p-2 text-right tabular-nums">{fmtNum(r.additional_bridge)}</td>
      <td className="p-2 text-right tabular-nums">{fmtNum(r.no_pan10)}</td>
      <td className="p-2 text-right tabular-nums">{fmtNum(r.no_pan12)}</td>
      <td className="p-2 text-right tabular-nums">{fmtNum(r.no_pan14)}</td>
      <td className="p-2 text-right tabular-nums">{fmtNum(r.no_ct)}</td>
      <td className="p-2 text-right tabular-nums">{fmtNum(r.no_mango)}</td>
      <td className="p-2 text-right tabular-nums">{fmtNum(r.total_sensors)}</td>
      <td className="p-2 text-right tabular-nums">{fmtNum(r.total_bridges ?? 1 + (r.additional_bridge ?? 0))}</td>
      {isAdmin && <>
        <td className="p-2 text-right tabular-nums">{fmtUSD(r.live_bridge_cost_usd)}</td>
        <td className="p-2 text-right tabular-nums">{fmtUSD(r.live_sensor_cost_usd)}</td>
        <td className="p-2 text-right tabular-nums">{fmtUSD(r.live_total_pkg_usd)}</td>
        <td className="p-2 text-right tabular-nums">{fmtEUR(r.live_total_pkg_eur)}</td>
        <td className="p-2 text-right tabular-nums">{fmtEUR(r.inbound.customs_cost)}</td>
        <td className="p-2 text-right tabular-nums">{fmtEUR(r.inbound.vat)}</td>
        <td className="p-2 text-right tabular-nums">{fmtEUR(r.inbound.shipping_cost)}</td>
        <td className="p-2 text-right tabular-nums">{fmtEUR(r.outbound.shipping_cost)}</td>
        <td className="p-2 text-right tabular-nums">{fmtEUR(r.outbound.customs_cost)}</td>
        <EditCell value={r.installation_cost != null ? String(r.installation_cost) : ""} type="number" right
          onSave={(v) => onUpdate(r.id, { installation_cost: v ? Number(v) : null })}
          render={() => <span>{fmtEUR(r.installation_cost)}</span>} />
        <EditCell value={r.quotation_value != null ? String(r.quotation_value) : ""} type="number" right
          onSave={(v) => onUpdate(r.id, { quotation_value: v ? Number(v) : null })}
          render={() => <span>{fmtEUR(r.quotation_value)}</span>} />
        <td className="p-2 text-right tabular-nums">{fmtEUR(r.live_company_cost)}</td>
        <td className="p-2 text-right tabular-nums">{fmtEUR(r.live_fgb_resource)}</td>
        <td className="p-2 text-right tabular-nums font-medium">{fmtEUR(r.live_total_cost)}</td>
        <td className="p-2 text-right tabular-nums">{fmtEUR(r.live_planned_remaining)}</td>
        <td className="p-2 text-right tabular-nums">{fmtEUR(r.live_taxes)}</td>
        <td className="p-2 text-right tabular-nums">{fmtEUR(r.live_profit)}</td>
        <td className="p-2 text-right tabular-nums">{fmtPct(r.live_roi)}</td>
      </>}
      {showNetwork && <>
        <td className="p-2 whitespace-nowrap">{r.outbound.tracking.join(", ") || "—"}</td>
        <EditCell value={r.ip_configuration} onSave={(v) => onUpdate(r.id, { ip_configuration: v })} />
        <EditCell value={r.assigned_port} onSave={(v) => onUpdate(r.id, { assigned_port: v })} />
        <EditCell value={r.ip_address} onSave={(v) => onUpdate(r.id, { ip_address: v })} />
        <EditCell value={r.subnet_mask} onSave={(v) => onUpdate(r.id, { subnet_mask: v })} />
        <EditCell value={r.gateway} onSave={(v) => onUpdate(r.id, { gateway: v })} />
        <EditCell value={r.dns1} onSave={(v) => onUpdate(r.id, { dns1: v })} />
        <EditCell value={r.dns2} onSave={(v) => onUpdate(r.id, { dns2: v })} />
      </>}
      <EditCell value={r.online_status} onSave={(v) => onUpdate(r.id, { online_status: v })} />
    </tr>
  );
}

interface EditCellProps {
  value: string | null | undefined;
  onSave: (v: string) => void;
  type?: "text" | "number" | "date";
  options?: readonly string[];
  right?: boolean;
  render?: (v: string | null | undefined) => React.ReactNode;
}

function EditCell({ value, onSave, type = "text", options, right, render }: EditCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  if (editing && options) {
    return (
      <td className="p-1">
        <Select value={draft} onValueChange={(v) => { setDraft(v); onSave(v); setEditing(false); }}>
          <SelectTrigger className="h-7 text-xs w-32" autoFocus><SelectValue /></SelectTrigger>
          <SelectContent>
            {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
      </td>
    );
  }
  if (editing) {
    return (
      <td className={`p-1 ${right ? "text-right" : ""}`}>
        <Input
          type={type} value={draft} autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { if (draft !== (value ?? "")) onSave(draft); setEditing(false); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); }
            if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); }
          }}
          className="h-7 text-xs"
        />
      </td>
    );
  }
  return (
    <td className={`p-2 cursor-text whitespace-nowrap ${right ? "text-right tabular-nums" : ""}`} onClick={() => { setDraft(value ?? ""); setEditing(true); }}>
      {render ? render(value) : (value ?? "—")}
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

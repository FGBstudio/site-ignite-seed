import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Pencil, Save, X, Search, Download } from "lucide-react";
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
const fmtEUR = (n: number | null | undefined) =>
  typeof n === "number" ? n.toLocaleString("en-US", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }) : "—";
const fmtNum = (n: number | null | undefined) =>
  typeof n === "number" ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "—";
const fmtPct = (n: number | null | undefined) =>
  typeof n === "number" ? `${n.toFixed(1)}%` : "—";
const fmtDate = (s: string | null | undefined) => (s ? s : "—");

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
  const [regionFilter, setRegionFilter] = useState<string>("all");
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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
      const matchesRegion = regionFilter === "all" || r.region === regionFilter;
      const matchesCountry = countryFilter === "all" || r.country === countryFilter;
      return matchesSearch && matchesStatus && matchesRegion && matchesCountry;
    });
  }, [rows, search, statusFilter, regionFilter, countryFilter]);

  const kpis = useMemo(() => {
    const sites = filtered.length;
    const sensors = filtered.reduce((s, r) => s + (r.total_sensors ?? 0), 0);
    const bridges = filtered.reduce((s, r) => s + (r.total_bridges ?? 0), 0);
    const mango = filtered.reduce((s, r) => s + (r.no_mango ?? 0), 0);
    const totalCostEur = filtered.reduce((s, r) => s + (r.total_cost ?? 0), 0);
    const rois = filtered.map((r) => r.roi_pct).filter((v): v is number => typeof v === "number");
    const avgRoi = rois.length ? rois.reduce((a, b) => a + b, 0) / rois.length : 0;
    return { sites, sensors, bridges, mango, totalCostEur, avgRoi };
  }, [filtered]);

  const uniques = useMemo(() => ({
    statuses: Array.from(new Set(rows.map((r) => r.status).filter(Boolean) as string[])),
    regions: Array.from(new Set(rows.map((r) => r.region).filter(Boolean) as string[])),
    countries: Array.from(new Set(rows.map((r) => r.country).filter(Boolean) as string[])),
  }), [rows]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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

  const colSpan = isAdmin ? 11 : 9;

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Sites" value={fmtNum(kpis.sites)} />
        <Kpi label="Total Sensors" value={fmtNum(kpis.sensors)} />
        <Kpi label="Total Bridges" value={fmtNum(kpis.bridges)} />
        <Kpi label="Mango" value={fmtNum(kpis.mango)} />
        {isAdmin && <Kpi label="Total Cost (€)" value={fmtEUR(kpis.totalCostEur)} />}
        <Kpi label="Avg ROI" value={`${kpis.avgRoi.toFixed(1)}%`} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search project, brand, country, PO, installer…"
            className="pl-9 w-80"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {uniques.statuses.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={regionFilter} onValueChange={setRegionFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Region" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All regions</SelectItem>
            {uniques.regions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={countryFilter} onValueChange={setCountryFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Country" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All countries</SelectItem>
            {uniques.countries.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
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
                    <th className="p-2 w-8"></th>
                    <th className="p-2">Project</th>
                    <th className="p-2">Brand</th>
                    <th className="p-2">Country</th>
                    <th className="p-2">City</th>
                    <th className="p-2">Status</th>
                    <th className="p-2 text-right">Sensors</th>
                    <th className="p-2 text-right">Bridges</th>
                    <th className="p-2 text-right">Mango</th>
                    {isAdmin && <th className="p-2 text-right">Total Cost (€)</th>}
                    {isAdmin && <th className="p-2 text-right">ROI</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const isOpen = expanded.has(r.id);
                    return (
                      <>
                        <tr
                          key={r.id}
                          className={cn("border-t border-border cursor-pointer hover:bg-muted/30", isOpen && "bg-primary/5")}
                          onClick={() => toggleExpand(r.id)}
                        >
                          <td className="p-2">
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </td>
                          <td className="p-2 font-medium">{r.project_name ?? "—"}</td>
                          <td className="p-2 text-muted-foreground">{r.brand_name ?? "—"}</td>
                          <td className="p-2">{r.country ?? "—"}</td>
                          <td className="p-2">{r.city ?? "—"}</td>
                          <td className="p-2"><Badge variant="outline">{r.status ?? "—"}</Badge></td>
                          <td className="p-2 text-right tabular-nums">{fmtNum(r.total_sensors)}</td>
                          <td className="p-2 text-right tabular-nums">{fmtNum(r.total_bridges)}</td>
                          <td className="p-2 text-right tabular-nums">{fmtNum(r.no_mango)}</td>
                          {isAdmin && <td className="p-2 text-right tabular-nums">{fmtEUR(r.total_cost)}</td>}
                          {isAdmin && <td className="p-2 text-right tabular-nums">{fmtPct(r.roi_pct)}</td>}
                        </tr>
                        {isOpen && (
                          <tr className="border-t border-border bg-muted/20">
                            <td colSpan={colSpan} className="p-4">
                              <RecordDetails
                                record={r}
                                isAdmin={isAdmin}
                                onSaved={() => {
                                  qc.invalidateQueries({ queryKey: ["site-energy-records"] });
                                  toast({ title: "Updated" });
                                }}
                                onError={(msg) => toast({ title: "Save failed", description: msg, variant: "destructive" })}
                              />
                            </td>
                          </tr>
                        )}
                      </>
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

interface DetailsProps {
  record: SiteEnergyRecord;
  isAdmin: boolean;
  onSaved: () => void;
  onError: (msg: string) => void;
}

function RecordDetails({ record, isAdmin, onSaved, onError }: DetailsProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<SiteEnergyRecordPatch>({});

  const v = <K extends keyof SiteEnergyRecord>(k: K): SiteEnergyRecord[K] =>
    (editing && k in draft ? (draft as Record<string, unknown>)[k as string] : record[k]) as SiteEnergyRecord[K];
  const setF = <K extends keyof SiteEnergyRecordPatch>(k: K, val: SiteEnergyRecordPatch[K]) =>
    setDraft((d) => ({ ...d, [k]: val }));

  const save = async () => {
    if (Object.keys(draft).length === 0) { setEditing(false); return; }
    const { error } = await supabase
      .from("site_energy_records" as never)
      .update(draft as never)
      .eq("id", record.id);
    if (error) { onError(error.message); return; }
    setEditing(false);
    setDraft({});
    onSaved();
  };

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <Tabs defaultValue="site">
        <div className="flex items-center justify-between mb-3">
          <TabsList>
            <TabsTrigger value="site">Site info</TabsTrigger>
            <TabsTrigger value="hardware">Hardware</TabsTrigger>
            {isAdmin && <TabsTrigger value="costs">Costs</TabsTrigger>}
            <TabsTrigger value="network">Network</TabsTrigger>
          </TabsList>
          {isAdmin && (
            editing ? (
              <div className="flex gap-2">
                <Button size="sm" onClick={save} className="gap-1"><Save className="h-3.5 w-3.5" /> Save</Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setDraft({}); }} className="gap-1">
                  <X className="h-3.5 w-3.5" /> Cancel
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)} className="gap-1">
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
            )
          )}
        </div>

        <TabsContent value="site">
          <FieldGrid>
            <Field label="Project Name" value={record.project_name} editing={editing} onChange={(x) => setF("project_name", x)} valueOverride={v("project_name") as string} />
            <Field label="Brand" value={record.brand_name} />
            <Field label="Region" value={record.region} editing={editing} onChange={(x) => setF("region", x)} valueOverride={v("region") as string} />
            <Field label="Country" value={record.country} editing={editing} onChange={(x) => setF("country", x)} valueOverride={v("country") as string} />
            <Field label="City" value={record.city} editing={editing} onChange={(x) => setF("city", x)} valueOverride={v("city") as string} />
            <Field label="Status" value={record.status} editing={editing} onChange={(x) => setF("status", x)} valueOverride={v("status") as string} />
            <Field label="Frequency (Hz)" value={record.frequency} editing={editing} onChange={(x) => setF("frequency", numOrNull(x))} valueOverride={v("frequency") as number} />
            <Field label="Free Software year" value={record.free_software_year} editing={editing} onChange={(x) => setF("free_software_year", numOrNull(x))} valueOverride={v("free_software_year") as number} />
            <Field label="Installation Date" value={fmtDate(record.installation_date)} editing={editing} onChange={(x) => setF("installation_date", x || null)} valueOverride={v("installation_date") as string} type="date" />
            <Field label="Contracted" value={record.contracted} editing={editing} onChange={(x) => setF("contracted", x)} valueOverride={v("contracted") as string} />
            <Field label="PM" value={record.pm_id ?? "—"} />
            <Field label="Handover Date" value={fmtDate(record.handover_date)} editing={editing} onChange={(x) => setF("handover_date", x || null)} valueOverride={v("handover_date") as string} type="date" />
            <Field label="Category" value={record.category} editing={editing} onChange={(x) => setF("category", x)} valueOverride={v("category") as string} />
            <Field label="PO" value={record.po_number} editing={editing} onChange={(x) => setF("po_number", x)} valueOverride={v("po_number") as string} />
            <Field label="Installer" value={record.installer} editing={editing} onChange={(x) => setF("installer", x)} valueOverride={v("installer") as string} />
            <Field label="Reference Contact" value={record.reference_contact} editing={editing} onChange={(x) => setF("reference_contact", x)} valueOverride={v("reference_contact") as string} />
          </FieldGrid>
        </TabsContent>

        <TabsContent value="hardware">
          <FieldGrid>
            <Field label="Package A" value={record.package_a ? "Yes" : "No"} />
            <Field label="Package B" value={record.package_b ? "Yes" : "No"} />
            <Field label="Customized Package" value={record.customized_package ? "Yes" : "No"} />
            <Field label="Additional Sensors" value={record.additional_sensors} editing={editing} onChange={(x) => setF("additional_sensors", numOrNull(x))} valueOverride={v("additional_sensors") as number} />
            <Field label="Additional Bridge" value={record.additional_bridge} editing={editing} onChange={(x) => setF("additional_bridge", numOrNull(x))} valueOverride={v("additional_bridge") as number} />
            <Field label="Additional PAN-42" value={record.additional_pan42} editing={editing} onChange={(x) => setF("additional_pan42", numOrNull(x))} valueOverride={v("additional_pan42") as number} />
            <Field label="Total Sensors" value={record.total_sensors} />
            <Field label="Total Bridges" value={record.total_bridges} />
            <Field label="No. PAN-10" value={record.no_pan10} />
            <Field label="No. PAN-12" value={record.no_pan12} />
            <Field label="No. PAN-14" value={record.no_pan14} />
            <Field label="No. CT" value={record.no_ct} />
            <Field label="No. Mango" value={record.no_mango} />
          </FieldGrid>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="costs">
            <FieldGrid>
              <Field label="Bridge Total Cost ($)" value={fmtUSD(record.bridge_total_cost)} editing={editing} onChange={(x) => setF("bridge_total_cost", numOrNull(x))} valueOverride={v("bridge_total_cost") as number} />
              <Field label="Sensor Total Cost ($)" value={fmtUSD(record.sensor_total_cost)} editing={editing} onChange={(x) => setF("sensor_total_cost", numOrNull(x))} valueOverride={v("sensor_total_cost") as number} />
              <Field label="Total Package ($)" value={fmtUSD(record.total_package_cost_usd)} editing={editing} onChange={(x) => setF("total_package_cost_usd", numOrNull(x))} valueOverride={v("total_package_cost_usd") as number} />
              <Field label="Total Package (€)" value={fmtEUR(record.total_package_cost_eur)} editing={editing} onChange={(x) => setF("total_package_cost_eur", numOrNull(x))} valueOverride={v("total_package_cost_eur") as number} />
              <Field label="FX USD→EUR" value={record.fx_rate_usd_eur} editing={editing} onChange={(x) => setF("fx_rate_usd_eur", numOrNull(x))} valueOverride={v("fx_rate_usd_eur") as number} />
              <Field label="Duty/Customs (in)" value={fmtEUR(record.duty_customs_inbound)} editing={editing} onChange={(x) => setF("duty_customs_inbound", numOrNull(x))} valueOverride={v("duty_customs_inbound") as number} />
              <Field label="VAT" value={fmtEUR(record.vat_fee)} editing={editing} onChange={(x) => setF("vat_fee", numOrNull(x))} valueOverride={v("vat_fee") as number} />
              <Field label="Pickup" value={fmtEUR(record.pickup_cost)} editing={editing} onChange={(x) => setF("pickup_cost", numOrNull(x))} valueOverride={v("pickup_cost") as number} />
              <Field label="Shipment" value={fmtEUR(record.shipment_cost)} editing={editing} onChange={(x) => setF("shipment_cost", numOrNull(x))} valueOverride={v("shipment_cost") as number} />
              <Field label="Outbound Custom" value={fmtEUR(record.outbound_custom_cost)} editing={editing} onChange={(x) => setF("outbound_custom_cost", numOrNull(x))} valueOverride={v("outbound_custom_cost") as number} />
              <Field label="Installation" value={fmtEUR(record.installation_cost)} editing={editing} onChange={(x) => setF("installation_cost", numOrNull(x))} valueOverride={v("installation_cost") as number} />
              <Field label="Quotation Value" value={fmtEUR(record.quotation_value)} editing={editing} onChange={(x) => setF("quotation_value", numOrNull(x))} valueOverride={v("quotation_value") as number} />
              <Field label="Company cost %" value={fmtPct(record.company_cost_pct)} editing={editing} onChange={(x) => setF("company_cost_pct", numOrNull(x))} valueOverride={v("company_cost_pct") as number} />
              <Field label="FGB Resource" value={fmtEUR(record.fgb_resource)} editing={editing} onChange={(x) => setF("fgb_resource", numOrNull(x))} valueOverride={v("fgb_resource") as number} />
              <Field label="Total Cost" value={fmtEUR(record.total_cost)} editing={editing} onChange={(x) => setF("total_cost", numOrNull(x))} valueOverride={v("total_cost") as number} />
              <Field label="Planned Remaining" value={fmtEUR(record.planned_remaining_value)} editing={editing} onChange={(x) => setF("planned_remaining_value", numOrNull(x))} valueOverride={v("planned_remaining_value") as number} />
              <Field label="Taxes" value={fmtEUR(record.taxes)} editing={editing} onChange={(x) => setF("taxes", numOrNull(x))} valueOverride={v("taxes") as number} />
              <Field label="Profit" value={fmtEUR(record.profit)} editing={editing} onChange={(x) => setF("profit", numOrNull(x))} valueOverride={v("profit") as number} />
              <Field label="ROI %" value={fmtPct(record.roi_pct)} editing={editing} onChange={(x) => setF("roi_pct", numOrNull(x))} valueOverride={v("roi_pct") as number} />
            </FieldGrid>
          </TabsContent>
        )}

        <TabsContent value="network">
          <FieldGrid>
            <Field label="Tracking Number" value={record.tracking_number} editing={editing} onChange={(x) => setF("tracking_number", x)} valueOverride={v("tracking_number") as string} />
            <Field label="IP Configuration" value={record.ip_configuration} editing={editing} onChange={(x) => setF("ip_configuration", x)} valueOverride={v("ip_configuration") as string} />
            <Field label="Assigned Port" value={record.assigned_port} editing={editing} onChange={(x) => setF("assigned_port", x)} valueOverride={v("assigned_port") as string} />
            <Field label="IP Address" value={record.ip_address} editing={editing} onChange={(x) => setF("ip_address", x)} valueOverride={v("ip_address") as string} />
            <Field label="Subnet Mask" value={record.subnet_mask} editing={editing} onChange={(x) => setF("subnet_mask", x)} valueOverride={v("subnet_mask") as string} />
            <Field label="Gateway" value={record.gateway} editing={editing} onChange={(x) => setF("gateway", x)} valueOverride={v("gateway") as string} />
            <Field label="DNS 1" value={record.dns1} editing={editing} onChange={(x) => setF("dns1", x)} valueOverride={v("dns1") as string} />
            <Field label="DNS 2" value={record.dns2} editing={editing} onChange={(x) => setF("dns2", x)} valueOverride={v("dns2") as string} />
            <Field label="Online Status" value={record.online_status} editing={editing} onChange={(x) => setF("online_status", x)} valueOverride={v("online_status") as string} />
          </FieldGrid>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function FieldGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">{children}</div>;
}

interface FieldProps {
  label: string;
  value: string | number | null | undefined;
  editing?: boolean;
  onChange?: (v: string) => void;
  valueOverride?: string | number | null;
  type?: string;
}

function Field({ label, value, editing, onChange, valueOverride, type }: FieldProps) {
  const display = value === null || value === undefined || value === "" ? "—" : String(value);
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      {editing && onChange ? (
        <Input
          type={type ?? "text"}
          value={valueOverride === null || valueOverride === undefined ? "" : String(valueOverride)}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 text-sm"
        />
      ) : (
        <div className="text-sm text-foreground tabular-nums">{display}</div>
      )}
    </div>
  );
}

function numOrNull(s: string): number | null {
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

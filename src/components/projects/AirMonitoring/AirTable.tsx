import { useState, useMemo } from "react";
import { useAirRows, useAirDevices, type AirMonitorRow } from "@/hooks/useAirRows";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { 
  Search, Download, Pencil, Save, X, 
  CheckCircle2, AlertCircle, Clock, Calendar, Package, 
  Loader2, MapPin, User, Activity, Monitor
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { 
  Dialog, DialogContent, DialogHeader, 
  DialogTitle, DialogTrigger 
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

/* ─────────── Device Modal Content ─────────── */
const DeviceModalContent = ({ siteId, projectName }: { siteId: string, projectName: string }) => {
  const { data: devices, isLoading } = useAirDevices(siteId);

  if (isLoading) return (
    <div className="py-20 flex flex-col items-center gap-3 text-slate-400">
      <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      <p className="text-sm font-medium">Loading inventory...</p>
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto p-1 pr-2">
      {devices?.map((device, idx) => (
        <div key={idx} className="flex flex-col gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200/60">
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="text-[10px] font-mono bg-white text-indigo-700 border-indigo-100">
              {device.device_id || 'NO SERIAL'}
            </Badge>
            <span className="text-[10px] text-slate-400 font-mono">
              {device.mac_address || 'NO MAC'}
            </span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1">
            <div className="flex items-center gap-1">
              <Package className="w-3 h-3" /> {device.po_number || '—'}
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="w-3 h-3" /> {device.shipment_date ? format(new Date(device.shipment_date), "MMM d, yy") : '—'}
            </div>
          </div>
        </div>
      ))}
      {!devices?.length && <p className="col-span-2 text-center py-10 text-slate-400 text-sm italic">No devices found.</p>}
    </div>
  );
};

/* ─────────── Main Table ─────────── */
export function AirTable() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useAirRows();

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ status: "all", region: "all", country: "all" });
  const [showFinancials, setShowFinancials] = useState(true);

  const uniques = useMemo(() => ({
    regions: Array.from(new Set(rows.map(r => r.region).filter(Boolean))).sort() as string[],
    countries: Array.from(new Set(rows.map(r => r.country).filter(Boolean))).sort() as string[],
  }), [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const matchSearch = !search || 
        [r.project_name, r.notes, r.region, r.country, r.city, r.pm_name, ...r.po_numbers]
        .some(v => v?.toLowerCase().includes(search.toLowerCase()));
      if (!matchSearch) return false;
      if (filters.status !== "all" && r.status !== filters.status) return false;
      if (filters.region !== "all" && r.region !== filters.region) return false;
      if (filters.country !== "all" && r.country !== filters.country) return false;
      return true;
    });
  }, [rows, search, filters]);

  const update = async (siteId: string, patch: any, projectName: string | null): Promise<boolean> => {
    const { error } = await supabase.from("site_air_records").update(patch).eq("site_id", siteId);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return false;
    }
    toast({ title: "Saved", description: `${projectName ?? "Record"} updated successfully.` });
    await qc.invalidateQueries({ queryKey: ["monitor-air-rows"] });
    return true;
  };

  const exportCSV = () => {
    if (!filtered.length) return;
    const headers = ["Project", "Status", "PM", "Region", "Country", "City", "Sensors", "POs", "Notes"];
    const lines = [
      headers.join(","),
      ...filtered.map((r) => [
        JSON.stringify(r.project_name ?? ""),
        JSON.stringify(r.status ?? ""),
        JSON.stringify(r.pm_name ?? ""),
        JSON.stringify(r.region ?? ""),
        JSON.stringify(r.country ?? ""),
        JSON.stringify(r.city ?? ""),
        r.total_sensors,
        JSON.stringify(r.po_numbers.join(" | ")),
        r.quotation_value,
        r.hardware_cost,
        r.total_cost,
        r.profit,
        r.roi,
        JSON.stringify(r.notes ?? ""),
      ].join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; 
    a.download = `air-monitors-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto">
      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 bg-white p-4 rounded-2xl border border-slate-200/60 shadow-sm">
        <div className="relative flex-1 min-w-[260px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects, POs, PMs..." className="pl-9 h-10 bg-slate-50/50 border-slate-200 focus-visible:ring-indigo-500/30 transition-all" />
        </div>
        <FilterSelect label="Status" value={filters.status} onChange={(v) => setFilters(p => ({ ...p, status: v }))} options={["Upcoming", "Assigned", "Delivered"]} />
        <FilterSelect label="Region" value={filters.region} onChange={(v) => setFilters(p => ({ ...p, region: v }))} options={uniques.regions} />
        <FilterSelect label="Country" value={filters.country} onChange={(v) => setFilters(p => ({ ...p, country: v }))} options={uniques.countries} />
        <div className="ml-auto">
          <Button variant="outline" size="sm" onClick={() => setShowFinancials(!showFinancials)} className={cn("gap-2 h-10 px-4", showFinancials ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "border-slate-200")}>
            <Activity className="h-4 w-4" /> {showFinancials ? "Hide Financials" : "Show Financials"}
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV} className="gap-2 h-10 px-4 border-slate-200">
            <Download className="h-4 w-4" /> Export
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-slate-200/60 bg-white shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="py-24 flex flex-col items-center gap-4 text-slate-400"><Loader2 className="w-10 h-10 animate-spin text-indigo-500" /><p className="text-sm font-medium">Loading...</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200">
                  <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider sticky left-0 bg-slate-50/80 z-20 min-w-[320px]"><span className="flex items-center gap-1.5"><Activity className="w-3.5 h-3.5" /> Project & Location</span></th>
                  <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-36"><span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> PM</span></th>
                  <th className="px-4 py-3.5 text-center text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-32">No. of Sensors Assigned</th>
                  <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-32"><span className="flex items-center gap-1.5"><Package className="w-3.5 h-3.5" /> PO Numbers</span></th>
                  <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-32"><span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Handover Date</span></th>
                  <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-32"><span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Shipment Date</span></th>
                  {showFinancials && (
                    <>
                      <th className="px-4 py-3.5 text-right text-[11px] font-bold text-indigo-600 uppercase tracking-wider w-24">Quotation</th>
                      <th className="px-4 py-3.5 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-24">HW Cost</th>
                      <th className="px-4 py-3.5 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-24">Shipping</th>
                      <th className="px-4 py-3.5 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-24">Tax/Vat</th>
                      <th className="px-4 py-3.5 text-right text-[11px] font-bold text-slate-700 uppercase tracking-wider w-24">Profit</th>
                      <th className="px-4 py-3.5 text-center text-[11px] font-bold text-slate-700 uppercase tracking-wider w-20">ROI</th>
                    </>
                  )}
                  <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider min-w-[180px]">Notes</th>
                  <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-28">Status</th>
                  <th className="px-4 py-3.5 text-center text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-20">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r, i) => (
                  <AirRow key={r.id} r={r} idx={i} isAdmin={isAdmin} onUpdate={update} showFinancials={showFinancials} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: readonly string[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-10 w-40 text-xs bg-slate-50/50 border-slate-200">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All {label}s</SelectItem>
        {options.map((o) => (<SelectItem key={o} value={o}>{o}</SelectItem>))}
      </SelectContent>
    </Select>
  );
}

function AirRow({ r, idx, isAdmin, onUpdate, showFinancials }: { r: AirMonitorRow & any; idx: number; isAdmin: boolean; onUpdate: any; showFinancials: boolean; }) {
  const [editing, setEditing] = useState(false);
  const [patch, setPatch] = useState<Partial<AirMonitorRow>>({});
  const [saving, setSaving] = useState(false);

  const isEven = idx % 2 === 0;
  const baseBg = editing ? "bg-sky-50" : isEven ? "bg-white" : "bg-slate-50";

  const save = async () => {
    setSaving(true);
    const ok = await onUpdate(r.id, patch, r.project_name);
    if (ok) { setEditing(false); setPatch({}); }
    setSaving(false);
  };

  return (
    <tr className={cn("group transition-colors duration-150", baseBg, "hover:bg-slate-100/50")}>
      <td className={cn("px-4 py-4 font-semibold text-slate-800 sticky left-0 z-10", editing ? "bg-sky-50" : isEven ? "bg-white" : "bg-slate-50", "group-hover:bg-slate-100 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.12)]")}>
        <div className="flex flex-col">
          <span className="text-sm font-bold tracking-tight">{r.project_name}</span>
          <span className="text-[10px] text-slate-400 font-normal mt-0.5">{r.city}{r.city && r.country ? ", " : ""}{r.country}</span>
        </div>
      </td>
      <td className="px-4 py-4 text-sm text-slate-600">
        {r.pm_name ? (
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold">{r.pm_name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}</div>
            <span className="truncate max-w-[120px]">{r.pm_name}</span>
          </div>
        ) : <span className="text-slate-400 italic">Unassigned</span>}
      </td>
      <td className="px-4 py-4 text-center">
        <Dialog>
          <DialogTrigger asChild>
            <button className={cn("inline-flex items-center justify-center min-w-[2.2rem] h-8 px-2.5 rounded-lg text-xs font-bold transition-all shadow-sm", r.total_sensors > 0 ? "bg-indigo-50 text-indigo-700 hover:bg-indigo-100 ring-1 ring-indigo-100" : "bg-slate-100 text-slate-500")}>
              {r.total_sensors}
            </button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-xl border-none shadow-2xl rounded-2xl overflow-hidden">
            <DialogHeader className="bg-slate-50 -m-6 p-6 mb-2 border-b border-slate-100">
              <DialogTitle className="flex items-center gap-2 text-indigo-700 uppercase tracking-tight">
                <Monitor className="w-5 h-5" /> {r.project_name}
              </DialogTitle>
            </DialogHeader>
            <DeviceModalContent siteId={r.id} projectName={r.project_name} />
          </DialogContent>
        </Dialog>
      </td>
      <td className="px-4 py-4">
        <div className="flex flex-wrap gap-1.5 max-w-[180px]">
          {r.po_numbers.length > 0 ? r.po_numbers.map(po => (
            <Badge key={po} variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 text-[10px] font-mono px-1.5 h-5">{po}</Badge>
          )) : <span className="text-slate-400">—</span>}
        </div>
      </td>
      <td className="px-4 py-4 whitespace-nowrap">
        <span className="text-xs text-slate-600 font-medium">
          {r.handover_date ? format(new Date(r.handover_date), "MMM d, yy") : <span className="text-slate-300 italic">No date</span>}
        </span>
      </td>
      <td className="px-4 py-4 whitespace-nowrap">
        <span className="text-xs text-slate-500">
          {r.latest_shipment_date ? format(new Date(r.latest_shipment_date), "MMM d, yy") : <span className="text-slate-300 italic">—</span>}
        </span>
      </td>
      {showFinancials && (
        <>
          <td className="px-4 py-4 text-right font-bold text-indigo-600 text-xs">€{r.quotation_value?.toLocaleString() || '0'}</td>
          <td className="px-4 py-4 text-right text-slate-500 text-xs">€{r.hardware_cost?.toLocaleString() || '0'}</td>
          <td className="px-4 py-4 text-right text-slate-500 text-xs">€{(r.inbound_cost + r.outbound_cost + r.internal_cost)?.toLocaleString() || '0'}</td>
          <td className="px-4 py-4 text-right text-slate-500 text-xs">€{(r.customs_cost + r.vat_cost)?.toLocaleString() || '0'}</td>
          <td className={cn("px-4 py-4 text-right font-bold text-xs", r.profit >= 0 ? "text-emerald-600" : "text-rose-600")}>€{r.profit?.toLocaleString() || '0'}</td>
          <td className="px-4 py-4 text-center">
            <Badge variant="outline" className={cn("text-[10px] font-bold h-5 px-1.5", r.roi >= 20 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-50 text-slate-600")}>
              {Math.round(r.roi)}%
            </Badge>
          </td>
        </>
      )}
      <td className="px-4 py-4 max-w-[200px]">
        {!editing ? <p className="text-sm text-slate-600 truncate" title={r.notes ?? undefined}>{r.notes || <span className="text-slate-300 italic">No notes</span>}</p> : <Input value={patch.notes ?? r.notes ?? ""} onChange={e => setPatch(p => ({ ...p, notes: e.target.value }))} className="h-8 text-xs bg-white focus-visible:ring-indigo-500/20" />}
      </td>
      <td className="px-4 py-4"><StatusBadge status={r.status} /></td>
      <td className="px-4 py-4 text-center">
        {!editing ? <button onClick={() => setEditing(true)} className="p-2 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 transition-all opacity-0 group-hover:opacity-100"><Pencil className="h-4 w-4" /></button> : (
          <div className="flex items-center justify-center gap-1">
            <button onClick={save} disabled={saving} className="p-2 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-all">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}</button>
            <button onClick={() => { setEditing(false); setPatch({}); }} className="p-2 rounded-lg text-rose-500 hover:bg-rose-50 transition-all"><X className="h-4 w-4" /></button>
          </div>
        )}
      </td>
    </tr>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-slate-400 text-xs">—</span>;
  const isCompound = status.includes(',');
  const display = isCompound ? status : status.replace(/^\d+\s+/, '');
  const s = display.toLowerCase();
  const configs = [
    { test: /delivered|complete|installed/i, icon: CheckCircle2, color: "text-emerald-700 bg-emerald-50 border-emerald-200/60", dot: "bg-emerald-500" },
    { test: /shipped|transit/i, icon: Loader2, color: "text-sky-700 bg-sky-50 border-sky-200/60", dot: "bg-sky-500", spin: true },
    { test: /pending|upcoming|assigned/i, icon: Clock, color: "text-amber-700 bg-amber-50 border-amber-200/60", dot: "bg-amber-500" },
  ];
  const cfg = configs.find(c => c.test.test(s)) ?? configs[2];
  const Icon = cfg.icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9.5px] font-bold uppercase tracking-wide border whitespace-nowrap", cfg.color)}>
      <span className={cn("w-1 h-1 rounded-full", cfg.dot, cfg.spin && "animate-pulse")} />
      <Icon className={cn("w-2.5 h-2.5", cfg.spin && "animate-spin")} />
      <span className="truncate max-w-[120px]">{display}</span>
    </span>
  );
}

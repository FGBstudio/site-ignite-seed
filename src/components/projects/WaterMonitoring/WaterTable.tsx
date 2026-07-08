import { useMemo, useState } from "react";
import { useWaterRows, type WaterMonitorRow } from "@/hooks/useWaterRows";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Search, Droplet } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

const fmtDate = (s: string | null) => {
  if (!s) return "—";
  try { return format(parseISO(s), "dd MMM yyyy"); } catch { return s; }
};

const statusTone = (s: string) => {
  const v = s.toLowerCase();
  if (v.includes("request") || v.includes("pending")) return "bg-amber-500/15 text-amber-700 border-amber-500/30";
  if (v.includes("install") || v.includes("deliver") || v.includes("complete")) return "bg-emerald-500/15 text-emerald-700 border-emerald-500/30";
  return "bg-muted text-foreground/70 border-border";
};

export function WaterTable() {
  const { data: rows = [], isLoading } = useWaterRows();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r: WaterMonitorRow) =>
      [r.project_name, r.brand_name, r.city, r.country, r.region, ...(r.po_numbers ?? [])]
        .some((v) => (v ?? "").toString().toLowerCase().includes(q))
    );
  }, [rows, search]);

  return (
    <div className="space-y-3">
      <Card className="p-3 flex items-center gap-2">
        <Droplet className="h-4 w-4 text-primary" />
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Search client, city, project…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-xs" />
        </div>
        <Badge variant="secondary" className="ml-auto">{filtered.length} sites</Badge>
      </Card>

      <Card className="overflow-hidden">
        {isLoading ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No water monitoring sites yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] border-separate border-spacing-0">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold border-b">Client</th>
                  <th className="text-left px-3 py-2 font-semibold border-b">City</th>
                  <th className="text-left px-3 py-2 font-semibold border-b">Project</th>
                  <th className="text-left px-3 py-2 font-semibold border-b">Region</th>
                  <th className="text-left px-3 py-2 font-semibold border-b">Status</th>
                  <th className="text-left px-3 py-2 font-semibold border-b">PM</th>
                  <th className="text-right px-3 py-2 font-semibold border-b">Sensors</th>
                  <th className="text-left px-3 py-2 font-semibold border-b">Handover</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2 border-b truncate">{r.brand_name ?? "—"}</td>
                    <td className="px-3 py-2 border-b truncate">{r.city ?? "—"}</td>
                    <td className="px-3 py-2 border-b truncate font-medium">{r.project_name}</td>
                    <td className="px-3 py-2 border-b truncate">{r.region ?? "—"}</td>
                    <td className="px-3 py-2 border-b">
                      <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px]", statusTone(r.status))}>{r.status}</span>
                    </td>
                    <td className="px-3 py-2 border-b truncate">{r.pm_name ?? "—"}</td>
                    <td className="px-3 py-2 border-b text-right tabular-nums">{r.total_sensors}</td>
                    <td className="px-3 py-2 border-b">{fmtDate(r.handover_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Circle, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminPlannerData, type AdminPlannerProject } from "@/hooks/useAdminPlannerData";
import { useLateCertMilestones } from "@/hooks/useLateCertMilestones";
import { ExcelFilterButton, type ExcelFilterState } from "@/components/common/ExcelFilterButton";

type Light = "green_check" | "green" | "amber" | "red";

const EMPTY_FILTER: ExcelFilterState = { selectedValues: undefined, sort: null };

function computeLight(p: AdminPlannerProject, isLate: boolean): Light {
  if (p.setup_status === "certificato" || p.issued_date) return "green_check";
  if (p.is_deadline_critical || isLate) return "red";
  if (p.on_hold) return "amber";
  return "green";
}

const LIGHT_ROW_CLASS: Record<Light, string> = {
  green_check: "bg-emerald-50/60 hover:bg-emerald-50",
  green: "hover:bg-slate-50",
  amber: "hover:bg-amber-50/40",
  red: "bg-rose-50/60 hover:bg-rose-50",
};

function StatusDot({ light }: { light: Light }) {
  if (light === "green_check")
    return <CheckCircle2 className="h-4 w-4 text-emerald-700" strokeWidth={2.5} />;
  const color =
    light === "red" ? "bg-rose-500" : light === "amber" ? "bg-amber-500" : "bg-emerald-500";
  return <span className={cn("inline-block h-2.5 w-2.5 rounded-full", color)} />;
}

function certYear(p: AdminPlannerProject): string {
  const d = p.issued_date || p.handover_date;
  if (!d) return "TBD";
  const y = new Date(d).getFullYear();
  return Number.isFinite(y) ? String(y) : "TBD";
}

function apply(state: ExcelFilterState, value: string | null | undefined): boolean {
  if (!state.selectedValues) return true;
  const v = value ?? "(Blanks)";
  return state.selectedValues.includes(v);
}

function uniqueVals(rows: AdminPlannerProject[], get: (p: AdminPlannerProject) => string | null | undefined): string[] {
  const set = new Set<string>();
  for (const r of rows) set.add((get(r) ?? "").toString().trim() || "(Blanks)");
  return Array.from(set);
}

export function PortfolioFollowUp() {
  const navigate = useNavigate();
  const { data: projects = [], isLoading } = useAdminPlannerData();
  const { data: lateMilestones = [] } = useLateCertMilestones();

  const lateSet = useMemo(() => new Set(lateMilestones.map((m) => m.certification_id)), [lateMilestones]);

  const [search, setSearch] = useState("");
  const [holdingF, setHoldingF] = useState<ExcelFilterState>(EMPTY_FILTER);
  const [brandF, setBrandF] = useState<ExcelFilterState>(EMPTY_FILTER);
  const [regionF, setRegionF] = useState<ExcelFilterState>(EMPTY_FILTER);
  const [countryF, setCountryF] = useState<ExcelFilterState>(EMPTY_FILTER);

  const active = useMemo(
    () => projects.filter((p) => p.setup_status !== "canceled"),
    [projects],
  );

  const holdingValues = useMemo(() => uniqueVals(active, (p) => p.holding_name), [active]);
  const brandValues = useMemo(() => uniqueVals(active, (p) => p.brand_name || p.client), [active]);
  const regionValues = useMemo(() => uniqueVals(active, (p) => p.region), [active]);
  const countryValues = useMemo(() => uniqueVals(active, (p) => p.country), [active]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = active.filter((p) => {
      if (!apply(holdingF, p.holding_name)) return false;
      if (!apply(brandF, p.brand_name || p.client)) return false;
      if (!apply(regionF, p.region)) return false;
      if (!apply(countryF, p.country)) return false;
      if (q) {
        const hay = [p.name, p.brand_name, p.client, p.city].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const sortSpec: Array<[ExcelFilterState, (p: AdminPlannerProject) => string]> = [
      [holdingF, (p) => p.holding_name || ""],
      [brandF, (p) => p.brand_name || p.client || ""],
      [regionF, (p) => p.region || ""],
      [countryF, (p) => p.country || ""],
    ];
    const active_sort = sortSpec.find(([s]) => s.sort !== null);
    if (active_sort) {
      const [state, get] = active_sort;
      const dir = state.sort === "asc" ? 1 : -1;
      rows = [...rows].sort((a, b) => get(a).localeCompare(get(b)) * dir);
    }
    return rows;
  }, [active, search, holdingF, brandF, regionF, countryF]);

  const kpis = useMemo(() => {
    let completed = 0;
    for (const p of filtered) if (p.setup_status === "certificato" || p.issued_date) completed += 1;
    return { total: filtered.length, completed, ongoing: filtered.length - completed };
  }, [filtered]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header strip: legend + tracker */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 rounded-3xl border-border/60 shadow-sm">
          <CardContent className="p-5">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-3">
              Legend
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-6 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-700" strokeWidth={2.5} />
                <span className="text-foreground">Certified / Completed</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <span className="text-foreground">No action required from HIG — proceeding</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />
                <span className="text-foreground">Waiting for HIG feedback</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-500" />
                <span className="text-foreground">HIG urgent attention required</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-border/60 shadow-sm">
          <CardContent className="p-5">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-3">
              Tracker
            </p>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-2xl font-semibold tabular-nums text-primary">{kpis.ongoing}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">Ongoing</p>
              </div>
              <div>
                <p className="text-2xl font-semibold tabular-nums text-emerald-700">{kpis.completed}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">Completed</p>
              </div>
              <div>
                <p className="text-2xl font-semibold tabular-nums text-foreground">{kpis.total}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search project, deal, city…"
            className="pl-9 h-9 rounded-lg"
          />
        </div>
        <ExcelFilterButton label="Holding" values={holdingValues} state={holdingF} onChange={setHoldingF} />
        <ExcelFilterButton label="Brand / Client" values={brandValues} state={brandF} onChange={setBrandF} />
        <ExcelFilterButton label="Region" values={regionValues} state={regionF} onChange={setRegionF} />
        <ExcelFilterButton label="Country" values={countryValues} state={countryF} onChange={setCountryF} />
      </div>

      {/* Portfolio table */}
      <Card className="rounded-3xl border-border/60 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/40 backdrop-blur">
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-2.5 px-3 font-medium w-10">Status</th>
                  <th className="py-2.5 px-3 font-medium">Type</th>
                  <th className="py-2.5 px-3 font-medium">Country</th>
                  <th className="py-2.5 px-3 font-medium">Deal</th>
                  <th className="py-2.5 px-3 font-medium">Project</th>
                  <th className="py-2.5 px-3 font-medium">Cert. Standard</th>
                  <th className="py-2.5 px-3 font-medium">Cert. Level</th>
                  <th className="py-2.5 px-3 font-medium">Year</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-muted-foreground">
                      No projects match the current filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map((p) => {
                    const light = computeLight(p, lateSet.has(p.id));
                    return (
                      <tr
                        key={p.id}
                        onClick={() => navigate(`/projects/${p.id}`)}
                        className={cn(
                          "border-t border-border/50 cursor-pointer transition-colors",
                          LIGHT_ROW_CLASS[light],
                        )}
                      >
                        <td className="py-2.5 px-3">
                          <StatusDot light={light} />
                        </td>
                        <td className="py-2.5 px-3 text-foreground">{p.typology || "—"}</td>
                        <td className="py-2.5 px-3 text-foreground">{p.country || "—"}</td>
                        <td className="py-2.5 px-3 text-foreground">{p.brand_name || p.client || "—"}</td>
                        <td className="py-2.5 px-3 font-medium text-foreground">
                          {p.name || p.city || "—"}
                        </td>
                        <td className="py-2.5 px-3 text-foreground">{p.cert_type || "—"}</td>
                        <td className="py-2.5 px-3 text-foreground">{p.cert_rating || "—"}</td>
                        <td className="py-2.5 px-3 tabular-nums text-foreground">{certYear(p)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

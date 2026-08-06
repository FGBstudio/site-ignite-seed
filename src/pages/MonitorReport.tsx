// Layer 1 – Controller: domain toggle, global filters, adapt+pivot orchestration.
import { useMemo, useState } from "react";
import { Zap, Wind, Droplet } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExcelFilterButton, type ExcelFilterState } from "@/components/common/ExcelFilterButton";
import { useMonitorRows } from "@/hooks/useMonitorRows";
import { useAirRows } from "@/hooks/useAirRows";
import { useWaterRows } from "@/hooks/useWaterRows";
import { useRequestedDemand } from "@/hooks/useRequestedDemand";
import {
  adaptEnergy, adaptAir, adaptWater, buildPivotTree, bucketTotals,
  type NormalizedRecord, type PivotDomain, type PivotTotals,
} from "@/lib/monitorPivot";
import { useAirProductMap } from "@/hooks/useAirProducts";
import { PivotTableRenderer } from "@/components/monitor/PivotTableRenderer";

const emptyFilter: ExcelFilterState = { selectedValues: undefined, sort: null };

/** Lead time between "material on site" and contractual handover. */
const ON_SITE_LEAD_DAYS = 15;

function matches(f: ExcelFilterState, v: string | null | undefined): boolean {
  if (!f.selectedValues || f.selectedValues.length === 0) return true;
  return f.selectedValues.includes(v ?? "");
}

import { DemandPlannerTab } from "@/components/monitor/DemandPlannerTab";
import { TrendingUp, Table } from "lucide-react";

/** Compact hardware breakdown shown under each horizon headline. */
function breakdownOf(domain: PivotDomain, t: PivotTotals): string {
  if (domain === "energy") {
    const parts = [
      t.bridges ? `${t.bridges} bridge` : null,
      t.pan10 ? `${t.pan10}× Pan-10` : null,
      t.pan12 ? `${t.pan12}× Pan-12` : null,
      t.pan14 ? `${t.pan14}× Pan-14` : null,
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : "—";
  }
  if (domain === "air") {
    const parts = [
      t.leed ? `${t.leed} LEED` : null,
      t.well ? `${t.well} WELL` : null,
      t.co2 ? `${t.co2} CO2` : null,
      t.unassigned ? `${t.unassigned} n/a` : null,
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : "—";
  }
  return t.value ? `${t.value} sensors` : "—";
}

export default function MonitorReport() {
  const [modeTab, setModeTab] = useState<"pivot" | "planner">("pivot");
  const [domain, setDomain] = useState<PivotDomain>("energy");
  const [statusF, setStatusF] = useState<ExcelFilterState>(emptyFilter);
  const [categoryF, setCategoryF] = useState<ExcelFilterState>(emptyFilter);
  const [pmF, setPmF] = useState<ExcelFilterState>(emptyFilter);
  const [brandF, setBrandF] = useState<ExcelFilterState>(emptyFilter);
  const [regionF, setRegionF] = useState<ExcelFilterState>(emptyFilter);
  const [countryF, setCountryF] = useState<ExcelFilterState>(emptyFilter);

  // Planning switches
  const [hidePast, setHidePast] = useState(true);
  const [includeRequested, setIncludeRequested] = useState(true);
  const [planOnSite, setPlanOnSite] = useState(false);

  const energy = useMonitorRows();
  const air = useAirRows();
  const water = useWaterRows();
  const airProducts = useAirProductMap();
  const requested = useRequestedDemand(domain);

  const isLoading =
    (domain === "energy" && energy.isLoading) ||
    (domain === "air" && air.isLoading) ||
    (domain === "water" && water.isLoading);

  const normalized: NormalizedRecord[] = useMemo(() => {
    const req = includeRequested ? requested.data : undefined;
    if (domain === "energy") return adaptEnergy(energy.data ?? [], req);
    if (domain === "air") return adaptAir(air.data ?? [], airProducts.data, req);
    return adaptWater(water.data ?? [], req);
  }, [domain, energy.data, air.data, water.data, airProducts.data, requested.data, includeRequested]);

  const uniques = useMemo(() => ({
    statuses: Array.from(new Set(normalized.map((r) => r.status).filter(Boolean) as string[])),
    categories: Array.from(new Set(normalized.map((r) => r.category).filter(Boolean) as string[])),
    pms: Array.from(new Set(normalized.map((r) => r.pm).filter(Boolean) as string[])),
    brands: Array.from(new Set(normalized.map((r) => r.brand).filter(Boolean) as string[])),
    regions: Array.from(new Set(normalized.map((r) => r.region).filter(Boolean))),
    countries: Array.from(new Set(normalized.map((r) => r.country).filter(Boolean) as string[])),
  }), [normalized]);

  const filtered = useMemo(() => {
    return normalized.filter((r) => (
      matches(statusF, r.status) &&
      matches(categoryF, r.category) &&
      matches(pmF, r.pm) &&
      matches(brandF, r.brand) &&
      matches(regionF, r.region) &&
      matches(countryF, r.country)
    ));
  }, [normalized, statusF, categoryF, pmF, brandF, regionF, countryF]);

  const offsetDays = planOnSite ? ON_SITE_LEAD_DAYS : 0;

  const tree = useMemo(
    () => buildPivotTree(filtered, { hidePast, offsetDays }),
    [filtered, hidePast, offsetDays],
  );
  const totals = useMemo(() => bucketTotals(tree), [tree]);

  // Overdue and undated rows must stay visible as headline numbers even when the
  // table hides them — they are demand that has not gone away.
  const alwaysTotals = useMemo(
    () => bucketTotals(buildPivotTree(filtered, { hidePast: false, offsetDays })),
    [filtered, offsetDays],
  );

  const hasAnyFilter = [statusF, categoryF, pmF, brandF, regionF, countryF]
    .some((f) => f.selectedValues !== undefined || f.sort !== null);

  // Reproduced in the exported file's header: a spreadsheet that does not say
  // what it was filtered by cannot be reconciled with the screen it came from.
  const filterSummary = useMemo(() => {
    const parts = ([
      ["Status", statusF], ["Category", categoryF], ["PM", pmF],
      ["Brand", brandF], ["Region", regionF], ["Country", countryF],
    ] as const)
      .filter(([, f]) => f.selectedValues !== undefined)
      .map(([label, f]) => `${label}: ${Array.from(f.selectedValues ?? []).join(", ") || "none"}`);

    if (hidePast) parts.push("past periods hidden");
    if (!includeRequested) parts.push("requested demand excluded");
    if (planOnSite) parts.push("planned on-site (handover − lead time)");
    return parts.join(" · ");
  }, [statusF, categoryF, pmF, brandF, regionF, countryF, hidePast, includeRequested, planOnSite]);

  const clearFilters = () => {
    setStatusF(emptyFilter); setCategoryF(emptyFilter); setPmF(emptyFilter);
    setBrandF(emptyFilter); setRegionF(emptyFilter); setCountryF(emptyFilter);
  };

  const headlines = [
    { key: "current", label: "Closing this quarter", hint: "In scadenza", totals: totals.current, tone: "text-amber-600" },
    { key: "next", label: "Next quarter", hint: "Mid-construction", totals: totals.next, tone: "text-blue-600" },
    { key: "long", label: "Long-range forecast", hint: "6-month blocks", totals: totals.long, tone: "text-emerald-600" },
    { key: "past", label: "Overdue", hint: hidePast ? "Hidden in the table below" : "Handover already passed", totals: alwaysTotals.past, tone: "text-destructive" },
  ] as const;

  return (
    <MainLayout title="Monitor · Report & Demand Planning" subtitle="Aggregated pivot analytics and future hardware demand forecasting">
      <div className="space-y-6">
        {/* Top-Level Mode Selector */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/60 pb-4">
          <Tabs value={modeTab} onValueChange={(v) => setModeTab(v as "pivot" | "planner")}>
            <TabsList className="grid grid-cols-2 w-full sm:w-[500px] bg-slate-100 dark:bg-slate-900 p-1 rounded-2xl">
              <TabsTrigger value="pivot" className="gap-2 text-xs font-bold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:shadow-sm">
                <Table className="h-4 w-4 text-emerald-600" /> 📊 Aggregated Pivot Report
              </TabsTrigger>
              <TabsTrigger value="planner" className="gap-2 text-xs font-extrabold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground shadow-sm">
                <TrendingUp className="h-4 w-4" /> 📦 Demand Planner & Forecast
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {modeTab === "planner" ? (
          <DemandPlannerTab />
        ) : (
          <div className="space-y-4">
            <Tabs value={domain} onValueChange={(v) => setDomain(v as PivotDomain)}>
              <TabsList className="grid w-full grid-cols-3 max-w-[520px]">
                <TabsTrigger value="energy" className="gap-2"><Zap className="h-4 w-4" /> Energy</TabsTrigger>
                <TabsTrigger value="air" className="gap-2"><Wind className="h-4 w-4" /> Air Quality</TabsTrigger>
                <TabsTrigger value="water" className="gap-2"><Droplet className="h-4 w-4" /> Water</TabsTrigger>
              </TabsList>
            </Tabs>

            <Card>
              <CardContent className="py-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <ExcelFilterButton label="Status" values={uniques.statuses} state={statusF} onChange={setStatusF} />
                  <ExcelFilterButton label="Category" values={uniques.categories} state={categoryF} onChange={setCategoryF} />
                  <ExcelFilterButton label="PM" values={uniques.pms} state={pmF} onChange={setPmF} />
                  <ExcelFilterButton label="Brand" values={uniques.brands} state={brandF} onChange={setBrandF} />
                  <ExcelFilterButton label="Region" values={uniques.regions} state={regionF} onChange={setRegionF} />
                  <ExcelFilterButton label="Country" values={uniques.countries} state={countryF} onChange={setCountryF} />
                  {hasAnyFilter && (
                    <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs text-indigo-600 hover:text-indigo-700 h-9 px-2.5 font-semibold">
                      Reset Filters
                    </Button>
                  )}
                  <div className="ml-auto text-xs text-muted-foreground font-semibold">
                    {filtered.length} record{filtered.length === 1 ? "" : "s"} · {tree.length} period{tree.length === 1 ? "" : "s"}
                  </div>
                </div>

                {/* Planning switches */}
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border/60 pt-3">
                  <div className="flex items-center gap-2">
                    <Switch id="hide-past" checked={hidePast} onCheckedChange={setHidePast} />
                    <Label htmlFor="hide-past" className="text-xs font-semibold cursor-pointer">
                      Hide past handovers
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch id="include-requested" checked={includeRequested} onCheckedChange={setIncludeRequested} />
                    <Label htmlFor="include-requested" className="text-xs font-semibold cursor-pointer">
                      Include requested (not yet assigned)
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch id="plan-on-site" checked={planOnSite} onCheckedChange={setPlanOnSite} />
                    <Label htmlFor="plan-on-site" className="text-xs font-semibold cursor-pointer">
                      Plan on on-site date (handover − {ON_SITE_LEAD_DAYS}d)
                    </Label>
                  </div>
                  {alwaysTotals.tbd.value > 0 && (
                    <span className="text-[11px] text-muted-foreground">
                      ⚠ {alwaysTotals.tbd.value.toLocaleString("en-US")} units on projects with no handover date
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {headlines.map((t) => (
                <Card key={t.key}>
                  <CardContent className="py-4">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{t.label}</p>
                    <p className={`mt-1 text-2xl font-black tabular-nums ${t.tone}`}>
                      {t.totals.value.toLocaleString("en-US")}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{breakdownOf(domain, t.totals)}</p>
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">{t.hint}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="overflow-hidden p-4">
              {isLoading ? (
                <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
              ) : (
                <PivotTableRenderer tree={tree} domain={domain} filterSummary={filterSummary} />
              )}
            </Card>
          </div>
        )}
      </div>
    </MainLayout>
  );
}

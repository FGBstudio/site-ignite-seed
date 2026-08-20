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
  buildHeadlines, buildLongRows, typologyBreakdown,
  type NormalizedRecord, type PivotDomain,
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
    // Air records are per site, energy and water per certification — each
    // adapter gets the index that matches its own grain.
    if (domain === "energy") return adaptEnergy(energy.data ?? [], req?.byCertification);
    if (domain === "air") return adaptAir(air.data ?? [], airProducts.data, req);
    return adaptWater(water.data ?? [], req?.byCertification);
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
  // Overdue and undated rows must stay visible as headline numbers even when the
  // table hides them — they are demand that has not gone away. Hiding past rows
  // only ever removes the `past` bucket, so this one set of totals is correct
  // for every card, and the cards need no second source.
  const completeTotals = useMemo(
    () => bucketTotals(buildPivotTree(filtered, { hidePast: false, offsetDays })),
    [filtered, offsetDays],
  );

  // The single place horizons are computed. The cards below render this, and
  // the very same array is handed to the PDF and to the Excel reconciliation
  // sheet — an export that derived its own is what made the PDF disagree.
  const headlines = useMemo(
    () => buildHeadlines(completeTotals, new Date(), hidePast),
    [completeTotals, hidePast],
  );

  // The flat source table behind the Excel. Built from the same filtered
  // records and the same bucketing, deliberately ignoring `hidePast`.
  const longRows = useMemo(
    () => buildLongRows(filtered, domain, { offsetDays }),
    [filtered, domain, offsetDays],
  );

  const hasAnyFilter = [statusF, categoryF, pmF, brandF, regionF, countryF]
    .some((f) => f.selectedValues !== undefined || f.sort !== null);

  // Reproduced in the exported file's header. Every switch is reported,
  // including the ones left alone: a sheet that only mentions what somebody
  // happened to flip cannot be reconciled with the screen it came from, because
  // the reader cannot tell a default from an omission.
  const filterLines = useMemo(() => {
    const parts = ([
      ["Status", statusF], ["Category", categoryF], ["PM", pmF],
      ["Brand", brandF], ["Region", regionF], ["Country", countryF],
    ] as const)
      .filter(([, f]) => f.selectedValues !== undefined)
      .map(([label, f]) => `${label}: ${Array.from(f.selectedValues ?? []).join(", ") || "none"}`);

    parts.push(`Hide past handovers: ${hidePast ? "on" : "off"}`);
    parts.push(`Include requested (not yet assigned): ${includeRequested ? "on" : "off"}`);
    parts.push(
      `Plan on on-site date (handover − ${ON_SITE_LEAD_DAYS}d): ${planOnSite ? "on" : "off"}`,
    );
    return parts;
  }, [statusF, categoryF, pmF, brandF, regionF, countryF, hidePast, includeRequested, planOnSite]);

  const clearFilters = () => {
    setStatusF(emptyFilter); setCategoryF(emptyFilter); setPmF(emptyFilter);
    setBrandF(emptyFilter); setRegionF(emptyFilter); setCountryF(emptyFilter);
  };

  /** Colour is presentation, so it stays here rather than in the pure lib. */
  const TONE: Record<string, string> = {
    current: "text-amber-600",
    next: "text-blue-600",
    long: "text-emerald-600",
    past: "text-destructive",
  };
  const cards = headlines.filter((h) => h.isCard);
  const tbd = headlines.find((h) => !h.isCard);

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
                  {(tbd?.totals.requested ?? 0) > 0 && (
                    <span className="text-[11px] text-muted-foreground">
                      ⚠ {tbd!.totals.requested.toLocaleString("en-US")} units to produce on projects with no handover date
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {cards.map((t) => (
                <Card key={t.key}>
                  <CardContent className="py-4">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{t.label}</p>
                    {/*
                      Units still to produce, not the project total. A project
                      already delivered — HIG Ballygunner's 65, Patrizia Ripa89's
                      10 — is hardware that exists and must not be ordered twice.
                    */}
                    <p className={`mt-1 text-2xl font-black tabular-nums ${TONE[t.key]}`}>
                      {t.totals.requested.toLocaleString("en-US")}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{typologyBreakdown(domain, t.totals)}</p>
                    <p className="text-[10px] text-muted-foreground/70">{t.range}</p>
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">{t.hint}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="overflow-hidden p-4">
              {isLoading ? (
                <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
              ) : (
                <PivotTableRenderer
                  tree={tree}
                  domain={domain}
                  filterLines={filterLines}
                  headlines={headlines}
                  longRows={longRows}
                />
              )}
            </Card>
          </div>
        )}
      </div>
    </MainLayout>
  );
}

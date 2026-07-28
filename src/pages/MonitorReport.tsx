// Layer 1 – Controller: domain toggle, global filters, adapt+pivot orchestration.
import { useMemo, useState } from "react";
import { Zap, Wind, Droplet } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExcelFilterButton, type ExcelFilterState } from "@/components/common/ExcelFilterButton";
import { useMonitorRows } from "@/hooks/useMonitorRows";
import { useAirRows } from "@/hooks/useAirRows";
import { useWaterRows } from "@/hooks/useWaterRows";
import {
  adaptEnergy, adaptAir, adaptWater, buildPivotTree,
  type NormalizedRecord, type PivotDomain,
} from "@/lib/monitorPivot";
import { PivotTableRenderer } from "@/components/monitor/PivotTableRenderer";

const emptyFilter: ExcelFilterState = { selectedValues: undefined, sort: null };

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

  const energy = useMonitorRows();
  const air = useAirRows();
  const water = useWaterRows();

  const isLoading =
    (domain === "energy" && energy.isLoading) ||
    (domain === "air" && air.isLoading) ||
    (domain === "water" && water.isLoading);

  const normalized: NormalizedRecord[] = useMemo(() => {
    if (domain === "energy") return adaptEnergy(energy.data ?? []);
    if (domain === "air") return adaptAir(air.data ?? []);
    return adaptWater(water.data ?? []);
  }, [domain, energy.data, air.data, water.data]);

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

  const tree = useMemo(() => buildPivotTree(filtered), [filtered]);

  const hasAnyFilter = [statusF, categoryF, pmF, brandF, regionF, countryF]
    .some((f) => f.selectedValues !== undefined || f.sort !== null);

  const clearFilters = () => {
    setStatusF(emptyFilter); setCategoryF(emptyFilter); setPmF(emptyFilter);
    setBrandF(emptyFilter); setRegionF(emptyFilter); setCountryF(emptyFilter);
  };

  return (
    <MainLayout title="Monitor · Report & Demand Planning" subtitle="Aggregated pivot analytics and future hardware demand forecasting">
      <div className="space-y-6">
        {/* Top-Level Mode Selector */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/60 pb-4">
          <Tabs value={modeTab} onValueChange={(v) => setModeTab(v as any)}>
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
                    {filtered.length} record{filtered.length === 1 ? "" : "s"} · {tree.length} date{tree.length === 1 ? "" : "s"}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-hidden p-4">
              {isLoading ? (
                <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
              ) : (
                <PivotTableRenderer tree={tree} domain={domain} />
              )}
            </Card>
          </div>
        )}
      </div>
    </MainLayout>
  );
}

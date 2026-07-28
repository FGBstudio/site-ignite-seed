import { useState, useMemo } from "react";
import { Zap, Wind, Calendar, Layers, Activity, TrendingUp, PackageCheck, Filter } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMonitorRows } from "@/hooks/useMonitorRows";
import { useAirRows } from "@/hooks/useAirRows";
import { adaptEnergy, adaptAir, buildPivotTree, NormalizedRecord } from "@/lib/monitorPivot";
import { PivotTableRenderer } from "@/components/monitor/PivotTableRenderer";
import { ProjectsReports } from "@/components/projects/ProjectsReports";

export function HardwareProcurementReport() {
  const [reportTab, setReportTab] = useState<"current" | "planner" | "delivery">("planner");
  const [domain, setDomain] = useState<"energy" | "air">("energy");
  const [timeframe, setTimeframe] = useState<string>("6M"); // Default Next 6 Months for demand planner
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [includePotential, setIncludePotential] = useState<boolean>(true);

  const energy = useMonitorRows();
  const air = useAirRows();

  const isLoading = energy.isLoading || air.isLoading;

  // Adapt raw data
  const rawRecords: NormalizedRecord[] = useMemo(() => {
    if (domain === "energy") return adaptEnergy(energy.data ?? []);
    return adaptAir(air.data ?? []);
  }, [domain, energy.data, air.data]);

  // Tab 1: Current Portfolio Records (Installed / Active / Delivered)
  const currentRecords = useMemo(() => {
    return rawRecords.filter((r) => {
      const st = (r.status || "").toLowerCase();
      return st.includes("installed") || st.includes("in_corso") || st.includes("certificato") || st.includes("delivered") || st.includes("active");
    });
  }, [rawRecords]);

  // Tab 2: Future Demand Planner Records (Upcoming / Confirmed / Quotation / Potential)
  const plannerRecords = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    return rawRecords.filter((r) => {
      const st = (r.status || "").toLowerCase();
      const isCurrent = st.includes("installed") || st.includes("delivered");
      
      // Focus on future/upcoming records for demand planner
      if (isCurrent && r.date < today) return false;

      if (!includePotential && st.includes("potential")) {
        return false;
      }

      // Timeframe Filter
      if (timeframe === "30D") {
        const d30 = new Date(today); d30.setDate(d30.getDate() + 30);
        if (r.date > d30) return false;
      } else if (timeframe === "90D") {
        const d90 = new Date(today); d90.setDate(d90.getDate() + 90);
        if (r.date > d90) return false;
      } else if (timeframe === "6M") {
        const d6m = new Date(today); d6m.setMonth(d6m.getMonth() + 6);
        if (r.date > d6m) return false;
      } else if (timeframe === "1Y") {
        const d1y = new Date(today); d1y.setFullYear(d1y.getFullYear() + 1);
        if (r.date > d1y) return false;
      } else if (timeframe === "CUSTOM") {
        if (customStart && r.date < new Date(customStart)) return false;
        if (customEnd && r.date > new Date(customEnd)) return false;
      }

      return true;
    });
  }, [rawRecords, timeframe, customStart, customEnd, includePotential]);

  // Pivot trees
  const currentTree = useMemo(() => buildPivotTree(currentRecords), [currentRecords]);
  const plannerTree = useMemo(() => buildPivotTree(plannerRecords), [plannerRecords]);

  // Demand Planner KPI Metrics
  const demandKpis = useMemo(() => {
    const totalProjects = plannerRecords.length;
    let totBridges = 0, totPan10 = 0, totPan12 = 0, totPan14 = 0;
    let totLeed = 0, totWell = 0, totCo2 = 0, totalUnits = 0;

    plannerRecords.forEach((r) => {
      totBridges += r.bridges;
      totPan10 += r.pan10;
      totPan12 += r.pan12;
      totPan14 += r.pan14;
      totLeed += r.leed;
      totWell += r.well;
      totCo2 += r.co2;
      totalUnits += r.value;
    });

    const confirmed = plannerRecords.filter((r) => {
      const st = (r.status || "").toLowerCase();
      return st.includes("requested") || st.includes("in_corso") || st.includes("assigned");
    }).length;

    const quoted = plannerRecords.filter((r) => r.status?.toLowerCase().includes("quotation")).length;
    const potential = plannerRecords.filter((r) => r.status?.toLowerCase().includes("potential")).length;

    return {
      totalProjects,
      totBridges,
      totPan10,
      totPan12,
      totPan14,
      totLeed,
      totWell,
      totCo2,
      totalUnits,
      confirmed,
      quoted,
      potential,
    };
  }, [plannerRecords]);

  return (
    <div className="space-y-6">
      {/* Top Level Navigation Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/60 pb-4">
        <Tabs value={reportTab} onValueChange={(v) => setReportTab(v as any)} className="w-full sm:w-auto">
          <TabsList className="grid grid-cols-3 w-full sm:w-[640px] bg-slate-100 dark:bg-slate-900 p-1 rounded-2xl">
            <TabsTrigger value="planner" className="gap-2 text-xs font-extrabold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground shadow-sm">
              <TrendingUp className="h-4 w-4" /> 📦 Demand Planner & Forecast
            </TabsTrigger>
            <TabsTrigger value="current" className="gap-2 text-xs font-bold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:shadow-sm">
              <PackageCheck className="h-4 w-4 text-emerald-600" /> 🏢 Current Active Scenario
            </TabsTrigger>
            <TabsTrigger value="delivery" className="gap-2 text-xs font-bold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:shadow-sm">
              <Activity className="h-4 w-4 text-purple-600" /> 📊 Delivery Analytics
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {reportTab !== "delivery" && (
          <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
            <button
              onClick={() => setDomain("energy")}
              className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                domain === "energy" ? "bg-orange-500 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Zap className="h-3.5 w-3.5" /> ⚡ Energy
            </button>
            <button
              onClick={() => setDomain("air")}
              className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                domain === "air" ? "bg-blue-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Wind className="h-3.5 w-3.5" /> 🍃 Air Quality
            </button>
          </div>
        )}
      </div>

      {reportTab === "delivery" ? (
        <ProjectsReports />
      ) : reportTab === "current" ? (
        /* TAB 1: CURRENT ACTIVE SCENARIO */
        <div className="space-y-4">
          <Card className="rounded-3xl border-border/60 shadow-sm p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-extrabold text-foreground">
                  {domain === "energy" ? "⚡ Active Energy Installed Scenario" : "🍃 Active Air Quality Installed Scenario"}
                </h3>
                <p className="text-xs text-muted-foreground">Showing active & installed operational sites across all regions</p>
              </div>
              <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 font-bold px-3 py-1 bg-emerald-50">
                {currentRecords.length} Active Sites
              </Badge>
            </div>
          </Card>

          <Card className="rounded-3xl border-border/60 shadow-sm overflow-hidden p-4">
            {isLoading ? (
              <div className="py-12 text-center text-sm text-muted-foreground">Loading active portfolio…</div>
            ) : (
              <PivotTableRenderer tree={currentTree} domain={domain} />
            )}
          </Card>
        </div>
      ) : (
        /* TAB 2: DEDICATED DEMAND PLANNER & HARDWARE FORECAST */
        <div className="space-y-6">
          {/* Filter & Timeframe Selector Bar */}
          <Card className="rounded-3xl border-border/60 shadow-sm">
            <CardContent className="p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-4">
                {/* Timeframe Presets */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5 text-xs font-extrabold text-foreground uppercase tracking-wider">
                    <Calendar className="h-4 w-4 text-primary" /> Forecast Horizon:
                  </div>
                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
                    {[
                      { key: "6M", label: "Next 6 Months (Default)" },
                      { key: "90D", label: "Next 90D" },
                      { key: "30D", label: "Next 30D" },
                      { key: "1Y", label: "Next 1 Year" },
                      { key: "ALL", label: "All Future" },
                      { key: "CUSTOM", label: "Custom Range" },
                    ].map((tf) => (
                      <button
                        key={tf.key}
                        onClick={() => setTimeframe(tf.key)}
                        className={`text-xs font-bold px-3 py-1 rounded-lg transition-all ${
                          timeframe === tf.key
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {tf.label}
                      </button>
                    ))}
                  </div>

                  {timeframe === "CUSTOM" && (
                    <div className="flex items-center gap-2 text-xs bg-slate-50 dark:bg-slate-900 px-3 py-1 rounded-xl border border-border">
                      <span className="font-semibold text-muted-foreground">From:</span>
                      <input
                        type="date"
                        value={customStart}
                        onChange={(e) => setCustomStart(e.target.value)}
                        className="bg-transparent font-mono text-xs font-bold focus:outline-none"
                      />
                      <span className="font-semibold text-muted-foreground">To:</span>
                      <input
                        type="date"
                        value={customEnd}
                        onChange={(e) => setCustomEnd(e.target.value)}
                        className="bg-transparent font-mono text-xs font-bold focus:outline-none"
                      />
                    </div>
                  )}
                </div>

                {/* Potential Projects Toggle */}
                <button
                  onClick={() => setIncludePotential(!includePotential)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-all flex items-center gap-1.5 ${
                    includePotential
                      ? "bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-950/40 dark:text-purple-300"
                      : "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-400"
                  }`}
                >
                  <Layers className="h-3.5 w-3.5" />
                  {includePotential ? "Potential Deals Included" : "Include Potential Deals"}
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Demand Forecasting KPI Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="rounded-3xl border-border/60 shadow-sm p-5 bg-gradient-to-br from-white to-orange-50/20 dark:from-slate-950 dark:to-slate-900/50">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-extrabold mb-1">
                🎯 Future Projects
              </p>
              <p className="text-3xl font-black text-foreground">{demandKpis.totalProjects} <span className="text-xs font-normal text-muted-foreground">upcoming projects</span></p>
              <div className="flex gap-2 mt-3 text-xs">
                <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 font-bold px-2 py-0.5 bg-emerald-50/50">
                  {demandKpis.confirmed} Confirmed
                </Badge>
                <Badge variant="outline" className="border-blue-500/30 text-blue-600 font-bold px-2 py-0.5 bg-blue-50/50">
                  {demandKpis.quoted} Quoted
                </Badge>
              </div>
            </Card>

            <Card className="rounded-3xl border-border/60 shadow-sm p-5 bg-gradient-to-br from-white to-blue-50/20 dark:from-slate-950 dark:to-slate-900/50">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-extrabold mb-1">
                📦 Expected Hardware Needed
              </p>
              <p className="text-3xl font-black text-primary">{demandKpis.totalUnits} <span className="text-xs font-normal text-muted-foreground">units required</span></p>
              <div className="flex flex-wrap gap-1.5 mt-3 text-xs">
                {domain === "energy" ? (
                  <>
                    <Badge variant="outline" className="border-blue-500/30 text-blue-600 font-bold px-1.5 py-0.5">{demandKpis.totBridges} Bridges</Badge>
                    <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 font-bold px-1.5 py-0.5">{demandKpis.totPan10} Pan-10</Badge>
                    <Badge variant="outline" className="border-indigo-500/30 text-indigo-600 font-bold px-1.5 py-0.5">{demandKpis.totPan12} Pan-12</Badge>
                    <Badge variant="outline" className="border-purple-500/30 text-purple-600 font-bold px-1.5 py-0.5">{demandKpis.totPan14} Pan-14</Badge>
                  </>
                ) : (
                  <>
                    <Badge variant="outline" className="border-blue-500/30 text-blue-600 font-bold px-1.5 py-0.5">{demandKpis.totLeed} LEED</Badge>
                    <Badge variant="outline" className="border-amber-500/30 text-amber-600 font-bold px-1.5 py-0.5">{demandKpis.totWell} WELL</Badge>
                    <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 font-bold px-1.5 py-0.5">{demandKpis.totCo2} CO2</Badge>
                  </>
                )}
              </div>
            </Card>

            <Card className="rounded-3xl border-border/60 shadow-sm p-5 bg-gradient-to-br from-white to-purple-50/20 dark:from-slate-950 dark:to-slate-900/50">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-extrabold mb-1">
                📈 Pipeline Breakdown
              </p>
              <p className="text-3xl font-black text-purple-600">{demandKpis.quoted + demandKpis.potential} <span className="text-xs font-normal text-muted-foreground font-semibold">in pipeline</span></p>
              <div className="flex gap-2 mt-3 text-xs">
                <Badge variant="outline" className="border-blue-500/30 text-blue-600 font-bold px-2 py-0.5">
                  {demandKpis.quoted} Quoted Deals
                </Badge>
                {includePotential && (
                  <Badge variant="outline" className="border-purple-500/30 text-purple-600 font-bold px-2 py-0.5">
                    {demandKpis.potential} Potential Deals
                  </Badge>
                )}
              </div>
            </Card>
          </div>

          {/* Dedicated Demand Forecast Pivot Matrix */}
          <Card className="rounded-3xl border-border/60 shadow-sm overflow-hidden p-4">
            <div className="flex items-center justify-between mb-3 px-2">
              <h3 className="text-sm font-extrabold text-foreground uppercase tracking-wider">
                {domain === "energy" ? "⚡ Energy Hardware Demand Forecast Matrix" : "🍃 AIR Quality Hardware Demand Forecast Matrix"}
              </h3>
            </div>
            {isLoading ? (
              <div className="py-12 text-center text-sm text-muted-foreground">Calculating hardware demand…</div>
            ) : (
              <PivotTableRenderer tree={plannerTree} domain={domain} />
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

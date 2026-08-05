import { useState, useMemo } from "react";
import { Zap, Wind, Calendar, Layers, TrendingUp, BarChart3, PieChart as PieIcon, Globe, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMonitorRows } from "@/hooks/useMonitorRows";
import { useAirRows } from "@/hooks/useAirRows";
import { adaptEnergy, adaptAir, buildPivotTree, parseDate, NormalizedRecord } from "@/lib/monitorPivot";
import { PivotTableRenderer } from "@/components/monitor/PivotTableRenderer";
import { useAirProductMap } from "@/hooks/useAirProducts";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from "recharts";

const COLORS = ["#009193", "#10b981", "#6366f1", "#8b5cf6", "#f59e0b", "#ef4444"];

export function DemandPlannerTab() {
  const [domain, setDomain] = useState<"energy" | "air">("energy");
  const [timeframe, setTimeframe] = useState<string>("6M"); // Default Next 6 Months
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [includePotential, setIncludePotential] = useState<boolean>(true);
  const [includeEstimates, setIncludeEstimates] = useState<boolean>(true);

  const energy = useMonitorRows();
  const air = useAirRows();

  // Query sites that already have physical hardware assigned/delivered in hardwares table
  const { data: assignedSiteIds = new Set<string>() } = useQuery({
    queryKey: ["assigned-hardware-site-ids"],
    queryFn: async () => {
      const { data } = await supabase
        .from("hardwares")
        .select("site_id")
        .not("site_id", "is", null);
      return new Set((data || []).map((h: any) => h.site_id).filter(Boolean) as string[]);
    },
    staleTime: 60_000,
  });

  // Query certifications directly as the single source of truth for project status & domain flags
  const { data: certDeals = [] } = useQuery({
    queryKey: ["planner-certifications-deals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("certifications")
        .select("id, name, status, site_id, handover_date, created_at, region, has_energy_monitoring, has_iaq_monitoring, has_water_monitoring, sites(country, region)")
        .in("status", ["da_configurare", "in_corso", "in_progress", "quotation", "quotation_approved", "potential"]);
      if (error) {
        console.error("Error fetching certifications deals:", error);
        return [];
      }
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const isLoading = (domain === "energy" ? energy.isLoading : air.isLoading);

  // Build hardware lookup maps by site_id from site_energy_records and site_air_records
  const energyBySiteId = useMemo(() => {
    const map = new Map<string, NormalizedRecord>();
    const energyRecords = adaptEnergy(energy.data ?? []);
    energyRecords.forEach((r) => {
      if (r.siteId) map.set(r.siteId, r);
    });
    return map;
  }, [energy.data]);

  const airBySiteId = useMemo(() => {
    const map = new Map<string, NormalizedRecord>();
    const airRecords = adaptAir(air.data ?? [], airProducts.data);
    airRecords.forEach((r) => {
      if (r.siteId) map.set(r.siteId, r);
    });
    return map;
  }, [air.data]);

  const rawRecords: NormalizedRecord[] = useMemo(() => {
    // 1. Filter certifications strictly by selected monitoring during quotation/onboarding
    const domainCerts = certDeals.filter((c: any) => {
      const siteId = c.site_id || c.id;
      if (domain === "air") {
        return c.has_iaq_monitoring === true || airBySiteId.has(siteId);
      }
      if (domain === "energy") {
        return c.has_energy_monitoring === true || energyBySiteId.has(siteId);
      }
      if (domain === "water") {
        return c.has_water_monitoring === true;
      }
      return true;
    });

    // 2. Map certifications, looking up hardware details from site_energy_records / site_air_records by site_id
    return domainCerts.map((c: any) => {
      const d = parseDate(c.handover_date) ?? parseDate(c.created_at) ?? new Date();
      const site = Array.isArray(c.sites) ? c.sites[0] : c.sites;
      const reg = c.region || site?.region || site?.country || "Europe";
      const siteId = c.site_id || c.id;

      // Look up hardware quantities from site_energy_records or site_air_records if available
      const energyInfo = domain === "energy" ? energyBySiteId.get(siteId) : undefined;
      const airInfo = domain === "air" ? airBySiteId.get(siteId) : undefined;

      const confirmedValue = domain === "energy" 
        ? (energyInfo ? energyInfo.value : (Number(c.total_bridges ?? 0) + Number(c.no_pan10 ?? 0) + Number(c.no_pan12 ?? 0) + Number(c.no_pan14 ?? 0)))
        : (airInfo ? airInfo.value : Number(c.total_sensors ?? 0));

      const st = (c.status || "").toLowerCase().trim();
      const isCommercialPipeline = st === "quotation" || st === "quotation_approved" || st === "potential";
      const isEstimated = isCommercialPipeline || confirmedValue === 0;

      let bridges = energyInfo ? energyInfo.bridges : Number(c.total_bridges ?? 0);
      let pan10 = energyInfo ? energyInfo.pan10 : Number(c.no_pan10 ?? 0);
      let pan12 = energyInfo ? energyInfo.pan12 : Number(c.no_pan12 ?? 0);
      let pan14 = energyInfo ? energyInfo.pan14 : Number(c.no_pan14 ?? 0);
      let leed = airInfo ? airInfo.leed : (domain === "air" ? Number(c.total_sensors ?? 0) : 0);
      let well = airInfo ? airInfo.well : 0;
      let co2 = airInfo ? airInfo.co2 : 0;

      // Apply potential baseline requirement for estimated/unconfirmed stage when includeEstimates is true
      if (isEstimated) {
        if (includeEstimates) {
          if (domain === "energy") {
            bridges = 1;
            pan10 = 6;
            pan12 = 6;
            pan14 = 0;
          } else if (domain === "air") {
            leed = 1;
            well = 0;
            co2 = 0;
          }
        } else {
          bridges = 0;
          pan10 = 0;
          pan12 = 0;
          pan14 = 0;
          leed = 0;
          well = 0;
          co2 = 0;
        }
      }

      const value = domain === "energy" 
        ? (bridges + pan10 + pan12 + pan14)
        : (leed + well + co2);

      return {
        date: isNaN(d.getTime()) ? new Date() : d,
        region: reg,
        projectName: c.name || "Commercial Project",
        value: value,
        siteId: siteId,
        bridges,
        pan10,
        pan12,
        pan14,
        leed,
        well,
        co2,
        status: c.status,
        category: null,
        pm: null,
        brand: null,
        country: site?.country ?? null,
        isEstimated,
      };
    });
  }, [domain, certDeals, energyBySiteId, airBySiteId, includeEstimates]);

  // Filter ONLY unassigned future demand records matching Rule 1 & Rule 2
  const plannerRecords = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    return rawRecords.filter((r) => {
      const st = (r.status || "").toLowerCase().trim();

      // RULE 1: Global Hardware Exclusion - If site_id IS IN hardwares table, EXCLUDE 100%!
      if (r.siteId && assignedSiteIds.has(r.siteId)) {
        return false;
      }

      // RULE 2: Status Whitelist for Unassigned Hardware Demand
      const isUpcomingDemand =
        st === "da_configurare" ||
        st === "in_corso" ||
        st === "in_progress" ||
        st === "quotation" ||
        st === "quotation_approved" ||
        st === "potential";

      if (!isUpcomingDemand) {
        return false;
      }

      // Dynamic Timeframe Date Window (Lower & Upper Bound)
      if (timeframe === "30D") {
        const d30 = new Date(today); d30.setDate(d30.getDate() + 30);
        if (r.date < today || r.date > d30) return false;
      } else if (timeframe === "90D") {
        const d90 = new Date(today); d90.setDate(d90.getDate() + 90);
        if (r.date < today || r.date > d90) return false;
      } else if (timeframe === "6M") {
        const d6m = new Date(today); d6m.setMonth(d6m.getMonth() + 6);
        if (r.date < today || r.date > d6m) return false;
      } else if (timeframe === "1Y") {
        const d1y = new Date(today); d1y.setFullYear(d1y.getFullYear() + 1);
        if (r.date < today || r.date > d1y) return false;
      } else if (timeframe === "CUSTOM") {
        if (customStart && r.date < new Date(customStart)) return false;
        if (customEnd && r.date > new Date(customEnd)) return false;
      }

      return true;
    });
  }, [rawRecords, timeframe, customStart, customEnd, includePotential, assignedSiteIds]);

  const tree = useMemo(() => buildPivotTree(plannerRecords), [plannerRecords]);

  // KPI calculations (Exact string matching)
  const kpis = useMemo(() => {
    const totalProjects = plannerRecords.length;
    let totBridges = 0, totPan10 = 0, totPan12 = 0, totPan14 = 0;
    let totLeed = 0, totWell = 0, totCo2 = 0, totalUnits = 0;
    let confirmedUnits = 0, estimatedUnits = 0;
    let estimatedProjectsCount = 0;

    plannerRecords.forEach((r) => {
      totBridges += r.bridges;
      totPan10 += r.pan10;
      totPan12 += r.pan12;
      totPan14 += r.pan14;
      totLeed += r.leed;
      totWell += r.well;
      totCo2 += r.co2;
      totalUnits += r.value;

      if (r.isEstimated) {
        estimatedUnits += r.value;
        estimatedProjectsCount += 1;
      } else {
        confirmedUnits += r.value;
      }
    });

    const toConfigure = plannerRecords.filter((r) => {
      const st = (r.status || "").toLowerCase().trim();
      return st === "da_configurare";
    }).length;

    const inCorso = plannerRecords.filter((r) => {
      const st = (r.status || "").toLowerCase().trim();
      return st === "in_corso" || st === "in_progress";
    }).length;

    const quoted = plannerRecords.filter((r) => {
      const st = (r.status || "").toLowerCase().trim();
      return st === "quotation" || st === "quotation_approved";
    }).length;

    const potential = plannerRecords.filter((r) => {
      const st = (r.status || "").toLowerCase().trim();
      return st === "potential";
    }).length;

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
      confirmedUnits,
      estimatedUnits,
      estimatedProjectsCount,
      toConfigure,
      inCorso,
      quoted,
      potential,
    };
  }, [plannerRecords]);

  // Chart Data 1: Dynamic Timeline Forecast (Generates ALL month/day ticks for selected horizon)
  const timelineData = useMemo(() => {
    const map = new Map<string, { label: string; Bridges: number; Pan10: number; Pan12: number; Pan14: number; LEED: number; WELL: number; CO2: number; Total: number }>();

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // 1. Pre-fill map with all date ticks for the chosen timeframe horizon
    if (timeframe === "30D") {
      for (let i = 0; i < 30; i += 5) {
        const d = new Date(today);
        d.setDate(d.getDate() + i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        map.set(key, { label, Bridges: 0, Pan10: 0, Pan12: 0, Pan14: 0, LEED: 0, WELL: 0, CO2: 0, Total: 0 });
      }
    } else if (timeframe === "90D") {
      for (let i = 0; i < 3; i++) {
        const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const label = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
        map.set(key, { label, Bridges: 0, Pan10: 0, Pan12: 0, Pan14: 0, LEED: 0, WELL: 0, CO2: 0, Total: 0 });
      }
    } else if (timeframe === "6M") {
      for (let i = 0; i < 6; i++) {
        const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const label = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
        map.set(key, { label, Bridges: 0, Pan10: 0, Pan12: 0, Pan14: 0, LEED: 0, WELL: 0, CO2: 0, Total: 0 });
      }
    } else if (timeframe === "1Y") {
      for (let i = 0; i < 12; i++) {
        const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const label = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
        map.set(key, { label, Bridges: 0, Pan10: 0, Pan12: 0, Pan14: 0, LEED: 0, WELL: 0, CO2: 0, Total: 0 });
      }
    }

    // 2. Aggregate plannerRecords into map
    plannerRecords.forEach((r) => {
      let key = "";
      if (timeframe === "30D") {
        key = `${r.date.getFullYear()}-${String(r.date.getMonth() + 1).padStart(2, "0")}-${String(r.date.getDate()).padStart(2, "0")}`;
      } else {
        key = `${r.date.getFullYear()}-${String(r.date.getMonth() + 1).padStart(2, "0")}`;
      }

      let entry = map.get(key);
      if (!entry) {
        const label = r.date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
        entry = { label, Bridges: 0, Pan10: 0, Pan12: 0, Pan14: 0, LEED: 0, WELL: 0, CO2: 0, Total: 0 };
        map.set(key, entry);
      }

      entry.Bridges += r.bridges;
      entry.Pan10 += r.pan10;
      entry.Pan12 += r.pan12;
      entry.Pan14 += r.pan14;
      entry.LEED += r.leed;
      entry.WELL += r.well;
      entry.CO2 += r.co2;
      entry.Total += r.value;
    });

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v);
  }, [plannerRecords, timeframe]);

  // Chart Data 2: Hardware Typology Donut
  const typologyData = useMemo(() => {
    if (domain === "energy") {
      return [
        { name: "Bridges", value: kpis.totBridges },
        { name: "Pan-10", value: kpis.totPan10 },
        { name: "Pan-12", value: kpis.totPan12 },
        { name: "Pan-14", value: kpis.totPan14 },
      ].filter((d) => d.value > 0);
    }
    return [
      { name: "LEED", value: kpis.totLeed },
      { name: "WELL", value: kpis.totWell },
      { name: "CO2", value: kpis.totCo2 },
    ].filter((d) => d.value > 0);
  }, [domain, kpis]);

  // Chart Data 3: Regional Distribution
  const regionalData = useMemo(() => {
    const map = new Map<string, number>();
    plannerRecords.forEach((r) => {
      map.set(r.region, (map.get(r.region) || 0) + r.value);
    });
    return Array.from(map.entries()).map(([region, units]) => ({ region, units }));
  }, [plannerRecords]);

  return (
    <div className="space-y-6">
      {/* Top Controls: Domain Switcher & Forecast Horizon */}
      <Card className="rounded-3xl border-border/60 shadow-sm">
        <CardContent className="p-5 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/40 pb-4">
            {/* Domain Switcher */}
            <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-900 p-1.5 rounded-2xl">
              <button
                onClick={() => setDomain("energy")}
                className={`text-xs font-extrabold px-4 py-2 rounded-xl transition-all flex items-center gap-2 ${
                  domain === "energy"
                    ? "bg-orange-500 text-white shadow-md"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Zap className="h-4 w-4" /> ⚡ Energy Demand
              </button>
              <button
                onClick={() => setDomain("air")}
                className={`text-xs font-extrabold px-4 py-2 rounded-xl transition-all flex items-center gap-2 ${
                  domain === "air"
                    ? "bg-blue-600 text-white shadow-md"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Wind className="h-4 w-4" /> 🍃 Air Quality Demand
              </button>
            </div>

            {/* Single Unified Estimated Demand Toggle */}
            <button
              onClick={() => setIncludeEstimates(!includeEstimates)}
              className={`text-xs font-extrabold px-3.5 py-2 rounded-xl border transition-all flex items-center gap-2 ${
                includeEstimates
                  ? "bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-950/40 dark:text-purple-300 shadow-xs"
                  : "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-400"
              }`}
            >
              <Sparkles className="h-4 w-4 text-purple-600" />
              {includeEstimates ? "Include Estimated Demand (Pipeline Baseline)" : "Confirmed PM Requests Only"}
            </button>
          </div>

          {/* Dedicated Timeframe Horizon Selector */}
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
                  className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
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
        </CardContent>
      </Card>

      {/* Dynamic KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="rounded-3xl border-border/60 shadow-sm p-5 bg-gradient-to-br from-white to-orange-50/20 dark:from-slate-950 dark:to-slate-900/50">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-extrabold mb-1">
            🎯 Upcoming Projects
          </p>
          <p className="text-3xl font-black text-foreground">{kpis.totalProjects} <span className="text-xs font-normal text-muted-foreground">future projects</span></p>
          <div className="flex flex-wrap gap-1.5 mt-3 text-xs">
            <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 font-bold px-2 py-0.5 bg-emerald-50/50">
              {kpis.toConfigure} To Configure
            </Badge>
            {kpis.inCorso > 0 && (
              <Badge variant="outline" className="border-amber-500/30 text-amber-600 font-bold px-2 py-0.5 bg-amber-50/50">
                {kpis.inCorso} In Progress (Unassigned)
              </Badge>
            )}
            {kpis.quoted > 0 && (
              <Badge variant="outline" className="border-blue-500/30 text-blue-600 font-bold px-2 py-0.5 bg-blue-50/50">
                {kpis.quoted} Quoted
              </Badge>
            )}
            {includePotential && kpis.potential > 0 && (
              <Badge variant="outline" className="border-purple-500/30 text-purple-600 font-bold px-2 py-0.5 bg-purple-50/50">
                {kpis.potential} Potential
              </Badge>
            )}
          </div>
        </Card>

        <Card className="rounded-3xl border-border/60 shadow-sm p-5 bg-gradient-to-br from-white to-blue-50/20 dark:from-slate-950 dark:to-slate-900/50">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-extrabold mb-1">
            📦 Total Hardware Required
          </p>
          <p className="text-3xl font-black text-primary">{kpis.totalUnits} <span className="text-xs font-normal text-muted-foreground">total units</span></p>
          <div className="flex flex-wrap gap-1.5 mt-3 text-xs">
            {domain === "energy" ? (
              <>
                <Badge variant="outline" className="border-blue-500/30 text-blue-600 font-bold px-1.5 py-0.5">{kpis.totBridges} Bridges</Badge>
                <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 font-bold px-1.5 py-0.5">{kpis.totPan10} Pan-10</Badge>
                <Badge variant="outline" className="border-indigo-500/30 text-indigo-600 font-bold px-1.5 py-0.5">{kpis.totPan12} Pan-12</Badge>
                <Badge variant="outline" className="border-purple-500/30 text-purple-600 font-bold px-1.5 py-0.5">{kpis.totPan14} Pan-14</Badge>
              </>
            ) : (
              <>
                <Badge variant="outline" className="border-blue-500/30 text-blue-600 font-bold px-1.5 py-0.5">{kpis.totLeed} LEED</Badge>
                <Badge variant="outline" className="border-amber-500/30 text-amber-600 font-bold px-1.5 py-0.5">{kpis.totWell} WELL</Badge>
                <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 font-bold px-1.5 py-0.5">{kpis.totCo2} CO2</Badge>
              </>
            )}
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 bg-emerald-50/50 font-extrabold px-1.5 py-0.5">{kpis.confirmedUnits} Confirmed</Badge>
            <Badge variant="outline" className="border-purple-500/40 text-purple-700 bg-purple-50/50 font-extrabold px-1.5 py-0.5">{kpis.estimatedUnits} Potential Units</Badge>
          </div>
        </Card>

        <Card className="rounded-3xl border-border/60 shadow-sm p-5 bg-gradient-to-br from-white to-purple-50/20 dark:from-slate-950 dark:to-slate-900/50">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-extrabold mb-1">
            📈 Commercial Pipeline & Potential Units
          </p>
          <p className="text-3xl font-black text-purple-600">{kpis.estimatedProjectsCount} <span className="text-xs font-normal text-muted-foreground font-semibold">projects that potentially require hardware</span></p>
          <div className="flex flex-wrap gap-2 mt-3 text-xs">
            <Badge variant="outline" className="border-purple-500/40 text-purple-700 bg-purple-50/60 font-black px-2 py-0.5 shadow-xs">
              {kpis.estimatedUnits} Potential Units
            </Badge>
            {kpis.quoted > 0 && (
              <Badge variant="outline" className="border-blue-500/30 text-blue-600 font-bold px-2 py-0.5">
                {kpis.quoted} Quoted / Approved
              </Badge>
            )}
            {kpis.potential > 0 && (
              <Badge variant="outline" className="border-purple-500/30 text-purple-600 font-bold px-2 py-0.5">
                {kpis.potential} Potential
              </Badge>
            )}
          </div>
        </Card>
      </div>

      {/* Interactive Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart 1: Hardware Demand Forecast Timeline */}
        <Card className="lg:col-span-2 rounded-3xl border-border/60 shadow-sm p-5">
          <CardHeader className="p-0 pb-4">
            <CardTitle className="text-sm font-extrabold uppercase tracking-wider text-foreground flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" /> Hardware Demand Forecast Timeline ({timeframe})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 h-[280px]">
            {timelineData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">No demand forecasted for this timeframe window.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={timelineData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  {domain === "energy" ? (
                    <>
                      <Bar dataKey="Bridges" fill="#009193" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Pan10" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Pan12" fill="#6366f1" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Pan14" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    </>
                  ) : (
                    <>
                      <Bar dataKey="LEED" fill="#009193" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="WELL" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="CO2" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </>
                  )}
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Chart 2: Typology Breakdown Donut */}
        <Card className="rounded-3xl border-border/60 shadow-sm p-5">
          <CardHeader className="p-0 pb-4">
            <CardTitle className="text-sm font-extrabold uppercase tracking-wider text-foreground flex items-center gap-2">
              <PieIcon className="h-4 w-4 text-primary" /> Hardware Model Share
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 h-[280px]">
            {typologyData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">No data available</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={typologyData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {typologyData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Demand Forecast Pivot Matrix */}
      <Card className="rounded-3xl border-border/60 shadow-sm overflow-hidden p-4">
        <div className="flex items-center justify-between mb-3 px-2">
          <h3 className="text-sm font-extrabold text-foreground uppercase tracking-wider">
            {domain === "energy" ? "⚡ Energy Hardware Demand Forecast Matrix" : "🍃 AIR Quality Hardware Demand Forecast Matrix"}
          </h3>
        </div>
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Calculating hardware demand…</div>
        ) : (
          <PivotTableRenderer tree={tree} domain={domain} />
        )}
      </Card>
    </div>
  );
}

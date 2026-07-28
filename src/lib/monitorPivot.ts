// Pure adapters + pivot builder for Monitor Report.
// Layer 2 (Adapter) + Layer 3 (Aggregator). No React, no side-effects.

import type { MonitorRow } from "@/hooks/useMonitorRows";
import type { AirMonitorRow } from "@/hooks/useAirRows";
import type { WaterMonitorRow } from "@/hooks/useWaterRows";

export type PivotDomain = "energy" | "air" | "water";

export interface NormalizedRecord {
  date: Date;
  region: string;
  projectName: string;
  value: number;
  note?: string | null;
  siteId?: string | null;
  // Hardware Breakdown Breakdown counts
  bridges: number;
  pan10: number;
  pan12: number;
  pan14: number;
  leed: number;
  well: number;
  co2: number;
  // Raw filter fields (kept so the controller can filter uniformly).
  status: string | null;
  category: string | null;
  pm: string | null;
  brand: string | null;
  country: string | null;
  isEstimated?: boolean;
}

const UNKNOWN = "—";

export function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  if (typeof s === "string" && s.includes("/")) {
    const parts = s.split("/");
    if (parts.length === 3) {
      const p0 = Number(parts[0]);
      const p1 = Number(parts[1]);
      const p2 = Number(parts[2]);
      if (p0 > 12) {
        const d = new Date(p2, p1 - 1, p0);
        if (!isNaN(d.getTime())) return d;
      }
    }
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function macroRegion(region: string | null | undefined, country: string | null | undefined): string {
  const r = (region ?? "").trim();
  if (r) {
    const low = r.toLowerCase();
    if (low.includes("europe") || low === "eu") return "Europe";
    if (low.includes("america") || low === "us" || low === "usa" || low.includes("latam")) return "America";
    if (low.includes("apac") || low.includes("asia") || low.includes("pacific")) return "APAC";
    if (low.includes("middle") || low === "me" || low.includes("east")) return "Middle-East";
    return r;
  }
  const c = (country ?? "").toLowerCase();
  if (!c) return UNKNOWN;
  if (["italy","france","spain","germany","uk","united kingdom","portugal","netherlands","belgium","switzerland","austria","poland","sweden","norway","denmark","finland","greece","ireland"].some(k => c.includes(k))) return "Europe";
  if (["usa","united states","canada","mexico","brazil","argentina","chile","colombia"].some(k => c.includes(k))) return "America";
  if (["china","japan","korea","singapore","hong kong","taiwan","australia","india","thailand","vietnam","malaysia","indonesia","philippines"].some(k => c.includes(k))) return "APAC";
  if (["uae","emirates","saudi","qatar","kuwait","bahrain","oman","israel","turkey","egypt"].some(k => c.includes(k))) return "Middle-East";
  return country || UNKNOWN;
}

export function adaptEnergy(rows: MonitorRow[]): NormalizedRecord[] {
  const out: NormalizedRecord[] = [];
  for (const r of rows) {
    const d = parseDate(r.handover_date) ?? parseDate(r.installation_date) ?? parseDate((r as any).created_at) ?? new Date();
    const b = Number(r.total_bridges ?? 0);
    const p10 = Number(r.no_pan10 ?? 0);
    const p12 = Number(r.no_pan12 ?? 0);
    const p14 = Number(r.no_pan14 ?? 0);
    const totalSensorsRaw = Number(r.total_sensors ?? 0);
    const sumPan = p10 + p12 + p14;
    const tot = Math.max(totalSensorsRaw, b + sumPan);

    out.push({
      date: d,
      region: macroRegion(r.region, r.country),
      projectName: r.project_name || r.brand_name || "Unnamed",
      value: tot,
      note: r.notes ?? null,
      siteId: r.site_id || r.id || null,
      bridges: b,
      pan10: p10,
      pan12: p12,
      pan14: p14,
      leed: 0,
      well: 0,
      co2: 0,
      status: r.status ?? null,
      category: r.category ?? null,
      pm: r.pm_name ?? null,
      brand: r.brand_name ?? null,
      country: r.country ?? null,
    });
  }
  return out;
}

export function adaptAir(rows: AirMonitorRow[]): NormalizedRecord[] {
  const out: NormalizedRecord[] = [];
  for (const r of rows) {
    const d = parseDate(r.handover_date) ?? parseDate(r.latest_shipment_date) ?? parseDate((r as any).created_at) ?? new Date();
    const tot = Number(r.total_sensors ?? 0);
    const nameLow = (r.project_name || "").toLowerCase();
    let leed = 0, well = 0, co2 = 0;
    if (nameLow.includes("leed")) leed = tot;
    else if (nameLow.includes("well")) well = tot;
    else if (nameLow.includes("co2")) co2 = tot;
    else well = tot;

    out.push({
      date: d,
      region: macroRegion(r.region, r.country),
      projectName: r.project_name || "Unnamed",
      value: tot || (leed + well + co2),
      note: r.notes ?? null,
      siteId: r.id || (r as any).site_id || null,
      bridges: 0,
      pan10: 0,
      pan12: 0,
      pan14: 0,
      leed,
      well,
      co2,
      status: r.status ?? null,
      category: null,
      pm: r.pm_name ?? null,
      brand: r.brand_name ?? null,
      country: r.country ?? null,
    });
  }
  return out;
}

export function adaptWater(rows: WaterMonitorRow[]): NormalizedRecord[] {
  const out: NormalizedRecord[] = [];
  for (const r of rows) {
    const d = parseDate(r.handover_date);
    if (!d) continue;
    out.push({
      date: d,
      region: macroRegion(r.region, r.country),
      projectName: r.project_name || "Unnamed",
      value: Number(r.total_sensors ?? 0),
      note: r.notes ?? null,
      bridges: 0,
      pan10: 0,
      pan12: 0,
      pan14: 0,
      leed: 0,
      well: 0,
      co2: 0,
      status: r.status ?? null,
      category: null,
      pm: r.pm_name ?? null,
      brand: r.brand_name ?? null,
      country: r.country ?? null,
    });
  }
  return out;
}

// ── Layer 3 – Pivot tree ──────────────────────────────────────────────────
export interface PivotProject {
  projectName: string;
  value: number;
  bridges: number;
  pan10: number;
  pan12: number;
  pan14: number;
  leed: number;
  well: number;
  co2: number;
  status?: string | null;
  notes: string[];
  isEstimated?: boolean;
}

export interface PivotRegion {
  region: string;
  value: number;
  bridges: number;
  pan10: number;
  pan12: number;
  pan14: number;
  leed: number;
  well: number;
  co2: number;
  projects: PivotProject[];
}

export interface PivotDate {
  dateKey: string;   // ISO yyyy-mm-dd for sorting
  dateLabel: string; // gg/mm/aaaa
  value: number;
  bridges: number;
  pan10: number;
  pan12: number;
  pan14: number;
  leed: number;
  well: number;
  co2: number;
  regions: PivotRegion[];
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
function fmtDayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function fmtDayLabel(d: Date): string {
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function buildPivotTree(records: NormalizedRecord[]): PivotDate[] {
  const byDate = new Map<string, { label: string; regions: Map<string, Map<string, PivotProject>> }>();

  for (const r of records) {
    const key = fmtDayKey(r.date);
    let dateNode = byDate.get(key);
    if (!dateNode) {
      dateNode = { label: fmtDayLabel(r.date), regions: new Map() };
      byDate.set(key, dateNode);
    }
    let regionMap = dateNode.regions.get(r.region);
    if (!regionMap) {
      regionMap = new Map();
      dateNode.regions.set(r.region, regionMap);
    }
    let proj = regionMap.get(r.projectName);
    if (!proj) {
      proj = {
        projectName: r.projectName,
        value: 0,
        bridges: 0,
        pan10: 0,
        pan12: 0,
        pan14: 0,
        leed: 0,
        well: 0,
        co2: 0,
        status: r.status,
        notes: [],
        isEstimated: r.isEstimated,
      };
      regionMap.set(r.projectName, proj);
    }
    proj.value += Number.isFinite(r.value) ? r.value : 0;
    proj.bridges += r.bridges;
    proj.pan10 += r.pan10;
    proj.pan12 += r.pan12;
    proj.pan14 += r.pan14;
    proj.leed += r.leed;
    proj.well += r.well;
    proj.co2 += r.co2;
    if (r.status && !proj.status) proj.status = r.status;
    if (r.note && r.note.trim()) proj.notes.push(r.note.trim());
  }

  const dates: PivotDate[] = [];
  for (const [dateKey, dNode] of byDate) {
    const regions: PivotRegion[] = [];
    let dateSum = 0;
    let dateBridges = 0, datePan10 = 0, datePan12 = 0, datePan14 = 0;
    let dateLeed = 0, dateWell = 0, dateCo2 = 0;

    for (const [regionName, projMap] of dNode.regions) {
      const projects = Array.from(projMap.values()).sort((a, b) => a.projectName.localeCompare(b.projectName));
      const regionSum = projects.reduce((s, p) => s + p.value, 0);
      const regBridges = projects.reduce((s, p) => s + p.bridges, 0);
      const regPan10 = projects.reduce((s, p) => s + p.pan10, 0);
      const regPan12 = projects.reduce((s, p) => s + p.pan12, 0);
      const regPan14 = projects.reduce((s, p) => s + p.pan14, 0);
      const regLeed = projects.reduce((s, p) => s + p.leed, 0);
      const regWell = projects.reduce((s, p) => s + p.well, 0);
      const regCo2 = projects.reduce((s, p) => s + p.co2, 0);

      dateSum += regionSum;
      dateBridges += regBridges;
      datePan10 += regPan10;
      datePan12 += regPan12;
      datePan14 += regPan14;
      dateLeed += regLeed;
      dateWell += regWell;
      dateCo2 += regCo2;

      regions.push({
        region: regionName,
        value: regionSum,
        bridges: regBridges,
        pan10: regPan10,
        pan12: regPan12,
        pan14: regPan14,
        leed: regLeed,
        well: regWell,
        co2: regCo2,
        projects,
      });
    }
    regions.sort((a, b) => a.region.localeCompare(b.region));
    dates.push({
      dateKey,
      dateLabel: dNode.label,
      value: dateSum,
      bridges: dateBridges,
      pan10: datePan10,
      pan12: datePan12,
      pan14: datePan14,
      leed: dateLeed,
      well: dateWell,
      co2: dateCo2,
      regions,
    });
  }

  dates.sort((a, b) => (a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0));
  return dates;
}

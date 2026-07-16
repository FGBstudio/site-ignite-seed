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
  // Raw filter fields (kept so the controller can filter uniformly).
  status: string | null;
  category: string | null;
  pm: string | null;
  brand: string | null;
  country: string | null;
}

const UNKNOWN = "—";

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
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
    const d = parseDate(r.handover_date) ?? parseDate(r.installation_date);
    if (!d) continue;
    out.push({
      date: d,
      region: macroRegion(r.region, r.country),
      projectName: r.project_name || r.brand_name || "Unnamed",
      value: Number(r.total_sensors ?? 0),
      note: r.notes ?? null,
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
    const d = parseDate(r.handover_date) ?? parseDate(r.latest_shipment_date);
    if (!d) continue;
    out.push({
      date: d,
      region: macroRegion(r.region, r.country),
      projectName: r.project_name || "Unnamed",
      value: Number(r.total_sensors ?? 0),
      note: r.notes ?? null,
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
  notes: string[];
}
export interface PivotRegion {
  region: string;
  value: number;
  projects: PivotProject[];
}
export interface PivotDate {
  dateKey: string;   // ISO yyyy-mm-dd for sorting
  dateLabel: string; // gg/mm/aaaa
  value: number;
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
      proj = { projectName: r.projectName, value: 0, notes: [] };
      regionMap.set(r.projectName, proj);
    }
    proj.value += Number.isFinite(r.value) ? r.value : 0;
    if (r.note && r.note.trim()) proj.notes.push(r.note.trim());
  }

  const dates: PivotDate[] = [];
  for (const [dateKey, dNode] of byDate) {
    const regions: PivotRegion[] = [];
    let dateSum = 0;
    for (const [regionName, projMap] of dNode.regions) {
      const projects = Array.from(projMap.values()).sort((a, b) => a.projectName.localeCompare(b.projectName));
      const regionSum = projects.reduce((s, p) => s + p.value, 0);
      dateSum += regionSum;
      regions.push({ region: regionName, value: regionSum, projects });
    }
    regions.sort((a, b) => a.region.localeCompare(b.region));
    dates.push({ dateKey, dateLabel: dNode.label, value: dateSum, regions });
  }

  dates.sort((a, b) => (a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0));
  return dates;
}

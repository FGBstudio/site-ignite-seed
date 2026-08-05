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
  unassigned?: number;
  // Raw filter fields (kept so the controller can filter uniformly).
  status: string | null;
  category: string | null;
  pm: string | null;
  brand: string | null;
  country: string | null;
  client?: string | null;
  city?: string | null;
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

/**
 * Unified project label for the Monitor Report:
 * CLIENT CITY Project  →  "EQT MIRANDOLA Minerva".
 * Client and city are uppercased; missing parts are skipped; the project name
 * is never repeated when it already starts with the client/city tokens.
 */
export function buildLabel(
  client: string | null | undefined,
  city: string | null | undefined,
  project: string | null | undefined,
): string {
  const cl = (client ?? "").trim().toUpperCase();
  const ct = (city ?? "").trim().toUpperCase();
  const pr = (project ?? "").trim();
  const parts: string[] = [];
  if (cl) parts.push(cl);
  if (ct && ct !== cl) parts.push(ct);
  if (pr) {
    const prUp = pr.toUpperCase();
    const alreadyPrefixed = parts.length > 0 && prUp.startsWith(parts.join(" "));
    if (alreadyPrefixed) return pr;
    parts.push(pr);
  }
  return parts.join(" ") || "Unnamed";
}

/** Maps an AIR product name (products.name) to its typology bucket. */
export function typologyFromProductName(name: string | null | undefined): "leed" | "well" | "co2" | null {
  const n = (name ?? "").toLowerCase();
  if (!n) return null;
  if (n.includes("leed")) return "leed";
  if (n.includes("well")) return "well";
  if (n.includes("co2") || n.includes("co-co2")) return "co2";
  return null;
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
      projectName: buildLabel(r.brand_name, r.city, r.project_name || r.brand_name),
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
      unassigned: 0,
      status: r.status ?? null,
      category: r.category ?? null,
      pm: r.pm_name ?? null,
      brand: r.brand_name ?? null,
      country: r.country ?? null,
      client: r.brand_name ?? null,
      city: r.city ?? null,
    });
  }
  return out;
}

/**
 * Air adapter.
 * Typology (LEED / WELL / CO2) comes from site_air_records.air_product_ids
 * resolved through the products catalogue — never guessed from the project name.
 * Records with no product assigned are counted as "Unassigned".
 */
export function adaptAir(
  rows: AirMonitorRow[],
  productNameById?: Map<string, string>,
): NormalizedRecord[] {
  const out: NormalizedRecord[] = [];
  for (const r of rows) {
    const d = parseDate(r.handover_date) ?? parseDate(r.latest_shipment_date) ?? parseDate((r as any).created_at) ?? new Date();
    const tot = Number(r.total_sensors ?? 0);

    const typologies = Array.from(
      new Set(
        (r.air_product_ids ?? [])
          .map((pid) => typologyFromProductName(productNameById?.get(pid)))
          .filter(Boolean) as Array<"leed" | "well" | "co2">,
      ),
    );

    let leed = 0, well = 0, co2 = 0, unassigned = 0;
    if (typologies.length === 0) {
      unassigned = tot;
    } else {
      const share = tot / typologies.length;
      for (const t of typologies) {
        if (t === "leed") leed += share;
        else if (t === "well") well += share;
        else co2 += share;
      }
      leed = Math.round(leed);
      well = Math.round(well);
      co2 = Math.round(co2);
      // Keep the split consistent with the total after rounding.
      const diff = tot - (leed + well + co2);
      if (diff !== 0) {
        if (typologies.includes("well")) well += diff;
        else if (typologies.includes("leed")) leed += diff;
        else co2 += diff;
      }
    }

    out.push({
      date: d,
      region: macroRegion(r.region, r.country),
      projectName: buildLabel(r.brand_name, r.city, r.project_name),
      value: tot,
      note: r.notes ?? null,
      siteId: r.id || (r as any).site_id || null,
      bridges: 0,
      pan10: 0,
      pan12: 0,
      pan14: 0,
      leed,
      well,
      co2,
      unassigned,
      status: r.status ?? null,
      category: null,
      pm: r.pm_name ?? null,
      brand: r.brand_name ?? null,
      country: r.country ?? null,
      client: r.brand_name ?? null,
      city: r.city ?? null,
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
      projectName: buildLabel(r.brand_name, r.city, r.project_name),
      value: Number(r.total_sensors ?? 0),
      note: r.notes ?? null,
      bridges: 0,
      pan10: 0,
      pan12: 0,
      pan14: 0,
      leed: 0,
      well: 0,
      co2: 0,
      unassigned: 0,
      status: r.status ?? null,
      category: null,
      pm: r.pm_name ?? null,
      brand: r.brand_name ?? null,
      country: r.country ?? null,
      client: r.brand_name ?? null,
      city: r.city ?? null,
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
  unassigned: number;
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
  unassigned: number;
  projects: PivotProject[];
}

/** Short-term planning buckets required by the business. */
export type PivotBucket = "past" | "current" | "next" | "long";

export const BUCKET_LABEL: Record<PivotBucket, string> = {
  past: "Overdue / Past periods",
  current: "Closing now — current quarter (in scadenza)",
  next: "Mid-construction — next quarter",
  long: "Long-range forecast (6-month blocks)",
};

export interface PivotDate {
  dateKey: string;   // sortable key (quarter: yyyy-Qn, date mode: yyyy-mm-dd)
  dateLabel: string; // human label
  bucket: PivotBucket;
  value: number;
  bridges: number;
  pan10: number;
  pan12: number;
  pan14: number;
  leed: number;
  well: number;
  co2: number;
  unassigned: number;
  regions: PivotRegion[];
}

export type PivotPeriod = PivotDate;
export type PivotGrouping = "quarter" | "date";

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
function fmtDayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function fmtDayLabel(d: Date): string {
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

const QUARTER_MONTHS = ["Jan–Mar", "Apr–Jun", "Jul–Sep", "Oct–Dec"];

export function quarterOf(d: Date): number {
  return Math.floor(d.getMonth() / 3) + 1; // 1..4
}

/** Absolute quarter index used to compare periods (year * 4 + quarter). */
function quarterIndex(d: Date): number {
  return d.getFullYear() * 4 + (quarterOf(d) - 1);
}

function fmtQuarterKey(d: Date): string {
  return `${d.getFullYear()}-Q${quarterOf(d)}`;
}
function fmtQuarterLabel(d: Date): string {
  const q = quarterOf(d);
  return `Q${q} ${d.getFullYear()} (${QUARTER_MONTHS[q - 1]})`;
}
function fmtHalfKey(d: Date): string {
  return `${d.getFullYear()}-H${d.getMonth() < 6 ? 1 : 2}`;
}
function fmtHalfLabel(d: Date): string {
  return d.getMonth() < 6 ? `H1 ${d.getFullYear()} (Jan–Jun)` : `H2 ${d.getFullYear()} (Jul–Dec)`;
}

export function bucketOf(d: Date, now: Date = new Date()): PivotBucket {
  const delta = quarterIndex(d) - quarterIndex(now);
  if (delta < 0) return "past";
  if (delta === 0) return "current";
  if (delta === 1) return "next";
  return "long";
}

function emptyTotals() {
  return { value: 0, bridges: 0, pan10: 0, pan12: 0, pan14: 0, leed: 0, well: 0, co2: 0, unassigned: 0 };
}

export function buildPivotTree(
  records: NormalizedRecord[],
  grouping: PivotGrouping = "quarter",
  now: Date = new Date(),
): PivotDate[] {
  const byPeriod = new Map<
    string,
    { label: string; bucket: PivotBucket; regions: Map<string, Map<string, PivotProject>> }
  >();

  for (const r of records) {
    const bucket = bucketOf(r.date, now);
    let key: string;
    let label: string;
    if (grouping === "date") {
      key = fmtDayKey(r.date);
      label = fmtDayLabel(r.date);
    } else if (bucket === "long") {
      // Long range: 6-month blocks (H1 / H2).
      key = fmtHalfKey(r.date);
      label = fmtHalfLabel(r.date);
    } else {
      key = fmtQuarterKey(r.date);
      label = fmtQuarterLabel(r.date);
    }

    let periodNode = byPeriod.get(key);
    if (!periodNode) {
      periodNode = { label, bucket, regions: new Map() };
      byPeriod.set(key, periodNode);
    }
    let regionMap = periodNode.regions.get(r.region);
    if (!regionMap) {
      regionMap = new Map();
      periodNode.regions.set(r.region, regionMap);
    }
    let proj = regionMap.get(r.projectName);
    if (!proj) {
      proj = {
        projectName: r.projectName,
        ...emptyTotals(),
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
    proj.unassigned += r.unassigned ?? 0;
    if (r.status && !proj.status) proj.status = r.status;
    if (r.note && r.note.trim()) proj.notes.push(r.note.trim());
  }

  const periods: PivotDate[] = [];
  for (const [periodKey, pNode] of byPeriod) {
    const regions: PivotRegion[] = [];
    const dTot = emptyTotals();

    for (const [regionName, projMap] of pNode.regions) {
      const projects = Array.from(projMap.values()).sort((a, b) => a.projectName.localeCompare(b.projectName));
      const rTot = emptyTotals();
      for (const p of projects) {
        rTot.value += p.value;
        rTot.bridges += p.bridges;
        rTot.pan10 += p.pan10;
        rTot.pan12 += p.pan12;
        rTot.pan14 += p.pan14;
        rTot.leed += p.leed;
        rTot.well += p.well;
        rTot.co2 += p.co2;
        rTot.unassigned += p.unassigned;
      }
      dTot.value += rTot.value;
      dTot.bridges += rTot.bridges;
      dTot.pan10 += rTot.pan10;
      dTot.pan12 += rTot.pan12;
      dTot.pan14 += rTot.pan14;
      dTot.leed += rTot.leed;
      dTot.well += rTot.well;
      dTot.co2 += rTot.co2;
      dTot.unassigned += rTot.unassigned;

      regions.push({ region: regionName, ...rTot, projects });
    }
    regions.sort((a, b) => a.region.localeCompare(b.region));
    periods.push({
      dateKey: periodKey,
      dateLabel: pNode.label,
      bucket: pNode.bucket,
      ...dTot,
      regions,
    });
  }

  periods.sort((a, b) => (a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0));
  return periods;
}

/** Headline numbers for the short-term planning windows. */
export function bucketTotals(tree: PivotDate[]): Record<PivotBucket, number> {
  const out: Record<PivotBucket, number> = { past: 0, current: 0, next: 0, long: 0 };
  for (const p of tree) out[p.bucket] += p.value;
  return out;
}

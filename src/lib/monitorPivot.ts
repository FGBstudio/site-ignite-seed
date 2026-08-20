// Pure adapters + pivot builder for Monitor Report.
// Layer 2 (Adapter) + Layer 3 (Aggregator). No React, no side-effects.

import type { MonitorRow } from "@/hooks/useMonitorRows";
import type { AirMonitorRow } from "@/hooks/useAirRows";
import type { WaterMonitorRow } from "@/hooks/useWaterRows";

export type PivotDomain = "energy" | "air" | "water";

/**
 * Where the handover date on a record comes from.
 * "handover" — the certification handover date propagated from Operations.
 * "fallback" — a proxy date (shipment / installation); usable but not contractual.
 * "none"     — no date at all: the record cannot be planned yet.
 */
export type DateSource = "handover" | "fallback" | "none";

/**
 * Which side of the workflow produced the typology/quantity of a record.
 * "monitoring" — Monitoring assigned the devices (technical decision, wins).
 * "request"    — Operations/PM requested them, Monitoring has not decided yet.
 * "none"       — neither: quantity known but typology still unassigned.
 */
export type TypologySource = "monitoring" | "request" | "none";

export interface NormalizedRecord {
  /** Null when no handover date is known — the record lands in the "TBD" bucket. */
  date: Date | null;
  dateSource: DateSource;
  region: string;
  projectName: string;
  /** Units the project needs: already produced + still to produce. */
  value: number;
  /**
   * Units that physically exist: a device has an id only once it has been built,
   * so an assignment is proof of production.
   */
  assigned: number;
  /**
   * Units requested but never given a device id — what production still has to
   * build. This is the remainder of the request, not its gross total, so
   * assigned + requested === value.
   */
  requested: number;
  note?: string | null;
  siteId?: string | null;
  // Hardware breakdown counts — units already produced.
  bridges: number;
  pan10: number;
  pan12: number;
  pan14: number;
  // …and the same breakdown for what still has to be built.
  bridgesToProduce?: number;
  pan10ToProduce?: number;
  pan12ToProduce?: number;
  pan14ToProduce?: number;
  // Typology split of the units ALREADY PRODUCED.
  leed: number;
  well: number;
  co2: number;
  /** CO-CO2 is a different sensor, not a CO2 variant — it gets its own column. */
  coco2: number;
  unassigned?: number;
  // Typology split of the units STILL TO PRODUCE, mirroring the four above.
  leedToProduce?: number;
  wellToProduce?: number;
  co2ToProduce?: number;
  coco2ToProduce?: number;
  unassignedToProduce?: number;
  /** Units per product name — keeps WELL black, CO2 black and CO-CO2 distinct. */
  byProduct?: Record<string, number>;
  typologySource?: TypologySource;
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

// ── Status normalisation ───────────────────────────────────────────────────
//
// fn_recalculate_site_air stores an AGGREGATED string built with
// `string_agg(cnt || ' ' || ship_status, ', ')`, so site_air_records.status
// holds things like "1 Delivered, 3 In Transit". Rendered verbatim that yields
// a different "status" for every combination of counts — the filter dropdown
// fills with noise and no two projects ever share a label.
//
// A project is only as advanced as its least advanced shipment: if anything is
// still in transit the project is in transit, and it is delivered only when
// everything is. So we collapse the aggregate to a single canonical value.

/** Advancement ladder, least advanced first. */
const STATUS_LADDER = ["requested", "assigned", "in_transit", "delivered", "installed"] as const;
export type MonitorStatus = (typeof STATUS_LADDER)[number];

const STATUS_PATTERNS: Array<{ status: MonitorStatus; test: RegExp }> = [
  { status: "requested", test: /\b(requested|upcoming|pending|draft)\b/ },
  { status: "assigned", test: /\b(assigned|awaiting dispatch|allocated)\b/ },
  { status: "in_transit", test: /\b(in[\s_-]?transit|transit|shipped|dispatched)\b/ },
  { status: "delivered", test: /\b(delivered|received)\b/ },
  { status: "installed", test: /\b(installed|online)\b/ },
];

export const STATUS_LABEL: Record<MonitorStatus, string> = {
  requested: "Requested",
  assigned: "Assigned",
  in_transit: "In Transit",
  delivered: "Delivered",
  installed: "Installed",
};

/**
 * Cancellation label, written by fn_recalculate_site_air when a project is
 * cancelled. Deliberately NOT a rung on STATUS_LADDER: the ladder ranks how far
 * along a project is, and "cancelled" is orthogonal to that — folding it in
 * would let a cancelled project win the "least advanced" tie-break and mislabel
 * a whole aggregate.
 */
export const CANCELLED_STATUS = "Cancelled";

/** Both spellings, and the aggregate forms ("2 Cancelled") the column can hold. */
const CANCELLED_TEST = /\bcancell?ed\b/;

/**
 * True when a monitor row belongs to a cancelled project. Such a row still
 * shows — the number it used to need is remembered in its notes — but every
 * quantity it contributes is zero.
 */
export function isCancelledStatus(raw: string | null | undefined): boolean {
  return CANCELLED_TEST.test((raw ?? "").trim().toLowerCase());
}

/**
 * Collapses any status string — plain or count-aggregated — to one canonical
 * value. Statuses that are not shipment states (certification statuses such as
 * `in_corso` or `da_configurare`) are passed through untouched.
 */
export function canonicalStatus(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return null;

  // Checked before the ladder so both spellings collapse to one filter entry
  // instead of two, and so a cancelled row never reads as "Requested".
  if (CANCELLED_TEST.test(s)) return CANCELLED_STATUS;

  const found = STATUS_PATTERNS.filter((p) => p.test.test(s)).map((p) => p.status);
  if (found.length === 0) return raw!.trim();

  // Least advanced wins.
  for (const step of STATUS_LADDER) {
    if (found.includes(step)) return step;
  }
  return raw!.trim();
}

/**
 * Canonical status ready for display and for the filter dropdown: "8 delivered",
 * "1 delivered" and "Delivered" all become the single label "Delivered". The
 * count is dropped on purpose — it already lives in the quantity column, and
 * carrying it inside the label is what gave every project a status of its own.
 */
export function canonicalStatusLabel(raw: string | null | undefined): string | null {
  const canonical = canonicalStatus(raw);
  if (!canonical) return null;
  return STATUS_LABEL[canonical as MonitorStatus] ?? canonical;
}

export type AirTypology = "leed" | "well" | "co2" | "coco2";

/** Display labels for the four typology families. */
export const TYPOLOGY_LABEL: Record<AirTypology, string> = {
  leed: "LEED",
  well: "WELL",
  co2: "CO2",
  coco2: "CO-CO2",
};

/** Maps an AIR product name (products.name) to its typology bucket. */
export function typologyFromProductName(name: string | null | undefined): AirTypology | null {
  const n = (name ?? "").toLowerCase();
  if (!n) return null;
  // "co-co" must be tested before "co2": "CO-CO2 ClAir" contains both, and it is
  // a different sensor (CO + CO2), not a CO2 variant.
  if (n.includes("co-co")) return "coco2";
  // CO2 next: "CO2 ClAir" contains no "well"/"leed", but WELL/LEED product names
  // never contain "co2".
  if (n.includes("co2")) return "co2";
  if (n.includes("leed")) return "leed";
  if (n.includes("well")) return "well";
  return null;
}

/** Zeroed family counter — one place to add a family. */
export function emptyTypologies(): Record<AirTypology, number> {
  return { leed: 0, well: 0, co2: 0, coco2: 0 };
}

/** Sum of a family counter, so callers stop enumerating the keys by hand. */
export function typologyTotal(counts: Record<AirTypology, number>): number {
  return counts.leed + counts.well + counts.co2 + counts.coco2;
}

/**
 * Counts how many units of each typology a product-id list represents.
 *
 * `air_product_ids` is a MULTISET: the same product id repeated N times means
 * N devices of that product (this is how AirTable renders "3x WELL ClAir").
 * Splitting evenly across the distinct typologies — as this module used to do —
 * threw those quantities away and pushed whole projects into a single bucket.
 */
export function countTypologies(
  productIds: string[] | null | undefined,
  productNameById?: Map<string, string>,
): Record<AirTypology, number> {
  const out = emptyTypologies();
  for (const pid of productIds ?? []) {
    const t = typologyFromProductName(productNameById?.get(pid));
    if (t) out[t] += 1;
  }
  return out;
}

/**
 * Counts units per PRODUCT (by product name), not per typology family.
 *
 * The catalogue distinguishes products the three families collapse together —
 * "WELL ClAir" vs "WELL ClAir black", "CO2 ClAir" vs "CO2 ClAir black" vs
 * "CO-CO2 ClAir". Production has to build the right SKU, so the report keeps
 * them apart and only aggregates into families for the headline figures.
 */
export function countProducts(
  productIds: string[] | null | undefined,
  productNameById?: Map<string, string>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const pid of productIds ?? []) {
    const name = productNameById?.get(pid);
    if (!name) continue;
    out[name] = (out[name] ?? 0) + 1;
  }
  return out;
}

/**
 * Distributes `total` units over arbitrary keyed counts, preserving proportions
 * and guaranteeing that the allocated parts sum exactly to `total`.
 * When nothing is known, everything falls into `unassigned`.
 */
export function distribute(
  total: number,
  counts: Record<string, number>,
): { allocated: Record<string, number>; unassigned: number } {
  const keys = Object.keys(counts).filter((k) => counts[k] > 0);
  const sum = keys.reduce((s, k) => s + counts[k], 0);
  if (sum <= 0 || total <= 0) {
    return { allocated: {}, unassigned: Math.max(0, total) };
  }
  // When the multiset already accounts for every device, use it verbatim.
  if (sum === total) {
    const exact: Record<string, number> = {};
    for (const k of keys) exact[k] = counts[k];
    return { allocated: exact, unassigned: 0 };
  }
  // Otherwise scale proportionally, then hand the rounding remainder to the
  // largest fractional parts so the row still adds up to the control total.
  const scaled = keys.map((k) => ({ k, exact: (total * counts[k]) / sum }));
  const allocated: Record<string, number> = {};
  for (const s of scaled) allocated[s.k] = Math.floor(s.exact);
  let remainder = total - keys.reduce((s, k) => s + allocated[k], 0);
  const byFraction = [...scaled].sort(
    (a, b) => (b.exact - Math.floor(b.exact)) - (a.exact - Math.floor(a.exact)),
  );
  let i = 0;
  while (remainder > 0 && byFraction.length > 0) {
    allocated[byFraction[i % byFraction.length].k] += 1;
    remainder -= 1;
    i += 1;
  }
  return { allocated, unassigned: 0 };
}

/**
 * Family-level split (LEED / WELL / CO2 / CO-CO2), used for the headline figures.
 * Guarantees leed + well + co2 + coco2 + unassigned === total.
 */
export function splitByTypology(
  total: number,
  counts: Record<AirTypology, number>,
): { leed: number; well: number; co2: number; coco2: number; unassigned: number } {
  const { allocated, unassigned } = distribute(total, counts as Record<string, number>);
  return {
    leed: allocated.leed ?? 0,
    well: allocated.well ?? 0,
    co2: allocated.co2 ?? 0,
    coco2: allocated.coco2 ?? 0,
    unassigned,
  };
}

function sumCounts(counts: Record<string, number>): number {
  return Object.values(counts).reduce((s, n) => s + n, 0);
}

/**
 * Attribution for counts that are an explicit itemisation rather than a label.
 *
 * `distribute` scales a mix up to the control total, which is right for
 * `air_product_ids`: 156 rows carry a single product id standing for every
 * sensor on the row. It is wrong for a request, where `requested_quantity` is a
 * stated number — stretching "5 WELL black" over a 20-sensor row invents a
 * typology for 15 units nobody ever named. Those stay unassigned instead.
 *
 * When the itemisation exceeds the total it is scaled down, since the row's own
 * count is the control figure.
 */
function distributeExplicit(
  total: number,
  counts: Record<string, number>,
): { allocated: Record<string, number>; unassigned: number } {
  const sum = sumCounts(counts);
  if (sum <= 0 || total <= 0) return { allocated: {}, unassigned: Math.max(0, total) };
  if (sum > total) return distribute(total, counts);
  const allocated: Record<string, number> = {};
  for (const [name, qty] of Object.entries(counts)) if (qty > 0) allocated[name] = qty;
  return { allocated, unassigned: total - sum };
}

/**
 * Drops products whose name maps to no family. Their units are not silently
 * folded into a neighbouring column: `distribute` leaves them in "Unassigned",
 * which is the honest answer when the typology is unknown.
 */
function keepTypedProducts(byProduct: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [name, qty] of Object.entries(byProduct)) {
    if (qty > 0 && typologyFromProductName(name)) out[name] = qty;
  }
  return out;
}

/** Rolls a per-product breakdown up into the typology families. */
export function familiesOf(byProduct: Record<string, number>): Record<AirTypology, number> {
  const out = emptyTypologies();
  for (const [name, qty] of Object.entries(byProduct)) {
    const family = typologyFromProductName(name);
    if (family) out[family] += qty;
  }
  return out;
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

/** Requested (not yet assigned) demand for one certification, per domain. */
/** Demand indexed both ways; see useRequestedDemand for why both are needed. */
export interface RequestedDemandMaps {
  byCertification: Map<string, RequestedDemand>;
  bySite: Map<string, RequestedDemand>;
}

export interface RequestedDemand {
  /** Units still to produce: requested and not yet shipped or installed. */
  quantity: number;
  /**
   * Units already shipped or installed. Not demand, so never part of
   * `quantity` — kept only to discount the floor `total_sensors` sets on an
   * Upcoming row, which counts every live allocation regardless of stage.
   */
  servedQuantity?: number;
  /**
   * Units belonging to a project on hold. Neither demand nor delivered:
   * suspended. They keep their place in the Monitor Hub, where the row still
   * states what the project will need, and count zero everywhere the report
   * asks what to order.
   */
  heldQuantity?: number;
  /** Requested typology mix, when the request names specific AIR products. */
  typologies?: Record<AirTypology, number>;
  /** Requested mix per product name, so requested SKUs stay distinct too. */
  byProduct?: Record<string, number>;
  /** Requested delivery date on site (handover − lead time). */
  targetDate?: string | null;
}

function resolveDate(
  primary: string | null | undefined,
  fallback?: string | null | undefined,
): { date: Date | null; dateSource: DateSource } {
  const p = parseDate(primary);
  if (p) return { date: p, dateSource: "handover" };
  const f = parseDate(fallback);
  if (f) return { date: f, dateSource: "fallback" };
  return { date: null, dateSource: "none" };
}

/** The four ENERGY buckets the report reports on. */
export type EnergyBucket = "bridges" | "pan10" | "pan12" | "pan14";

/**
 * Maps an ENERGY product or hardware_type to its report bucket.
 * Live values on hardwares.hardware_type: Bridge-LAN, Bridge-LTE, FGB-10,
 * FGB-12, FGB-14, Mango. Catalogue names differ slightly ("FGB Bridge LAN"),
 * so both spellings are handled. Mango maps to nothing: it has never had a
 * column in this report.
 */
export function energyBucketFromName(name: string | null | undefined): EnergyBucket | null {
  const n = (name ?? "").toLowerCase();
  if (!n) return null;
  if (n.includes("bridge")) return "bridges";
  if (n.includes("10")) return "pan10";
  if (n.includes("12")) return "pan12";
  if (n.includes("14")) return "pan14";
  return null;
}

export function adaptEnergy(
  rows: MonitorRow[],
  requestedByCertId?: Map<string, RequestedDemand>,
): NormalizedRecord[] {
  const out: NormalizedRecord[] = [];
  for (const r of rows) {
    // Never fall back to created_at / today: a record with no handover date is
    // not "due this quarter", it is unplannable and must say so.
    const { date, dateSource } = resolveDate(r.handover_date, r.installation_date);
    const req = r.certification_id ? requestedByCertId?.get(r.certification_id) : undefined;

    // Produced units come from the physical inventory, not from the counters on
    // site_energy_records. Those counters are hand-maintained and drift: they
    // total 801 against 648 devices actually assigned, and the 10 rows in status
    // 'Active' declare zero while holding 76 real pieces. `hardwares` is where a
    // device gets an id, so it is the only proof that one exists.
    const hasHardwareCounts = r.produced_bridges != null;
    const b = hasHardwareCounts ? Number(r.produced_bridges ?? 0) : Number(r.total_bridges ?? 0);
    const p10 = hasHardwareCounts ? Number(r.produced_pan10 ?? 0) : Number(r.no_pan10 ?? 0);
    const p12 = hasHardwareCounts ? Number(r.produced_pan12 ?? 0) : Number(r.no_pan12 ?? 0);
    const p14 = hasHardwareCounts ? Number(r.produced_pan14 ?? 0) : Number(r.no_pan14 ?? 0);
    // Devices outside the four buckets exist and must be counted; they land in
    // "Other" rather than being dropped, exactly as unmapped AIR products do.
    const other = hasHardwareCounts ? Number(r.produced_other ?? 0) : 0;
    const produced = b + p10 + p12 + p14 + other;

    // Requested but never given a device id — the production order.
    const askedFor = Number(req?.quantity ?? 0);
    const toProduce = Math.max(askedFor - produced, 0);

    // The request names products; spread it over the buckets it actually names,
    // never stretched (the quantities are explicit), remainder left in "Other".
    const requestedByBucket: Record<string, number> = {};
    for (const [name, qty] of Object.entries(req?.byProduct ?? {})) {
      const bucket = energyBucketFromName(name);
      if (bucket && qty > 0) requestedByBucket[bucket] = (requestedByBucket[bucket] ?? 0) + qty;
    }
    const toProduceSplit = distributeExplicit(toProduce, requestedByBucket);

    // Per-SKU breakdown across both halves, so Energy gets the same chips and
    // tooltip as AIR: "3× FGB-12" says what to build, "Pan-12" does not.
    const byProduct: Record<string, number> = { ...(r.produced_by_type ?? {}) };
    if (toProduce > 0) {
      const requestedNames = Object.entries(req?.byProduct ?? {}).filter(([, q]) => q > 0);
      const requestedTotal = requestedNames.reduce((s, [, q]) => s + q, 0);
      for (const [name, qty] of requestedNames) {
        // Scale the request down to the part still outstanding, so the chips
        // describe what is left to build rather than the original order.
        const share = requestedTotal > 0 ? Math.round((qty * toProduce) / requestedTotal) : 0;
        if (share > 0) byProduct[name] = (byProduct[name] ?? 0) + share;
      }
    }

    const tot = produced + toProduce;

    out.push({
      date,
      dateSource,
      region: macroRegion(r.region, r.country),
      projectName: buildLabel(r.brand_name, r.city, r.project_name || r.brand_name),
      value: tot,
      assigned: produced,
      requested: toProduce,
      note: r.notes ?? null,
      siteId: r.site_id || r.id || null,
      bridges: b,
      pan10: p10,
      pan12: p12,
      pan14: p14,
      bridgesToProduce: toProduceSplit.allocated.bridges ?? 0,
      pan10ToProduce: toProduceSplit.allocated.pan10 ?? 0,
      pan12ToProduce: toProduceSplit.allocated.pan12 ?? 0,
      pan14ToProduce: toProduceSplit.allocated.pan14 ?? 0,
      leed: 0,
      well: 0,
      co2: 0,
      coco2: 0,
      // "Other": devices that exist but sit outside the four buckets…
      unassigned: other,
      // …and units the request did not attribute to any of them (Mango, Greeny,
      // or a generic placeholder). Both count in the total; neither has a column.
      unassignedToProduce: toProduceSplit.unassigned,
      byProduct,
      // Nothing describes this project's mix when neither side names a product,
      // which is what the "NO TYPOLOGY" marker is for.
      typologySource:
        produced > 0 ? "monitoring" : sumCounts(requestedByBucket) > 0 ? "request" : "none",
      status: canonicalStatusLabel(r.status),
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
 *
 * Typology precedence, per the agreed workflow:
 *   1. Monitoring's assignment (`site_air_records.air_product_ids`) — Monitoring
 *      has the technical competence and may deliberately assign a typology other
 *      than the one requested, so its decision wins whenever it exists.
 *   2. The Operations/PM request (`project_allocations`), when Monitoring has
 *      not decided yet — this is what keeps planned-but-unassigned demand visible.
 *   3. Neither → "Unassigned", surfaced as its own column instead of being
 *      silently folded into WELL.
 */
export function adaptAir(
  rows: AirMonitorRow[],
  productNameById?: Map<string, string>,
  requested?: RequestedDemandMaps,
): NormalizedRecord[] {
  const out: NormalizedRecord[] = [];
  for (const r of rows) {
    // site_air_records holds one row per SITE, so the demand has to be read per
    // site too. A site certified under several schemas splits its requests
    // across those certifications, and reading only the one this record points
    // at lost the rest — Offices HQ showed 5 WELL black and buried its 15
    // CO-CO2 black under "Unassigned" because they hang off a sibling
    // certification. The certification lookup stays as a fallback for records
    // whose certification carries no site.
    const req =
      (r.id ? requested?.bySite?.get(r.id) : undefined) ??
      (r.certification_id ? requested?.byCertification?.get(r.certification_id) : undefined);
    const { date, dateSource } = resolveDate(r.handover_date, r.latest_shipment_date);

    // A device only has an id once it physically exists, so `total_sensors` is
    // the count of units already PRODUCED — except on rows the recalculation
    // marked "Upcoming", where no hardware is attached at all and the column
    // holds the pending request instead. That status is an exact discriminator:
    // measured on 2026-08-06, all 92 Upcoming rows have zero hardware and none
    // of the other 277 is Upcoming.
    const isUpcoming = /^\s*upcoming\s*$/i.test(r.status ?? "");

    // A cancelled project contributes nothing to either half. The row survives —
    // it names a project that existed, and the count it used to need is spelled
    // out in its notes — but it must not add a single unit to any total.
    //
    // Enforced here as well as in fn_recalculate_site_air, which zeroes
    // total_sensors: the demand half does not come from that column at all, it
    // comes from project_allocations via useRequestedDemand, so zeroing the
    // record alone would still let a cancelled project ask for sensors.
    const isCancelled = isCancelledStatus(r.status);

    const declared = isCancelled ? 0 : Number(r.total_sensors ?? 0);
    const produced = isUpcoming ? 0 : declared;

    // What the project asked for, across every live allocation status.
    //
    // On an Upcoming row the stored count IS a statement of demand, and it is
    // not always recoverable from project_allocations: 44 air records exist with
    // no certification at all — projects created straight in the monitor — so
    // there is no allocation keyed to them. Reading only the allocations made
    // those 38 sensors vanish from the report, Kering Eyewear's 20 among them.
    // Taking the larger of the two keeps them while still letting a fuller
    // allocation (420 units against 302 declared) win where both exist.
    // `declared` is a floor, not a truth: on an Upcoming row it counts every
    // live allocation, shipped and installed ones included. Discount those, or
    // a fully served project would come back as demand through the floor —
    // BAY Cappagh Ratoath Road, 127 units, is exactly that case.
    // Suspended units are discounted from the floor for the same reason served
    // ones are: on an Upcoming row `declared` is the whole request, so a project
    // put on hold would climb straight back into the production order through
    // the floor even though its allocations no longer count as demand.
    const served = Number(req?.servedQuantity ?? 0);
    const held = Number(req?.heldQuantity ?? 0);
    const declaredFloor = isUpcoming ? Math.max(declared - served - held, 0) : 0;
    const askedFor = isCancelled ? 0 : Math.max(Number(req?.quantity ?? 0), declaredFloor);
    // Units still to build: a request that has not been given an id yet.
    const toProduce = Math.max(askedFor - produced, 0);
    // The project needs both halves; they never double-count because toProduce
    // is the remainder of the request beyond what already exists.
    const tot = produced + toProduce;

    // Each half is split by its OWN mix: Monitoring's assignment describes the
    // devices that exist, the request describes the ones that do not yet. Using
    // one source for both — as this did before — attributed produced units to a
    // typology the request had named but Monitoring had not chosen.
    const monitoringByProduct = keepTypedProducts(countProducts(r.air_product_ids, productNameById));
    const requestedByProduct = keepTypedProducts(req?.byProduct ?? {});

    let typologySource: TypologySource;
    // Nothing is being built, so no mix describes this row — claiming one would
    // put a "NO TYPOLOGY"-style attribution on units that do not exist.
    if (isCancelled) typologySource = "none";
    else if (sumCounts(monitoringByProduct) > 0) typologySource = "monitoring";
    else if (sumCounts(requestedByProduct) > 0) typologySource = "request";
    else typologySource = "none";

    // Produced units follow Monitoring's own list, which labels the whole row.
    const producedSplit = sumCounts(monitoringByProduct) > 0
      ? distribute(produced, monitoringByProduct)
      : distributeExplicit(produced, requestedByProduct);

    // Units still to build follow the request, whose quantities are explicit and
    // must not be stretched. Monitoring's list is the fallback only when the
    // request itemises nothing at all.
    const toProduceSplit = sumCounts(requestedByProduct) > 0
      ? distributeExplicit(toProduce, requestedByProduct)
      : distribute(toProduce, monitoringByProduct);
    const producedFam = familiesOf(producedSplit.allocated);
    const toProduceFam = familiesOf(toProduceSplit.allocated);

    // Per-SKU breakdown covers both halves: production needs the whole picture.
    const byProduct: Record<string, number> = { ...producedSplit.allocated };
    for (const [name, qty] of Object.entries(toProduceSplit.allocated)) {
      byProduct[name] = (byProduct[name] ?? 0) + qty;
    }

    out.push({
      date,
      dateSource,
      region: macroRegion(r.region, r.country),
      projectName: buildLabel(r.brand_name, r.city, r.project_name),
      value: tot,
      assigned: produced,
      requested: toProduce,
      note: r.notes ?? null,
      siteId: r.id || null, // AirMonitorRow.id is the site_id
      bridges: 0,
      pan10: 0,
      pan12: 0,
      pan14: 0,
      leed: producedFam.leed,
      well: producedFam.well,
      co2: producedFam.co2,
      coco2: producedFam.coco2,
      unassigned: producedSplit.unassigned,
      leedToProduce: toProduceFam.leed,
      wellToProduce: toProduceFam.well,
      co2ToProduce: toProduceFam.co2,
      coco2ToProduce: toProduceFam.coco2,
      unassignedToProduce: toProduceSplit.unassigned,
      byProduct,
      typologySource,
      status: canonicalStatusLabel(r.status),
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

export function adaptWater(
  rows: WaterMonitorRow[],
  requestedByCertId?: Map<string, RequestedDemand>,
): NormalizedRecord[] {
  const out: NormalizedRecord[] = [];
  for (const r of rows) {
    // Water used to drop undated rows entirely, which hid real demand.
    // They now land in the TBD bucket like every other domain.
    const { date, dateSource } = resolveDate(r.handover_date);
    const req = r.certification_id ? requestedByCertId?.get(r.certification_id) : undefined;
    const assigned = Number(r.total_sensors ?? 0);
    const requested = Number(req?.quantity ?? 0);
    out.push({
      date,
      dateSource,
      region: macroRegion(r.region, r.country),
      projectName: buildLabel(r.brand_name, r.city, r.project_name),
      value: assigned > 0 ? assigned : requested,
      assigned,
      requested,
      note: r.notes ?? null,
      siteId: r.id || null,
      bridges: 0,
      pan10: 0,
      pan12: 0,
      pan14: 0,
      leed: 0,
      well: 0,
      co2: 0,
      coco2: 0,
      unassigned: 0,
      typologySource: assigned > 0 ? "monitoring" : requested > 0 ? "request" : "none",
      status: canonicalStatusLabel(r.status),
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
export interface PivotTotals {
  value: number;
  assigned: number;
  requested: number;
  bridges: number;
  pan10: number;
  pan12: number;
  pan14: number;
  bridgesToProduce: number;
  pan10ToProduce: number;
  pan12ToProduce: number;
  pan14ToProduce: number;
  leed: number;
  well: number;
  co2: number;
  coco2: number;
  unassigned: number;
  leedToProduce: number;
  wellToProduce: number;
  co2ToProduce: number;
  coco2ToProduce: number;
  unassignedToProduce: number;
  /** Units per product name, summed across every record in this node. */
  byProduct: Record<string, number>;
}

export interface PivotProject extends PivotTotals {
  projectName: string;
  status?: string | null;
  notes: string[];
  /** Exact handover dates behind this row (dd/mm/yyyy), for month-grouped views. */
  dates: string[];
  /** True when at least one contributing record has no contractual handover date. */
  hasFallbackDate: boolean;
  typologySource?: TypologySource;
  isEstimated?: boolean;
}

export interface PivotRegion extends PivotTotals {
  region: string;
  projects: PivotProject[];
}

/** Short-term planning buckets required by the business. */
export type PivotBucket = "past" | "current" | "next" | "long" | "tbd";

export const BUCKET_LABEL: Record<PivotBucket, string> = {
  past: "Overdue — handover date already passed",
  current: "Closing now — current quarter (in scadenza)",
  next: "Mid-construction — next quarter",
  long: "Long-range forecast (6-month blocks)",
  tbd: "Handover date to be defined — not plannable yet",
};

/**
 * Bucket names for the Excel source sheet, whose headers are in Italian.
 * Typed against PivotBucket so a new bucket cannot be added on screen and
 * forgotten here.
 */
export const BUCKET_LABEL_IT: Record<PivotBucket, string> = {
  past: "Arretrati",
  current: "Trimestre corrente",
  next: "Trimestre successivo",
  long: "Lungo periodo",
  tbd: "Senza data",
};

/** Reading resolution of a period node, derived from its distance from today. */
export type PeriodGranularity = "day" | "month" | "half" | "none";

export interface PivotPeriod extends PivotTotals {
  dateKey: string;   // sortable key (yyyy-mm-dd | yyyy-mm | yyyy-Hn | TBD)
  dateLabel: string; // human label
  bucket: PivotBucket;
  granularity: PeriodGranularity;
  regions: PivotRegion[];
}

/** Back-compat alias: the tree node used to be called PivotDate. */
export type PivotDate = PivotPeriod;
export type PivotGrouping = "quarter" | "date";

export interface PivotOptions {
  /** Reference "today". Injectable so the bucketing is testable. */
  now?: Date;
  /** Drop everything whose handover date is already in the past. */
  hidePast?: boolean;
  /**
   * Shift every date backwards by N days before bucketing, to plan on the
   * "material on site" date rather than the handover date. Mirrors the
   * 15-day lead time that project_allocations.target_date already uses.
   */
  offsetDays?: number;
  /** Force a single resolution instead of the adaptive day/month/half rule. */
  grouping?: PivotGrouping;
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

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const QUARTER_MONTHS = ["Jan–Mar", "Apr–Jun", "Jul–Sep", "Oct–Dec"];

export function quarterOf(d: Date): number {
  return Math.floor(d.getMonth() / 3) + 1; // 1..4
}

/** Absolute quarter index used to compare periods (year * 4 + quarter). */
function quarterIndex(d: Date): number {
  return d.getFullYear() * 4 + (quarterOf(d) - 1);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d.getTime());
  out.setDate(out.getDate() + days);
  return out;
}

function addMonths(d: Date, months: number): Date {
  const out = new Date(d.getTime());
  out.setMonth(out.getMonth() + months);
  return out;
}

function fmtMonthKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
function fmtMonthLabel(d: Date): string {
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()} · Q${quarterOf(d)}`;
}
function fmtHalfKey(d: Date): string {
  return `${d.getFullYear()}-H${d.getMonth() < 6 ? 1 : 2}`;
}
function fmtHalfLabel(d: Date): string {
  return d.getMonth() < 6 ? `H1 ${d.getFullYear()} (Jan–Jun)` : `H2 ${d.getFullYear()} (Jul–Dec)`;
}

export function fmtQuarterLabel(d: Date): string {
  const q = quarterOf(d);
  return `Q${q} ${d.getFullYear()} (${QUARTER_MONTHS[q - 1]})`;
}

/**
 * Horizon bucket.
 *
 * "past" is day-based (anything before today), so the hide-past flag does what
 * it says. Everything else is quarter-based, because the company plans on
 * calendar quarters — Jan–Mar, Apr–Jun, Jul–Sep, Oct–Dec — and nothing else.
 */
export function bucketOf(d: Date | null, now: Date = new Date()): PivotBucket {
  if (!d) return "tbd";
  const today = startOfDay(now);
  if (startOfDay(d) < today) return "past";
  const delta = quarterIndex(d) - quarterIndex(now);
  if (delta <= 0) return "current";
  if (delta === 1) return "next";
  return "long";
}

/**
 * Reading resolution for a date:
 *   • today → +1 month      : exact day (what is closing right now)
 *   • +1 month → quarter end : month, so the quarter reads at a glance
 *   • beyond the next quarter: 6-month block
 *   • overdue                : month
 */
export function granularityOf(d: Date | null, now: Date = new Date()): PeriodGranularity {
  if (!d) return "none";
  const bucket = bucketOf(d, now);
  if (bucket === "tbd") return "none";
  if (bucket === "past") return "month";
  if (bucket === "long") return "half";
  return startOfDay(d) <= startOfDay(addMonths(now, 1)) ? "day" : "month";
}

function emptyTotals(): PivotTotals {
  return {
    value: 0, assigned: 0, requested: 0,
    bridges: 0, pan10: 0, pan12: 0, pan14: 0,
    bridgesToProduce: 0, pan10ToProduce: 0, pan12ToProduce: 0, pan14ToProduce: 0,
    leed: 0, well: 0, co2: 0, coco2: 0, unassigned: 0,
    leedToProduce: 0, wellToProduce: 0, co2ToProduce: 0, coco2ToProduce: 0, unassignedToProduce: 0,
    byProduct: {},
  };
}

function addInto(target: PivotTotals, src: PivotTotals): void {
  target.value += src.value;
  target.assigned += src.assigned;
  target.requested += src.requested;
  target.bridges += src.bridges;
  target.pan10 += src.pan10;
  target.pan12 += src.pan12;
  target.pan14 += src.pan14;
  target.bridgesToProduce += src.bridgesToProduce;
  target.pan10ToProduce += src.pan10ToProduce;
  target.pan12ToProduce += src.pan12ToProduce;
  target.pan14ToProduce += src.pan14ToProduce;
  target.leed += src.leed;
  target.well += src.well;
  target.co2 += src.co2;
  target.coco2 += src.coco2;
  target.unassigned += src.unassigned;
  target.leedToProduce += src.leedToProduce;
  target.wellToProduce += src.wellToProduce;
  target.co2ToProduce += src.co2ToProduce;
  target.coco2ToProduce += src.coco2ToProduce;
  target.unassignedToProduce += src.unassignedToProduce;
  for (const [name, qty] of Object.entries(src.byProduct ?? {})) {
    target.byProduct[name] = (target.byProduct[name] ?? 0) + qty;
  }
}

/** Every product name present anywhere in the tree, for the dynamic columns. */
export function productKeysOf(tree: PivotPeriod[]): string[] {
  const keys = new Set<string>();
  for (const p of tree) for (const k of Object.keys(p.byProduct ?? {})) keys.add(k);
  return Array.from(keys).sort((a, b) => a.localeCompare(b));
}

/** Sort order of the horizon bands in the table. */
const BUCKET_ORDER: Record<PivotBucket, number> = { past: 0, current: 1, next: 2, long: 3, tbd: 4 };

export function buildPivotTree(
  records: NormalizedRecord[],
  options: PivotOptions = {},
): PivotPeriod[] {
  const now = options.now ?? new Date();
  const offsetDays = options.offsetDays ?? 0;

  const byPeriod = new Map<
    string,
    {
      label: string;
      bucket: PivotBucket;
      granularity: PeriodGranularity;
      sortKey: string;
      regions: Map<string, Map<string, PivotProject>>;
    }
  >();

  for (const r of records) {
    // Planning date: the handover, optionally pulled forward by the lead time
    // needed to have the material on site.
    const planDate = r.date && offsetDays ? addDays(r.date, -offsetDays) : r.date;

    const bucket = bucketOf(planDate, now);
    if (bucket === "past" && options.hidePast) continue;

    let granularity = granularityOf(planDate, now);
    if (options.grouping === "date" && planDate) granularity = "day";

    let key: string;
    let label: string;
    if (!planDate) {
      key = "TBD";
      label = "Handover to be defined";
    } else if (granularity === "day") {
      key = fmtDayKey(planDate);
      label = fmtDayLabel(planDate);
    } else if (granularity === "half") {
      key = fmtHalfKey(planDate);
      label = fmtHalfLabel(planDate);
    } else {
      key = fmtMonthKey(planDate);
      label = fmtMonthLabel(planDate);
    }

    // Day nodes only ever cover dates inside the 1-month window, month nodes only
    // dates after it — so a month node sorts at the END of its month, otherwise
    // "2026-09" would jump ahead of the "04/09" day node next to it.
    const chronoKey =
      granularity === "month" ? `${key}-99` : key === "TBD" ? "9999" : key;

    let periodNode = byPeriod.get(key);
    if (!periodNode) {
      periodNode = {
        label,
        bucket,
        granularity,
        // Bands first, then chronology; TBD has no date so it sorts last.
        sortKey: `${BUCKET_ORDER[bucket]}::${chronoKey}`,
        regions: new Map(),
      };
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
        dates: [],
        hasFallbackDate: false,
        typologySource: r.typologySource,
        isEstimated: r.isEstimated,
      };
      regionMap.set(r.projectName, proj);
    }
    addInto(proj, {
      ...emptyTotals(),
      value: Number.isFinite(r.value) ? r.value : 0,
      assigned: r.assigned ?? 0,
      requested: r.requested ?? 0,
      bridges: r.bridges,
      pan10: r.pan10,
      pan12: r.pan12,
      pan14: r.pan14,
      bridgesToProduce: r.bridgesToProduce ?? 0,
      pan10ToProduce: r.pan10ToProduce ?? 0,
      pan12ToProduce: r.pan12ToProduce ?? 0,
      pan14ToProduce: r.pan14ToProduce ?? 0,
      leed: r.leed,
      well: r.well,
      co2: r.co2,
      coco2: r.coco2,
      unassigned: r.unassigned ?? 0,
      leedToProduce: r.leedToProduce ?? 0,
      wellToProduce: r.wellToProduce ?? 0,
      co2ToProduce: r.co2ToProduce ?? 0,
      coco2ToProduce: r.coco2ToProduce ?? 0,
      unassignedToProduce: r.unassignedToProduce ?? 0,
      byProduct: r.byProduct ?? {},
    });
    if (r.status && !proj.status) proj.status = r.status;
    if (r.note && r.note.trim()) proj.notes.push(r.note.trim());
    // Keep the exact handover visible even when the row is grouped by month.
    if (r.date) {
      const exact = fmtDayLabel(r.date);
      if (!proj.dates.includes(exact)) proj.dates.push(exact);
    }
    if (r.dateSource !== "handover") proj.hasFallbackDate = true;
    // A Monitoring decision on any contributing record wins for the whole row.
    if (r.typologySource === "monitoring") proj.typologySource = "monitoring";
  }

  const periods: Array<PivotPeriod & { __sort: string }> = [];
  for (const [periodKey, pNode] of byPeriod) {
    const regions: PivotRegion[] = [];
    const pTot = emptyTotals();

    for (const [regionName, projMap] of pNode.regions) {
      const projects = Array.from(projMap.values()).sort((a, b) => a.projectName.localeCompare(b.projectName));
      const rTot = emptyTotals();
      for (const p of projects) {
        p.dates.sort();
        addInto(rTot, p);
      }
      addInto(pTot, rTot);
      regions.push({ region: regionName, ...rTot, projects });
    }
    regions.sort((a, b) => a.region.localeCompare(b.region));
    periods.push({
      dateKey: periodKey,
      dateLabel: pNode.label,
      bucket: pNode.bucket,
      granularity: pNode.granularity,
      ...pTot,
      regions,
      __sort: pNode.sortKey,
    });
  }

  periods.sort((a, b) => (a.__sort < b.__sort ? -1 : a.__sort > b.__sort ? 1 : 0));
  return periods.map(({ __sort, ...period }) => period);
}

/** Headline numbers per horizon band, with the full hardware breakdown. */
export function bucketTotals(tree: PivotPeriod[]): Record<PivotBucket, PivotTotals> {
  const out: Record<PivotBucket, PivotTotals> = {
    past: emptyTotals(),
    current: emptyTotals(),
    next: emptyTotals(),
    long: emptyTotals(),
    tbd: emptyTotals(),
  };
  for (const p of tree) addInto(out[p.bucket], p);
  return out;
}

// ── Shared headline blocks ──────────────────────────────────────────────────
//
// The cards on screen, the cards in the PDF and the reconciliation sheet of the
// Excel all read this one function. Nothing downstream derives a horizon of its
// own: the export doing exactly that is how the PDF came to contradict the
// table it was printed from — rolling 30/90-day windows against calendar
// quarters, two cards against four, and a cumulative second card against
// per-period ones.

function startOfQuarter(d: Date): Date {
  return new Date(d.getFullYear(), (quarterOf(d) - 1) * 3, 1);
}

/** Day 0 of the following month is the last day of this one. */
function endOfQuarter(d: Date): Date {
  const s = startOfQuarter(d);
  return new Date(s.getFullYear(), s.getMonth() + 3, 0);
}

function fmtRangeDay(d: Date): string {
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

export interface Headline {
  key: PivotBucket;
  label: string;
  hint: string;
  /** The window spelled out, so nobody has to infer what the label covers. */
  range: string;
  totals: PivotTotals;
  /** True when the table below is hiding these rows from view. */
  hiddenInTable: boolean;
  /** TBD is a warning line rather than one of the four horizon cards. */
  isCard: boolean;
}

/**
 * Headline blocks for every bucket, with the calendar window each one spans.
 *
 * `byBucket` must come from a tree built with `hidePast: false` — hiding past
 * rows is a display choice, and the Overdue card has to keep reporting them.
 * The boundaries below are derived from the same quarter arithmetic `bucketOf`
 * uses, so a card can never claim a window the bucketing does not honour.
 */
export function buildHeadlines(
  byBucket: Record<PivotBucket, PivotTotals>,
  now: Date = new Date(),
  hidePast = false,
): Headline[] {
  const today = startOfDay(now);
  const curEnd = endOfQuarter(today);
  const nextStart = addDays(curEnd, 1);
  const nextEnd = endOfQuarter(nextStart);
  const longStart = addDays(nextEnd, 1);

  return [
    {
      key: "current", label: "Closing this quarter", hint: "In scadenza",
      range: `${fmtRangeDay(today)} – ${fmtRangeDay(curEnd)}`,
      totals: byBucket.current, hiddenInTable: false, isCard: true,
    },
    {
      key: "next", label: "Next quarter", hint: "Mid-construction",
      range: `${fmtRangeDay(nextStart)} – ${fmtRangeDay(nextEnd)}`,
      totals: byBucket.next, hiddenInTable: false, isCard: true,
    },
    {
      key: "long", label: "Long-range forecast", hint: "6-month blocks",
      range: `from ${fmtRangeDay(longStart)}`,
      totals: byBucket.long, hiddenInTable: false, isCard: true,
    },
    {
      key: "past", label: "Overdue",
      hint: hidePast ? "Hidden in the table below" : "Handover already passed",
      range: `before ${fmtRangeDay(today)}`,
      totals: byBucket.past, hiddenInTable: hidePast, isCard: true,
    },
    {
      key: "tbd", label: "No handover date", hint: "Not plannable yet",
      range: "handover date missing",
      totals: byBucket.tbd, hiddenInTable: false, isCard: false,
    },
  ];
}

// ── Long (source) table ─────────────────────────────────────────────────────

/** Fields carried by both a record and an aggregated node, so one table serves both. */
type TypologyField = keyof PivotTotals & keyof NormalizedRecord;

/** Typology columns per domain: label, produced field, still-to-produce field. */
const LONG_TYPOLOGIES: Record<PivotDomain, Array<[string, TypologyField, TypologyField]>> = {
  air: [
    ["LEED", "leed", "leedToProduce"],
    ["WELL", "well", "wellToProduce"],
    ["CO2", "co2", "co2ToProduce"],
    ["CO-CO2", "coco2", "coco2ToProduce"],
    ["Unassigned", "unassigned", "unassignedToProduce"],
  ],
  energy: [
    ["Bridge", "bridges", "bridgesToProduce"],
    ["Pan-10", "pan10", "pan10ToProduce"],
    ["Pan-12", "pan12", "pan12ToProduce"],
    ["Pan-14", "pan14", "pan14ToProduce"],
    ["Other", "unassigned", "unassignedToProduce"],
  ],
  water: [],
};

/**
 * The "22 LEED · 80 CO2 · 42 CO-CO2" line under a headline: the mix of what is
 * still to PRODUCE. Shared by the cards on screen and the ones in the PDF, so
 * the two cannot drift apart.
 */
export function typologyBreakdown(domain: PivotDomain, t: PivotTotals): string {
  const cols = LONG_TYPOLOGIES[domain];
  if (!cols.length) return t.requested ? `${t.requested} sensors` : "—";
  const parts = cols
    .map(([label, , toProduceKey]) => {
      const qty = Number(t[toProduceKey] ?? 0);
      if (!qty) return null;
      return `${qty} ${label === "Unassigned" ? "n/a" : label}`;
    })
    .filter(Boolean);
  return parts.length ? parts.join(" · ") : "—";
}

export interface LongRow {
  project: string;
  client: string | null;
  city: string | null;
  brand: string | null;
  region: string;
  country: string | null;
  pm: string | null;
  /** Contractual handover, untouched by the on-site lead time. */
  handover: Date | null;
  /** The date the bucket, quarter and month below are computed on. */
  planDate: Date | null;
  bucket: PivotBucket;
  bucketLabel: string;
  quarter: string;
  month: string;
  status: string | null;
  typology: string;
  /** Units already on site. */
  delivered: number;
  /** Units built and assigned, not yet delivered. */
  assigned: number;
  toProduce: number;
  notes: string | null;
}

/**
 * True when every unit on the row has reached the site.
 *
 * `canonicalStatus` collapses a project to its LEAST advanced shipment, so a
 * partly delivered project reads as not-yet-delivered. Conservative by design,
 * and exact on the current data: none of the 385 air rows carries a compound
 * status, so no row is split across two stages.
 */
function isOnSite(status: string | null | undefined): boolean {
  const c = canonicalStatus(status);
  return c === "delivered" || c === "installed";
}

/**
 * The flat source table the pivot is built from: one row per project ×
 * typology, in long format, so it can be pivoted again in a spreadsheet.
 *
 * `hidePast` is deliberately NOT honoured here. Hiding overdue rows is a
 * display choice of the table on screen, while the Overdue card keeps counting
 * them — dropping them from the source sheet would make its bucket sums
 * disagree with the very cards it exists to reconcile.
 */
export function buildLongRows(
  records: NormalizedRecord[],
  domain: PivotDomain,
  options: PivotOptions = {},
): LongRow[] {
  const now = options.now ?? new Date();
  const offsetDays = options.offsetDays ?? 0;
  const out: LongRow[] = [];

  for (const r of records) {
    const planDate = r.date && offsetDays ? addDays(r.date, -offsetDays) : r.date;
    const bucket = bucketOf(planDate, now);
    const onSite = isOnSite(r.status);

    const emit = (typology: string, produced: number, toProduce: number): boolean => {
      if (!produced && !toProduce) return false;
      out.push({
        project: r.projectName,
        client: r.client ?? null,
        city: r.city ?? null,
        brand: r.brand ?? null,
        region: r.region,
        country: r.country ?? null,
        pm: r.pm ?? null,
        handover: r.date,
        planDate,
        bucket,
        bucketLabel: BUCKET_LABEL_IT[bucket],
        quarter: planDate ? fmtQuarterLabel(planDate) : "",
        month: planDate ? `${MONTH_NAMES[planDate.getMonth()]} ${planDate.getFullYear()}` : "",
        status: canonicalStatusLabel(r.status),
        typology,
        delivered: onSite ? produced : 0,
        assigned: onSite ? 0 : produced,
        toProduce,
        notes: r.note?.trim() || null,
      });
      return true;
    };

    const cols = LONG_TYPOLOGIES[domain];
    if (!cols.length) {
      emit("Sensors", r.assigned ?? 0, r.requested ?? 0);
      continue;
    }

    let emitted = false;
    for (const [label, producedKey, toProduceKey] of cols) {
      if (emit(label, Number(r[producedKey] ?? 0), Number(r[toProduceKey] ?? 0))) emitted = true;
    }
    // A record whose units carry no typology at all must still reach the sheet,
    // or its hardware silently stops being ordered.
    if (!emitted) emit("Unassigned", r.assigned ?? 0, r.requested ?? 0);
  }

  return out;
}

/**
 * Totals per calendar quarter, independent of the reading resolution — this is
 * the number the business plans on, so it must stay exact whether the rows
 * underneath are shown by day, by month or by half-year.
 */
export function quarterTotals(records: NormalizedRecord[], offsetDays = 0): Map<string, PivotTotals> {
  const out = new Map<string, PivotTotals>();
  for (const r of records) {
    if (!r.date) continue;
    const d = offsetDays ? addDays(r.date, -offsetDays) : r.date;
    const key = `${d.getFullYear()}-Q${quarterOf(d)}`;
    let t = out.get(key);
    if (!t) {
      t = emptyTotals();
      out.set(key, t);
    }
    addInto(t, {
      ...emptyTotals(),
      value: Number.isFinite(r.value) ? r.value : 0,
      assigned: r.assigned ?? 0,
      requested: r.requested ?? 0,
      bridges: r.bridges,
      pan10: r.pan10,
      pan12: r.pan12,
      pan14: r.pan14,
      bridgesToProduce: r.bridgesToProduce ?? 0,
      pan10ToProduce: r.pan10ToProduce ?? 0,
      pan12ToProduce: r.pan12ToProduce ?? 0,
      pan14ToProduce: r.pan14ToProduce ?? 0,
      leed: r.leed,
      well: r.well,
      co2: r.co2,
      coco2: r.coco2,
      unassigned: r.unassigned ?? 0,
      leedToProduce: r.leedToProduce ?? 0,
      wellToProduce: r.wellToProduce ?? 0,
      co2ToProduce: r.co2ToProduce ?? 0,
      coco2ToProduce: r.coco2ToProduce ?? 0,
      unassignedToProduce: r.unassignedToProduce ?? 0,
      byProduct: r.byProduct ?? {},
    });
  }
  return out;
}

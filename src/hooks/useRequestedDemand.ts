import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  emptyTypologies,
  typologyFromProductName,
  type PivotDomain,
  type RequestedDemand,
} from "@/lib/monitorPivot";

/**
 * Monitoring demand as requested by Operations/PM, before Monitoring assigns
 * anything physical.
 *
 * The monitor tables (`site_air_records` & co.) only ever count hardware that is
 * already assigned — `fn_recalculate_site_air` even deletes the record when no
 * device is attached. That makes them useless for planning production, because
 * a project that has been requested but not yet served is invisible.
 * `project_allocations` is where the request lives: product, requested quantity
 * and target_date (= handover − 15 days, the date the material must be on site).
 */

/** Allocation statuses that no longer represent live demand. */
const DEAD_STATUSES = new Set(["replaced", "canceled", "cancelled", "rejected"]);

/**
 * Certification statuses that kill the demand of every allocation hanging off
 * them, whatever the allocation's own status says.
 *
 * Cancelling a project only hid it from Operations (`src/pages/Projects.tsx`
 * filters `setup_status === "canceled"` out of the list); its allocations kept
 * being counted here as units still to produce, and the Monitor kept showing
 * the project — BOXENGO / MILAN / Boxengo Famagosta is the case that surfaced
 * it. A cancelled project needs nothing.
 *
 * Filtered per CERTIFICATION, not per site: a site certified under several
 * schemas with one cancelled and one running must still report what the
 * running one asked for.
 */
const DEAD_CERT_STATUSES = new Set(["canceled", "cancelled"]);

/**
 * Alive, but nothing left to produce: the units exist and have already left.
 * The Report answers "what do we still have to order and build", so these are
 * not demand — while the Monitor Hub keeps showing them as part of the fleet.
 *
 * Excluded per ALLOCATION, never per project: a site with 127 installed and 20
 * requested must report 20, not vanish. That is why they are subtracted here
 * rather than by dropping the row downstream.
 */
const SERVED_STATUSES = new Set(["shipped", "installed_online"]);

/**
 * A project on hold is paused, not dead: it will need its sensors again the day
 * it restarts, so the quantity stays visible in the Monitor Hub — but it must
 * not drive an order today, which is the only question this report answers.
 *
 * Kept apart from both `quantity` and `servedQuantity`: those units are neither
 * demand nor delivered, they are suspended. Releasing the hold in Operations
 * puts them back into demand with no intervention here.
 */
function isHeld(raw: AllocationRow): boolean {
  return raw.certifications?.on_hold === true;
}

const DOMAIN_CATEGORIES: Record<PivotDomain, string[]> = {
  energy: ["energy"],
  air: ["air", "iaq", "clair"],
  water: ["water"],
};

interface AllocationRow {
  certification_id: string | null;
  product_id: string | null;
  quantity: number | null;
  requested_quantity: number | null;
  status: string | null;
  target_date: string | null;
  category: string | null;
  is_generic_placeholder: boolean | null;
  products: { name: string | null; category: string | null } | null;
  certifications: { site_id: string | null; status: string | null; on_hold: boolean | null } | null;
}

/**
 * The same demand indexed two ways, because the monitor tables have different
 * grains: `site_air_records` holds one row per SITE, while
 * `site_energy_records` holds one per CERTIFICATION.
 *
 * A site certified under several schemas — "Offices HQ - WELL" alongside its
 * siblings — splits its requests across those certifications. Reading only the
 * one the air record happens to reference lost the rest: 42 units across 2
 * sites, including 15 CO-CO2 black that showed up as "Unassigned".
 */
export interface RequestedDemandMaps {
  byCertification: Map<string, RequestedDemand>;
  bySite: Map<string, RequestedDemand>;
}

function categoryOf(row: AllocationRow): string {
  return (row.category || row.products?.category || "").toLowerCase();
}

/**
 * Requested demand keyed by certification id, for one domain.
 * Quantities prefer `requested_quantity` and fall back to `quantity`, which is
 * what the CT Builder writes into both columns.
 */
export function useRequestedDemand(domain: PivotDomain) {
  return useQuery({
    // v2: the shape changed from a bare Map to the two indexes above, so a
    // cache entry written by the previous version must not be reused.
    queryKey: ["monitor-requested-demand", "v2", domain],
    staleTime: 60_000,
    queryFn: async (): Promise<RequestedDemandMaps> => {
      const { data, error } = await supabase
        .from("project_allocations" as never)
        .select(
          "certification_id, product_id, quantity, requested_quantity, status, target_date, category, is_generic_placeholder, products(name, category), certifications(site_id, status, on_hold)",
        );
      if (error) throw error;

      const wanted = DOMAIN_CATEGORIES[domain];
      const byCertification = new Map<string, RequestedDemand>();
      const bySite = new Map<string, RequestedDemand>();

      const accumulate = (map: Map<string, RequestedDemand>, key: string, raw: AllocationRow, qty: number) => {
        let entry = map.get(key);
        if (!entry) {
          entry = {
            quantity: 0,
            servedQuantity: 0,
            heldQuantity: 0,
            typologies: emptyTypologies(),
            byProduct: {},
            targetDate: raw.target_date ?? null,
          };
          map.set(key, entry);
        }

        // Already shipped or installed: recorded so the reader can tell "this
        // site is served" from "this site is unknown", but never counted as
        // demand and never allowed to colour the to-produce typology mix.
        if (SERVED_STATUSES.has((raw.status ?? "").toLowerCase())) {
          entry.servedQuantity = (entry.servedQuantity ?? 0) + qty;
          return;
        }

        // Suspended: remembered so the Hub can still show what the project will
        // need, but kept out of demand and out of the to-produce mix.
        if (isHeld(raw)) {
          entry.heldQuantity = (entry.heldQuantity ?? 0) + qty;
          return;
        }

        entry.quantity += qty;
        // Earliest target date wins: it is the binding one for production.
        if (raw.target_date && (!entry.targetDate || raw.target_date < entry.targetDate)) {
          entry.targetDate = raw.target_date;
        }
        const typology = typologyFromProductName(raw.products?.name);
        if (typology && entry.typologies) entry.typologies[typology] += qty;
        // Keep the SKU too: production builds "WELL ClAir black", not "WELL".
        const productName = raw.products?.name?.trim();
        if (productName && entry.byProduct) {
          entry.byProduct[productName] = (entry.byProduct[productName] ?? 0) + qty;
        }
      };

      for (const raw of (data ?? []) as unknown as AllocationRow[]) {
        if (!raw.certification_id) continue;
        if (DEAD_STATUSES.has((raw.status ?? "").toLowerCase())) continue;
        if (DEAD_CERT_STATUSES.has((raw.certifications?.status ?? "").toLowerCase())) continue;

        const cat = categoryOf(raw);
        // A generic placeholder carries no product yet: it still represents a
        // real request, but only for the domain its own category names.
        if (!wanted.some((w) => cat.includes(w))) continue;

        const qty = Number(raw.requested_quantity ?? raw.quantity ?? 0);
        if (!Number.isFinite(qty) || qty <= 0) continue;

        accumulate(byCertification, raw.certification_id, raw, qty);
        const siteId = raw.certifications?.site_id;
        if (siteId) accumulate(bySite, siteId, raw, qty);
      }

      const out = { byCertification, bySite };

      return out;
    },
  });
}

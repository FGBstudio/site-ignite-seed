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
    queryKey: ["monitor-requested-demand", domain],
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, RequestedDemand>> => {
      const { data, error } = await supabase
        .from("project_allocations" as never)
        .select(
          "certification_id, product_id, quantity, requested_quantity, status, target_date, category, is_generic_placeholder, products(name, category)",
        );
      if (error) throw error;

      const wanted = DOMAIN_CATEGORIES[domain];
      const out = new Map<string, RequestedDemand>();

      for (const raw of (data ?? []) as unknown as AllocationRow[]) {
        if (!raw.certification_id) continue;
        if (DEAD_STATUSES.has((raw.status ?? "").toLowerCase())) continue;

        const cat = categoryOf(raw);
        // A generic placeholder carries no product yet: it still represents a
        // real request, but only for the domain its own category names.
        if (!wanted.some((w) => cat.includes(w))) continue;

        const qty = Number(raw.requested_quantity ?? raw.quantity ?? 0);
        if (!Number.isFinite(qty) || qty <= 0) continue;

        let entry = out.get(raw.certification_id);
        if (!entry) {
          entry = {
            quantity: 0,
            typologies: emptyTypologies(),
            byProduct: {},
            targetDate: raw.target_date ?? null,
          };
          out.set(raw.certification_id, entry);
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
      }

      return out;
    },
  });
}

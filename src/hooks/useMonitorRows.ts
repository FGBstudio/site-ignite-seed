// Aggregates everything the Monitor → Energy table needs into one shape.
// Joins site_energy_records with profiles (PM), hardwares→ops_purchase_orders (POs),
// and ops_shipments (inbound/outbound costs + tracking).
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { SiteEnergyRecord } from "@/types/site-energy";
import { useEnergyProductPrices, type EnergyPriceMap } from "@/lib/productPricing";
import { loadIdentityMaps } from "@/lib/monitorIdentity";

export interface ShipmentAgg {
  customs_cost: number;
  vat: number;
  shipping_cost: number;
  tracking: string[];
}

export interface MonitorRow extends SiteEnergyRecord {
  pm_name: string | null;
  po_numbers: string[];
  inbound: ShipmentAgg;
  outbound: ShipmentAgg;
  // Live derived (re-computed on the fly using product prices)
  live_bridge_cost_usd: number;
  live_sensor_cost_usd: number;
  live_mango_cost_usd: number;
  live_total_pkg_usd: number;
  live_total_pkg_eur: number;
  live_company_cost: number;
  live_fgb_resource: number;
  live_total_cost: number;
  live_planned_remaining: number;
  live_taxes: number;
  live_profit: number;
  live_roi: number;
}

const FGB_RESOURCE_HOURS = 1 + 0.5 + 0.25 + 0.25 + 0.25 + 1 + 0.5 + 1 / 6 + 1 + 0.5 + 1.5 + 0.5 + 1 / 6;
const FGB_RESOURCE_DEFAULT_EUR = 50 * FGB_RESOURCE_HOURS;

interface ProfileRow { id: string; display_name: string | null; full_name: string | null; first_name: string | null; last_name: string | null; }
interface HardwareJoin { site_id: string | null; purchase_order_id: string | null; ops_purchase_orders: { po_number: string | null } | null; }
interface ShipmentRow { purchase_order_id: string | null; shipment_type: string | null; customs_cost: number | null; vat: number | null; total_shipping_cost: number | null; tracking_number: string | null; }

function pmName(p?: ProfileRow | null): string | null {
  if (!p) return null;
  return p.full_name || p.display_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || null;
}

function deriveLive(r: SiteEnergyRecord, prices: EnergyPriceMap, inbound: ShipmentAgg, outbound: ShipmentAgg): Pick<MonitorRow,
  "live_bridge_cost_usd"|"live_sensor_cost_usd"|"live_mango_cost_usd"|"live_total_pkg_usd"|"live_total_pkg_eur"|
  "live_company_cost"|"live_fgb_resource"|"live_total_cost"|"live_planned_remaining"|"live_taxes"|"live_profit"|"live_roi"> {
  const bridges = (r.total_bridges ?? 0);
  // Pick bridge price by category if known; default LAN
  const bridgeUnit = prices.BRIDGE_LAN;
  const bridgeUsd = bridges * bridgeUnit;
  const sensorUsd =
    (r.no_pan10 ?? 0) * prices["PAN-10"] +
    (r.no_pan12 ?? 0) * prices["PAN-12"] +
    (r.no_pan14 ?? 0) * prices["PAN-14"];
  const mangoUsd = (r.no_mango ?? 0) * prices.MANGO;
  const totalUsd = bridgeUsd + sensorUsd + mangoUsd;
  const fx = r.fx_rate_usd_eur ?? 0.86;
  const totalEur = totalUsd * fx;
  const installation = r.installation_cost ?? 0;
  const companyCost = installation * 0.2;
  const fgb = r.fgb_resource ?? FGB_RESOURCE_DEFAULT_EUR;
  const total = totalEur + inbound.customs_cost + inbound.vat + inbound.shipping_cost + outbound.shipping_cost + installation + companyCost + fgb;
  const quotation = r.quotation_value ?? 0;
  const planned = quotation - total;
  const taxes = planned * 0.27;
  const profit = planned - taxes;
  const roi = quotation > 0 ? (profit / quotation) * 100 : 0;
  return {
    live_bridge_cost_usd: bridgeUsd,
    live_sensor_cost_usd: sensorUsd,
    live_mango_cost_usd: mangoUsd,
    live_total_pkg_usd: totalUsd,
    live_total_pkg_eur: totalEur,
    live_company_cost: companyCost,
    live_fgb_resource: fgb,
    live_total_cost: total,
    live_planned_remaining: planned,
    live_taxes: taxes,
    live_profit: profit,
    live_roi: roi,
  };
}

export function useMonitorRows() {
  const { data: priceInfo } = useEnergyProductPrices();
  return useQuery({
    queryKey: ["monitor-energy-rows", priceInfo?.prices],
    enabled: !!priceInfo,
    staleTime: 60_000,
    queryFn: async (): Promise<MonitorRow[]> => {
      const { data: recs, error } = await supabase
        .from("site_energy_records" as never)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const records = (recs ?? []) as unknown as SiteEnergyRecord[];
      if (records.length === 0) return [];

      const pmIds = Array.from(new Set(records.map((r) => r.pm_id).filter(Boolean) as string[]));
      const siteIds = Array.from(new Set(records.map((r) => r.site_id).filter(Boolean) as string[]));
      const certIds = Array.from(new Set(records.map((r) => r.certification_id).filter(Boolean) as string[]));
      const identity = await loadIdentityMaps(siteIds, certIds);

      const [profilesRes, hardwaresRes] = await Promise.all([
        pmIds.length
          ? supabase.from("profiles").select("id, display_name, full_name, first_name, last_name").in("id", pmIds)
          : Promise.resolve({ data: [], error: null }),
        siteIds.length
          ? supabase
              .from("hardwares" as never)
              .select("site_id, purchase_order_id, ops_purchase_orders(po_number)")
              .in("site_id", siteIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      const profilesById = new Map<string, ProfileRow>();
      ((profilesRes.data ?? []) as unknown as ProfileRow[]).forEach((p) => profilesById.set(p.id, p));

      const hardwares = (hardwaresRes.data ?? []) as unknown as HardwareJoin[];
      const poNumbersBySite = new Map<string, Set<string>>();
      const poIdsBySite = new Map<string, Set<string>>();
      for (const h of hardwares) {
        if (!h.site_id) continue;
        if (h.ops_purchase_orders?.po_number) {
          if (!poNumbersBySite.has(h.site_id)) poNumbersBySite.set(h.site_id, new Set());
          poNumbersBySite.get(h.site_id)!.add(h.ops_purchase_orders.po_number);
        }
        if (h.purchase_order_id) {
          if (!poIdsBySite.has(h.site_id)) poIdsBySite.set(h.site_id, new Set());
          poIdsBySite.get(h.site_id)!.add(h.purchase_order_id);
        }
      }

      const allPoIds = Array.from(new Set(hardwares.map((h) => h.purchase_order_id).filter(Boolean) as string[]));
      const shipmentsRes = allPoIds.length
        ? await supabase
            .from("ops_shipments" as never)
            .select("purchase_order_id, shipment_type, customs_cost, vat, total_shipping_cost, tracking_number")
            .in("purchase_order_id", allPoIds)
        : { data: [], error: null };
      const shipments = (shipmentsRes.data ?? []) as unknown as ShipmentRow[];

      const aggForPoIds = (poIds: Set<string> | undefined, type: "inbound" | "outbound"): ShipmentAgg => {
        const agg: ShipmentAgg = { customs_cost: 0, vat: 0, shipping_cost: 0, tracking: [] };
        if (!poIds) return agg;
        for (const s of shipments) {
          if (!s.purchase_order_id || !poIds.has(s.purchase_order_id)) continue;
          if ((s.shipment_type ?? "").toLowerCase() !== type) continue;
          agg.customs_cost += Number(s.customs_cost ?? 0);
          agg.vat += Number(s.vat ?? 0);
          agg.shipping_cost += Number(s.total_shipping_cost ?? 0);
          if (s.tracking_number) agg.tracking.push(s.tracking_number);
        }
        return agg;
      };

      return records.map<MonitorRow>((r) => {
        const inbound = aggForPoIds(r.site_id ? poIdsBySite.get(r.site_id) : undefined, "inbound");
        const outbound = aggForPoIds(r.site_id ? poIdsBySite.get(r.site_id) : undefined, "outbound");
        const live = deriveLive(r, priceInfo!.prices, inbound, outbound);
        return {
          ...r,
          pm_name: pmName(profilesById.get(r.pm_id ?? "")),
          po_numbers: r.site_id ? Array.from(poNumbersBySite.get(r.site_id) ?? []) : [],
          inbound,
          outbound,
          ...live,
        };
      });
    },
  });
}

export const STATUS_OPTIONS = ["Upcoming", "Deleted", "Installed", "Postponed", "Completed", "On-hold"] as const;
export const CATEGORY_OPTIONS = [
  "Fendi Energy Project 2024",
  "Armani",
  "Bouc. Energy Project",
  "LEED Platinum",
  "Fendi Energy Project",
  "Schneider Reconfiguration",
  "LEED Gold",
  "LEED",
  "Energy Monitoring Project",
] as const;

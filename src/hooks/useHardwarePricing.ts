import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface HardwarePricing {
  iaqMaxUnit: number;          // highest unit_cost in AIR category (ClAir family)
  greenyBridgeLan: number;     // SKU FGB-BR-LAN
  greenyPan12: number;         // SKU FGB-12 (PAN12 sensor)
  mango: number;               // SKU MANGO
  loaded: boolean;
}

const ZERO: HardwarePricing = {
  iaqMaxUnit: 0, greenyBridgeLan: 0, greenyPan12: 0, mango: 0, loaded: false,
};

export function useHardwarePricing() {
  return useQuery({
    queryKey: ["hardware-pricing", "quotation-builder"],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<HardwarePricing> => {
      const { data, error } = await supabase
        .from("products")
        .select("sku, category, unit_cost");
      if (error) throw error;
      const rows = (data ?? []) as { sku: string; category: string | null; unit_cost: number | null }[];
      const air = rows.filter((r) => (r.category ?? "").toUpperCase() === "AIR");
      const iaqMaxUnit = air.reduce((m, r) => Math.max(m, Number(r.unit_cost) || 0), 0);
      const find = (sku: string) => Number(rows.find((r) => r.sku === sku)?.unit_cost ?? 0) || 0;
      return {
        iaqMaxUnit,
        greenyBridgeLan: find("FGB-BR-LAN"),
        greenyPan12: find("FGB-12"),
        mango: find("MANGO"),
        loaded: true,
      };
    },
  });
}

export const ZERO_PRICING = ZERO;

export function computeGreenyKitCost(p: HardwarePricing): number {
  return p.greenyBridgeLan + 12 * p.greenyPan12 + p.mango;
}

export function computeIaqCost(p: HardwarePricing, sensors: number): number {
  return p.iaqMaxUnit * Math.max(0, sensors || 0);
}

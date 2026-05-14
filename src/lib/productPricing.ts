// Single source of truth for hardware pricing: pulls from `products.unit_price`.
// Used by the CT Builder and finance computations.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type EnergyHardwareKey =
  | "PAN-10"
  | "PAN-12"
  | "PAN-14"
  | "BRIDGE_LAN"
  | "BRIDGE_LTE"
  | "MANGO";

interface ProductRow {
  id: string;
  sku: string | null;
  name: string;
  unit_cost: number | null;
}

function classify(p: ProductRow): EnergyHardwareKey | null {
  const haystack = `${p.sku ?? ""} ${p.name}`.toLowerCase();
  if (/(?:pan|fgb)[\s-]?10/.test(haystack)) return "PAN-10";
  if (/(?:pan|fgb)[\s-]?12/.test(haystack)) return "PAN-12";
  if (/(?:pan|fgb)[\s-]?14/.test(haystack)) return "PAN-14";
  if (/bridge.*lan|lan.*bridge|fgb-br-lan/.test(haystack)) return "BRIDGE_LAN";
  if (/bridge.*lte|lte.*bridge|fgb-br-lte/.test(haystack)) return "BRIDGE_LTE";
  if (/mango/.test(haystack)) return "MANGO";
  return null;
}

export type EnergyPriceMap = Record<EnergyHardwareKey, number>;

export const FALLBACK_PRICES: EnergyPriceMap = {
  "PAN-10": 104.3,
  "PAN-12": 104.3,
  "PAN-14": 104.3,
  BRIDGE_LAN: 237.3,
  BRIDGE_LTE: 307.3,
  MANGO: 38.0,
};

export function useEnergyProductPrices() {
  return useQuery({
    queryKey: ["energy-product-prices"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<{ prices: EnergyPriceMap; missing: EnergyHardwareKey[] }> => {
      const { data, error } = await supabase
        .from("products" as never)
        .select("id, sku, name, unit_cost, category");
      if (error) throw error;
      const products = (data ?? []) as unknown as ProductRow[];
      const out: EnergyPriceMap = { ...FALLBACK_PRICES };
      const seen = new Set<EnergyHardwareKey>();
      for (const p of products) {
        const key = classify(p);
        if (!key) continue;
        if (typeof p.unit_cost === "number" && p.unit_cost > 0) {
          out[key] = Number(p.unit_cost);
          seen.add(key);
        }
      }
      const missing = (Object.keys(FALLBACK_PRICES) as EnergyHardwareKey[]).filter(
        (k) => !seen.has(k),
      );
      return { prices: out, missing };
    },
  });
}

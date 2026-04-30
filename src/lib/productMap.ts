// Maps CT Builder hardware names to existing rows in the `products` catalog.
// Used both at quote-acceptance and when reading allocations back.

import { supabase } from "@/integrations/supabase/client";

export type CTBuilderHardware =
  | "PAN-10"
  | "PAN-12"
  | "PAN-14"
  | "LAN Bridge"
  | "LTE Bridge"
  | "MANGO Gateway";

interface ProductLite {
  id: string;
  name: string;
  sku: string | null;
}

const matchers: Record<CTBuilderHardware, (p: ProductLite) => boolean> = {
  "PAN-10": (p) => /pan[\s-]?10|fgb[\s-]?10/i.test(p.name) || /pan[\s-]?10|fgb[\s-]?10/i.test(p.sku ?? ""),
  "PAN-12": (p) => /pan[\s-]?12|fgb[\s-]?12/i.test(p.name) || /pan[\s-]?12|fgb[\s-]?12/i.test(p.sku ?? ""),
  "PAN-14": (p) => /pan[\s-]?14|fgb[\s-]?14/i.test(p.name) || /pan[\s-]?14|fgb[\s-]?14/i.test(p.sku ?? ""),
  "LAN Bridge": (p) => /bridge.*lan|lan.*bridge/i.test(p.name) || /bridge/i.test(p.name),
  "LTE Bridge": (p) => /bridge.*lte|lte.*bridge/i.test(p.name),
  "MANGO Gateway": (p) => /mango/i.test(p.name) || /mango/i.test(p.sku ?? ""),
};

export async function resolveCTBuilderProductIds(
  needed: CTBuilderHardware[],
): Promise<{ map: Record<string, string>; missing: CTBuilderHardware[] }> {
  const { data, error } = await supabase
    .from("products" as never)
    .select("id, name, sku");
  if (error) throw error;
  const products = (data ?? []) as unknown as ProductLite[];

  const map: Record<string, string> = {};
  const missing: CTBuilderHardware[] = [];
  for (const hw of needed) {
    const found = products.find((p) => matchers[hw](p));
    if (found) map[hw] = found.id;
    else missing.push(hw);
  }
  return { map, missing };
}

/** BOM hardware label as produced by ctBuilder.ts → canonical CTBuilderHardware */
export function bomLabelToHardware(label: string): CTBuilderHardware | null {
  if (label === "PAN-10" || label === "PAN-12" || label === "PAN-14") return label;
  if (/lan/i.test(label)) return "LAN Bridge";
  if (/lte/i.test(label)) return "LTE Bridge";
  if (/mango/i.test(label)) return "MANGO Gateway";
  return null;
}

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Map of AIR product id → product name (e.g. "LEED ClAir", "WELL ClAir").
 * Single source used to classify the monitor typology of air records.
 */
export function useAirProductMap() {
  return useQuery({
    queryKey: ["air-products-map"],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<Map<string, string>> => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, category")
        .eq("category", "AIR");
      if (error) throw error;
      const map = new Map<string, string>();
      ((data ?? []) as Array<{ id: string; name: string }>).forEach((p) => map.set(p.id, p.name));
      return map;
    },
  });
}

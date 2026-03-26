import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useBrands() {
  return useQuery({
    queryKey: ["brands"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brands")
        .select("id, name")
        .order("name", { ascending: true });
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
  });
}

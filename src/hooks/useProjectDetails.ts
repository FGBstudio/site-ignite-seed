import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Fetches a single certification (the root entity) by ID.
 * Includes site info and PM profile.
 */
export function useProjectDetails(certificationId: string | undefined) {
  return useQuery({
    queryKey: ["certification", certificationId],
    queryFn: async () => {
      if (!certificationId) throw new Error("No certification ID");

      const { data: cert, error } = await (supabase as any)
        .from("certifications")
        .select("*, sites(name, city, country)")
        .eq("id", certificationId)
        .single();

      if (error) {
        console.error("ERRORE Query Dettaglio Certificazione:", error);
        throw error;
      }

      // Fetch PM profile separately
      if (cert.pm_id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, full_name, display_name, email")
          .eq("id", cert.pm_id)
          .maybeSingle();
        cert.profiles = profile;
      }

      return cert;
    },
    enabled: !!certificationId,
  });
}

/**
 * @deprecated Certification IS now the root entity. Use useProjectDetails directly.
 * Kept for backward compatibility during transition.
 */
export function useCertification(certificationId: string | undefined, _siteId?: string | null) {
  return useQuery({
    queryKey: ["certification-detail", certificationId],
    queryFn: async () => {
      if (!certificationId) return null;
      const { data, error } = await (supabase as any)
        .from("certifications")
        .select("*")
        .eq("id", certificationId)
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return data;
    },
    enabled: !!certificationId,
  });
}

export function useMilestones(certificationId: string | undefined) {
  return useQuery({
    queryKey: ["milestones", certificationId],
    queryFn: async () => {
      if (!certificationId) throw new Error("No certification ID");
      const { data, error } = await supabase
        .from("certification_milestones")
        .select("*")
        .eq("certification_id", certificationId)
        .order("category")
        .order("requirement");
      if (error) throw error;
      return data || [];
    },
    enabled: !!certificationId,
  });
}

export function useProjectAllocations(certificationId: string | undefined) {
  return useQuery({
    queryKey: ["certification-allocations", certificationId],
    queryFn: async () => {
      if (!certificationId) throw new Error("No certification ID");
      const { data, error } = await (supabase as any)
        .from("project_allocations")
        .select("*, products(name, sku, certification)")
        .eq("certification_id", certificationId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!certificationId,
  });
}

export function useSites(brandId?: string) {
  return useQuery({
    queryKey: ["sites", brandId],
    queryFn: async () => {
      let query = supabase.from("sites").select("*").order("name");
      if (brandId) query = query.eq("brand_id", brandId);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: brandId ? true : true,
  });
}

export function useHoldings() {
  return useQuery({
    queryKey: ["holdings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("holdings")
        .select("*")
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });
}

export function useBrands(holdingId?: string) {
  return useQuery({
    queryKey: ["brands", holdingId],
    queryFn: async () => {
      if (!holdingId) return [];
      const { data, error } = await supabase
        .from("brands")
        .select("*")
        .eq("holding_id", holdingId)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!holdingId,
  });
}

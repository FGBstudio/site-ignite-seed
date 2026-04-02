import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useProjectDetails(projectId: string | undefined) {
  return useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      if (!projectId) throw new Error("No project ID");
      
      // Fetch project without profiles join (FK points to auth.users, not profiles)
      const { data: project, error } = await (supabase as any)
        .from("projects")
        .select("*, sites!projects_site_id_fkey(name, city, country)")
        .eq("id", projectId)
        .single();
        
      if (error) {
        console.error("ERRORE Query Dettaglio Progetto:", error);
        throw error;
      }

      // Fetch PM profile separately
      if (project.pm_id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, full_name, display_name, email")
          .eq("id", project.pm_id)
          .maybeSingle();
        project.profiles = profile;
      }

      return project;
        
      if (error) {
        console.error("ERRORE Query Dettaglio Progetto:", error);
        throw error;
      }
      return data;
    },
    enabled: !!projectId,
  });
}

export function useCertification(projectId: string | undefined) {
  return useQuery({
    queryKey: ["certification", projectId],
    queryFn: async () => {
      if (!projectId) throw new Error("No project ID");
      
      const { data, error } = await (supabase as any)
        .from("certifications")
        .select("*")
        .eq("project_id", projectId)
        .maybeSingle(); // FIX: Evita crash fatali se la certificazione non esiste ancora
        
      if (error) {
        console.error("ERRORE Query Certificazione:", error);
        throw error;
      }
      return data;
    },
    enabled: !!projectId,
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

export function useProjectAllocations(projectId: string | undefined) {
  return useQuery({
    queryKey: ["project-allocations", projectId],
    queryFn: async () => {
      if (!projectId) throw new Error("No project ID");
      const { data, error } = await (supabase as any)
        .from("project_allocations")
        .select("*, products(name, sku, certification)")
        .eq("project_id", projectId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!projectId,
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

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
    },
    enabled: !!projectId,
  });
}

// FIX: Aggiunta logica avanzata di match (Project_ID -> Fallback Storico)
export function useCertification(projectId: string | undefined, siteId?: string | null) {
  return useQuery({
    queryKey: ["certification", projectId, siteId],
    queryFn: async () => {
      if (!projectId) return null; // Abortiamo se non c'è progetto
      
      // 1. Cerca usando il nuovo e infallibile project_id
      let { data, error } = await (supabase as any)
        .from("certifications")
        .select("*")
        .eq("project_id", projectId)
        .maybeSingle(); 
        
      // 2. Fallback per i progetti storici: usa le info del progetto per trovarla
      if (!data) {
         // Recupera le informazioni necessarie dal progetto
         const { data: proj } = await (supabase as any)
            .from("projects")
            .select("site_id, cert_type, cert_rating")
            .eq("id", projectId)
            .single();
            
         // Se ha le info, cerca il match esatto (oppure se è stato passato il siteId come parametro)
         const targetSiteId = proj?.site_id || siteId;
         
         if (targetSiteId) {
            let fallbackQuery = (supabase as any)
              .from("certifications")
              .select("*")
              .eq("site_id", targetSiteId);
              
            if (proj?.cert_type) {
                fallbackQuery = fallbackQuery.eq("cert_type", proj.cert_type);
            }
            if (proj?.cert_rating) {
                fallbackQuery = fallbackQuery.eq("level", proj.cert_rating);
            }
            
            const { data: fallbackData } = await fallbackQuery.maybeSingle();
            data = fallbackData;
         }
      }
      
      if (error) {
        console.error("ERRORE Query Certificazione:", error);
        // Non blocchiamo se è solo un "non trovato", ma lanciamo l'errore se è di rete o permessi
        if (error.code !== "PGRST116") throw error; 
      }
      
      return data;
    },
    enabled: !!projectId, // Attiviamo la query se esiste il projectId
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

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type SetupStatus = "da_configurare" | "in_corso" | "certificato";

export interface PMProject {
  id: string;
  name: string;
  client: string;
  region: string;
  status: string;
  handover_date: string;
  site_id: string | null;
  cert_type: string | null;
  cert_rating: string | null;
  pm_id: string | null;
  created_at: string;
  updated_at: string;
  is_commissioning: boolean | null;
  project_subtype: string | null;
  // Joined
  sites: { name: string; city: string | null; country: string | null } | null;
  certifications: any[];
  project_allocations: any[];
  // Computed
  setup_status: SetupStatus;
  missing: string[];
  certification_milestones: any[];
  plannerData?: any; // <--- AGGIUNTO PER IL MOTORE GANTT
}

export function usePMDashboard() {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: ["pm-dashboard", userId],
    enabled: !!userId,
    queryFn: async () => {
      // 1. Fetch projects with relations
      const { data: projects, error } = await (supabase as any)
        .from("projects")
        .select("*, sites!projects_site_id_fkey(name, city, country), project_allocations(*)")
        .eq("pm_id", userId)
        .order("handover_date", { ascending: true });
      if (error) throw error;
      if (!projects || projects.length === 0) return [] as PMProject[];

      // 2. Fetch certifications for project sites
      const siteIds = [...new Set(
        (projects as any[]).map((p) => p.site_id).filter(Boolean)
      )] as string[];

      let certifications: any[] = [];
      if (siteIds.length > 0) {
        const { data, error: certErr } = await supabase
          .from("certifications")
          .select("*")
          .in("site_id", siteIds);
        if (certErr) throw certErr;
        certifications = data || [];
      }

      // 3. Fetch milestones for those certifications
      const certIds = certifications.map((c) => c.id);
      let milestones: any[] = [];
      if (certIds.length > 0) {
        const { data, error: mErr } = await supabase
          .from("certification_milestones")
          .select("*")
          .in("certification_id", certIds);
        if (mErr) throw mErr;
        milestones = data || [];
      }

      // 4. Merge and classify — match by site_id + cert_type + level
      return (projects as any[]).map((p): PMProject => {
        // Precise match: site_id + cert_type + level/cert_rating
        const projectCerts = certifications.filter((c) =>
          c.site_id === p.site_id &&
          c.cert_type === p.cert_type &&
          (c.level === p.cert_rating || (!c.level && !p.cert_rating))
        );
        // Fallback: if no precise match, try site_id + cert_type only
        const fallbackCerts = projectCerts.length > 0
          ? projectCerts
          : certifications.filter((c) => c.site_id === p.site_id && c.cert_type === p.cert_type);
        const projectMilestones = milestones.filter((m) =>
          fallbackCerts.some((c: any) => c.id === m.certification_id)
        );
        const allocations = p.project_allocations || [];

        // Classification logic
        const today = new Date().toISOString().slice(0, 10);
        
        // FIX CRITICO: Controlla se il DB (tabella projects) ha lo status "certificato"
        // OPPURE se la certificazione è "active" e la sua data (troncata) è <= a oggi.
        const isCertified = 
          p.status === "certificato" || 
          projectCerts.some(
            (c: any) => c.status === "active" && c.issued_date && c.issued_date.slice(0, 10) <= today
          );

        // Timeline: Check if timeline milestones EXIST
        const timelineMilestones = projectMilestones.filter(
          (m: any) => m.milestone_type === "timeline"
        );
        const hasTimeline = timelineMilestones.length > 0;

        // Scorecard: at least one scorecard row exists
        const hasScorecard = projectMilestones.some(
          (m: any) => m.milestone_type === "scorecard"
        );

        const missing: string[] = [];
        if (!isCertified) {
          if (!hasTimeline) missing.push("Timeline");
          if (!hasScorecard) missing.push("Scorecard");
          if (allocations.length === 0) missing.push("Hardware"); // RE-INSERITO IL FIX HARDWARE!
        }

        let setup_status: SetupStatus;
        if (isCertified) {
          setup_status = "certificato";
        } else if (hasTimeline && hasScorecard) {
          setup_status = "in_corso";
        } else {
          setup_status = "da_configurare";
        }

        // =========================================================
        // CALCOLO DATI MACRO-PLANNER (Il Motore Gantt Globale)
        // =========================================================
        let planStart = p.created_at.slice(0, 10); // Default: Data di assegnazione del progetto
        let achievedCount = 0;
        
        if (hasTimeline) {
          // Trova la prima data ufficiale inserita nel Gantt dal PM
          const startDates = timelineMilestones.map((m: any) => m.start_date).filter(Boolean).sort();
          if (startDates.length > 0) planStart = startDates[0];
          
          achievedCount = timelineMilestones.filter((m: any) => m.status === "achieved").length;
        }
        
        // Calcolo saturazione 0-100%
        const progress = hasTimeline ? Math.round((achievedCount / timelineMilestones.length) * 100) : 0;
        
        // Logica visiva (Rosso se in ritardo sulla consegna, verde se certificato)
        let plannerStatus = setup_status === "certificato" ? "achieved" : "in_progress";
        if (setup_status === "da_configurare") plannerStatus = "pending";
        if (setup_status === "in_corso" && p.handover_date < today) plannerStatus = "late";

        const plannerData = {
          id: p.id,
          label: p.name,
          subLabel: p.client,
          planStart: planStart,
          planEnd: p.handover_date,
          actualStart: setup_status !== "da_configurare" ? planStart : null,
          actualEnd: setup_status === "certificato" ? today : null,
          progress: progress,
          status: plannerStatus
        };
        // =========================================================

        return {
          ...p,
          certifications: fallbackCerts,
          certification_milestones: projectMilestones,
          setup_status,
          missing,
          plannerData, // Injectiamo i dati preparati
        };
      });
    },
  });
}

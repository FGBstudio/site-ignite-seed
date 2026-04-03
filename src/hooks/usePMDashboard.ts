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
  const { user, role } = useAuth(); // Aggiunto 'role' per gestire l'Admin
  const userId = user?.id;

  return useQuery({
    queryKey: ["pm-dashboard", userId, role],
    enabled: !!userId,
    queryFn: async () => {
      console.log("🚀 [PM Dashboard] Avvio sincronizzazione dati...");

      // 1. Fetch projects with relations
      let query = (supabase as any)
        .from("projects")
        .select("*, sites!projects_site_id_fkey(name, city, country), project_allocations(*)")
        .order("handover_date", { ascending: true });

      // Se NON è admin, filtra solo i suoi progetti
      if (role !== "ADMIN") {
         query = query.eq("pm_id", userId);
      }
      
      const { data: projects, error } = await query;
      if (error) throw error;
      if (!projects || projects.length === 0) return [] as PMProject[];

      console.log(`📦 [PM Dashboard] Trovati ${projects.length} progetti per l'utente ${userId}.`);

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
        console.log(`📜 [PM Dashboard] Trovate ${certifications.length} certificazioni legate ai siti.`);
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
        console.log(`🎯 [PM Dashboard] Trovate ${milestones.length} milestone totali nel DB.`);
      }

      // 4. Merge and classify
      return (projects as any[]).map((p): PMProject => {
        
        // FIX CRITICO MOTORE DI RICERCA: 
        // Cerchiamo la certificazione tramite site_id e cert_type
        let projectCerts = certifications.filter((c) => 
          c.site_id === p.site_id && c.cert_type === p.cert_type
        );
        
        // Affinamento per progetti legacy se ci sono match multipli
        if (projectCerts.length > 1 && p.cert_rating) {
           const exactMatch = projectCerts.filter(c => c.level === p.cert_rating);
           if (exactMatch.length > 0) projectCerts = exactMatch;
        }
          
        const projectMilestones = milestones.filter((m) =>
          projectCerts.some((c: any) => c.id === m.certification_id)
        );

        // --- DEBUG CHIRURGICO ---
        if (projectMilestones.length === 0) {
           console.warn(`⚠️ [Mancanza Dati] Il progetto "${p.name}" (ID: ${p.id}) NON ha milestone collegate! Certificazioni trovate: ${projectCerts.length}`);
           if (projectCerts.length > 0) {
              console.warn(`👉 La certificazione esiste (ID: ${projectCerts[0].id}, Level: ${projectCerts[0].level}), ma il DB non le ha assegnato milestone.`);
           } else {
              console.warn(`👉 La certificazione NON è stata trovata. Match fallito per site_id: ${p.site_id}, cert_type: ${p.cert_type}`);
           }
        }
        // ------------------------

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

        // =====================================================================
        // FIX 2.0: La timeline è "configurata" solo se il PM ha inserito delle date
        // =====================================================================
        const isTimelineConfigured = timelineMilestones.some(
          (m: any) => m.start_date !== null || m.due_date !== null
        );

        const missing: string[] = [];
        if (!isCertified) {
          if (!hasTimeline) missing.push("Timeline");
          else if (!isTimelineConfigured) missing.push("Pianifica Date"); // Extra info UI per il PM
          if (!hasScorecard) missing.push("Scorecard");
          if (allocations.length === 0) missing.push("Hardware");
        }

        let setup_status: SetupStatus;
        if (isCertified) {
          setup_status = "certificato";
        } else if (hasTimeline && hasScorecard && isTimelineConfigured) {
          // Passa a "in_corso" SOLO se sono state popolate le date
          setup_status = "in_corso";
        } else {
          setup_status = "da_configurare";
        }

        // =========================================================
        // CALCOLO DATI MACRO-PLANNER (Il Motore Gantt a Segmenti)
        // =========================================================
        const projectLaunchDate = p.created_at.slice(0, 10); // Launch date
        let planStart = projectLaunchDate; // Default
        let achievedCount = 0;
        
        const segments: any[] = []; // I "vagoni" del nostro treno di progetto
        
        // Calcola segmenti solo se la timeline è stata configurata dal PM
        if (hasTimeline && isTimelineConfigured) {
          // Trova la prima data ufficiale per l'inizio del progetto globale
          const startDates = timelineMilestones.map((m: any) => m.start_date).filter(Boolean).sort();
          if (startDates.length > 0) planStart = startDates[0];
          
          achievedCount = timelineMilestones.filter((m: any) => m.status === "achieved").length;

          // Popoliamo i segmenti iterando sulle milestone di questo progetto
          timelineMilestones.forEach((m: any) => {
            if (m.start_date && m.due_date) { // Includiamo solo le fasi con date valide
              // Logica colore rosso per i segmenti in ritardo
              let displayStatus = m.status;
              if (m.status !== "achieved" && m.due_date < today) displayStatus = "late";

              segments.push({
                start: m.start_date,
                end: m.due_date,
                status: displayStatus,
                progress: m.status === "achieved" ? 100 : m.status === "in_progress" ? 50 : 0
              });
            }
          });
        }
        
        // Calcolo saturazione 0-100% globale del progetto
        const progress = (hasTimeline && isTimelineConfigured) ? Math.round((achievedCount / timelineMilestones.length) * 100) : 0;
        
        // --- AGGIUNTA PER TROVARE L'ATTIVITA' IN CORSO ---
        const activeMilestone = timelineMilestones.find((m: any) => m.status === "in_progress");
        const currentActivity = activeMilestone 
          ? activeMilestone.requirement 
          : (setup_status === "certificato" ? "Completato" : "In attesa");
        // -------------------------------------------------

        // Logica visiva per la riga master del Progetto
        let plannerStatus = "pending";
        if (setup_status === "certificato") {
          plannerStatus = "achieved";
        } else if (hasTimeline && isTimelineConfigured) {
          // Se almeno una attività è iniziata o completata, il progetto è "in corso"
          const hasActive = timelineMilestones.some((m: any) => m.status === "in_progress" || m.status === "achieved");
          if (hasActive) {
            plannerStatus = p.handover_date < today ? "late" : "in_progress";
          }
        }

        const plannerData = {
          id: p.id,
          label: p.name,
          subLabel: p.client,
          launchDate: projectLaunchDate, // Iniettato
          currentActivity: currentActivity, // <--- AGGIUNTA QUI
          planStart: planStart,
          planEnd: p.handover_date,
          actualStart: plannerStatus !== "pending" ? planStart : null,
          actualEnd: setup_status === "certificato" ? today : null,
          progress: progress,
          status: plannerStatus,
          segments: segments // Iniettiamo l'array dei segmenti
        };
        // =========================================================

        return {
          ...p,
          certifications: projectCerts,
          certification_milestones: projectMilestones,
          setup_status,
          missing,
          plannerData, // Injectiamo i dati preparati
        };
      });
    },
  });
}

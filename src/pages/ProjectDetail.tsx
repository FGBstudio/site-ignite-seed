import { useParams, useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { useProjectDetails, useCertification, useProjectAllocations } from "@/hooks/useProjectDetails";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScorecardEditor } from "@/components/projects/ScorecardEditor";
import { ProjectWBS } from "@/components/projects/ProjectWBS";
import { ProjectPayments } from "@/components/projects/ProjectPayments";
import { ArrowLeft, MapPin, Calendar, User, Cpu } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";

// --- NUOVI IMPORT PER IL PLANNER ---
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FGBPlanner, type GanttRowData } from "@/components/dashboard/FGBPlanner";

const statusColors: Record<string, string> = {
  Design: "bg-primary/10 text-primary border-primary/20",
  Construction: "bg-warning/10 text-warning border-warning/20",
  Completed: "bg-success/10 text-success border-success/20",
  Cancelled: "bg-destructive/10 text-destructive border-destructive/20",
};

export default function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { data: project, isLoading } = useProjectDetails(projectId);
  const { data: certification } = useCertification(projectId);
  const { data: allocations } = useProjectAllocations(projectId);

  // =======================================================================
  // FETCH: Scarichiamo le righe della timeline per questo progetto specifico
  // =======================================================================
  const { data: timelineMilestones = [] } = useQuery({
    queryKey: ["project-timeline", certification?.id],
    enabled: !!certification?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("certification_milestones")
        .select("*")
        .eq("certification_id", certification!.id)
        .eq("milestone_type", "timeline")
        .order("order_index");
      if (error) throw error;
      return data || [];
    },
  });

  // =======================================================================
  // MAP: Trasformiamo le righe del DB in dati compatibili col Motore Gantt
  // =======================================================================
  const plannerData: GanttRowData[] = useMemo(() => {
    if (!project || timelineMilestones.length === 0) return [];

    const today = new Date().toISOString().slice(0, 10);
    // Data di lancio globale del progetto
    const projectLaunchDate = project.created_at.slice(0, 10);

    // Mappatura delle singole fasi
    const phases: GanttRowData[] = timelineMilestones.map((m: any) => {
      let role = "Specialista";
      try {
        const meta = JSON.parse(m.notes || "{}");
        if (meta.assigned_to_role) role = meta.assigned_to_role;
      } catch (e) {}

      let displayStatus = m.status;
      if (m.status !== "achieved" && m.due_date && m.due_date < today) {
        displayStatus = "late"; // Diventa Rosso
      } else if (m.status === "achieved") {
        displayStatus = "achieved"; // Diventa Verde
      } else if (m.status === "in_progress") {
        displayStatus = "in_progress"; // Diventa Blu
      }

      return {
        id: m.id,
        label: m.requirement,
        subLabel: `Ruolo: ${role}`,
        launchDate: projectLaunchDate, // Viene mappata in tutte le righe
        planStart: m.start_date,
        planEnd: m.due_date,
        actualStart: m.status !== "pending" ? m.start_date : null,
        actualEnd: m.completed_date || null,
        progress: m.status === "achieved" ? 100 : m.status === "in_progress" ? 50 : 0,
        status: displayStatus,
      };
    });

    // RIGA RIASSUNTIVA DEL PROGETTO (Macro-Avanzamento)
    const totalAchieved = timelineMilestones.filter((m: any) => m.status === 'achieved').length;
    const overallProgress = timelineMilestones.length > 0 ? Math.round((totalAchieved / timelineMilestones.length) * 100) : 0;
    
    // Trova la primissima data di inizio tra tutte le fasi
    const firstStartDate = timelineMilestones.map((m: any) => m.start_date).filter(Boolean).sort()[0] || projectLaunchDate;

    const summaryRow: GanttRowData = {
      id: "summary",
      label: "TOTALE CANTIERE",
      subLabel: "Avanzamento Globale",
      launchDate: projectLaunchDate,
      planStart: firstStartDate,
      planEnd: project.handover_date,
      actualStart: overallProgress > 0 ? firstStartDate : null,
      actualEnd: project.status === "certificato" ? today : null,
      progress: overallProgress,
      status: project.status === "certificato" ? "achieved" : (project.handover_date < today ? "late" : "in_progress"),
    };

    return [summaryRow, ...phases];
  }, [timelineMilestones, project]);

  if (isLoading) {
    return (
      <MainLayout title="Caricamento...">
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </MainLayout>
    );
  }

  if (!project) {
    return (
      <MainLayout title="Progetto non trovato">
        <div className="text-center py-20 text-muted-foreground">
          Progetto non trovato.
          <Button variant="link" onClick={() => navigate("/projects")}>Torna ai cantieri</Button>
        </div>
      </MainLayout>
    );
  }

  const hasCert = (project as any).project_type === "LEED" || (project as any).project_type === "WELL";
  const pmName = (project as any).profiles?.full_name || "—";
  const siteName = (project as any).sites?.name;
  const siteCity = (project as any).sites?.city;
  const siteCountry = (project as any).sites?.country;

  return (
    <MainLayout
      title={project.name}
      subtitle={`${project.client} — ${project.region}`}
    >
      <Button variant="ghost" size="sm" onClick={() => navigate("/projects")} className="gap-2 mb-4">
        <ArrowLeft className="h-4 w-4" /> Torna ai Cantieri
      </Button>

      {/* Project header cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <MapPin className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Sito</p>
              <p className="font-medium text-sm text-foreground">{siteName || "Non assegnato"}</p>
              {siteCity && <p className="text-xs text-muted-foreground">{siteCity}{siteCountry ? `, ${siteCountry}` : ""}</p>}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Handover</p>
              <p className="font-medium text-sm text-foreground">{format(new Date(project.handover_date), "dd MMM yyyy", { locale: it })}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <User className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">PM</p>
              <p className="font-medium text-sm text-foreground">{pmName}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <Cpu className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Stato / Tipo</p>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="outline" className={cn("border text-xs", statusColors[project.status])}>{project.status}</Badge>
                {(project as any).project_type && <Badge variant="secondary" className="text-xs">{(project as any).project_type}</Badge>}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="planner" className="space-y-4">
        <TabsList>
          <TabsTrigger value="planner">Planner (Fasi)</TabsTrigger>
          {hasCert && <TabsTrigger value="scorecard">Scorecard {(project as any).project_type}</TabsTrigger>}
          <TabsTrigger value="wbs">Cronoprogramma</TabsTrigger>
          <TabsTrigger value="hardware">Hardware</TabsTrigger>
          <TabsTrigger value="payments">Pagamenti</TabsTrigger>
        </TabsList>

        {/* NUOVO TAB: PLANNER MICRO-VISTA CON LA DATA GRID E RIGA TOTALE */}
        <TabsContent value="planner">
          <Card>
            <CardContent className="p-0 border-none">
              {plannerData.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  Nessuna timeline inizializzata. Configura il progetto dalla dashboard PM.
                </div>
              ) : (
                <div className="h-[600px] flex flex-col">
                  <FGBPlanner data={plannerData} />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hardware">
          {!allocations || allocations.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Nessun hardware allocato a questo progetto.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-medium text-muted-foreground">Prodotto</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">SKU</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Certificazione</th>
                      <th className="text-center p-3 font-medium text-muted-foreground">Quantità</th>
                      <th className="text-center p-3 font-medium text-muted-foreground">Stato</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocations.map((a: any) => (
                      <tr key={a.id} className="border-b last:border-b-0">
                        <td className="p-3 font-medium text-foreground">{a.products?.name || "—"}</td>
                        <td className="p-3 text-muted-foreground font-mono text-xs">{a.products?.sku}</td>
                        <td className="p-3"><Badge variant="outline">{a.products?.certification}</Badge></td>
                        <td className="p-3 text-center font-medium">{a.quantity}</td>
                        <td className="p-3 text-center"><Badge variant="outline">{a.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {hasCert && (
          <TabsContent value="scorecard">
            {certification ? (
              <ScorecardEditor
                certificationId={certification.id}
                currentScore={Number(certification.score)}
                targetScore={Number(certification.target_score)}
              />
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  Nessuna scorecard trovata per questo progetto.
                </CardContent>
              </Card>
            )}
          </TabsContent>
        )}

        <TabsContent value="wbs">
          <ProjectWBS projectId={projectId!} />
        </TabsContent>

        <TabsContent value="payments">
          <ProjectPayments projectId={projectId!} />
        </TabsContent>
      </Tabs>
    </MainLayout>
  );
}

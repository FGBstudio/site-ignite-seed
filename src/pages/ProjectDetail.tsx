import { useParams, useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { useProjectDetails, useCertification, useProjectAllocations } from "@/hooks/useProjectDetails";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScorecardEditor } from "@/components/projects/ScorecardEditor";
import { ProjectWBS } from "@/components/projects/ProjectWBS";
import { ProjectOverview } from "@/components/projects/ProjectOverview";
import { useAuth } from "@/contexts/AuthContext";
import { ProjectPayments } from "@/components/projects/ProjectPayments";
import { ProjectCanvas } from "@/components/projects/ProjectCanvas";
import { ArrowLeft, MapPin, Calendar, User, Cpu } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FGBPlanner, type GanttRowData, type GanttSegment } from "@/components/dashboard/FGBPlanner";

const statusColors: Record<string, string> = {
  Design: "bg-primary/10 text-primary border-primary/20",
  Construction: "bg-warning/10 text-warning border-warning/20",
  Completed: "bg-success/10 text-success border-success/20",
  Cancelled: "bg-destructive/10 text-destructive border-destructive/20",
};

export default function ProjectDetail() {
  const params = useParams();
  const projectId = params.projectId || params.id; 
  const navigate = useNavigate();
  const { role } = useAuth();
  const { data: project, isLoading } = useProjectDetails(projectId);
  const { data: certification } = useCertification(projectId, project?.site_id);
  const { data: allocations } = useProjectAllocations(projectId);

  const { data: timelineMilestones = [] } = useQuery({
    queryKey: ["project-timeline", certification?.id],
    enabled: !!certification?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("certification_milestones")
        .select('*')
        .eq("certification_id", certification!.id)
        .eq("milestone_type", "timeline")
        .order("order_index");
      if (error) throw error;
      return data || [];
    },
  });

  const plannerData: GanttRowData[] = useMemo(() => {
    if (!project || timelineMilestones.length === 0) return [];

    const today = new Date().toISOString().slice(0, 10);
    const projectLaunchDate = project.created_at.slice(0, 10);
    const projectSegments: GanttSegment[] = [];

    const phases: GanttRowData[] = timelineMilestones.map((m: any) => {
      let role = "Specialist";
      try {
        const meta = JSON.parse(m.notes || "{}");
        if (meta.assigned_to_role) role = meta.assigned_to_role;
      } catch (e) {}

      let displayStatus = m.status;
      if (m.status === "on_hold") {
        displayStatus = "on_hold";
      } else if (m.status !== "achieved" && m.due_date && m.due_date < today) {
        displayStatus = "late";
      } else if (m.status === "achieved") {
        displayStatus = "achieved";
      } else if (m.status === "in_progress") {
        displayStatus = "in_progress";
      }

      if (m.start_date && m.due_date) {
        projectSegments.push({
          id: m.id,
          start: m.start_date,
          end: m.due_date,
          status: displayStatus,
          progress: m.status === "achieved" ? 100 : m.status === "in_progress" ? 50 : 0
        });
      }

      return {
        id: m.id,
        label: m.requirement,
        subLabel: `Role: ${role}`,
        currentActivity: m.status === "in_progress" ? m.requirement : (m.status === "achieved" ? "Completed" : "Pending"),
        launchDate: projectLaunchDate, 
        planStart: m.start_date,
        planEnd: m.due_date,
        actualStart: m.status !== "pending" ? m.start_date : null,
        actualEnd: m.completed_date || null,
        progress: m.status === "achieved" ? 100 : m.status === "in_progress" ? 50 : 0,
        status: displayStatus,
      };
    });

    const totalAchieved = timelineMilestones.filter((m: any) => m.status === 'achieved').length;
    const overallProgress = timelineMilestones.length > 0 ? Math.round((totalAchieved / timelineMilestones.length) * 100) : 0;
    
    const firstStartDate = timelineMilestones.map((m: any) => m.start_date).filter(Boolean).sort()[0] || projectLaunchDate;

    const activeMilestone = timelineMilestones.find((m: any) => m.status === "in_progress");
    const summaryActivity = activeMilestone ? activeMilestone.requirement : (project.status === "certificato" ? "Completed" : "Pending");

    const summaryRow: GanttRowData = {
      id: "summary",
      label: "PROJECT TOTAL",
      subLabel: "Overall Progress",
      currentActivity: summaryActivity,
      launchDate: projectLaunchDate,
      planStart: firstStartDate,
      planEnd: project.handover_date,
      actualStart: overallProgress > 0 ? firstStartDate : null,
      actualEnd: project.status === "certificato" ? today : null,
      progress: overallProgress,
      status: project.status === "certificato" ? "achieved" : (project.handover_date < today ? "late" : "in_progress"),
      segments: projectSegments
    };

    return [summaryRow, ...phases];
  }, [timelineMilestones, project]);

  if (isLoading) {
    return (
      <MainLayout title="Loading...">
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </MainLayout>
    );
  }

  if (!project) {
    return (
      <MainLayout title="Project not found">
        <div className="text-center py-20 text-muted-foreground">
          Project not found.
          <Button variant="link" onClick={() => navigate("/projects")}>Back to projects</Button>
        </div>
      </MainLayout>
    );
  }

  const hasCert = (project as any).project_type === "LEED" || (project as any).project_type === "WELL";
  const pmName = (project as any).profiles?.display_name || (project as any).profiles?.full_name || (project as any).profiles?.email || "—";
  const siteName = (project as any).sites?.name;
  const siteCity = (project as any).sites?.city;
  const siteCountry = (project as any).sites?.country;

  return (
    <MainLayout
      title={project.name}
      subtitle={`${project.client} — ${project.region}`}
    >
      <Button variant="ghost" size="sm" onClick={() => navigate("/projects")} className="gap-2 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to Projects
      </Button>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <MapPin className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Site</p>
              <p className="font-medium text-sm text-foreground">{siteName || "Not assigned"}</p>
              {siteCity && <p className="text-xs text-muted-foreground">{siteCity}{siteCountry ? `, ${siteCountry}` : ""}</p>}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Handover</p>
              <p className="font-medium text-sm text-foreground">{format(new Date(project.handover_date), "dd MMM yyyy")}</p>
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
              <p className="text-xs text-muted-foreground">Status / Type</p>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="outline" className={cn("border text-xs", statusColors[project.status])}>{project.status}</Badge>
                {(project as any).project_type && <Badge variant="secondary" className="text-xs">{(project as any).project_type}</Badge>}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="planner">Planner (Phases)</TabsTrigger>
          {hasCert && <TabsTrigger value="scorecard">Scorecard {(project as any).project_type}</TabsTrigger>}
          <TabsTrigger value="wbs">Schedule</TabsTrigger>
          <TabsTrigger value="hardware">Hardware</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <ProjectOverview
            certificationId={projectId!}
            project={project}
            timelineMilestones={timelineMilestones}
          />
        </TabsContent>

        <TabsContent value="planner">
          <Card>
            <CardContent className="p-0 border-none">
              {plannerData.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  No timeline initialized. Configure the project from the PM dashboard.
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
                No hardware allocated to this project.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-medium text-muted-foreground">Product</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">SKU</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Certification</th>
                      <th className="text-center p-3 font-medium text-muted-foreground">Quantity</th>
                      <th className="text-center p-3 font-medium text-muted-foreground">Status</th>
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
                  No scorecard found for this project.
                </CardContent>
              </Card>
            )}
          </TabsContent>
        )}

        <TabsContent value="wbs">
          <ProjectWBS projectId={projectId!} role={role} />
        </TabsContent>

        <TabsContent value="payments">
          <ProjectPayments projectId={projectId!} />
        </TabsContent>
      </Tabs>
    </MainLayout>
  );
}

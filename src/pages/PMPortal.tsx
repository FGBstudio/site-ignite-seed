import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { usePMDashboard, type PMProject } from "@/hooks/usePMDashboard";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import { 
  AlertTriangle, ArrowRight, Building2, CalendarIcon, CheckCircle2, 
  Clock3, FolderKanban, FileWarning, AlertCircle, CircleDollarSign 
} from "lucide-react";
import { PMCalendar } from "@/components/dashboard/PMCalendar";
import { ScrollArea } from "@/components/ui/scroll-area";

type PMProjectView = PMProject & { project_subtype?: string | null };

const STATUS_META = {
  da_configurare: {
    label: "To Configure",
    icon: AlertTriangle,
    className: "border-warning/30 bg-warning/10 text-warning",
  },
  in_corso: {
    label: "In Progress",
    icon: Clock3,
    className: "border-primary/30 bg-primary/10 text-primary",
  },
  certificato: {
    label: "Certified",
    icon: CheckCircle2,
    className: "border-success/30 bg-success/10 text-success",
  },
} as const;

export default function PMPortal() {
  const navigate = useNavigate();
  const { data: projects = [], isLoading } = usePMDashboard();

  const daConfigurare = projects.filter((p) => p.setup_status === "da_configurare");
  const inCorso = projects.filter((p) => p.setup_status === "in_corso");
  const certificati = projects.filter((p) => p.setup_status === "certificato");
  const recentProjects = useMemo(
    () =>
      [...projects]
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .slice(0, 5) as PMProjectView[],
    [projects],
  );

  // --- CALCOLO ALLARMI E RITARDI ---
  const alerts = useMemo(() => {
    const late: { project: PMProjectView; days: number }[] = [];
    const tasks: { project: PMProjectView; taskName: string; daysLeft: number }[] = [];
    const financial: { project: PMProjectView; issue: string }[] = [];

    const today = new Date();

    projects.forEach((p) => {
      // Analizziamo solo i progetti non ancora chiusi/certificati
      if (p.setup_status !== "certificato") {
        
        // 1. Late Projects (Calcolato dalla data di Handover)
        if (p.handover_date) {
          const handoverDate = new Date(p.handover_date);
          const delay = differenceInDays(today, handoverDate);
          if (delay > 0) {
            late.push({ project: p as PMProjectView, days: delay });
          }
        }

        // 2. Task Alerts (Milestone non completate e in scadenza o scadute)
        const activeTasks = (p.certification_milestones || []).filter(
          (m) => m.status !== "achieved" && m.due_date
        );

        activeTasks.forEach((m) => {
          const dueDate = new Date(m.due_date);
          const daysLeft = differenceInDays(dueDate, today);
          // Avvisa se il task è scaduto (< 0) o scade nei prossimi 14 giorni
          if (daysLeft <= 14) {
            tasks.push({
              project: p as PMProjectView,
              taskName: m.requirement || m.category || m.name || "Task",
              daysLeft,
            });
          }
        });

        // 3. Financial Issues (Es. Manca l'allocazione hardware che blocca i ricavi)
        if (p.missing && p.missing.includes("Hardware")) {
          financial.push({ 
            project: p as PMProjectView, 
            issue: "Hardware non allocato (Impatto su costi/fatturazione)" 
          });
        }
      }
    });

    return {
      late: late.sort((a, b) => b.days - a.days),
      tasks: tasks.sort((a, b) => a.daysLeft - b.daysLeft),
      financial: financial,
    };
  }, [projects]);

  return (
    <MainLayout title="PM Dashboard" subtitle="Operational overview of assigned projects">
      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : projects.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FolderKanban className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
            <p className="text-lg font-medium text-foreground">No projects assigned</p>
            <p className="mt-1 text-sm text-muted-foreground">
              When an admin assigns you a project, you'll see the recap here and in "My Projects" the operational dashboard.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* KPI PRINCIPALI */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="border-warning/30 bg-card">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
                  <AlertTriangle className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{daConfigurare.length}</p>
                  <p className="text-xs text-muted-foreground">To Configure</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-primary/30 bg-card">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Clock3 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{inCorso.length}</p>
                  <p className="text-xs text-muted-foreground">In Progress</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-success/30 bg-card">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{certificati.length}</p>
                  <p className="text-xs text-muted-foreground">Certified</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* SEZIONE ALERTS (NUOVA) */}
          <div className="grid gap-4 md:grid-cols-3">
            {/* LATE PROJECTS */}
            <Card className="border-destructive/30 shadow-sm">
              <CardHeader className="bg-destructive/5 py-3 border-b border-destructive/10">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-destructive">
                  <FileWarning className="w-4 h-4" /> Late Projects (days)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[180px] p-4">
                  {alerts.late.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center mt-12">Nessun progetto in ritardo sulla Handover.</p>
                  ) : (
                    <div className="space-y-4">
                      {alerts.late.map((alert, i) => (
                        <div key={i} className="flex flex-col gap-1 border-b border-border/50 pb-2 last:border-0 last:pb-0">
                          <div className="flex justify-between items-start">
                            <span className="text-sm font-medium leading-tight truncate pr-2">{alert.project.name}</span>
                            <Badge variant="destructive" className="text-[10px] whitespace-nowrap">
                              +{alert.days} days
                            </Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">{alert.project.client}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            {/* TASK ALERTS */}
            <Card className="border-warning/30 shadow-sm">
              <CardHeader className="bg-warning/5 py-3 border-b border-warning/10">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-warning-foreground">
                  <AlertCircle className="w-4 h-4 text-warning" /> Task Alerts
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[180px] p-4">
                  {alerts.tasks.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center mt-12">Nessun task in scadenza a breve.</p>
                  ) : (
                    <div className="space-y-4">
                      {alerts.tasks.map((task, i) => (
                        <div key={i} className="flex flex-col gap-1 border-b border-border/50 pb-2 last:border-0 last:pb-0">
                          <div className="flex justify-between items-start gap-2">
                            <span className="text-sm font-medium leading-tight line-clamp-1" title={task.taskName}>
                              {task.taskName}
                            </span>
                            <Badge 
                              variant={task.daysLeft < 0 ? "destructive" : "outline"} 
                              className={cn("text-[10px] whitespace-nowrap", task.daysLeft >= 0 && task.daysLeft <= 3 && "border-warning text-warning")}
                            >
                              {task.daysLeft < 0 ? `Scaduto da ${Math.abs(task.daysLeft)}gg` : `${task.daysLeft}gg rimasti`}
                            </Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">{task.project.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            {/* FINANCIAL ISSUES */}
            <Card className="border-amber-500/30 shadow-sm">
              <CardHeader className="bg-amber-500/5 py-3 border-b border-amber-500/10">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-amber-600">
                  <CircleDollarSign className="w-4 h-4" /> Financial Issues
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[180px] p-4">
                  {alerts.financial.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center mt-12">Nessuna criticità finanziaria rilevata.</p>
                  ) : (
                    <div className="space-y-4">
                      {alerts.financial.map((fin, i) => (
                        <div key={i} className="flex flex-col gap-1 border-b border-border/50 pb-2 last:border-0 last:pb-0">
                          <div className="flex justify-between items-start">
                            <span className="text-sm font-medium leading-tight truncate pr-2">{fin.project.name}</span>
                          </div>
                          <span className="text-xs text-destructive/80 font-medium">{fin.issue}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          <PMCalendar projects={projects} />

          {/* LISTA PROGETTI RECENTI */}
          <Card>
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Recently assigned projects</CardTitle>
                <CardDescription>Quick recap of the projects you're working on.</CardDescription>
              </div>
              <Button variant="outline" className="gap-2" onClick={() => navigate("/projects")}>
                Open My Projects
                <ArrowRight className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentProjects.map((project) => {
                const statusMeta = STATUS_META[project.setup_status];
                const StatusIcon = statusMeta.icon;
                return (
                  <div
                    key={project.id}
                    className="flex flex-col gap-3 rounded-lg border border-border/70 bg-muted/20 p-4 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-foreground">{project.name}</h3>
                        <Badge variant="outline" className={cn(statusMeta.className)}>
                          <StatusIcon className="mr-1 h-3 w-3" />
                          {statusMeta.label}
                        </Badge>
                      </div>
                      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Building2 className="h-3.5 w-3.5" />
                        {project.client}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {project.cert_type && <Badge variant="secondary">{project.cert_type}</Badge>}
                        {project.cert_rating && <Badge variant="outline">{project.cert_rating}</Badge>}
                        {project.project_subtype && <Badge variant="outline">{project.project_subtype}</Badge>}
                      </div>
                    </div>

                    <div className="flex flex-col items-start gap-2 text-sm text-muted-foreground lg:items-end">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarIcon className="h-3.5 w-3.5" />
                        {format(new Date(project.handover_date), "dd MMM yyyy")}
                      </span>
                      <Button size="sm" variant="ghost" className="gap-2 px-0" onClick={() => navigate("/projects")}>
                        Go to operational dashboard
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}
    </MainLayout>
  );
}

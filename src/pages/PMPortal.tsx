import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { usePMDashboard, type PMProject } from "@/hooks/usePMDashboard";
import { useAuth } from "@/contexts/AuthContext";
import { useTaskAlertCounts, ALERT_TYPE_LABELS, ALERT_TYPE_COLORS, type TaskAlertType } from "@/hooks/useTaskAlerts";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import { AlertTriangle, ArrowRight, Bell, Building2, CalendarIcon, CheckCircle2, Clock3, FolderKanban } from "lucide-react";
import { PMCalendar } from "@/components/dashboard/PMCalendar";

// IMPORT PER I WIDGET GRAFICI (STILE CEO DASHBOARD)
import { PieChart, Pie, Label, BarChart, Bar, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

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

// CONFIGURAZIONI GRAFICI SHADCN
const statusChartConfig = {
  count: { label: "Projects" },
  da_configurare: { label: "To Configure", color: "hsl(var(--warning))" },
  in_corso: { label: "In Progress", color: "hsl(var(--primary))" },
  certificato: { label: "Certified", color: "hsl(var(--success))" },
};

const lateChartConfig = {
  days: { label: "Days Late", color: "hsl(var(--destructive))" },
};

const financialChartConfig = {
  value: { label: "Issue Score", color: "hsl(var(--warning))" },
};

export default function PMPortal() {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { data: projects = [], isLoading } = usePMDashboard();
  const { total: alertTotal, counts: alertCounts, alerts: recentAlerts } = useTaskAlertCounts(role, user?.id);

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

  // --- COSTRUZIONE DATI PER I GRAFICI (Solo progetti del PM) ---
  const { statusData, lateData, financialData } = useMemo(() => {
    const today = new Date();

    // 1. Dati Donut Chart (Project Status)
    const sData = [
      { status: "da_configurare", count: daConfigurare.length, fill: "var(--color-da_configurare)" },
      { status: "in_corso", count: inCorso.length, fill: "var(--color-in_corso)" },
      { status: "certificato", count: certificati.length, fill: "var(--color-certificato)" },
    ].filter(d => d.count > 0);

    // 2. Dati Bar Chart (Late Projects - Calcolo da Handover a Submission)
    const lData = projects
      .filter(p => p.setup_status !== "certificato")
      .map(p => {
        const handoverMilestone = p.certification_milestones?.find(m => 
          m.requirement?.toLowerCase().includes("handover") || 
          m.category?.toLowerCase().includes("handover")
        );
        const baseDateStr = handoverMilestone?.due_date || p.handover_date;
        const submissionMilestone = p.certification_milestones?.find(m => 
          m.requirement?.toLowerCase().includes("submission") || 
          m.category?.toLowerCase().includes("submission")
        );
        const isSubmitted = submissionMilestone?.status === "achieved";

        let days = 0;
        if (!isSubmitted && baseDateStr) {
          const delay = differenceInDays(today, new Date(baseDateStr));
          if (delay > 0) days = delay;
        }
        return { name: p.name, days };
      })
      .filter(p => p.days > 0)
      .sort((a, b) => b.days - a.days)
      .slice(0, 5); // Mostra i top 5 più in ritardo

    // 3. Dati Bar Chart (Financial Issues)
    const fData = projects
      .filter(p => p.setup_status !== "certificato" && p.missing?.includes("Hardware"))
      .map(p => {
        return { name: p.name, value: 100 }; // Assegniamo uno score/valore fittizio all'alert
      })
      .slice(0, 5);

    return { statusData: sData, lateData: lData, financialData: fData };
  }, [projects, daConfigurare.length, inCorso.length, certificati.length]);

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
          
          {/* =========================================
              1. KPI COUNTERS (ORIGINALI)
          ========================================= */}
          <div className="grid gap-4 md:grid-cols-4">
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
            <Card
              className="border-destructive/30 bg-card cursor-pointer hover:shadow-md transition-all"
              onClick={() => navigate("/my-tasks")}
            >
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
                  <Bell className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{alertTotal}</p>
                  <p className="text-xs text-muted-foreground">Alerts / Tasks</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* =========================================
              2. WIDGET GRAFICI (NUOVI - STILE CEO)
          ========================================= */}
          <div className="grid gap-4 md:grid-cols-3">
            
            {/* WIDGET: PROJECT STATUS (Donut Chart) */}
            <Card className="flex flex-col">
              <CardHeader className="items-center pb-0">
                <CardTitle className="text-sm font-semibold">Project Status</CardTitle>
                <CardDescription className="text-xs">Overview of your active projects</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 pb-4 pt-4">
                {statusData.length === 0 ? (
                  <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
                    Nessun dato
                  </div>
                ) : (
                  <ChartContainer config={statusChartConfig} className="mx-auto aspect-square max-h-[200px]">
                    <PieChart>
                      <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                      <Pie
                        data={statusData}
                        dataKey="count"
                        nameKey="status"
                        innerRadius={50}
                        strokeWidth={4}
                      >
                        <Label
                          content={({ viewBox }) => {
                            if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                              return (
                                <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                                  <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-3xl font-bold">
                                    {projects.length}
                                  </tspan>
                                  <tspan x={viewBox.cx} y={(viewBox.cy || 0) + 24} className="fill-muted-foreground text-xs">
                                    Totali
                                  </tspan>
                                </text>
                              )
                            }
                          }}
                        />
                      </Pie>
                    </PieChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            {/* WIDGET: LATE PROJECTS (Horizontal Bar Chart) */}
            <Card className="flex flex-col">
              <CardHeader className="pb-0 pt-4">
                <CardTitle className="text-sm font-semibold text-destructive">Late Projects (days)</CardTitle>
                <CardDescription className="text-xs">Delayed post-handover</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 pb-4 pt-4">
                {lateData.length === 0 ? (
                  <div className="flex h-[180px] items-center justify-center text-sm text-muted-foreground">
                    Nessun progetto in ritardo
                  </div>
                ) : (
                  <ChartContainer config={lateChartConfig} className="h-[180px] w-full">
                    <BarChart data={lateData} layout="vertical" margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={100} tick={{ fontSize: 10 }} />
                      <ChartTooltip cursor={{ fill: 'var(--muted)' }} content={<ChartTooltipContent hideLabel />} />
                      <Bar dataKey="days" fill="var(--color-days)" radius={[0, 4, 4, 0]} barSize={20} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            {/* WIDGET: FINANCIAL ISSUES (Horizontal Bar Chart) */}
            <Card className="flex flex-col">
              <CardHeader className="pb-0 pt-4">
                <CardTitle className="text-sm font-semibold text-warning-foreground">Financial Issues</CardTitle>
                <CardDescription className="text-xs">Missing hardware or allocations</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 pb-4 pt-4">
                {financialData.length === 0 ? (
                  <div className="flex h-[180px] items-center justify-center text-sm text-muted-foreground">
                    Nessuna anomalia finanziaria
                  </div>
                ) : (
                  <ChartContainer config={financialChartConfig} className="h-[180px] w-full">
                    <BarChart data={financialData} layout="vertical" margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={100} tick={{ fontSize: 10 }} />
                      <ChartTooltip cursor={{ fill: 'var(--muted)' }} content={<ChartTooltipContent hideLabel />} />
                      <Bar dataKey="value" fill="var(--color-value)" radius={[0, 4, 4, 0]} barSize={20} />
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* =========================================
              3. CALENDARIO PM (ORIGINALE)
          ========================================= */}
          <PMCalendar projects={projects} />

          {/* =========================================
              4. LISTA PROGETTI RECENTI (ORIGINALE)
          ========================================= */}
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

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
import { AlertTriangle, ArrowRight, Bell, Building2, CalendarIcon, CheckCircle2, Clock3, DollarSign, FolderKanban, TrendingUp } from "lucide-react";
import { PMCalendar } from "@/components/dashboard/PMCalendar";
import { useFinancialAlerts } from "@/hooks/useFinancialAlerts";


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
  const { user, role } = useAuth();
  const { data: projects = [], isLoading } = usePMDashboard();
  const { total: alertTotal, counts: alertCounts, alerts: recentAlerts } = useTaskAlertCounts(role, user?.id);
  const { data: financialAlerts } = useFinancialAlerts();

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
  const { statusData, lateData } = useMemo(() => {
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
      .slice(0, 5);

    return { statusData: sData, lateData: lData };
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
            
            {/* WIDGET: PROJECT STATUS (Donut SVG minimal) */}
            <Card className="flex flex-col rounded-3xl border-border/60 shadow-sm">
              <CardContent className="flex flex-1 flex-col p-6">
                <h3 className="mb-6 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Project Status
                </h3>
                {projects.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                    No data
                  </div>
                ) : (
                  (() => {
                    const lateCount = lateData.length;
                    const segments = [
                      { key: "late", label: "Late", count: lateCount, stroke: "hsl(var(--destructive))", dot: "bg-destructive" },
                      { key: "certificato", label: "Certified", count: certificati.length, stroke: "hsl(var(--success))", dot: "bg-success" },
                      { key: "in_corso", label: "In Progress", count: inCorso.length, stroke: "hsl(var(--primary))", dot: "bg-primary" },
                      { key: "da_configurare", label: "To Configure", count: daConfigurare.length, stroke: "hsl(var(--muted-foreground))", dot: "bg-muted-foreground" },
                    ];
                    const total = projects.length;
                    let offset = 0;
                    return (
                      <div className="flex flex-1 items-center justify-between gap-6">
                        <div className="relative h-36 w-36 flex-shrink-0">
                          <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                            <circle cx="18" cy="18" r="15.9" fill="transparent" stroke="hsl(var(--muted))" strokeWidth="3.5" />
                            {segments.map((s) => {
                              if (s.count === 0) return null;
                              const dash = (s.count / total) * 100;
                              const el = (
                                <circle
                                  key={s.key}
                                  cx="18"
                                  cy="18"
                                  r="15.9"
                                  fill="transparent"
                                  stroke={s.stroke}
                                  strokeWidth="3.8"
                                  strokeDasharray={`${dash} 100`}
                                  strokeDashoffset={-offset}
                                  strokeLinecap="round"
                                />
                              );
                              offset += dash;
                              return el;
                            })}
                          </svg>
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-3xl font-semibold tracking-tight text-foreground">{total}</span>
                            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total</span>
                          </div>
                        </div>
                        <div className="flex flex-1 flex-col gap-3">
                          {segments.map((s) => (
                            <div key={s.key} className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className={cn("h-2 w-2 rounded-full", s.dot)} />
                                <span className="text-sm font-medium text-muted-foreground">{s.label}</span>
                              </div>
                              <span className="text-sm font-semibold text-foreground tabular-nums">{s.count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()
                )}
              </CardContent>
            </Card>

            {/* WIDGET: LATE PROJECTS (clean vertical list) */}
            <Card className="flex flex-col rounded-3xl border-border/60 shadow-sm">
              <CardContent className="flex flex-1 flex-col p-6">
                <h3 className="mb-6 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Late Projects (Days)
                </h3>
                {lateData.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                    No late projects
                  </div>
                ) : (
                  (() => {
                    const max = Math.max(...lateData.map((p) => p.days));
                    return (
                      <div className="space-y-4">
                        {lateData.map((p, i) => {
                          const critical = i < 2;
                          const width = max > 0 ? Math.max(8, (p.days / max) * 100) : 0;
                          return (
                            <div key={`${p.name}-${i}`}>
                              <div className="mb-1.5 flex items-end justify-between gap-2">
                                <span className="truncate text-[13px] font-medium text-foreground">{p.name}</span>
                                <span className={cn("text-xs font-semibold tabular-nums", critical ? "text-destructive" : "text-muted-foreground")}>
                                  {p.days} days
                                </span>
                              </div>
                              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                                <div
                                  className={cn("h-full rounded-full transition-all duration-500", critical ? "bg-destructive" : "bg-muted-foreground/40")}
                                  style={{ width: `${width}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()
                )}
              </CardContent>
            </Card>


            {/* WIDGET: FINANCIAL ALERTS (Clickable summary like Alerts/Tasks) */}
            <Card
              className="flex flex-col cursor-pointer hover:shadow-md transition-all"
              onClick={() => navigate("/projects?filter=financial")}
            >
              <CardHeader className="pb-0 pt-4 flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                    <DollarSign className="h-4 w-4 text-destructive" />
                    Financial Alerts
                  </CardTitle>
                  <CardDescription className="text-xs">Overdue payments & Extra-Canone</CardDescription>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="flex-1 pb-4 pt-4">
                {!financialAlerts || financialAlerts.totalCount === 0 ? (
                  <div className="flex h-[180px] items-center justify-center text-sm text-muted-foreground">
                    No financial issues 🎉
                  </div>
                ) : (
                  <div className="flex flex-col justify-center h-[180px] space-y-3">
                    <p className="text-4xl font-bold text-foreground text-center">{financialAlerts.totalCount}</p>
                    <p className="text-xs text-muted-foreground text-center">open financial issues</p>
                    <div className="flex flex-wrap gap-1.5 justify-center pt-1">
                      {financialAlerts.overduePayments.count > 0 && (
                        <Badge variant="outline" className="text-[10px] border-destructive/30 bg-destructive/10 text-destructive">
                          Overdue: {financialAlerts.overduePayments.count}
                        </Badge>
                      )}
                      {financialAlerts.extraCanone.count > 0 && (
                        <Badge variant="outline" className="text-[10px] border-destructive/30 bg-destructive/10 text-destructive">
                          <TrendingUp className="h-3 w-3 mr-0.5" />
                          Extra-Canone: {financialAlerts.extraCanone.count}
                        </Badge>
                      )}
                    </div>
                  </div>
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
                // STATUS_META copre tre stati; nel database ne esistono dieci
                // — `completato` da solo vale 93 commesse, `in_progress` 55.
                // Bastava che una finisse fra i cinque progetti recenti perché
                // `STATUS_META[...]` fosse undefined e `.icon` portasse via
                // tutta la pagina. Uno stato che non conosciamo si mostra per
                // quello che è, invece di far sparire la dashboard.
                const statusMeta = STATUS_META[project.setup_status] ?? {
                  label: (project.setup_status ?? "unknown").replace(/_/g, " "),
                  icon: FolderKanban,
                  className: "border-border bg-muted text-muted-foreground",
                };
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
                        {/* Senza questo controllo la pagina diventa bianca.
                            `new Date(null)` è una data invalida e `format` di
                            date-fns lancia RangeError invece di restituire una
                            stringa vuota: l'errore risale fino alla radice e
                            porta via tutta la schermata. Le certificazioni
                            senza handover sono 461 su 1507 — bastava che una
                            sola finisse in questa lista. */}
                        {project.handover_date
                          ? format(new Date(project.handover_date), "dd MMM yyyy")
                          : "no handover date"}
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

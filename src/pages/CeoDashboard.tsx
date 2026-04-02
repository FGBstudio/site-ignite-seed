import { useState, useMemo } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PMCalendar } from "@/components/dashboard/PMCalendar";
import { useAdminCalendarData } from "@/hooks/useAdminCalendarData";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  useCertTasks,
  useCertPayments,
  useActiveProjects,
  computeProjectStatus,
  computeOverduePayments,
  type CertTaskRow,
  type CertPaymentRow,
  type ProjectRow,
} from "@/hooks/useCeoDashboardData";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LabelList,
} from "recharts";
import { format, differenceInDays } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { AdminTimeline } from "@/components/admin/AdminTimeline";

// Chart color tokens (HSL from design system) - AGGIORNATI PER I NUOVI STATUS
const COLORS = {
  late: "hsl(0, 84%, 60%)",          // destructive (Rosso - In Ritardo)
  inProgress: "hsl(217, 91%, 50%)",  // primary (Blu - In Corso)
  toConfigure: "hsl(220, 14%, 71%)", // muted (Grigio - Da Configurare)
  certified: "hsl(142, 71%, 45%)",   // success (Verde - Certificati)
  overdue: "hsl(0, 84%, 60%)",
  paid: "hsl(142, 71%, 45%)",
  blocked: "hsl(38, 92%, 50%)",
};

// ============================================================
// KPI Strip
// ============================================================
function KpiStrip({ tasks, payments, projects }: { tasks: CertTaskRow[]; payments: CertPaymentRow[]; projects: ProjectRow[] }) {
  const { inRitardo, inCorso, daConfigurare, certificati, lateProjects } = useMemo(() => computeProjectStatus(projects, tasks), [projects, tasks]);
  const overdueByProject = useMemo(() => computeOverduePayments(payments), [payments]);

  const pieData = [
    { name: "In Ritardo", value: inRitardo, color: COLORS.late },
    { name: "In Corso", value: inCorso, color: COLORS.inProgress },
    { name: "Da Configurare", value: daConfigurare, color: COLORS.toConfigure },
    { name: "Certificati", value: certificati, color: COLORS.certified },
  ].filter(d => d.value > 0);

  const sortedLate = [...lateProjects].sort((a, b) => b.daysLate - a.daysLate).slice(0, 8);
  const sortedOverdue = [...overdueByProject].sort((a, b) => b.daysOverdue - a.daysOverdue).slice(0, 8);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
      {/* Pie */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Status Progetti</CardTitle>
        </CardHeader>
        <CardContent className="h-[220px]">
          {pieData.length === 0 ? (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">Nessun dato</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Bar: Late projects */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Progetti in Ritardo (giorni)</CardTitle>
        </CardHeader>
        <CardContent className="h-[220px]">
          {sortedLate.length === 0 ? (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">Nessun ritardo 🎉</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sortedLate} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={100} />
                <Tooltip formatter={(v: number) => [`${v} gg`, "Ritardo"]} />
                <Bar dataKey="daysLate" fill={COLORS.late} radius={[0, 4, 4, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Bar: Financial */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Criticità Finanziarie</CardTitle>
        </CardHeader>
        <CardContent className="h-[220px]">
          {sortedOverdue.length === 0 ? (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">Nessuno scaduto 🎉</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sortedOverdue} layout="vertical" margin={{ left: 10, right: 30, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={100} />
                <Tooltip formatter={(v: number, name: string) => {
                  if (name === "daysOverdue") return [`${v} gg`, "Ritardo"];
                  return [`€${v.toLocaleString("it-IT")}`, "Importo"];
                }} />
                <Bar dataKey="daysOverdue" fill={COLORS.overdue} radius={[0, 4, 4, 0]} barSize={18}>
                  <LabelList
                    dataKey="amount"
                    position="right"
                    formatter={(v: number) => `€${v.toLocaleString("it-IT")}`}
                    style={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// Tab: Risorse
// ============================================================
function TabRisorse({ tasks, projects }: { tasks: CertTaskRow[]; projects: ProjectRow[] }) {
  const [selectedUser, setSelectedUser] = useState<string | null>(null);

  // Build user map from BOTH cert_tasks assignees AND project PMs
  const userMap = useMemo(() => {
    const map = new Map<string, { name: string; tasks: CertTaskRow[]; projectCount: number }>();

    // 1. Add all PMs from projects
    for (const p of projects) {
      if (!p.pm_id) continue;
      if (!map.has(p.pm_id)) {
        map.set(p.pm_id, { name: p.pm_display_name || "PM senza nome", tasks: [], projectCount: 0 });
      }
      map.get(p.pm_id)!.projectCount++;
    }

    // 2. Add cert_tasks assignees and their tasks
    for (const t of tasks) {
      if (!t.assignee_id) continue;
      if (!map.has(t.assignee_id)) {
        map.set(t.assignee_id, { name: t.profiles?.full_name || "Senza nome", tasks: [], projectCount: 0 });
      }
      map.get(t.assignee_id)!.tasks.push(t);
    }
    return map;
  }, [tasks, projects]);

  const users = useMemo(() =>
    Array.from(userMap.entries()).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.tasks.length - a.tasks.length || b.projectCount - a.projectCount),
    [userMap]
  );

  const selectedTasks = useMemo(() => {
    if (!selectedUser) return [];
    return userMap.get(selectedUser)?.tasks || [];
  }, [selectedUser, userMap]);

  const tasksByProject = useMemo(() => {
    const map = new Map<string, { projectName: string; tasks: CertTaskRow[] }>();
    for (const t of selectedTasks) {
      if (!map.has(t.project_id)) {
        map.set(t.project_id, { projectName: t.projects?.name || "—", tasks: [] });
      }
      map.get(t.project_id)!.tasks.push(t);
    }
    return Array.from(map.values());
  }, [selectedTasks]);

  const computeSaturation = (userTasks: CertTaskRow[]) => {
    const withDates = userTasks.filter(t => t.start_date && t.end_date && t.status !== "Completed");
    if (withDates.length <= 1) return withDates.length;
    let maxOverlap = 1;
    for (let i = 0; i < withDates.length; i++) {
      let overlap = 1;
      for (let j = 0; j < withDates.length; j++) {
        if (i === j) continue;
        const s1 = new Date(withDates[i].start_date!), e1 = new Date(withDates[i].end_date!);
        const s2 = new Date(withDates[j].start_date!), e2 = new Date(withDates[j].end_date!);
        if (s1 <= e2 && s2 <= e1) overlap++;
      }
      maxOverlap = Math.max(maxOverlap, overlap);
    }
    return maxOverlap;
  };

  const getUserProjectCount = (userId: string) => {
    return projects.filter(p => p.pm_id === userId).length;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card className="md:col-span-1">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">PM / DM / Specialisti</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[450px] overflow-y-auto">
            {users.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nessuna risorsa assegnata</p>
            ) : users.map(u => {
              const sat = computeSaturation(u.tasks);
              const pCount = getUserProjectCount(u.id);
              const satColor = sat >= 4 ? "text-destructive" : sat >= 2 ? "text-warning" : "text-success";
              return (
                <button
                  key={u.id}
                  onClick={() => setSelectedUser(u.id === selectedUser ? null : u.id)}
                  className={cn(
                    "w-full text-left px-4 py-3 border-b transition-colors hover:bg-muted/50 flex justify-between items-center",
                    selectedUser === u.id && "bg-primary/5 border-l-2 border-l-primary"
                  )}
                >
                  <div>
                    <p className="font-medium text-sm text-foreground">{u.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {pCount} progett{pCount === 1 ? "o" : "i"} · {u.tasks.filter(t => t.status !== "Completed").length} task attive
                    </p>
                  </div>
                  <div className="text-right">
                    {u.tasks.length > 0 ? (
                      <Badge variant="outline" className={cn("text-xs", satColor)}>
                        Saturazione: {sat}x
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        Nessuna task
                      </Badge>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            {selectedUser ? `Task di ${userMap.get(selectedUser)?.name}` : "Seleziona una risorsa"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!selectedUser ? (
            <p className="text-sm text-muted-foreground text-center py-12">Clicca su un nome a sinistra per vedere le task assegnate</p>
          ) : tasksByProject.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-muted-foreground">Nessuna task operativa assegnata</p>
              {getUserProjectCount(selectedUser) > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Questa risorsa è PM di {getUserProjectCount(selectedUser)} progett{getUserProjectCount(selectedUser) === 1 ? "o" : "i"}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4 max-h-[400px] overflow-y-auto">
              {tasksByProject.map(({ projectName, tasks: pTasks }) => (
                <div key={projectName}>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{projectName}</h4>
                  <div className="space-y-1">
                    {pTasks.map(t => {
                      const statusColor = t.status === "Completed" ? "bg-success/10 text-success" :
                        t.status === "Blocked" ? "bg-destructive/10 text-destructive" :
                        t.status === "In_Progress" ? "bg-warning/10 text-warning" : "bg-muted text-muted-foreground";
                      return (
                        <div key={t.id} className="flex items-center justify-between p-2 rounded border bg-card">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{t.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {t.start_date ? format(new Date(t.start_date), "dd MMM", { locale: it }) : "—"} → {t.end_date ? format(new Date(t.end_date), "dd MMM", { locale: it }) : "—"}
                            </p>
                          </div>
                          <Badge variant="outline" className={cn("text-xs ml-2 shrink-0", statusColor)}>{t.status.replace("_", " ")}</Badge>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


// ============================================================
// Tab: Progetti
// ============================================================
function TabProgetti({ tasks, projects }: { tasks: CertTaskRow[]; projects: any[] }) {
  const navigate = useNavigate();

  const projectData = useMemo(() => {
    const tasksByProject = new Map<string, CertTaskRow[]>();
    for (const t of tasks) {
      if (!tasksByProject.has(t.project_id)) tasksByProject.set(t.project_id, []);
      tasksByProject.get(t.project_id)!.push(t);
    }

    return projects.map(p => {
      const pTasks = tasksByProject.get(p.id) || [];
      const total = pTasks.length;
      const completed = pTasks.filter(t => t.status === "Completed").length;
      const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
      const minStart = pTasks.reduce((min, t) => {
        if (!t.start_date) return min;
        return !min || t.start_date < min ? t.start_date : min;
      }, null as string | null);

      return { ...p, total, completed, progress, minStart };
    });
  }, [tasks, projects]);

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">ID</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead>Data Inizio</TableHead>
                <TableHead>Handover</TableHead>
                <TableHead>PM</TableHead>
                <TableHead className="w-[180px]">Avanzamento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projectData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nessun progetto attivo</TableCell>
                </TableRow>
              ) : projectData.map(p => (
                <TableRow
                  key={p.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => navigate(`/projects/${p.id}`)}
                >
                  <TableCell className="text-xs text-muted-foreground font-mono">{p.id.slice(0, 6)}</TableCell>
                  <TableCell className="font-medium text-foreground">{p.name}</TableCell>
                  <TableCell className="text-foreground">{p.client}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("text-xs border", {
                      "bg-primary/10 text-primary border-primary/20": p.status === "in_corso" || p.status === "Design" || p.status === "Construction",
                      "bg-success/10 text-success border-success/20": p.status === "certificato" || p.status === "certified",
                      "bg-muted text-muted-foreground border-muted": !p.status || p.status === "pending" || p.status === "da_configurare",
                    })}>
                      {p.status || "da_configurare"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{p.minStart ? format(new Date(p.minStart), "dd MMM yy", { locale: it }) : "—"}</TableCell>
                  <TableCell className="text-sm">{p.handover_date ? format(new Date(p.handover_date), "dd MMM yy", { locale: it }) : "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{p.pm_display_name || "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={p.progress} className="h-2 flex-1" />
                      <span className="text-xs text-muted-foreground w-[48px] text-right">{p.completed}/{p.total}</span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Tab: Pagamenti
// ============================================================
function TabPagamenti({ payments, projects }: { payments: CertPaymentRow[]; projects: any[] }) {
  const [selectedProject, setSelectedProject] = useState<string | null>(null);

  const projectsWithPayments = useMemo(() => {
    const pIds = new Set(payments.map(p => p.project_id));
    return projects.filter(p => pIds.has(p.id));
  }, [payments, projects]);

  const filteredPayments = useMemo(() => {
    if (!selectedProject) return payments;
    return payments.filter(p => p.project_id === selectedProject);
  }, [payments, selectedProject]);

  const getBarColor = (payment: CertPaymentRow) => {
    if (payment.status === "Paid") return COLORS.paid;
    if (payment.status === "Overdue") return COLORS.overdue;
    if (payment.trigger_task_id && payment.trigger_task?.status === "Blocked") return COLORS.blocked;
    return "hsl(var(--muted-foreground))";
  };

  const getBarLabel = (payment: CertPaymentRow) => {
    if (payment.status === "Paid") return "Pagato";
    if (payment.status === "Overdue") return "Scaduto";
    if (payment.trigger_task_id && payment.trigger_task?.status === "Blocked") return "Task Bloccata";
    return payment.status;
  };

  return (
    <div className="space-y-4">
      {/* Project filter */}
      <div className="flex flex-wrap gap-2">
        <Badge
          variant={selectedProject === null ? "default" : "outline"}
          className="cursor-pointer"
          onClick={() => setSelectedProject(null)}
        >
          Tutti
        </Badge>
        {projectsWithPayments.map(p => (
          <Badge
            key={p.id}
            variant={selectedProject === p.id ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setSelectedProject(p.id)}
          >
            {p.name}
          </Badge>
        ))}
      </div>

      {/* Timeline */}
      <Card>
        <CardContent className="pt-4">
          {filteredPayments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">Nessuna milestone di pagamento</p>
          ) : (
            <div className="space-y-3">
              {filteredPayments.map(p => {
                const barColor = getBarColor(p);
                const barLabel = getBarLabel(p);
                const today = new Date();
                const daysInfo = p.due_date
                  ? differenceInDays(new Date(p.due_date), today)
                  : null;

                return (
                  <div key={p.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-sm font-medium text-foreground">{p.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.projects?.name || "—"} • {p.due_date ? format(new Date(p.due_date), "dd MMM yyyy", { locale: it }) : "—"}
                          {daysInfo !== null && (
                            <span className={cn("ml-1", daysInfo < 0 ? "text-destructive" : "text-muted-foreground")}>
                              ({daysInfo < 0 ? `${Math.abs(daysInfo)}gg scaduto` : `${daysInfo}gg rimasti`})
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-foreground">€{Number(p.amount).toLocaleString("it-IT", { minimumFractionDigits: 2 })}</p>
                        <Badge variant="outline" className="text-xs" style={{ borderColor: barColor, color: barColor }}>
                          {barLabel}
                        </Badge>
                      </div>
                    </div>
                    {/* Visual bar */}
                    <div className="w-full h-3 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: p.status === "Paid" ? "100%" : p.status === "Overdue" ? "100%" : "60%",
                          backgroundColor: barColor,
                        }}
                      />
                    </div>
                    {p.trigger_task && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Task collegata: <span className="font-medium text-foreground">{p.trigger_task.title}</span> ({p.trigger_task.status.replace("_", " ")})
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// Main Dashboard
// ============================================================
export default function CeoDashboard() {
  const { data: tasks = [], isLoading: loadingTasks } = useCertTasks();
  const { data: payments = [], isLoading: loadingPayments } = useCertPayments();
  const { data: projects = [], isLoading: loadingProjects } = useActiveProjects();
  const { data: calendarProjects = [], isLoading: loadingCalendar } = useAdminCalendarData();

  const isLoading = loadingTasks || loadingPayments || loadingProjects;

  // Build pm names map for the calendar filter
  const pmNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of calendarProjects) {
      if (p.pm_id && p.pm_name) {
        map.set(p.pm_id, p.pm_name);
      }
    }
    return map;
  }, [calendarProjects]);

  return (
    <MainLayout title="CEO Dashboard" subtitle="Hub di controllo direzionale — Certificazioni & Portfolio">
      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <Card key={i}><CardContent className="pt-6"><Skeleton className="h-[220px] w-full" /></CardContent></Card>
            ))}
          </div>
          <Skeleton className="h-[400px] w-full" />
        </div>
      ) : (
        <>
          <KpiStrip tasks={tasks} payments={payments} projects={projects} />

          <PMCalendar projects={calendarProjects} adminMode pmNames={pmNames} />

          <Tabs defaultValue="progetti" className="space-y-4">
            <TabsList>
              <TabsTrigger value="risorse">Risorse</TabsTrigger>
              <TabsTrigger value="progetti">Progetti</TabsTrigger>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
              <TabsTrigger value="pagamenti">Pagamenti</TabsTrigger>
            </TabsList>

            <TabsContent value="risorse">
              <TabRisorse tasks={tasks} projects={projects} />
            </TabsContent>

            <TabsContent value="progetti">
              <TabProgetti tasks={tasks} projects={projects} />
            </TabsContent>

            <TabsContent value="pagamenti">
              <TabPagamenti payments={payments} projects={projects} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </MainLayout>
  );
}

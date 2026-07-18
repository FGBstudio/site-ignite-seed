import { useState, useMemo } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PMCalendar } from "@/components/dashboard/PMCalendar";
import { useAdminPlannerData } from "@/hooks/useAdminPlannerData";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  useCertTasks,
  useAllProjectTasks,
  useCertPayments,
  useActiveProjects,
  computeProjectStatus,
  computeOverduePayments,
  type CertTaskRow,
  type CertPaymentRow,
  type ProjectRow,
} from "@/hooks/useCeoDashboardData";
import { useTaskAlertCounts, ALERT_TYPE_LABELS, type TaskAlertType } from "@/hooks/useTaskAlerts";
import { useFinancialAlerts } from "@/hooks/useFinancialAlerts";
import { useAuth } from "@/contexts/AuthContext";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LabelList,
} from "recharts";
import { format, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import {
  ColumnFilter,
  applyColumnFiltersAndSort,
  type ColFiltersMap,
  type SortConfig,
} from "@/components/common/ColumnFilter";
import { ProjectBurnRate, ResourceMonitor } from "@/components/dashboard/HoursAnalytics";


const COLORS = {
  late: "hsl(0, 84%, 60%)",
  inProgress: "hsl(217, 91%, 50%)",
  toConfigure: "hsl(220, 14%, 71%)",
  certified: "hsl(142, 71%, 45%)",
  overdue: "hsl(0, 84%, 60%)",
  paid: "hsl(142, 71%, 45%)",
  blocked: "hsl(38, 92%, 50%)",
};

function KpiStrip({
  tasks,
  payments,
  projects,
  alertTotal,
  alertCounts,
  onOpenPayments,
}: {
  tasks: CertTaskRow[];
  payments: CertPaymentRow[];
  projects: ProjectRow[];
  alertTotal: number;
  alertCounts: Record<string, number>;
  onOpenPayments: () => void;
}) {
  const navigate = useNavigate();
  const { data: financialAlerts } = useFinancialAlerts();
  const { inRitardo, inCorso, daConfigurare, certificati, lateProjects } = useMemo(() => computeProjectStatus(projects, tasks), [projects, tasks]);
  const overdueByProject = useMemo(() => computeOverduePayments(payments), [payments]);

  const pieData = [
    { name: "Late", value: inRitardo, color: COLORS.late },
    { name: "In Progress", value: inCorso, color: COLORS.inProgress },
    { name: "To Configure", value: daConfigurare, color: COLORS.toConfigure },
    { name: "Certified", value: certificati, color: COLORS.certified },
  ].filter(d => d.value > 0);

  const sortedLate = [...lateProjects].sort((a, b) => b.daysLate - a.daysLate).slice(0, 8);
  const sortedOverdue = [...overdueByProject].sort((a, b) => b.daysOverdue - a.daysOverdue).slice(0, 8);

  const totalProjects = inRitardo + inCorso + daConfigurare + certificati;
  const segments = [
    { key: "late", label: "Late", count: inRitardo, stroke: "hsl(var(--destructive))", dot: "bg-destructive" },
    { key: "in_corso", label: "In Progress", count: inCorso, stroke: "hsl(var(--primary))", dot: "bg-primary" },
    { key: "da_configurare", label: "To Configure", count: daConfigurare, stroke: "hsl(var(--muted-foreground))", dot: "bg-muted-foreground" },
    { key: "certificato", label: "Certified", count: certificati, stroke: "hsl(var(--success))", dot: "bg-success" },
  ];

  const maxLate = sortedLate.length > 0 ? Math.max(...sortedLate.map(p => p.daysLate)) : 0;
  const topLate = sortedLate.slice(0, 5);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
      {/* PROJECT STATUS — Donut minimal */}
      <Card className="flex flex-col rounded-3xl border-border/60 shadow-sm">
        <CardContent className="flex flex-1 flex-col p-6">
          <h3 className="mb-6 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Project Status
          </h3>
          {totalProjects === 0 ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">No data</div>
          ) : (
            (() => {
              let offset = 0;
              return (
                <div className="flex flex-1 items-center justify-between gap-5">
                  <div className="relative h-32 w-32 flex-shrink-0">
                    <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                      <circle cx="18" cy="18" r="15.9" fill="transparent" stroke="hsl(var(--muted))" strokeWidth="3.5" />
                      {segments.map(s => {
                        if (s.count === 0) return null;
                        const dash = (s.count / totalProjects) * 100;
                        const el = (
                          <circle
                            key={s.key}
                            cx="18" cy="18" r="15.9"
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
                      <span className="text-2xl font-semibold tracking-tight text-foreground">{totalProjects}</span>
                      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total</span>
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col gap-2.5">
                    {segments.map(s => (
                      <div key={s.key} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={cn("h-2 w-2 rounded-full", s.dot)} />
                          <span className="text-xs font-medium text-muted-foreground">{s.label}</span>
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

      {/* LATE PROJECTS — clean vertical list */}
      <Card className="flex flex-col rounded-3xl border-border/60 shadow-sm">
        <CardContent className="flex flex-1 flex-col p-6">
          <h3 className="mb-6 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Late Projects (Days)
          </h3>
          {topLate.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">No delays 🎉</div>
          ) : (
            <div className="space-y-3.5">
              {topLate.map((p, i) => {
                const critical = i < 2;
                const width = maxLate > 0 ? Math.max(8, (p.daysLate / maxLate) * 100) : 0;
                return (
                  <div key={`${p.name}-${i}`}>
                    <div className="mb-1.5 flex items-end justify-between gap-2">
                      <span className="truncate text-[13px] font-medium text-foreground">{p.name}</span>
                      <span className={cn("text-xs font-semibold tabular-nums", critical ? "text-destructive" : "text-muted-foreground")}>
                        {p.daysLate}d
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn("h-full rounded-full transition-all duration-500", critical ? "bg-destructive" : "bg-muted-foreground/40")}
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* FINANCIAL ALERTS — summary */}
      <Card
        className="flex flex-col rounded-3xl border-border/60 shadow-sm cursor-pointer hover:shadow-md transition-all"
        onClick={onOpenPayments}
      >
        <CardContent className="flex flex-1 flex-col p-6">
          <h3 className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Financial Alerts
          </h3>
          {(!financialAlerts || financialAlerts.totalCount === 0) && sortedOverdue.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">None overdue 🎉</div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2">
              <p className="text-4xl font-semibold tracking-tight text-foreground">{financialAlerts?.totalCount ?? sortedOverdue.length}</p>
              <p className="text-xs text-muted-foreground">open financial issues</p>
              <div className="mt-2 flex flex-wrap gap-1.5 justify-center">
                {financialAlerts?.overduePayments.count ? (
                  <Badge variant="outline" className="text-[10px] border-destructive/30 bg-destructive/10 text-destructive">
                    Overdue: {financialAlerts.overduePayments.count}
                  </Badge>
                ) : null}
                {financialAlerts?.extraCanone.count ? (
                  <Badge variant="outline" className="text-[10px] border-destructive/30 bg-destructive/10 text-destructive">
                    Extra-Canone: {financialAlerts.extraCanone.count}
                  </Badge>
                ) : null}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ALERTS / TASKS */}
      <Card
        className="flex flex-col rounded-3xl border-border/60 shadow-sm cursor-pointer hover:shadow-md transition-all"
        onClick={() => navigate("/admin-tasks")}
      >
        <CardContent className="flex flex-1 flex-col p-6">
          <h3 className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Alerts / Tasks
          </h3>
          {alertTotal === 0 ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">No open alerts 🎉</div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2">
              <p className="text-4xl font-semibold tracking-tight text-foreground">{alertTotal}</p>
              <p className="text-xs text-muted-foreground">open alerts from PMs</p>
              <div className="mt-2 flex flex-wrap gap-1.5 justify-center">
                {Object.entries(alertCounts)
                  .filter(([, v]) => v > 0)
                  .slice(0, 5)
                  .map(([type, count]) => (
                    <Badge key={type} variant="outline" className="text-[10px]">
                      {ALERT_TYPE_LABELS[type as TaskAlertType]}: {count}
                    </Badge>
                  ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TabRisorse({ tasks, projects }: { tasks: CertTaskRow[]; projects: ProjectRow[] }) {
  const [selectedUser, setSelectedUser] = useState<string | null>(null);

  const userMap = useMemo(() => {
    const map = new Map<string, { name: string; tasks: CertTaskRow[]; projectCount: number }>();
    for (const p of projects) {
      if (!p.pm_id) continue;
      if (!map.has(p.pm_id)) {
        map.set(p.pm_id, { name: p.pm_display_name || "Unnamed PM", tasks: [], projectCount: 0 });
      }
      map.get(p.pm_id)!.projectCount++;
    }
    for (const t of tasks) {
      if (!t.assignee_id) continue;
      if (!map.has(t.assignee_id)) {
        map.set(t.assignee_id, { name: t.profiles?.full_name || "Unnamed", tasks: [], projectCount: 0 });
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
      if (!map.has(t.certification_id)) {
        map.set(t.certification_id, { projectName: t.certifications?.name || "—", tasks: [] });
      }
      map.get(t.certification_id)!.tasks.push(t);
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
          <CardTitle className="text-sm">PM / DM / Specialists</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[450px] overflow-y-auto">
            {users.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No resources assigned</p>
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
                      {pCount} project{pCount === 1 ? "" : "s"} · {u.tasks.filter(t => t.status !== "Completed").length} active tasks
                    </p>
                  </div>
                  <div className="text-right">
                    {u.tasks.length > 0 ? (
                      <Badge variant="outline" className={cn("text-xs", satColor)}>
                        Saturation: {sat}x
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        No tasks
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
            {selectedUser ? `Tasks for ${userMap.get(selectedUser)?.name}` : "Select a resource"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!selectedUser ? (
            <p className="text-sm text-muted-foreground text-center py-12">Click a name on the left to see assigned tasks</p>
          ) : tasksByProject.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-muted-foreground">No operational tasks assigned</p>
              {getUserProjectCount(selectedUser) > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  This resource is PM of {getUserProjectCount(selectedUser)} project{getUserProjectCount(selectedUser) === 1 ? "" : "s"}
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
                              {t.start_date ? format(new Date(t.start_date), "dd MMM") : "—"} → {t.end_date ? format(new Date(t.end_date), "dd MMM") : "—"}
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

function TabProgetti({ tasks, projects }: { tasks: CertTaskRow[]; projects: any[] }) {
  const navigate = useNavigate();
  const [colFilters, setColFilters] = useState<ColFiltersMap>({});
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);

  const projectData = useMemo(() => {
    const tasksByProject = new Map<string, CertTaskRow[]>();
    for (const t of tasks) {
      if (!tasksByProject.has(t.certification_id)) tasksByProject.set(t.certification_id, []);
      tasksByProject.get(t.certification_id)!.push(t);
    }

    return projects.map((p) => {
      const pTasks = tasksByProject.get(p.id) || [];
      const total = pTasks.length;
      const completed = pTasks.filter((t) => t.status === "Completed").length;
      const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
      const minStart = pTasks.reduce((min, t) => {
        if (!t.start_date) return min;
        return !min || t.start_date < min ? t.start_date : min;
      }, null as string | null);

      return { ...p, total, completed, progress, minStart };
    });
  }, [tasks, projects]);

  const resolvers = useMemo(
    () => ({
      client: (r: any) => r.client || "",
      city: (r: any) => r.city || "",
      name: (r: any) => r.name || "",
      status: (r: any) => r.status || "da_configurare",
      minStart: (r: any) => (r.minStart ? format(new Date(r.minStart), "dd MMM yy") : ""),
      handover_date: (r: any) => (r.handover_date ? format(new Date(r.handover_date), "dd MMM yy") : ""),
      pm_display_name: (r: any) => r.pm_display_name || "",
    }),
    []
  );

  const visible = useMemo(
    () => applyColumnFiltersAndSort(projectData, colFilters, sortConfig, resolvers),
    [projectData, colFilters, sortConfig, resolvers]
  );

  const filterProps = { colFilters, setColFilters, sortConfig, setSortConfig };

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead><ColumnFilter title="Client" colKey="client" rows={projectData} getValue={resolvers.client} {...filterProps} /></TableHead>
                <TableHead><ColumnFilter title="City" colKey="city" rows={projectData} getValue={resolvers.city} {...filterProps} /></TableHead>
                <TableHead><ColumnFilter title="Project" colKey="name" rows={projectData} getValue={resolvers.name} {...filterProps} /></TableHead>
                <TableHead><ColumnFilter title="Status" colKey="status" rows={projectData} getValue={resolvers.status} {...filterProps} /></TableHead>
                <TableHead><ColumnFilter title="Start Date" colKey="minStart" rows={projectData} getValue={resolvers.minStart} {...filterProps} /></TableHead>
                <TableHead><ColumnFilter title="Handover" colKey="handover_date" rows={projectData} getValue={resolvers.handover_date} {...filterProps} /></TableHead>
                <TableHead><ColumnFilter title="PM" colKey="pm_display_name" rows={projectData} getValue={resolvers.pm_display_name} {...filterProps} /></TableHead>
                <TableHead className="w-[180px]">Progress</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">No active projects</TableCell>
                </TableRow>
              ) : visible.map(p => (
                <TableRow
                  key={p.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => navigate(`/projects/${p.id}`)}
                >
                  <TableCell className="font-semibold text-foreground uppercase">{p.client || "—"}</TableCell>
                  <TableCell className="text-muted-foreground uppercase">{p.city || "—"}</TableCell>
                  <TableCell className="text-foreground">{p.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("text-xs border", {
                      "bg-primary/10 text-primary border-primary/20": p.status === "in_corso" || p.status === "Design" || p.status === "Construction",
                      "bg-success/10 text-success border-success/20": p.status === "certificato" || p.status === "certified",
                      "bg-muted text-muted-foreground border-muted": !p.status || p.status === "pending" || p.status === "da_configurare",
                    })}>
                      {p.status || "da_configurare"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{p.minStart ? format(new Date(p.minStart), "dd MMM yy") : "—"}</TableCell>
                  <TableCell className="text-sm">{p.handover_date ? format(new Date(p.handover_date), "dd MMM yy") : "—"}</TableCell>
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


function TabPagamenti({ payments, projects }: { payments: CertPaymentRow[]; projects: any[] }) {
  const [selectedProject, setSelectedProject] = useState<string | null>(null);

  const projectsWithPayments = useMemo(() => {
    const pIds = new Set(payments.map(p => p.certification_id));
    return projects.filter(p => pIds.has(p.id));
  }, [payments, projects]);

  const filteredPayments = useMemo(() => {
    if (!selectedProject) return payments;
    return payments.filter(p => p.certification_id === selectedProject);
  }, [payments, selectedProject]);

  const getBarColor = (payment: CertPaymentRow) => {
    if (payment.status === "Paid") return COLORS.paid;
    if (payment.status === "Overdue") return COLORS.overdue;
    if (payment.trigger_task_id && payment.trigger_task?.status === "Blocked") return COLORS.blocked;
    return "hsl(var(--muted-foreground))";
  };

  const getBarLabel = (payment: CertPaymentRow) => {
    if (payment.status === "Paid") return "Paid";
    if (payment.status === "Overdue") return "Overdue";
    if (payment.trigger_task_id && payment.trigger_task?.status === "Blocked") return "Task Blocked";
    return payment.status;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Badge
          variant={selectedProject === null ? "default" : "outline"}
          className="cursor-pointer"
          onClick={() => setSelectedProject(null)}
        >
          All
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

      <Card>
        <CardContent className="pt-4">
          {filteredPayments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">No payment milestones</p>
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
                          {p.certifications?.name || "—"} • {p.due_date ? format(new Date(p.due_date), "dd MMM yyyy") : "—"}
                          {daysInfo !== null && (
                            <span className={cn("ml-1", daysInfo < 0 ? "text-destructive" : "text-muted-foreground")}>
                              ({daysInfo < 0 ? `${Math.abs(daysInfo)}d overdue` : `${daysInfo}d left`})
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-foreground">€{Number(p.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
                        <Badge variant="outline" className="text-xs" style={{ borderColor: barColor, color: barColor }}>
                          {barLabel}
                        </Badge>
                      </div>
                    </div>
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
                        Linked task: <span className="font-medium text-foreground">{p.trigger_task.title}</span> ({p.trigger_task.status.replace("_", " ")})
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

export default function CeoDashboard() {
  const { user, role } = useAuth();
  const { data: tasks = [], isLoading: loadingTasks } = useCertTasks();
  const { data: projectTasks = [] } = useAllProjectTasks();
  const { data: payments = [], isLoading: loadingPayments } = useCertPayments();
  const { data: projects = [], isLoading: loadingProjects } = useActiveProjects();
  const { data: calendarProjects = [], isLoading: loadingCalendar } = useAdminPlannerData();
  const { total: alertTotal, counts: alertCountsRaw } = useTaskAlertCounts(role, user?.id);
  const alertCounts = alertCountsRaw as unknown as Record<string, number>;

  const isLoading = loadingTasks || loadingPayments || loadingProjects;
  const [activeTab, setActiveTab] = useState("projects");

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
    <MainLayout title="Admins Dashboard" subtitle="Executive control hub — Certifications & Portfolio">
      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <Card key={i}><CardContent className="pt-6"><Skeleton className="h-[220px] w-full" /></CardContent></Card>
            ))}
          </div>
          <Skeleton className="h-[400px] w-full" />
        </div>
      ) : (
        <>
          <KpiStrip
            tasks={tasks}
            payments={payments}
            projects={projects}
            alertTotal={alertTotal}
            alertCounts={alertCounts}
            onOpenPayments={() => setActiveTab("payments")}
          />


          <PMCalendar projects={calendarProjects as any} adminMode pmNames={pmNames} />

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList>
              <TabsTrigger value="resources">Resources</TabsTrigger>
              <TabsTrigger value="projects">Projects</TabsTrigger>
              <TabsTrigger value="payments">Payments</TabsTrigger>
              <TabsTrigger value="hours">Hours</TabsTrigger>
            </TabsList>



            <TabsContent value="resources">
              <TabRisorse tasks={[...tasks, ...projectTasks]} projects={projects} />
            </TabsContent>

            <TabsContent value="projects">
              <TabProgetti tasks={tasks} projects={projects} />
            </TabsContent>

            <TabsContent value="payments">
              <TabPagamenti payments={payments} projects={projects} />
            </TabsContent>

            <TabsContent value="hours" className="space-y-4">
              <ProjectBurnRate />
              <ResourceMonitor />
            </TabsContent>
          </Tabs>
        </>
      )}
    </MainLayout>
  );
}

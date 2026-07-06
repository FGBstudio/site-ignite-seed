import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAdminPlannerData, type AdminPlannerProject } from "@/hooks/useAdminPlannerData";
import { AlertTriangle, PauseCircle, Clock3, CheckCircle2, FileText, XCircle, Activity } from "lucide-react";
import { differenceInDays, format } from "date-fns";
import { cn } from "@/lib/utils";

interface OnHoldInfo {
  certification_id: string;
  title: string;
  description: string | null;
  created_at: string;
}

interface LateMilestoneInfo {
  certification_id: string;
  requirement: string;
  due_date: string;
  daysLate: number;
}

function useOnHoldAlerts() {
  return useQuery({
    queryKey: ["projects-reports-on-hold-alerts"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("task_alerts")
        .select("certification_id, title, description, created_at")
        .eq("alert_type", "project_on_hold")
        .eq("is_resolved", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as OnHoldInfo[];
    },
  });
}

function useLateMilestones() {
  return useQuery({
    queryKey: ["projects-reports-late-milestones"],
    queryFn: async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("certification_milestones")
        .select("certification_id, requirement, due_date, status")
        .eq("milestone_type", "timeline")
        .lt("due_date", today)
        .neq("status", "achieved");
      if (error) throw error;
      const todayDate = new Date();
      const rows = (data || []).map((m: any) => ({
        certification_id: m.certification_id as string,
        requirement: (m.requirement as string) || "Milestone",
        due_date: m.due_date as string,
        daysLate: differenceInDays(todayDate, new Date(m.due_date)),
      }));
      // Keep the worst (most overdue) per certification
      const byCert = new Map<string, LateMilestoneInfo>();
      for (const r of rows) {
        const existing = byCert.get(r.certification_id);
        if (!existing || r.daysLate > existing.daysLate) byCert.set(r.certification_id, r);
      }
      return Array.from(byCert.values());
    },
  });
}

interface KpiTileProps {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone: "default" | "primary" | "destructive" | "warning" | "success";
}

const TONE_CLASS: Record<KpiTileProps["tone"], string> = {
  default: "text-foreground",
  primary: "text-primary",
  destructive: "text-destructive",
  warning: "text-warning",
  success: "text-success",
};

function KpiTile({ label, value, icon: Icon, tone }: KpiTileProps) {
  return (
    <Card className="rounded-3xl border-border/60 shadow-sm">
      <CardContent className="p-5 flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className={cn("mt-1 text-3xl font-semibold tabular-nums", TONE_CLASS[tone])}>{value}</p>
        </div>
        <div className={cn("h-10 w-10 rounded-2xl bg-muted/60 flex items-center justify-center", TONE_CLASS[tone])}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

interface DonutSegment {
  value: number;
  colorVar: string;
  label: string;
}

function Donut({ segments, total }: { segments: DonutSegment[]; total: number }) {
  const radius = 70;
  const stroke = 18;
  const c = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="flex items-center gap-6">
      <svg width={170} height={170} viewBox="0 0 170 170">
        <circle cx="85" cy="85" r={radius} stroke="hsl(var(--muted))" strokeWidth={stroke} fill="none" />
        {segments.map((s, i) => {
          const len = total > 0 ? (s.value / total) * c : 0;
          const el = (
            <circle
              key={i}
              cx="85"
              cy="85"
              r={radius}
              stroke={`hsl(var(--${s.colorVar}))`}
              strokeWidth={stroke}
              fill="none"
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 85 85)"
              strokeLinecap="butt"
            />
          );
          offset += len;
          return el;
        })}
        <text x="85" y="82" textAnchor="middle" className="fill-foreground text-2xl font-semibold tabular-nums">
          {total}
        </text>
        <text x="85" y="102" textAnchor="middle" className="fill-muted-foreground text-[10px] uppercase tracking-wider">
          Total
        </text>
      </svg>
      <div className="space-y-2 flex-1">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: `hsl(var(--${s.colorVar}))` }} />
            <span className="text-foreground flex-1">{s.label}</span>
            <span className="font-semibold tabular-nums text-foreground">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProjectsReports() {
  const { data: projects = [], isLoading } = useAdminPlannerData();
  const { data: onHoldAlerts = [] } = useOnHoldAlerts();
  const { data: lateMilestones = [] } = useLateMilestones();

  const lateByCert = useMemo(() => {
    const map = new Map<string, LateMilestoneInfo>();
    for (const m of lateMilestones) map.set(m.certification_id, m);
    return map;
  }, [lateMilestones]);

  const onHoldByCert = useMemo(() => {
    const map = new Map<string, OnHoldInfo>();
    for (const a of onHoldAlerts) {
      if (!map.has(a.certification_id)) map.set(a.certification_id, a); // latest first thanks to ordering
    }
    return map;
  }, [onHoldAlerts]);

  const activeProjects = useMemo(
    () => projects.filter((p) => p.setup_status !== "canceled"),
    [projects]
  );

  const counts = useMemo(() => {
    const c = {
      total: activeProjects.length,
      quotation: 0,
      to_configure: 0,
      in_progress: 0,
      certified: 0,
      canceled: projects.filter((p) => p.setup_status === "canceled").length,
      late: 0,
      onHold: 0,
      critical: 0,
    };
    for (const p of activeProjects) {
      if (p.setup_status === "quotation") c.quotation += 1;
      else if (p.setup_status === "da_configurare") c.to_configure += 1;
      else if (p.setup_status === "in_corso") c.in_progress += 1;
      else if (p.setup_status === "certificato") c.certified += 1;
      if (lateByCert.has(p.id)) c.late += 1;
      if (onHoldByCert.has(p.id)) c.onHold += 1;
      if (p.is_deadline_critical) c.critical += 1;
    }
    return c;
  }, [activeProjects, projects, lateByCert, onHoldByCert]);

  const macroPhaseCounts = useMemo(() => {
    const m = { Design: 0, Construction: 0, Certification: 0, Certified: 0, Other: 0 };
    for (const p of activeProjects) {
      const key = (p.macro_phase || "Other") as keyof typeof m;
      if (key in m) m[key] += 1;
      else m.Other += 1;
    }
    return m;
  }, [activeProjects]);

  const lateProjects = useMemo(() => {
    return activeProjects
      .filter((p) => lateByCert.has(p.id))
      .map((p) => ({ project: p, late: lateByCert.get(p.id)! }))
      .sort((a, b) => b.late.daysLate - a.late.daysLate);
  }, [activeProjects, lateByCert]);

  const onHoldProjects = useMemo(() => {
    return activeProjects
      .filter((p) => onHoldByCert.has(p.id))
      .map((p) => ({ project: p, alert: onHoldByCert.get(p.id)! }))
      .sort((a, b) => a.alert.created_at < b.alert.created_at ? 1 : -1);
  }, [activeProjects, onHoldByCert]);

  const criticalDeadlineProjects = useMemo(
    () => activeProjects.filter((p) => p.is_deadline_critical).sort((a, b) => a.handover_date.localeCompare(b.handover_date)),
    [activeProjects]
  );

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const statusSegments: DonutSegment[] = [
    { value: counts.late, colorVar: "destructive", label: "Late" },
    { value: counts.onHold, colorVar: "muted-foreground", label: "On Hold" },
    { value: counts.in_progress, colorVar: "primary", label: "In Progress" },
    { value: counts.to_configure, colorVar: "warning", label: "To Configure" },
    { value: counts.quotation, colorVar: "accent-foreground", label: "Quotation" },
    { value: counts.certified, colorVar: "success", label: "Certified" },
  ];

  const macroMax = Math.max(1, ...Object.values(macroPhaseCounts));

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiTile label="Total Active" value={counts.total} icon={Activity} tone="default" />
        <KpiTile label="In Progress" value={counts.in_progress} icon={Clock3} tone="primary" />
        <KpiTile label="Late" value={counts.late} icon={AlertTriangle} tone="destructive" />
        <KpiTile label="On Hold" value={counts.onHold} icon={PauseCircle} tone="warning" />
        <KpiTile label="Critical (<15d)" value={counts.critical} icon={AlertTriangle} tone="destructive" />
        <KpiTile label="Certified" value={counts.certified} icon={CheckCircle2} tone="success" />
      </div>

      {/* Status + Macro Phase */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="rounded-3xl border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
              Status Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <Donut segments={statusSegments} total={counts.total} />
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
              Macro Phase Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-2">
            {Object.entries(macroPhaseCounts).map(([phase, val]) => (
              <div key={phase}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-foreground">{phase}</span>
                  <span className="text-sm font-semibold tabular-nums text-foreground">{val}</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      phase === "Certified" ? "bg-success" : phase === "Construction" ? "bg-warning" : "bg-primary"
                    )}
                    style={{ width: `${(val / macroMax) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Late Projects */}
      <Card className="rounded-3xl border-border/60 shadow-sm">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
            Late Projects
          </CardTitle>
          <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">
            {lateProjects.length}
          </Badge>
        </CardHeader>
        <CardContent>
          {lateProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No late projects. 🎉</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Client</th>
                    <th className="py-2 pr-4 font-medium">City</th>
                    <th className="py-2 pr-4 font-medium">Project</th>
                    <th className="py-2 pr-4 font-medium">PM</th>
                    <th className="py-2 pr-4 font-medium">Phase</th>
                    <th className="py-2 pr-4 font-medium">Late Milestone</th>
                    <th className="py-2 pr-4 font-medium">Due</th>
                    <th className="py-2 pr-4 font-medium text-right">Days Late</th>
                  </tr>
                </thead>
                <tbody>
                  {lateProjects.map(({ project, late }) => (
                    <tr key={project.id} className="border-b last:border-b-0 hover:bg-muted/40">
                      <td className="py-3 pr-4 font-semibold text-foreground">{project.client}</td>
                      <td className="py-3 pr-4 text-muted-foreground">{project.city || "—"}</td>
                      <td className="py-3 pr-4 text-foreground">{project.name}</td>
                      <td className="py-3 pr-4 text-muted-foreground">{project.pm_name || "—"}</td>
                      <td className="py-3 pr-4">
                        <Badge variant="outline" className="text-xs">{project.macro_phase || "—"}</Badge>
                      </td>
                      <td className="py-3 pr-4 text-foreground">{late.requirement}</td>
                      <td className="py-3 pr-4 text-muted-foreground tabular-nums">
                        {format(new Date(late.due_date), "dd MMM yyyy")}
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <span className="font-semibold tabular-nums text-destructive">{late.daysLate}d</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* On Hold Projects */}
      <Card className="rounded-3xl border-border/60 shadow-sm">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
            On Hold — Reasons
          </CardTitle>
          <Badge variant="outline" className="border-warning/30 bg-warning/10 text-warning">
            {onHoldProjects.length}
          </Badge>
        </CardHeader>
        <CardContent>
          {onHoldProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No projects on hold.</p>
          ) : (
            <div className="space-y-3">
              {onHoldProjects.map(({ project, alert }) => (
                <div key={project.id} className="rounded-2xl border border-border/60 p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <PauseCircle className="h-4 w-4 text-warning shrink-0" />
                        <span className="font-semibold text-foreground">{project.client}</span>
                        <span className="text-xs text-muted-foreground">· {project.city || "—"}</span>
                        <span className="text-sm text-foreground">· {project.name}</span>
                        {project.pm_name && <span className="text-xs text-muted-foreground">· PM {project.pm_name}</span>}
                      </div>
                      <p className="mt-2 text-sm text-foreground">{alert.title}</p>
                      {alert.description && (
                        <p className="mt-1 text-sm text-muted-foreground italic">"{alert.description}"</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Since</p>
                      <p className="text-sm font-medium text-foreground tabular-nums">
                        {format(new Date(alert.created_at), "dd MMM yyyy")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {differenceInDays(new Date(), new Date(alert.created_at))}d
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Critical Deadlines */}
      <Card className="rounded-3xl border-border/60 shadow-sm">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
            {"Critical Deadlines (< 15 days)"}
          </CardTitle>
          <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">
            {criticalDeadlineProjects.length}
          </Badge>
        </CardHeader>
        <CardContent>
          {criticalDeadlineProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No critical deadlines incoming.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {criticalDeadlineProjects.map((p: AdminPlannerProject) => {
                const daysLeft = differenceInDays(new Date(p.handover_date), new Date());
                return (
                  <div key={p.id} className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{p.client} · {p.pm_name || "—"}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-destructive tabular-nums">
                          {daysLeft}d
                        </p>
                        <p className="text-[11px] text-muted-foreground tabular-nums">
                          {format(new Date(p.handover_date), "dd MMM")}
                        </p>
                      </div>
                    </div>
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

import { useMemo, useState } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
  isWithinInterval,
  differenceInCalendarDays,
  parseISO,
} from "date-fns";
import { it } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PMProject } from "@/hooks/usePMDashboard";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const BAR_COLORS = [
  "hsl(211 100% 50%)",
  "hsl(142 71% 45%)",
  "hsl(25 95% 53%)",
  "hsl(280 65% 55%)",
  "hsl(340 75% 55%)",
  "hsl(180 60% 40%)",
  "hsl(50 90% 45%)",
  "hsl(0 72% 51%)",
  "hsl(200 80% 50%)",
  "hsl(160 70% 40%)",
  "hsl(300 60% 50%)",
  "hsl(30 80% 50%)",
];

interface CalendarEvent {
  id: string;
  projectName: string;
  start: Date;
  end: Date;
  color: string;
  projectId: string;
}

function getProjectPhase(project: PMProject, date: Date): string {
  const milestones = (project.certification_milestones || [])
    .filter((m: any) => m.milestone_type === "timeline" && m.start_date && m.due_date)
    .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0));

  for (const m of milestones) {
    const start = parseISO(m.start_date);
    const end = parseISO(m.due_date);
    if (isWithinInterval(date, { start, end })) {
      return m.category || m.requirement || "";
    }
  }
  return "";
}

function getProjectDateRange(project: PMProject): { start: Date; end: Date } | null {
  const milestones = (project.certification_milestones || [])
    .filter((m: any) => m.milestone_type === "timeline" && m.start_date && m.due_date);
  if (milestones.length === 0) return null;
  const starts = milestones.map((m: any) => parseISO(m.start_date).getTime());
  const ends = milestones.map((m: any) => parseISO(m.due_date).getTime());
  return { start: new Date(Math.min(...starts)), end: new Date(Math.max(...ends)) };
}

function buildEvents(projects: PMProject[]): CalendarEvent[] {
  return projects
    .map((p, idx) => {
      const range = getProjectDateRange(p);
      if (!range) return null;
      return {
        id: p.id,
        projectName: p.name,
        start: range.start,
        end: range.end,
        color: BAR_COLORS[idx % BAR_COLORS.length],
        projectId: p.id,
      };
    })
    .filter(Boolean) as CalendarEvent[];
}

const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

function MonthGrid({
  month,
  events,
  projects,
}: {
  month: Date;
  events: CalendarEvent[];
  projects: PMProject[];
}) {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });
  const today = new Date();

  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  function getWeekEvents(week: Date[]) {
    const weekStart = week[0];
    const weekEnd = week[6];
    return events.filter((ev) => ev.start <= weekEnd && ev.end >= weekStart);
  }

  return (
    <div className="flex-1 min-w-0">
      <h3 className="mb-3 text-center text-sm font-semibold capitalize text-foreground">
        {format(month, "MMMM yyyy", { locale: it })}
      </h3>

      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground py-1">
            {d}
          </div>
        ))}
      </div>

      {weeks.map((week, wi) => {
        const weekEvents = getWeekEvents(week);
        return (
          <div key={wi} className="relative">
            <div className="grid grid-cols-7">
              {week.map((day, di) => {
                const inMonth = isSameMonth(day, month);
                const isToday = isSameDay(day, today);
                return (
                  <div
                    key={di}
                    className={cn(
                      "h-8 flex items-start justify-center pt-1 text-[11px] border-b border-r border-border/40",
                      di === 0 && "border-l",
                      wi === 0 && "border-t",
                      !inMonth && "text-muted-foreground/40",
                      inMonth && "text-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "h-5 w-5 flex items-center justify-center rounded-full text-[11px]",
                        isToday && "bg-primary text-primary-foreground font-bold"
                      )}
                    >
                      {format(day, "d")}
                    </span>
                  </div>
                );
              })}
            </div>

            {weekEvents.length > 0 && (
              <div className="relative -mt-3 mb-1 space-y-0.5 px-0.5 pointer-events-none">
                {weekEvents.map((ev) => {
                  const weekStart = week[0];
                  const weekEnd = week[6];
                  const barStart = ev.start > weekStart ? ev.start : weekStart;
                  const barEnd = ev.end < weekEnd ? ev.end : weekEnd;
                  const startCol = differenceInCalendarDays(barStart, weekStart);
                  const span = differenceInCalendarDays(barEnd, barStart) + 1;

                  const midDate = new Date(barStart.getTime() + (barEnd.getTime() - barStart.getTime()) / 2);
                  const proj = projects.find((p) => p.id === ev.projectId);
                  const phaseName = proj ? getProjectPhase(proj, midDate) : "";

                  const leftPct = (startCol / 7) * 100;
                  const widthPct = (span / 7) * 100;
                  const isStart = ev.start >= weekStart && ev.start <= weekEnd;
                  const isEnd = ev.end >= weekStart && ev.end <= weekEnd;

                  return (
                    <div
                      key={ev.id}
                      className={cn(
                        "h-4 flex items-center overflow-hidden text-[9px] font-medium text-white pointer-events-auto",
                        isStart && "rounded-l-sm",
                        isEnd && "rounded-r-sm",
                        !isStart && !isEnd && "rounded-none"
                      )}
                      style={{
                        marginLeft: `${leftPct}%`,
                        width: `${widthPct}%`,
                        backgroundColor: ev.color,
                      }}
                      title={`${ev.projectName}${phaseName ? ` — ${phaseName}` : ""}`}
                    >
                      <span className="truncate px-1">
                        {span >= 2 ? (phaseName || ev.projectName) : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Shared props ────────────────────────────────────────────
export interface PMCalendarProps {
  projects: PMProject[];
  /** Admin mode: show PM filter + project filter */
  adminMode?: boolean;
  /** Map of pm_id → pm display name (only needed for adminMode) */
  pmNames?: Map<string, string>;
}

export function PMCalendar({ projects, adminMode, pmNames }: PMCalendarProps) {
  const [centerMonth, setCenterMonth] = useState(() => new Date());
  const [showCertificati, setShowCertificati] = useState(true);
  const [showInCorso, setShowInCorso] = useState(true);
  const [showDaConfigurare, setShowDaConfigurare] = useState(true);
  const [selectedPm, setSelectedPm] = useState<string>("all");
  const [selectedProject, setSelectedProject] = useState<string>("all");

  // Derive unique PM list
  const pmList = useMemo(() => {
    if (!adminMode || !pmNames) return [];
    const entries: { id: string; name: string }[] = [];
    const seen = new Set<string>();
    for (const p of projects) {
      if (p.pm_id && !seen.has(p.pm_id)) {
        seen.add(p.pm_id);
        entries.push({ id: p.pm_id, name: pmNames.get(p.pm_id) || p.pm_id });
      }
    }
    return entries.sort((a, b) => a.name.localeCompare(b.name));
  }, [projects, adminMode, pmNames]);

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      if (p.setup_status === "certificato" && !showCertificati) return false;
      if (p.setup_status === "in_corso" && !showInCorso) return false;
      if (p.setup_status === "da_configurare" && !showDaConfigurare) return false;
      if (adminMode && selectedPm !== "all" && p.pm_id !== selectedPm) return false;
      if (selectedProject !== "all" && p.id !== selectedProject) return false;
      return true;
    });
  }, [projects, showCertificati, showInCorso, showDaConfigurare, selectedPm, selectedProject, adminMode]);

  const events = useMemo(() => buildEvents(filteredProjects), [filteredProjects]);

  const prevMonth = subMonths(centerMonth, 1);
  const nextMonth = addMonths(centerMonth, 1);

  // Project list for filter (after PM filter)
  const projectOptions = useMemo(() => {
    let base = projects;
    if (adminMode && selectedPm !== "all") {
      base = projects.filter((p) => p.pm_id === selectedPm);
    }
    return base.map((p) => ({ id: p.id, name: p.name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [projects, adminMode, selectedPm]);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: navigation */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setCenterMonth(new Date())} className="text-xs">
            Oggi
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCenterMonth((m) => subMonths(m, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCenterMonth((m) => addMonths(m, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold capitalize text-foreground">
            {format(centerMonth, "MMMM yyyy", { locale: it })}
          </span>
        </div>

        {/* Right: filters */}
        <div className="flex flex-wrap items-center gap-2">
          {adminMode && pmList.length > 0 && (
            <Select value={selectedPm} onValueChange={(v) => { setSelectedPm(v); setSelectedProject("all"); }}>
              <SelectTrigger className="h-8 w-40 text-xs">
                <SelectValue placeholder="Tutti i PM" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i PM</SelectItem>
                {pmList.map((pm) => (
                  <SelectItem key={pm.id} value={pm.id}>{pm.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {projectOptions.length > 1 && (
            <Select value={selectedProject} onValueChange={setSelectedProject}>
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue placeholder="Tutti i progetti" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i progetti</SelectItem>
                {projectOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 text-xs h-8">
                <Filter className="h-3.5 w-3.5" />
                Stato
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Stato cantiere</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem checked={showDaConfigurare} onCheckedChange={setShowDaConfigurare}>
                Da Configurare
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={showInCorso} onCheckedChange={setShowInCorso}>
                In Corso
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={showCertificati} onCheckedChange={setShowCertificati}>
                Certificati
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {events.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-3">
            {events.map((ev) => (
              <div key={ev.id} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: ev.color }} />
                <span className="text-[11px] text-muted-foreground">{ev.projectName}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-4">
          <MonthGrid month={prevMonth} events={events} projects={filteredProjects} />
          <MonthGrid month={centerMonth} events={events} projects={filteredProjects} />
          <MonthGrid month={nextMonth} events={events} projects={filteredProjects} />
        </div>
      </CardContent>
    </Card>
  );
}

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
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Distinct, accessible colors for project bars
const BAR_COLORS = [
  "hsl(211 100% 50%)",   // primary blue
  "hsl(142 71% 45%)",    // success green
  "hsl(25 95% 53%)",     // orange
  "hsl(280 65% 55%)",    // purple
  "hsl(340 75% 55%)",    // pink
  "hsl(180 60% 40%)",    // teal
  "hsl(50 90% 45%)",     // gold
  "hsl(0 72% 51%)",      // red
];

interface CalendarEvent {
  id: string;
  projectName: string;
  start: Date;
  end: Date;
  phase: string;
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

  return {
    start: new Date(Math.min(...starts)),
    end: new Date(Math.max(...ends)),
  };
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
        phase: "",
        color: BAR_COLORS[idx % BAR_COLORS.length],
        projectId: p.id,
      };
    })
    .filter(Boolean) as CalendarEvent[];
}

const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

interface MonthGridProps {
  month: Date;
  events: CalendarEvent[];
  projects: PMProject[];
  isCenter?: boolean;
}

function MonthGrid({ month, events, projects, isCenter }: MonthGridProps) {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });
  const today = new Date();

  // Group days into weeks
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  // For each week, determine which events overlap
  function getWeekEvents(week: Date[]) {
    const weekStart = week[0];
    const weekEnd = week[6];
    return events.filter(
      (ev) => ev.start <= weekEnd && ev.end >= weekStart
    );
  }

  return (
    <div className={cn("flex-1 min-w-0", isCenter && "")}>
      <h3 className="mb-3 text-center text-sm font-semibold capitalize text-foreground">
        {format(month, "MMMM yyyy", { locale: it })}
      </h3>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Weeks */}
      {weeks.map((week, wi) => {
        const weekEvents = getWeekEvents(week);
        return (
          <div key={wi} className="relative">
            {/* Day cells */}
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

            {/* Event bars overlay */}
            {weekEvents.length > 0 && (
              <div className="relative -mt-3 mb-1 space-y-0.5 px-0.5 pointer-events-none">
                {weekEvents.map((ev) => {
                  const weekStart = week[0];
                  const weekEnd = week[6];
                  const barStart = ev.start > weekStart ? ev.start : weekStart;
                  const barEnd = ev.end < weekEnd ? ev.end : weekEnd;
                  const startCol = differenceInCalendarDays(barStart, weekStart);
                  const span = differenceInCalendarDays(barEnd, barStart) + 1;

                  // Find current phase for midpoint of bar
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

interface PMCalendarProps {
  projects: PMProject[];
}

export function PMCalendar({ projects }: PMCalendarProps) {
  const [centerMonth, setCenterMonth] = useState(() => new Date());
  const [showCertificati, setShowCertificati] = useState(true);
  const [showInCorso, setShowInCorso] = useState(true);
  const [showDaConfigurare, setShowDaConfigurare] = useState(true);

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      if (p.setup_status === "certificato" && !showCertificati) return false;
      if (p.setup_status === "in_corso" && !showInCorso) return false;
      if (p.setup_status === "da_configurare" && !showDaConfigurare) return false;
      return true;
    });
  }, [projects, showCertificati, showInCorso, showDaConfigurare]);

  const events = useMemo(() => buildEvents(filteredProjects), [filteredProjects]);

  const prevMonth = subMonths(centerMonth, 1);
  const nextMonth = addMonths(centerMonth, 1);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCenterMonth(new Date())}
            className="text-xs"
          >
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

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2 text-xs">
              <Filter className="h-3.5 w-3.5" />
              Filtri
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
      </CardHeader>

      <CardContent className="pt-0">
        {/* Legend */}
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

        {/* 3-month grid */}
        <div className="flex gap-4">
          <MonthGrid month={prevMonth} events={events} projects={filteredProjects} />
          <MonthGrid month={centerMonth} events={events} projects={filteredProjects} isCenter />
          <MonthGrid month={nextMonth} events={events} projects={filteredProjects} />
        </div>
      </CardContent>
    </Card>
  );
}

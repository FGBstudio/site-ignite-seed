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
  parseISO,
} from "date-fns";
import { ChevronLeft, ChevronRight, Filter, CalendarIcon, AlignLeft } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FGBPlanner } from "@/components/dashboard/FGBPlanner";

const BAR_COLORS = [
  "hsl(211 100% 50%)", "hsl(142 71% 45%)", "hsl(25 95% 53%)",
  "hsl(280 65% 55%)", "hsl(340 75% 55%)", "hsl(180 60% 40%)",
  "hsl(50 90% 45%)", "hsl(0 72% 51%)", "hsl(200 80% 50%)",
];

interface ProjectSpan {
  id: string;
  projectId: string;
  projectName: string;
  start: Date;
  end: Date;
  color: string;
}

interface MilestoneEvent {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  date: Date;
  color: string;
}

function getProjectDateRange(project: PMProject): { start: Date; end: Date } | null {
  const milestones = (project.certification_milestones || [])
    .filter((m: any) => m.milestone_type === "timeline" && m.start_date && m.due_date);
  if (milestones.length === 0) return null;
  const starts = milestones.map((m: any) => parseISO(m.start_date).getTime());
  const ends = milestones.map((m: any) => parseISO(m.due_date).getTime());
  return { start: new Date(Math.min(...starts)), end: new Date(Math.max(...ends)) };
}

function buildCalendarData(projects: PMProject[]) {
  const spans: ProjectSpan[] = [];
  const milestones: MilestoneEvent[] = [];

  projects.forEach((p, idx) => {
    const color = BAR_COLORS[idx % BAR_COLORS.length];
    
    // 1. Spans (Durata progetto)
    const range = getProjectDateRange(p);
    if (range) {
      spans.push({ id: `span-${p.id}`, projectId: p.id, projectName: p.name, start: range.start, end: range.end, color });
    }

    // 2. Milestones (Pills)
    (p.certification_milestones || []).forEach((m: any, mIdx: number) => {
      if (m.due_date) {
        milestones.push({
          id: `m-${p.id}-${mIdx}`,
          projectId: p.id,
          projectName: p.name,
          title: m.requirement || m.category || "Milestone",
          date: parseISO(m.due_date),
          color,
        });
      }
    });
  });

  return { spans, milestones };
}

const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

interface MonthGridProps {
  month: Date;
  spans: ProjectSpan[];
  milestones: MilestoneEvent[];
  isCenter?: boolean;
  onDayClick?: (date: Date) => void;
}

function MonthGrid({ month, spans, milestones, isCenter, onDayClick }: MonthGridProps) {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });
  const today = new Date();

  return (
    <div className="flex-1 min-w-0 flex flex-col h-full bg-card rounded-md border shadow-sm overflow-hidden">
      <div className="bg-muted/30 py-2 border-b">
        <h3 className="text-center text-sm font-semibold capitalize text-foreground">
          {format(month, "MMMM yyyy")}
        </h3>
        {isCenter && (
          <div className="grid grid-cols-7 mt-2">
            {WEEKDAYS.map((d) => (
              <div key={d} className="text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {d}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-7 flex-1">
        {days.map((day, di) => {
          const inMonth = isSameMonth(day, month);
          const isToday = isSameDay(day, today);
          
          // Trova progetti in corso (Ribbons) e milestone del giorno (Pills)
          const daySpans = spans.filter(s => isWithinInterval(day, { start: s.start, end: s.end }));
          const dayMilestones = milestones.filter(m => isSameDay(m.date, day));

          return (
            <div
              key={day.toISOString()}
              onClick={() => isCenter && onDayClick && onDayClick(day)}
              className={cn(
                "relative flex flex-col border-b border-r border-border/40 transition-colors",
                !inMonth && "bg-muted/10 opacity-50",
                isCenter ? "min-h-[100px] p-1 hover:bg-accent/30 cursor-pointer" : "min-h-[40px] p-0.5 pointer-events-none",
                di % 7 === 0 && "border-l"
              )}
            >
              {/* Header Giorno */}
              <div className="flex justify-between items-start mb-1">
                <span className={cn(
                  "flex items-center justify-center rounded-full text-[11px] h-5 w-5",
                  isToday ? "bg-primary text-primary-foreground font-bold" : "text-muted-foreground",
                  inMonth && !isToday && "text-foreground"
                )}>
                  {format(day, "d")}
                </span>
              </div>

              {/* Spans / Ribbons (Progetti in corso) */}
              <div className="flex flex-col gap-[1px] mb-1 opacity-70">
                {daySpans.map(span => (
                  <div key={span.id} className="h-[2px] w-full rounded-full" style={{ backgroundColor: span.color }} title={span.projectName} />
                ))}
              </div>

              {/* Milestones / Task Pills */}
              {isCenter && (
                <div className="flex flex-col gap-1 mt-auto overflow-hidden">
                  {dayMilestones.slice(0, 2).map((m) => (
                    <div 
                      key={m.id} 
                      className="text-[9px] px-1.5 py-0.5 rounded-sm truncate text-white shadow-sm flex items-center gap-1"
                      style={{ backgroundColor: m.color }}
                    >
                      <span>🎯</span> {m.title}
                    </div>
                  ))}
                  
                  {dayMilestones.length > 2 && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <div className="text-[10px] text-muted-foreground font-medium cursor-pointer hover:text-foreground hover:underline text-center">
                          +{dayMilestones.length - 2} eventi
                        </div>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-2 shadow-lg" align="center">
                        <div className="space-y-1">
                          <p className="text-xs font-semibold mb-2">Eventi del {format(day, "dd/MM/yyyy")}</p>
                          {dayMilestones.map(m => (
                            <div key={`pop-${m.id}`} className="text-xs flex items-center gap-2 p-1 rounded-sm border">
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: m.color }} />
                              <span className="truncate">{m.title} <span className="text-muted-foreground">({m.projectName})</span></span>
                            </div>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export interface PMCalendarProps {
  projects: PMProject[];
  adminMode?: boolean;
  pmNames?: Map<string, string>;
}

export function PMCalendar({ projects, adminMode, pmNames }: PMCalendarProps) {
  const [centerMonth, setCenterMonth] = useState(() => new Date());
  const [view, setView] = useState<"calendar" | "timeline">("calendar");
  const [showCertificati, setShowCertificati] = useState(true);
  const [showInCorso, setShowInCorso] = useState(true);
  const [showDaConfigurare, setShowDaConfigurare] = useState(true);
  const [selectedPm, setSelectedPm] = useState<string>("all");
  const [selectedProject, setSelectedProject] = useState<string>("all");

  // Stato per la creazione Task (Sheet)
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

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

  const { spans, milestones } = useMemo(() => buildCalendarData(filteredProjects), [filteredProjects]);

  const handleDayClick = (day: Date) => {
    setSelectedDate(day);
    setIsSheetOpen(true);
  };

  const projectOptions = projects.map((p) => ({ id: p.id, name: p.name })).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Card className="flex flex-col h-full border-none shadow-none bg-transparent">
      <CardHeader className="flex flex-col gap-4 pb-4 sm:flex-row sm:items-center sm:justify-between px-0">
        
        <div className="flex items-center gap-2">
          <Tabs value={view} onValueChange={(v) => setView(v as "calendar" | "timeline")} className="w-[200px]">
            <TabsList className="grid w-full grid-cols-2 h-9">
              <TabsTrigger value="calendar" className="text-xs gap-1"><CalendarIcon className="w-3.5 h-3.5"/> Mese</TabsTrigger>
              <TabsTrigger value="timeline" className="text-xs gap-1"><AlignLeft className="w-3.5 h-3.5"/> Timeline</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {view === "calendar" && (
          <div className="flex items-center gap-2 bg-background p-1 rounded-md border shadow-sm">
            <Button variant="ghost" size="sm" onClick={() => setCenterMonth(new Date())} className="text-xs h-7">Oggi</Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCenterMonth((m) => subMonths(m, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-semibold capitalize min-w-[120px] text-center">
              {format(centerMonth, "MMMM yyyy")}
            </span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCenterMonth((m) => addMonths(m, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 text-xs h-9">
                <Filter className="h-3.5 w-3.5" /> Stato
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Filtra per Stato</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem checked={showDaConfigurare} onCheckedChange={setShowDaConfigurare}>Da Configurare</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={showInCorso} onCheckedChange={setShowInCorso}>In Corso</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={showCertificati} onCheckedChange={setShowCertificati}>Certificati</DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="px-0 flex-1 flex flex-col min-h-[600px]">
        {view === "timeline" ? (
          <div className="flex-1 border rounded-lg shadow-sm bg-background p-4 min-h-[500px]">
             {/* Nota: castiamo `filteredProjects` ad any in quanto FGBPlanner si aspetta i dati plannerData formattati. 
                 Questo assicura la compatibilità con il tuo hook useAdminPlannerData o una mappatura simile */}
            <FGBPlanner data={filteredProjects.map(p => (p as any).plannerData || p)} />
          </div>
        ) : (
          <div className="flex gap-4 flex-1 h-full">
            {/* Mese Precedente (Ridotto, senza interattività) */}
            <div className="hidden lg:block w-[18%] opacity-60 hover:opacity-100 transition-opacity">
              <MonthGrid month={subMonths(centerMonth, 1)} spans={spans} milestones={milestones} />
            </div>
            
            {/* Mese Centrale (Dominante, interattivo) */}
            <div className="w-full lg:w-[64%] h-full">
              <MonthGrid 
                month={centerMonth} 
                spans={spans} 
                milestones={milestones} 
                isCenter={true} 
                onDayClick={handleDayClick} 
              />
            </div>

            {/* Mese Successivo (Ridotto, senza interattività) */}
            <div className="hidden lg:block w-[18%] opacity-60 hover:opacity-100 transition-opacity">
              <MonthGrid month={addMonths(centerMonth, 1)} spans={spans} milestones={milestones} />
            </div>
          </div>
        )}
      </CardContent>

      {/* Sheet Creazione Task / Milestone */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent side="right" className="w-[400px] sm:w-[540px]">
          <SheetHeader>
            <SheetTitle>Nuova Task o Milestone</SheetTitle>
            <SheetDescription>
              Stai pianificando per il giorno <strong className="text-foreground">{selectedDate ? format(selectedDate, "dd MMMM yyyy") : ""}</strong>
            </SheetDescription>
          </SheetHeader>
          
          <div className="py-6 space-y-6">
            <div className="space-y-2">
              <Label>Progetto di riferimento *</Label>
              <Select>
                <SelectTrigger><SelectValue placeholder="Seleziona un progetto..." /></SelectTrigger>
                <SelectContent>
                  {projectOptions.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Titolo Task / Milestone *</Label>
              <Input placeholder="Es. Revisione documenti energetici..." />
            </div>

            <div className="space-y-3">
              <Label>Tipologia Evento</Label>
              <RadioGroup defaultValue="task" className="flex flex-col gap-3">
                <div className="flex items-start space-x-3 border p-3 rounded-md bg-muted/20">
                  <RadioGroupItem value="task" id="r1" className="mt-1" />
                  <div>
                    <Label htmlFor="r1" className="font-semibold cursor-pointer">Task Operativa</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Visibile solo nella tua To-Do list come PM. Non impatta la timeline pubblica.</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3 border p-3 rounded-md bg-muted/20">
                  <RadioGroupItem value="milestone" id="r2" className="mt-1" />
                  <div>
                    <Label htmlFor="r2" className="font-semibold cursor-pointer">Milestone di Progetto</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Scadenza chiave. Aggiorna la vista Timeline e avvisa l'Admin/Cliente.</p>
                  </div>
                </div>
              </RadioGroup>
            </div>

            <div className="pt-4 border-t flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsSheetOpen(false)}>Annulla</Button>
              <Button>Crea ed Assegna</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </Card>
  );
}

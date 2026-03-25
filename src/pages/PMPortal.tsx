import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { MainLayout } from "@/components/layout/MainLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Info, Trash2, Calendar as CalendarIcon, GripVertical } from "lucide-react";
import { format, differenceInDays, addMonths, startOfMonth, endOfMonth, eachMonthOfInterval, isBefore, isAfter } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  usePMProjects,
  useCertPhases,
  useCertTasksByProject,
  useAllPMCertTasks,
  useOperationalProfiles,
  useCertTasksByAssignee,
  useAddPhase,
  useAddCertTask,
  useDeletePhase,
  useDeleteCertTask,
} from "@/hooks/usePMPortalData";
import type { CertWbsPhase, CertTask, CertTaskStatus } from "@/types/custom-tables";

// ============================================================
// Gantt Chart Component (CSS Grid)
// ============================================================
function GanttChart({ tasks, months }: { tasks: (CertTask & { profiles?: { full_name: string | null } })[]; months: Date[] }) {
  if (months.length === 0 || tasks.length === 0) {
    return <p className="text-xs text-muted-foreground py-4">Nessuna task con date per visualizzare il Gantt.</p>;
  }

  const timelineStart = startOfMonth(months[0]);
  const timelineEnd = endOfMonth(months[months.length - 1]);
  const totalDays = differenceInDays(timelineEnd, timelineStart) + 1;

  const statusColor = (s: string) => {
    if (s === "Completed") return "bg-success/70";
    if (s === "In_Progress") return "bg-primary/70";
    if (s === "Blocked") return "bg-destructive/70";
    return "bg-muted-foreground/40";
  };

  return (
    <div className="overflow-x-auto mt-3">
      <div
        className="min-w-[700px]"
        style={{
          display: "grid",
          gridTemplateColumns: `180px repeat(${months.length}, 1fr)`,
          gridTemplateRows: `32px repeat(${tasks.length}, 28px)`,
          gap: "1px",
        }}
      >
        {/* Header: Task label */}
        <div className="text-xs font-medium text-muted-foreground flex items-center px-2 bg-muted/50 rounded-tl">Task</div>
        {/* Header: Months */}
        {months.map((m, i) => (
          <div key={i} className="text-xs text-center text-muted-foreground flex items-center justify-center bg-muted/50 border-l border-border">
            {format(m, "MMM yy", { locale: it })}
          </div>
        ))}

        {/* Rows */}
        {tasks.map((task) => {
          const start = task.start_date ? new Date(task.start_date) : null;
          const end = task.end_date ? new Date(task.end_date) : null;

          let colStart = 1;
          let colSpan = 1;

          if (start && end) {
            const clampedStart = isBefore(start, timelineStart) ? timelineStart : start;
            const clampedEnd = isAfter(end, timelineEnd) ? timelineEnd : end;
            const dayOffset = differenceInDays(clampedStart, timelineStart);
            const dayLength = Math.max(1, differenceInDays(clampedEnd, clampedStart) + 1);
            // Map to grid columns (months.length columns for the timeline area)
            colStart = Math.floor((dayOffset / totalDays) * months.length) + 2; // +2 because col 1 is label
            colSpan = Math.max(1, Math.ceil((dayLength / totalDays) * months.length));
          }

          return (
            <div key={task.id} className="contents">
              <div className="text-xs text-foreground flex items-center px-2 truncate border-t border-border/50">
                {task.title}
              </div>
              {/* Empty cells for the month grid */}
              {months.map((_, mi) => {
                const gridCol = mi + 2;
                const isInRange = start && end && gridCol >= colStart && gridCol < colStart + colSpan;
                return (
                  <div
                    key={mi}
                    className={cn(
                      "border-l border-t border-border/30 relative",
                      isInRange && statusColor(task.status),
                      isInRange && "rounded-sm"
                    )}
                    title={isInRange ? `${task.title} — ${task.status}` : undefined}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// WBS Project Accordion Body
// ============================================================
function ProjectWBSBody({ projectId }: { projectId: string }) {
  const { data: phases = [], isLoading: loadingPhases } = useCertPhases(projectId);
  const { data: tasks = [], isLoading: loadingTasks } = useCertTasksByProject(projectId);
  const addPhase = useAddPhase();
  const deletePhase = useDeletePhase();
  const addTask = useAddCertTask();
  const deleteTask = useDeleteCertTask();
  const { toast } = useToast();
  const [newPhaseName, setNewPhaseName] = useState("");
  const [addingTaskPhase, setAddingTaskPhase] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskStart, setNewTaskStart] = useState("");
  const [newTaskEnd, setNewTaskEnd] = useState("");

  // Compute months for Gantt
  const months = useMemo(() => {
    const dates = tasks.filter(t => t.start_date || t.end_date).flatMap(t => [t.start_date, t.end_date].filter(Boolean) as string[]);
    if (dates.length === 0) return [];
    const min = new Date(dates.sort()[0]);
    const max = new Date(dates.sort().reverse()[0]);
    return eachMonthOfInterval({ start: startOfMonth(min), end: endOfMonth(addMonths(max, 1)) });
  }, [tasks]);

  const tasksByPhase = useMemo(() => {
    const map = new Map<string | null, typeof tasks>();
    for (const t of tasks) {
      const key = t.phase_id || "__unassigned__";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return map;
  }, [tasks]);

  const handleAddPhase = () => {
    if (!newPhaseName.trim()) return;
    addPhase.mutate(
      { projectId, name: newPhaseName.trim(), orderIndex: phases.length },
      {
        onSuccess: () => { setNewPhaseName(""); toast({ title: "Fase aggiunta" }); },
        onError: (e: any) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
      }
    );
  };

  const handleAddTask = (phaseId: string | null) => {
    if (!newTaskTitle.trim()) return;
    addTask.mutate(
      {
        project_id: projectId,
        phase_id: phaseId === "__unassigned__" ? null : phaseId,
        title: newTaskTitle.trim(),
        start_date: newTaskStart || undefined,
        end_date: newTaskEnd || undefined,
      },
      {
        onSuccess: () => {
          setNewTaskTitle("");
          setNewTaskStart("");
          setNewTaskEnd("");
          setAddingTaskPhase(null);
          toast({ title: "Task aggiunta" });
        },
        onError: (e: any) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
      }
    );
  };

  if (loadingPhases || loadingTasks) {
    return <div className="space-y-2 py-4">{[1, 2].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  }

  return (
    <div className="space-y-4">
      {/* Add phase */}
      <div className="flex items-center gap-2">
        <Input
          placeholder="Nuova fase (es. Document Collection)"
          value={newPhaseName}
          onChange={e => setNewPhaseName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleAddPhase()}
          className="flex-1 h-8 text-sm"
        />
        <Button size="sm" variant="outline" onClick={handleAddPhase} disabled={addPhase.isPending} className="gap-1">
          <Plus className="h-3 w-3" /> Fase
        </Button>
      </div>

      {/* Phases + tasks */}
      {phases.map(phase => {
        const phaseTasks = tasksByPhase.get(phase.id) || [];
        return (
          <div key={phase.id} className="rounded-lg border bg-card">
            <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
              <div className="flex items-center gap-2">
                <GripVertical className="h-3 w-3 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">{phase.name}</span>
                <Badge variant="outline" className="text-xs">{phaseTasks.length} task</Badge>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="sm" variant="ghost" className="h-6 w-6 p-0"
                  onClick={() => setAddingTaskPhase(addingTaskPhase === phase.id ? null : phase.id)}
                >
                  <Plus className="h-3 w-3" />
                </Button>
                <Button
                  size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive"
                  onClick={() => deletePhase.mutate({ phaseId: phase.id, projectId })}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>

            {/* Add task form */}
            {addingTaskPhase === phase.id && (
              <div className="px-3 py-2 border-b bg-primary/5 flex items-end gap-2 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <Label className="text-xs">Titolo</Label>
                  <Input className="h-7 text-xs" value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} />
                </div>
                <div className="w-[130px]">
                  <Label className="text-xs">Inizio</Label>
                  <Input type="date" className="h-7 text-xs" value={newTaskStart} onChange={e => setNewTaskStart(e.target.value)} />
                </div>
                <div className="w-[130px]">
                  <Label className="text-xs">Fine</Label>
                  <Input type="date" className="h-7 text-xs" value={newTaskEnd} onChange={e => setNewTaskEnd(e.target.value)} />
                </div>
                <Button size="sm" className="h-7 text-xs" onClick={() => handleAddTask(phase.id)} disabled={addTask.isPending}>Aggiungi</Button>
              </div>
            )}

            {/* Task list */}
            {phaseTasks.length > 0 && (
              <div className="divide-y">
                {phaseTasks.map(t => {
                  const statusStyle = t.status === "Completed" ? "bg-success/10 text-success" :
                    t.status === "In_Progress" ? "bg-warning/10 text-warning" :
                    t.status === "Blocked" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground";
                  return (
                    <div key={t.id} className="flex items-center justify-between px-3 py-2 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <span className="text-sm text-foreground truncate">{t.title}</span>
                        {t.profiles?.full_name && (
                          <Badge variant="outline" className="text-[10px] shrink-0">{t.profiles.full_name}</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground">
                          {t.start_date ? format(new Date(t.start_date), "dd/MM", { locale: it }) : "—"} → {t.end_date ? format(new Date(t.end_date), "dd/MM", { locale: it }) : "—"}
                        </span>
                        <Badge variant="outline" className={cn("text-[10px]", statusStyle)}>{t.status.replace("_", " ")}</Badge>
                        <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-destructive/60 hover:text-destructive"
                          onClick={() => deleteTask.mutate({ taskId: t.id, projectId })}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Unassigned tasks */}
      {(tasksByPhase.get("__unassigned__") || []).length > 0 && (
        <div className="rounded-lg border bg-card">
          <div className="px-3 py-2 border-b bg-muted/20">
            <span className="text-sm font-medium text-muted-foreground">Senza Fase</span>
          </div>
          <div className="divide-y">
            {(tasksByPhase.get("__unassigned__") || []).map(t => (
              <div key={t.id} className="flex items-center justify-between px-3 py-2">
                <span className="text-sm text-foreground">{t.title}</span>
                <Badge variant="outline" className="text-[10px]">{t.status.replace("_", " ")}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gantt */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">Timeline Gantt</CardTitle>
        </CardHeader>
        <CardContent>
          <GanttChart tasks={tasks} months={months} />
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// VISTA 1: Tempo per Progetto
// ============================================================
function VistaProgetti() {
  const { user } = useAuth();
  const { data: projects = [], isLoading } = usePMProjects(user?.id);
  const [infoProject, setInfoProject] = useState<any | null>(null);

  if (isLoading) {
    return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  }

  if (projects.length === 0) {
    return <p className="text-center text-muted-foreground py-12">Nessun progetto assegnato a te come PM.</p>;
  }

  return (
    <>
      <Accordion type="single" collapsible className="space-y-2">
        {projects.map((p: any) => (
          <AccordionItem key={p.id} value={p.id} className="border rounded-lg overflow-hidden">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/30">
              <div className="flex items-center gap-3 flex-1 text-left">
                <span className="text-xs font-mono text-muted-foreground">{p.id.slice(0, 6)}</span>
                <span className="font-medium text-foreground">{p.name}</span>
                <Badge variant="outline" className="text-xs">{p.status}</Badge>
                <Button
                  size="sm" variant="ghost" className="h-6 w-6 p-0 ml-auto mr-2"
                  onClick={(e) => { e.stopPropagation(); setInfoProject(p); }}
                >
                  <Info className="h-3.5 w-3.5 text-primary" />
                </Button>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <ProjectWBSBody projectId={p.id} />
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      {/* Info Dialog */}
      <Dialog open={!!infoProject} onOpenChange={(o) => !o && setInfoProject(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{infoProject?.name}</DialogTitle>
          </DialogHeader>
          {infoProject && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-muted-foreground">Cliente:</span> <span className="font-medium text-foreground">{infoProject.client}</span></div>
                <div><span className="text-muted-foreground">Regione:</span> <span className="font-medium text-foreground">{infoProject.region}</span></div>
                <div><span className="text-muted-foreground">Stato:</span> <Badge variant="outline" className="text-xs">{infoProject.status}</Badge></div>
                <div><span className="text-muted-foreground">Handover:</span> <span className="font-medium text-foreground">{format(new Date(infoProject.handover_date), "dd MMM yyyy", { locale: it })}</span></div>
                {infoProject.sites?.name && (
                  <div className="col-span-2"><span className="text-muted-foreground">Sito:</span> <span className="font-medium text-foreground">{infoProject.sites.name}{infoProject.sites.city ? `, ${infoProject.sites.city}` : ""}</span></div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ============================================================
// VISTA 2: Tempo per Risorsa
// ============================================================
function VistaRisorse() {
  const { user } = useAuth();
  const { data: profiles = [], isLoading: loadingProfiles } = useOperationalProfiles();
  const { data: projects = [] } = usePMProjects(user?.id);
  const [selectedProfile, setSelectedProfile] = useState<any | null>(null);
  const { data: assigneeTasks = [], isLoading: loadingTasks } = useCertTasksByAssignee(selectedProfile?.id);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const { toast } = useToast();

  // Add-task dialog state
  const [newTitle, setNewTitle] = useState("");
  const [newProjectId, setNewProjectId] = useState("");
  const [newPhaseId, setNewPhaseId] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [newDeps, setNewDeps] = useState<string[]>([]);

  const { data: selectedProjectPhases = [] } = useCertPhases(newProjectId || undefined);
  const { data: selectedProjectTasks = [] } = useCertTasksByProject(newProjectId || undefined);
  const addTask = useAddCertTask();

  // Compute months for calendar
  const calendarMonths = useMemo(() => {
    const now = new Date();
    return eachMonthOfInterval({ start: startOfMonth(now), end: endOfMonth(addMonths(now, 5)) });
  }, []);

  const totalCalendarDays = useMemo(() => {
    if (calendarMonths.length === 0) return 1;
    return differenceInDays(endOfMonth(calendarMonths[calendarMonths.length - 1]), startOfMonth(calendarMonths[0])) + 1;
  }, [calendarMonths]);

  const calendarStart = calendarMonths.length > 0 ? startOfMonth(calendarMonths[0]) : new Date();

  const resetForm = () => {
    setNewTitle("");
    setNewProjectId("");
    setNewPhaseId("");
    setNewStart("");
    setNewEnd("");
    setNewDeps([]);
  };

  const handleAdd = () => {
    if (!newTitle.trim() || !newProjectId) return;
    addTask.mutate(
      {
        project_id: newProjectId,
        phase_id: newPhaseId || null,
        title: newTitle.trim(),
        start_date: newStart || undefined,
        end_date: newEnd || undefined,
        assignee_id: selectedProfile?.id || null,
        dependencies: newDeps.length > 0 ? newDeps : undefined,
      },
      {
        onSuccess: () => {
          resetForm();
          setShowAddDialog(false);
          toast({ title: "Task creata" });
        },
        onError: (e: any) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
      }
    );
  };

  const taskStatusColor = (s: string) => {
    if (s === "Completed") return "bg-success/60";
    if (s === "In_Progress") return "bg-primary/60";
    if (s === "Blocked") return "bg-destructive/60";
    return "bg-muted-foreground/30";
  };

  return (
    <>
      <ResizablePanelGroup direction="horizontal" className="min-h-[500px] rounded-lg border">
        {/* Left panel: profiles */}
        <ResizablePanel defaultSize={30} minSize={20}>
          <div className="h-full flex flex-col">
            <div className="px-3 py-2 border-b bg-muted/30">
              <h3 className="text-sm font-medium text-foreground">Risorse Operative</h3>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loadingProfiles ? (
                <div className="p-3 space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : profiles.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">Nessuna risorsa operativa trovata</p>
              ) : (
                profiles.map((p: any) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProfile(p)}
                    className={cn(
                      "w-full text-left px-3 py-3 border-b transition-colors hover:bg-muted/50 flex flex-col gap-0.5",
                      selectedProfile?.id === p.id && "bg-primary/5 border-l-2 border-l-primary"
                    )}
                  >
                    <span className="text-sm font-medium text-foreground">{p.full_name || p.email}</span>
                    <div className="flex gap-1 flex-wrap">
                      {p.roles?.map((r: string) => (
                        <Badge key={r} variant="outline" className="text-[10px]">{r.replace("_", " ")}</Badge>
                      ))}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right panel: calendar */}
        <ResizablePanel defaultSize={70} minSize={40}>
          <div className="h-full flex flex-col">
            <div className="px-3 py-2 border-b bg-muted/30 flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">
                {selectedProfile ? `Calendario — ${selectedProfile.full_name || selectedProfile.email}` : "Seleziona una risorsa"}
              </h3>
              {selectedProfile && (
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setShowAddDialog(true)}>
                  <Plus className="h-3 w-3" /> Aggiungi Attività
                </Button>
              )}
            </div>
            <div className="flex-1 overflow-x-auto p-3">
              {!selectedProfile ? (
                <p className="text-sm text-muted-foreground text-center py-16">← Seleziona una risorsa per visualizzare il calendario</p>
              ) : loadingTasks ? (
                <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>
              ) : (
                <div className="min-w-[600px]">
                  {/* Month headers */}
                  <div className="grid gap-px mb-2" style={{ gridTemplateColumns: `repeat(${calendarMonths.length}, 1fr)` }}>
                    {calendarMonths.map((m, i) => (
                      <div key={i} className="text-xs text-center text-muted-foreground py-1 bg-muted/30 rounded">
                        {format(m, "MMMM yyyy", { locale: it })}
                      </div>
                    ))}
                  </div>

                  {/* Task blocks */}
                  {assigneeTasks.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-8">Nessuna task assegnata</p>
                  ) : (
                    <div className="space-y-1.5 relative">
                      {assigneeTasks.map((t: any) => {
                        const start = t.start_date ? new Date(t.start_date) : null;
                        const end = t.end_date ? new Date(t.end_date) : null;

                        if (!start || !end) {
                          return (
                            <div key={t.id} className="flex items-center gap-2 px-2 py-1.5 rounded border bg-card">
                              <div className={cn("w-2 h-2 rounded-full shrink-0", taskStatusColor(t.status))} />
                              <span className="text-xs text-foreground truncate">{t.title}</span>
                              <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{t.projects?.name}</span>
                            </div>
                          );
                        }

                        const clampedStart = isBefore(start, calendarStart) ? calendarStart : start;
                        const clampedEnd = isAfter(end, endOfMonth(calendarMonths[calendarMonths.length - 1]))
                          ? endOfMonth(calendarMonths[calendarMonths.length - 1])
                          : end;

                        const offsetDays = differenceInDays(clampedStart, calendarStart);
                        const lengthDays = Math.max(1, differenceInDays(clampedEnd, clampedStart) + 1);
                        const leftPct = (offsetDays / totalCalendarDays) * 100;
                        const widthPct = (lengthDays / totalCalendarDays) * 100;

                        return (
                          <div key={t.id} className="relative h-7">
                            <div
                              className={cn("absolute top-0 h-full rounded flex items-center px-2 text-[10px] text-white font-medium truncate cursor-default", taskStatusColor(t.status))}
                              style={{ left: `${leftPct}%`, width: `${Math.max(widthPct, 3)}%` }}
                              title={`${t.title} — ${t.projects?.name || ""} (${format(start, "dd/MM")} → ${format(end, "dd/MM")})`}
                            >
                              {t.title}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Add Task Dialog */}
      <Dialog open={showAddDialog} onOpenChange={(o) => { if (!o) { resetForm(); setShowAddDialog(false); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Aggiungi Attività</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Nome Task *</Label>
              <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Titolo attività" />
            </div>
            <div>
              <Label className="text-xs">Progetto *</Label>
              <Select value={newProjectId} onValueChange={v => { setNewProjectId(v); setNewPhaseId(""); setNewDeps([]); }}>
                <SelectTrigger><SelectValue placeholder="Seleziona progetto" /></SelectTrigger>
                <SelectContent>
                  {projects.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {newProjectId && selectedProjectPhases.length > 0 && (
              <div>
                <Label className="text-xs">Fase WBS</Label>
                <Select value={newPhaseId} onValueChange={setNewPhaseId}>
                  <SelectTrigger><SelectValue placeholder="(Opzionale)" /></SelectTrigger>
                  <SelectContent>
                    {selectedProjectPhases.map(ph => (
                      <SelectItem key={ph.id} value={ph.id}>{ph.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Data Inizio</Label>
                <Input type="date" value={newStart} onChange={e => setNewStart(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Data Fine</Label>
                <Input type="date" value={newEnd} onChange={e => setNewEnd(e.target.value)} />
              </div>
            </div>
            {newProjectId && selectedProjectTasks.length > 0 && (
              <div>
                <Label className="text-xs">Dipendenze (task che devono completarsi prima)</Label>
                <div className="max-h-[120px] overflow-y-auto border rounded p-2 space-y-1">
                  {selectedProjectTasks.map(t => (
                    <label key={t.id} className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newDeps.includes(t.id)}
                        onChange={e => {
                          setNewDeps(prev => e.target.checked ? [...prev, t.id] : prev.filter(d => d !== t.id));
                        }}
                        className="rounded"
                      />
                      <span className="text-foreground">{t.title}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { resetForm(); setShowAddDialog(false); }}>Annulla</Button>
              <Button onClick={handleAdd} disabled={addTask.isPending || !newTitle.trim() || !newProjectId}>
                {addTask.isPending ? "Salvataggio..." : "Salva"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ============================================================
// Main PM Portal
// ============================================================
export default function PMPortal() {
  const { profile } = useAuth();

  return (
    <MainLayout title="PM Portal" subtitle={`${profile?.full_name || ""} — Gestione Certificazioni`}>
      <Tabs defaultValue="progetti" className="space-y-4">
        <TabsList>
          <TabsTrigger value="progetti">Tempo per Progetto</TabsTrigger>
          <TabsTrigger value="risorse">Tempo per Risorsa</TabsTrigger>
        </TabsList>

        <TabsContent value="progetti">
          <VistaProgetti />
        </TabsContent>

        <TabsContent value="risorse">
          <VistaRisorse />
        </TabsContent>
      </Tabs>
    </MainLayout>
  );
}

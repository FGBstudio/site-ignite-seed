import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePMDashboard } from "@/hooks/usePMDashboard";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, CheckCircle, Clock, AlertTriangle, CalendarDays, FolderKanban, Upload, Lock } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface TaskRow {
  id: string;
  project_id: string;
  task_name: string;
  assigned_to: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  blocking_payment_id: string | null;
  dependency_id: string | null;
  created_at: string;
  // joined
  project_name?: string;
  project_client?: string;
  blocking_payment_status?: string;
  blocking_payment_name?: string;
  isSynthetic?: boolean;
}

export default function MyTasks() {
  const navigate = useNavigate();
  const { user, isPM } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedTask, setSelectedTask] = useState<TaskRow | null>(null);
  const { data: pmProjects = [], isLoading: isPMProjectsLoading } = usePMDashboard();

  const { data: tasks = [], isLoading, isError } = useQuery({
    queryKey: ["my-tasks", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("project_tasks" as any)
        .select("*, projects!project_tasks_project_id_fkey(name, client)")
        .eq("assigned_to", user.id)
        .neq("status", "done")
        .order("end_date", { ascending: true });
      if (error) throw error;

      // Enrich with blocking payment info
      const enriched: TaskRow[] = [];
      for (const t of (data || []) as any[]) {
        const row: TaskRow = {
          ...t,
          project_name: t.projects?.name || "—",
          project_client: t.projects?.client || "",
        };

        if (t.blocking_payment_id) {
          const { data: payment } = await supabase
            .from("payment_milestones" as any)
            .select("status, milestone_name")
            .eq("id", t.blocking_payment_id)
            .single();
          if (payment) {
            row.blocking_payment_status = (payment as any).status;
            row.blocking_payment_name = (payment as any).milestone_name;
          }
        }
        enriched.push(row);
      }
      return enriched;
    },
    enabled: !!user?.id,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ taskId, newStatus }: { taskId: string; newStatus: string }) => {
      const { error } = await supabase
        .from("project_tasks" as any)
        .update({ status: newStatus } as any)
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["resource-saturation"] });
      queryClient.invalidateQueries({ queryKey: ["project-tasks"] });
      toast({ title: "Stato aggiornato" });
      setSelectedTask(null);
    },
    onError: (err: any) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });

  const isBlocked = (task: TaskRow) =>
    task.blocking_payment_id && task.blocking_payment_status !== "paid";

  const STATUS_LABELS: Record<string, string> = {
    todo: "Da fare",
    in_progress: "In corso",
    review: "In revisione",
    done: "Completato",
  };

  const STATUS_COLORS: Record<string, string> = {
    todo: "bg-muted text-muted-foreground",
    in_progress: "bg-primary/10 text-primary border-primary/20",
    review: "bg-warning/10 text-warning border-warning/20",
    done: "bg-success/10 text-success border-success/20",
  };

  const syntheticTasks = useMemo<TaskRow[]>(() => {
    if (!isPM || tasks.length > 0) return [];

    return pmProjects
      .filter((project) => project.setup_status !== "certificato")
      .map((project) => ({
        id: `setup-${project.id}`,
        project_id: project.id,
        task_name:
          project.setup_status === "da_configurare"
            ? `Configura il progetto ${project.name}`
            : `Completa il setup del progetto ${project.name}`,
        assigned_to: user?.id ?? null,
        start_date: null,
        end_date: project.handover_date,
        status: project.setup_status === "in_corso" ? "in_progress" : "todo",
        blocking_payment_id: null,
        dependency_id: null,
        created_at: project.updated_at,
        project_name: project.name,
        project_client: project.client,
        isSynthetic: true,
      }));
  }, [isPM, pmProjects, tasks.length, user?.id]);

  const visibleTasks = tasks.length > 0 ? tasks : syntheticTasks;
  const pageIsLoading = isLoading || (isPM && tasks.length === 0 && isPMProjectsLoading);

  const todoTasks = visibleTasks.filter((t) => t.status === "todo");
  const inProgressTasks = visibleTasks.filter((t) => t.status === "in_progress");
  const reviewTasks = visibleTasks.filter((t) => t.status === "review");

  const renderTaskCard = (task: TaskRow) => {
    const blocked = isBlocked(task);
    const overdue = task.end_date && new Date(task.end_date) < new Date();
    const daysLeft = task.end_date ? differenceInDays(new Date(task.end_date), new Date()) : null;

    return (
      <Card
        key={task.id}
        className={cn(
          "cursor-pointer hover:shadow-md transition-all",
          blocked && "border-destructive/40 bg-destructive/5 opacity-75",
          overdue && !blocked && "border-warning/40",
        )}
        onClick={() => setSelectedTask(task)}
      >
        <CardContent className="py-3 px-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {blocked && <Lock className="h-3.5 w-3.5 text-destructive shrink-0" />}
                <p className={cn("font-medium text-sm text-foreground truncate", blocked && "text-destructive")}>
                  {task.task_name}
                </p>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <FolderKanban className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground truncate">{task.project_name}</span>
              </div>
              {blocked && task.blocking_payment_name && (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Bloccato: "{task.blocking_payment_name}"
                </p>
              )}
            </div>
            <div className="text-right shrink-0">
              {task.end_date && (
                <div className={cn("flex items-center gap-1 text-xs", overdue ? "text-destructive font-medium" : "text-muted-foreground")}>
                  <CalendarDays className="h-3 w-3" />
                  {format(new Date(task.end_date), "dd MMM", { locale: it })}
                </div>
              )}
              {daysLeft !== null && (
                <p className={cn("text-xs mt-0.5", daysLeft < 0 ? "text-destructive" : daysLeft <= 3 ? "text-warning" : "text-muted-foreground")}>
                  {daysLeft < 0 ? `${Math.abs(daysLeft)}gg ritardo` : `${daysLeft}gg rimasti`}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <MainLayout title="I Miei Task" subtitle="La tua inbox operativa">
      {pageIsLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="py-12 text-center text-destructive">
            Errore nel caricamento dei task. Riprova più tardi.
          </CardContent>
        </Card>
      ) : tasks.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <CheckCircle className="h-12 w-12 text-success mx-auto mb-3" />
            <p className="text-lg font-medium text-foreground">Tutto fatto! 🎉</p>
            <p className="text-sm text-muted-foreground mt-1">Non hai task attivi al momento.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* In Progress */}
          {inProgressTasks.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                In Corso ({inProgressTasks.length})
              </h3>
              <div className="space-y-2">{inProgressTasks.map(renderTaskCard)}</div>
            </div>
          )}

          {/* To Do */}
          {todoTasks.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Da Fare ({todoTasks.length})
              </h3>
              <div className="space-y-2">{todoTasks.map(renderTaskCard)}</div>
            </div>
          )}

          {/* Review */}
          {reviewTasks.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" />
                In Revisione ({reviewTasks.length})
              </h3>
              <div className="space-y-2">{reviewTasks.map(renderTaskCard)}</div>
            </div>
          )}
        </div>
      )}

      {/* Task Detail Sheet */}
      <Sheet open={!!selectedTask} onOpenChange={(open) => !open && setSelectedTask(null)}>
        <SheetContent className="sm:max-w-md">
          {selectedTask && (
            <>
              <SheetHeader>
                <SheetTitle className="text-left">{selectedTask.task_name}</SheetTitle>
                <SheetDescription className="text-left">
                  {selectedTask.project_name} — {selectedTask.project_client}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-4 py-6">
                {/* Status */}
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Stato</p>
                  <Badge variant="outline" className={cn("text-xs", STATUS_COLORS[selectedTask.status])}>
                    {STATUS_LABELS[selectedTask.status]}
                  </Badge>
                </div>

                {/* Dates */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Inizio</p>
                    <p className="text-sm text-foreground">
                      {selectedTask.start_date ? format(new Date(selectedTask.start_date), "dd MMM yyyy", { locale: it }) : "—"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Scadenza</p>
                    <p className="text-sm text-foreground">
                      {selectedTask.end_date ? format(new Date(selectedTask.end_date), "dd MMM yyyy", { locale: it }) : "—"}
                    </p>
                  </div>
                </div>

                {/* Blocking info */}
                {isBlocked(selectedTask) && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                    <div className="flex items-center gap-2">
                      <Lock className="h-4 w-4 text-destructive" />
                      <p className="text-sm font-medium text-destructive">Task Bloccato</p>
                    </div>
                    <p className="text-xs text-destructive/80 mt-1">
                      In attesa del pagamento: "{selectedTask.blocking_payment_name}"
                    </p>
                  </div>
                )}

                {selectedTask.isSynthetic && (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <p className="text-sm font-medium text-foreground">Task generato automaticamente</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Questo progetto non ha ancora milestone operative assegnate: completa il setup da “I Miei Cantieri”.
                    </p>
                  </div>
                )}

                {/* Change status */}
                {!isBlocked(selectedTask) && !selectedTask.isSynthetic && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Cambia Stato</p>
                    <Select
                      value={selectedTask.status}
                      onValueChange={(val) => updateStatus.mutate({ taskId: selectedTask.id, newStatus: val })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todo">Da fare</SelectItem>
                        <SelectItem value="in_progress">In corso</SelectItem>
                        <SelectItem value="review">In revisione</SelectItem>
                        <SelectItem value="done">Completato</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <SheetFooter className="flex-col gap-2 sm:flex-col">
                {selectedTask.isSynthetic ? (
                  <Button
                    className="w-full gap-2"
                    onClick={() => {
                      setSelectedTask(null);
                      navigate("/projects");
                    }}
                  >
                    Apri I Miei Cantieri
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    className="w-full gap-2"
                    disabled={isBlocked(selectedTask) || updateStatus.isPending}
                    onClick={() => updateStatus.mutate({ taskId: selectedTask.id, newStatus: "review" })}
                  >
                    <Upload className="h-4 w-4" />
                    Carica Documento ed Esegui
                  </Button>
                )}
                {isBlocked(selectedTask) && !selectedTask.isSynthetic && (
                  <p className="text-xs text-center text-destructive">
                    Non puoi completare questo task finché il pagamento non è stato saldato.
                  </p>
                )}
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
    </MainLayout>
  );
}

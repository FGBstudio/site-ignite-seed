import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePMDashboard } from "@/hooks/usePMDashboard";
import { useTaskAlerts, useResolveAlert, useCreateAlert, ALERT_TYPE_LABELS, ALERT_TYPE_COLORS, type TaskAlert, type TaskAlertType } from "@/hooks/useTaskAlerts";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ArrowRight, Bell, CheckCircle, Clock, AlertTriangle, CalendarDays, FolderKanban, Upload, Lock, Plus, X, ChevronDown } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";

interface TaskRow {
  id: string;
  certification_id: string;
  task_name: string;
  assigned_to: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  blocking_payment_id: string | null;
  dependency_id: string | null;
  created_at: string;
  project_name?: string;
  project_client?: string;
  blocking_payment_status?: string;
  blocking_payment_name?: string;
  isSynthetic?: boolean;
}

export default function MyTasks() {
  const navigate = useNavigate();
  const { user, isPM, role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedTask, setSelectedTask] = useState<TaskRow | null>(null);
  const [showCreateAlert, setShowCreateAlert] = useState(false);
  const [newAlertTitle, setNewAlertTitle] = useState("");
  const [newAlertDesc, setNewAlertDesc] = useState("");
  const [newAlertType, setNewAlertType] = useState<TaskAlertType>("pm_operational");
  const [newAlertCertId, setNewAlertCertId] = useState("");
  const { data: pmProjects = [], isLoading: isPMProjectsLoading } = usePMDashboard();
  const { data: alerts = [], isLoading: alertsLoading } = useTaskAlerts(role, user?.id);
  const resolveAlert = useResolveAlert();
  const createAlert = useCreateAlert();

  const { data: tasks = [], isLoading, isError } = useQuery({
    queryKey: ["my-tasks", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("project_tasks" as any)
        .select("*, certifications!project_tasks_certification_id_fkey(name, client)")
        .eq("assigned_to", user.id)
        .order("end_date", { ascending: true })
        .limit(200); // Safety limit for performance: fetches active + max recent completed tasks

      if (error) throw error;

      const enriched: TaskRow[] = [];
      for (const t of (data || []) as any[]) {
        const row: TaskRow = {
          ...t,
          project_name: t.certifications?.name || "—",
          project_client: t.certifications?.client || "",
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
      toast({ title: "Status updated" });
      setSelectedTask(null);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const isBlocked = (task: TaskRow) =>
    task.blocking_payment_id && task.blocking_payment_status !== "paid";

  const STATUS_LABELS: Record<string, string> = {
    todo: "To Do",
    in_progress: "In Progress",
    review: "In Review",
    done: "Completed",
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
        certification_id: project.id,
        task_name:
          project.setup_status === "da_configurare"
            ? `Configure project ${project.name}`
            : `Complete setup for project ${project.name}`,
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

  // Group tasks by status
  const todoTasks = visibleTasks.filter((t) => t.status === "todo");
  const inProgressTasks = visibleTasks.filter((t) => t.status === "in_progress");
  const reviewTasks = visibleTasks.filter((t) => t.status === "review");
  const doneTasks = visibleTasks.filter((t) => t.status === "done");
  const activeTasksCount = todoTasks.length + inProgressTasks.length + reviewTasks.length;

  // Split alerts
  const activeAlerts = alerts.filter((a) => !a.is_resolved);
  const resolvedAlerts = alerts.filter((a) => a.is_resolved);

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
                  Blocked: "{task.blocking_payment_name}"
                </p>
              )}
            </div>
            <div className="text-right shrink-0">
              {task.end_date && (
                <div className={cn("flex items-center gap-1 text-xs", overdue ? "text-destructive font-medium" : "text-muted-foreground")}>
                  <CalendarDays className="h-3 w-3" />
                  {format(new Date(task.end_date), "dd MMM")}
                </div>
              )}
              {daysLeft !== null && task.status !== "done" && (
                <p className={cn("text-xs mt-0.5", daysLeft < 0 ? "text-destructive" : daysLeft <= 3 ? "text-warning" : "text-muted-foreground")}>
                  {daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d left`}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const handleCreateAlert = () => {
    if (!user?.id || !newAlertCertId || !newAlertTitle.trim()) return;
    const escalate = newAlertType !== "pm_operational";
    createAlert.mutate(
      {
        certification_id: newAlertCertId,
        created_by: user.id,
        alert_type: newAlertType,
        title: newAlertTitle.trim(),
        description: newAlertDesc.trim() || undefined,
        escalate_to_admin: escalate,
      },
      {
        onSuccess: () => {
          toast({ title: "Alert created" });
          setShowCreateAlert(false);
          setNewAlertTitle("");
          setNewAlertDesc("");
          setNewAlertType("pm_operational");
          setNewAlertCertId("");
        },
      }
    );
  };

  return (
    <MainLayout title="My Tasks" subtitle="Your operational inbox">
      {/* Alerts Section */}
      {isPM && (
        <div className="mb-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Bell className="h-4 w-4 text-destructive" />
              Alerts ({activeAlerts.length})
            </h3>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setShowCreateAlert(true)}>
              <Plus className="h-3 w-3" /> New Alert
            </Button>
          </div>
          {activeAlerts.length > 0 && (
            <div className="space-y-2">
              {activeAlerts.map((alert) => (
                <Card key={alert.id} className="hover:shadow-sm transition-all">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm text-foreground truncate">{alert.title}</p>
                          <Badge variant="outline" className={cn("text-[10px] shrink-0", ALERT_TYPE_COLORS[alert.alert_type as TaskAlertType])}>
                            {ALERT_TYPE_LABELS[alert.alert_type as TaskAlertType]}
                          </Badge>
                          {alert.escalate_to_admin && (
                            <Badge variant="destructive" className="text-[10px] shrink-0">Admin</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {alert.certification_name} · {format(new Date(alert.created_at), "dd MMM")}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => resolveAlert.mutate(alert.id)}
                          disabled={resolveAlert.isPending}
                        >
                          <CheckCircle className="h-4 w-4 text-success" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {pageIsLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="py-12 text-center text-destructive">
            Error loading tasks. Please try again later.
          </CardContent>
        </Card>
      ) : activeTasksCount === 0 && activeAlerts.length === 0 && doneTasks.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <CheckCircle className="h-12 w-12 text-success mx-auto mb-3" />
            <p className="text-lg font-medium text-foreground">All done! 🎉</p>
            <p className="text-sm text-muted-foreground mt-1">You have no active tasks at the moment.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Inbox Zero State - Shows when all active tasks and active alerts are done but history exists */}
          {activeTasksCount === 0 && activeAlerts.length === 0 && (doneTasks.length > 0 || resolvedAlerts.length > 0) && (
            <Card>
              <CardContent className="py-12 text-center bg-muted/20 border-border/50">
                <CheckCircle className="h-10 w-10 text-success mx-auto mb-3" />
                <p className="text-lg font-medium text-foreground">Inbox Zero! 🎉</p>
                <p className="text-sm text-muted-foreground mt-1">Check your completed items below.</p>
              </CardContent>
            </Card>
          )}

          {inProgressTasks.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                In Progress ({inProgressTasks.length})
              </h3>
              <div className="space-y-2">{inProgressTasks.map(renderTaskCard)}</div>
            </div>
          )}

          {todoTasks.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                To Do ({todoTasks.length})
              </h3>
              <div className="space-y-2">{todoTasks.map(renderTaskCard)}</div>
            </div>
          )}

          {reviewTasks.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" />
                In Review ({reviewTasks.length})
              </h3>
              <div className="space-y-2">{reviewTasks.map(renderTaskCard)}</div>
            </div>
          )}

          {/* Completed Tasks Collapsible Section */}
          {doneTasks.length > 0 && (
            <div className="mt-8 border-t border-border pt-6">
              <Collapsible>
                <CollapsibleTrigger className="flex w-full items-center justify-between rounded-xl bg-success/10 border border-success/20 px-5 py-4 text-sm font-medium hover:bg-success/20 transition-colors group">
                  <div className="flex items-center gap-2.5 text-success">
                    <CheckCircle className="h-5 w-5" />
                    <span className="text-base font-semibold">Attività Completate Recenti</span>
                    <span className="rounded-full bg-success/20 px-2.5 py-0.5 text-xs font-bold">
                      {doneTasks.length}
                    </span>
                  </div>
                  <ChevronDown className="h-5 w-5 text-success transition-transform duration-200 group-data-[state=open]:rotate-180" />
                </CollapsibleTrigger>
                
                <CollapsibleContent className="mt-4 space-y-2">
                  {doneTasks.map((task) => (
                    <div key={task.id} className="opacity-60 grayscale-[50%] pointer-events-none">
                      {renderTaskCard(task)}
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}

          {/* SEZIONE ALERTS RISOLTI (STORICO) */}
          {resolvedAlerts.length > 0 && (
            <div className="mt-4 border-t border-border pt-6">
              <Collapsible>
                <CollapsibleTrigger className="flex w-full items-center justify-between rounded-xl bg-muted border border-border px-5 py-4 text-sm font-medium hover:bg-muted/80 transition-colors group">
                  <div className="flex items-center gap-2.5 text-muted-foreground">
                    <CheckCircle className="h-5 w-5" />
                    <span className="text-base font-semibold">Storico Alerts Risolti</span>
                    <span className="rounded-full bg-background px-2.5 py-0.5 text-xs font-bold border border-border">
                      {resolvedAlerts.length}
                    </span>
                  </div>
                  <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
                </CollapsibleTrigger>
                
                <CollapsibleContent className="mt-4 space-y-2">
                  {resolvedAlerts.map((alert) => (
                    <div key={alert.id} className="opacity-60 grayscale-[50%] pointer-events-none">
                      <Card className="hover:shadow-sm transition-all">
                        <CardContent className="py-3 px-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-sm text-foreground truncate">{alert.title}</p>
                                <Badge variant="outline" className={cn("text-[10px] shrink-0", ALERT_TYPE_COLORS[alert.alert_type as TaskAlertType])}>
                                  {ALERT_TYPE_LABELS[alert.alert_type as TaskAlertType]}
                                </Badge>
                                {alert.escalate_to_admin && (
                                  <Badge variant="destructive" className="text-[10px] shrink-0">Admin</Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                {alert.certification_name} · {format(new Date(alert.created_at), "dd MMM")}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}
        </div>
      )}

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
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Status</p>
                  <Badge variant="outline" className={cn("text-xs", STATUS_COLORS[selectedTask.status])}>
                    {STATUS_LABELS[selectedTask.status]}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Start</p>
                    <p className="text-sm text-foreground">
                      {selectedTask.start_date ? format(new Date(selectedTask.start_date), "dd MMM yyyy") : "—"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Deadline</p>
                    <p className="text-sm text-foreground">
                      {selectedTask.end_date ? format(new Date(selectedTask.end_date), "dd MMM yyyy") : "—"}
                    </p>
                  </div>
                </div>

                {isBlocked(selectedTask) && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                    <div className="flex items-center gap-2">
                      <Lock className="h-4 w-4 text-destructive" />
                      <p className="text-sm font-medium text-destructive">Task Blocked</p>
                    </div>
                    <p className="text-xs text-destructive/80 mt-1">
                      Waiting for payment: "{selectedTask.blocking_payment_name}"
                    </p>
                  </div>
                )}

                {selectedTask.isSynthetic && (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <p className="text-sm font-medium text-foreground">Auto-generated task</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      This project has no operational milestones assigned yet: complete the setup from "My Projects".
                    </p>
                  </div>
                )}

                {!isBlocked(selectedTask) && !selectedTask.isSynthetic && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Change Status</p>
                    <Select
                      value={selectedTask.status}
                      onValueChange={(val) => updateStatus.mutate({ taskId: selectedTask.id, newStatus: val })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todo">To Do</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="review">In Review</SelectItem>
                        <SelectItem value="done">Completed</SelectItem>
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
                    Open My Projects
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    className="w-full gap-2"
                    disabled={isBlocked(selectedTask) || updateStatus.isPending || selectedTask.status === "done"}
                    onClick={() => updateStatus.mutate({ taskId: selectedTask.id, newStatus: "review" })}
                  >
                    <Upload className="h-4 w-4" />
                    Upload Document & Execute
                  </Button>
                )}
                {isBlocked(selectedTask) && !selectedTask.isSynthetic && (
                  <p className="text-xs text-center text-destructive">
                    You cannot complete this task until the payment has been settled.
                  </p>
                )}
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Create Alert Dialog */}
      <Dialog open={showCreateAlert} onOpenChange={setShowCreateAlert}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Alert</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Project</Label>
              <Select value={newAlertCertId} onValueChange={setNewAlertCertId}>
                <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                <SelectContent>
                  {pmProjects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={newAlertType} onValueChange={(v) => setNewAlertType(v as TaskAlertType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pm_operational">PM Operational (private)</SelectItem>
                  <SelectItem value="timeline_to_configure">Timeline to Configure</SelectItem>
                  <SelectItem value="milestone_deadline">Milestone Deadline</SelectItem>
                  <SelectItem value="project_on_hold">Project On Hold</SelectItem>
                  <SelectItem value="other_critical">Other Critical</SelectItem>
                </SelectContent>
              </Select>
              {newAlertType !== "pm_operational" && (
                <p className="text-xs text-muted-foreground">⚠️ This will be visible to Admin</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={newAlertTitle} onChange={(e) => setNewAlertTitle(e.target.value)} placeholder="Brief description" />
            </div>
            <div className="space-y-2">
              <Label>Details (optional)</Label>
              <Textarea value={newAlertDesc} onChange={(e) => setNewAlertDesc(e.target.value)} placeholder="Additional context..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateAlert(false)}>Cancel</Button>
            <Button onClick={handleCreateAlert} disabled={!newAlertCertId || !newAlertTitle.trim() || createAlert.isPending}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}

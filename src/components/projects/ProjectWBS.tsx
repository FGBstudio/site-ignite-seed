import { useState } from "react";
import { useProjectTasks, useCreateTask, useUpdateTask, useDeleteTask, ProjectTask } from "@/hooks/useProjectTasks";
import { usePaymentMilestones, PaymentMilestone } from "@/hooks/usePaymentMilestones";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Lock, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

const TASK_STATUS_LABELS: Record<string, string> = {
  todo: "Da fare",
  in_progress: "In corso",
  review: "In revisione",
  done: "Completato",
};

const TASK_STATUS_COLORS: Record<string, string> = {
  todo: "bg-muted text-muted-foreground",
  in_progress: "bg-primary/10 text-primary border-primary/20",
  review: "bg-warning/10 text-warning border-warning/20",
  done: "bg-success/10 text-success border-success/20",
};

interface Props {
  projectId: string;
}

export function ProjectWBS({ projectId }: Props) {
  const { data: tasks = [], isLoading } = useProjectTasks(projectId);
  const { data: payments = [] } = usePaymentMilestones(projectId);
  const createTask = useCreateTask(projectId);
  const updateTask = useUpdateTask(projectId);
  const deleteTask = useDeleteTask(projectId);

  const [showNewTask, setShowNewTask] = useState(false);
  const [newTask, setNewTask] = useState({
    task_name: "",
    assigned_to: "",
    start_date: "",
    end_date: "",
    blocking_payment_id: "",
    dependency_id: "",
  });

  // Fetch staff list
  const { data: staff = [] } = useQuery({
    queryKey: ["staff-list"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name");
      return data || [];
    },
  });

  // Build payment map for blocking checks
  const paymentMap = new Map<string, PaymentMilestone>(payments.map((p) => [p.id, p]));

  const isBlocked = (task: ProjectTask): boolean => {
    if (!task.blocking_payment_id) return false;
    const payment = paymentMap.get(task.blocking_payment_id);
    return !!payment && payment.status !== "paid";
  };

  const getBlockingPaymentName = (task: ProjectTask): string | null => {
    if (!task.blocking_payment_id) return null;
    const payment = paymentMap.get(task.blocking_payment_id);
    return payment ? payment.milestone_name : null;
  };

  const handleCreateTask = async () => {
    if (!newTask.task_name.trim()) return;
    await createTask.mutateAsync({
      task_name: newTask.task_name,
      assigned_to: newTask.assigned_to || null,
      start_date: newTask.start_date || null,
      end_date: newTask.end_date || null,
      blocking_payment_id: newTask.blocking_payment_id || null,
      dependency_id: newTask.dependency_id || null,
      status: "todo",
    } as any);
    setNewTask({ task_name: "", assigned_to: "", start_date: "", end_date: "", blocking_payment_id: "", dependency_id: "" });
    setShowNewTask(false);
  };

  const handleStatusChange = (task: ProjectTask, newStatus: string) => {
    if (isBlocked(task) && (newStatus === "done" || newStatus === "review")) return;
    updateTask.mutate({ id: task.id, status: newStatus } as any);
  };

  const staffMap = new Map(staff.map((s: any) => [s.id, s.full_name]));

  if (isLoading) {
    return (
      <Card><CardContent className="py-12 flex justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground">Cronoprogramma (WBS)</h3>
        <Button size="sm" onClick={() => setShowNewTask(true)} className="gap-1">
          <Plus className="h-4 w-4" /> Nuovo Task
        </Button>
      </div>

      {tasks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nessun task nel cronoprogramma. Clicca "Nuovo Task" per iniziare.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => {
            const blocked = isBlocked(task);
            const blockingName = getBlockingPaymentName(task);
            return (
              <Card key={task.id} className={cn(blocked && "border-destructive/40 bg-destructive/5")}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-4">
                    {/* Task name + blocking indicator */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {blocked && <Lock className="h-4 w-4 text-destructive shrink-0" />}
                        <span className={cn("font-medium text-sm text-foreground", blocked && "text-destructive")}>{task.task_name}</span>
                      </div>
                      {blocked && blockingName && (
                        <p className="text-xs text-destructive flex items-center gap-1 mt-0.5">
                          <AlertTriangle className="h-3 w-3" />
                          Bloccato da pagamento: "{blockingName}"
                        </p>
                      )}
                      <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                        {task.assigned_to && <span>👤 {staffMap.get(task.assigned_to) || "—"}</span>}
                        {task.start_date && <span>📅 {format(new Date(task.start_date), "dd MMM", { locale: it })}</span>}
                        {task.end_date && <span>→ {format(new Date(task.end_date), "dd MMM", { locale: it })}</span>}
                      </div>
                    </div>

                    {/* Status select */}
                    <Select
                      value={task.status}
                      onValueChange={(val) => handleStatusChange(task, val)}
                      disabled={blocked && task.status !== "todo"}
                    >
                      <SelectTrigger className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(TASK_STATUS_LABELS).map(([val, label]) => (
                          <SelectItem
                            key={val}
                            value={val}
                            disabled={blocked && (val === "done" || val === "review")}
                          >
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Badge */}
                    <Badge variant="outline" className={cn("shrink-0 text-xs", TASK_STATUS_COLORS[task.status])}>
                      {TASK_STATUS_LABELS[task.status]}
                    </Badge>

                    {/* Delete */}
                    <Button variant="ghost" size="icon" onClick={() => deleteTask.mutate(task.id)} className="text-destructive hover:text-destructive shrink-0">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* New Task Dialog */}
      <Dialog open={showNewTask} onOpenChange={setShowNewTask}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nuovo Task</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome Task *</Label>
              <Input value={newTask.task_name} onChange={(e) => setNewTask({ ...newTask, task_name: e.target.value })} placeholder="es. Installazione sensori piano 3" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data Inizio</Label>
                <Input type="date" value={newTask.start_date} onChange={(e) => setNewTask({ ...newTask, start_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Data Fine</Label>
                <Input type="date" value={newTask.end_date} onChange={(e) => setNewTask({ ...newTask, end_date: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Assegnato a</Label>
              <Select value={newTask.assigned_to} onValueChange={(val) => setNewTask({ ...newTask, assigned_to: val })}>
                <SelectTrigger><SelectValue placeholder="Seleziona risorsa" /></SelectTrigger>
                <SelectContent>
                  {staff.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Bloccato da Pagamento</Label>
              <Select value={newTask.blocking_payment_id} onValueChange={(val) => setNewTask({ ...newTask, blocking_payment_id: val })}>
                <SelectTrigger><SelectValue placeholder="Nessun blocco" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Nessun blocco</SelectItem>
                  {payments.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.milestone_name} — €{Number(p.amount).toLocaleString("it-IT")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Task Propedeutico</Label>
              <Select value={newTask.dependency_id} onValueChange={(val) => setNewTask({ ...newTask, dependency_id: val })}>
                <SelectTrigger><SelectValue placeholder="Nessuna dipendenza" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Nessuna dipendenza</SelectItem>
                  {tasks.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.task_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewTask(false)}>Annulla</Button>
            <Button onClick={handleCreateTask} disabled={createTask.isPending || !newTask.task_name.trim()}>
              {createTask.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Crea Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

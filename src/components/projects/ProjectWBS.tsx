import { useState } from "react";
import { useProjectTasks, useCreateTask, useUpdateTask, useDeleteTask } from "@/hooks/useProjectTasks";
import { usePaymentMilestones, PaymentMilestone } from "@/hooks/usePaymentMilestones";
import { useCreateAlert, useResolveAlert, ALERT_TYPE_LABELS, ALERT_TYPE_COLORS, type TaskAlertType } from "@/hooks/useTaskAlerts";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface ProjectTask {
  id: string;
  certification_id: string;
  task_name: string;
  assigned_to: string | null;
  start_date: string | null;
  end_date: string | null;
  status: "todo" | "in_progress" | "review" | "done";
  dependency_id: string | null;
  blocking_payment_id: string | null;
  allocation_id?: string | null;
  created_at: string;
}

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Plus, Trash2, Lock, AlertTriangle, Loader2, Package, CheckCircle2, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import type { ProjectAllocation, Product, AppRole } from "@/types/custom-tables";

const TASK_STATUS_LABELS: Record<string, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  review: "In Review",
  done: "Completed",
};

const TASK_STATUS_COLORS: Record<string, string> = {
  todo: "bg-muted text-muted-foreground",
  in_progress: "bg-primary/10 text-primary border-primary/20",
  review: "bg-warning/10 text-warning border-warning/20",
  done: "bg-success/10 text-success border-success/20",
};

interface Props {
  projectId: string;
  role?: AppRole | null;
}

export function ProjectWBS({ projectId, role }: Props) {
  const { data: tasks = [], isLoading } = useProjectTasks(projectId);
  const { data: payments = [] } = usePaymentMilestones(projectId);
  const createTask = useCreateTask(projectId);
  const updateTask = useUpdateTask(projectId);
  const deleteTask = useDeleteTask(projectId);
  const { user } = useAuth();

  // Fetch project alerts
  const { data: alerts = [] } = useQuery({
    queryKey: ["project-alerts", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("task_alerts")
        .select("*, profiles!task_alerts_created_by_fkey(full_name)")
        .eq("certification_id", projectId)
        .eq("is_resolved", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      let items = (data || []) as any[];
      // Admin sees only escalated; PM sees all
      if (role === "ADMIN") {
        items = items.filter((a: any) => a.escalate_to_admin);
      }
      return items.map((a: any) => ({
        ...a,
        pm_name: a.profiles?.full_name || "—",
      }));
    },
  });

  const resolveAlert = useResolveAlert();
  const createAlert = useCreateAlert();

  const [showNewTask, setShowNewTask] = useState(false);
  const [newTaskTab, setNewTaskTab] = useState<"wbs" | "note" | "escalation">("wbs");
  const [alertTitle, setAlertTitle] = useState("");
  const [alertDescription, setAlertDescription] = useState("");
  const [newTask, setNewTask] = useState({
    task_name: "",
    assigned_to: "",
    start_date: "",
    end_date: "",
    blocking_payment_id: "",
    dependency_id: "",
    allocation_id: "",
  });

  const { data: staff = [] } = useQuery({
    queryKey: ["staff-list"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name");
      return data || [];
    },
  });

  const { data: allocations = [] } = useQuery({
    queryKey: ["project-allocations", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_allocations" as any)
        .select("*")
        .eq("certification_id", projectId);
      if (error) throw error;
      return (data || []) as unknown as ProjectAllocation[];
    },
    enabled: !!projectId,
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products-list"],
    queryFn: async () => {
      const { data } = await supabase.from("products" as any).select("*");
      return (data || []) as unknown as Product[];
    },
  });

  const paymentMap = new Map<string, PaymentMilestone>(payments.map((p) => [p.id, p]));
  const allocationMap = new Map<string, ProjectAllocation>(allocations.map((a) => [a.id, a]));
  const productMap = new Map<string, Product>(products.map((p) => [p.id, p]));

  const isBlocked = (task: ProjectTask): boolean => {
    if (task.blocking_payment_id) {
      const payment = paymentMap.get(task.blocking_payment_id);
      if (payment && payment.status !== "paid") return true;
    }
    if (task.allocation_id) {
      const allocation = allocationMap.get(task.allocation_id);
      if (allocation && !["Shipped", "Installed_Online"].includes(allocation.status)) {
        return true;
      }
    }
    return false;
  };

  const getBlockingPaymentName = (task: ProjectTask): string | null => {
    if (!task.blocking_payment_id) return null;
    const payment = paymentMap.get(task.blocking_payment_id);
    return payment ? payment.milestone_name : null;
  };

  const getBlockingAllocationInfo = (task: ProjectTask): { productName: string; status: string } | null => {
    if (!task.allocation_id) return null;
    const allocation = allocationMap.get(task.allocation_id);
    if (!allocation || ["Shipped", "Installed_Online"].includes(allocation.status)) return null;
    const product = productMap.get(allocation.product_id);
    return {
      productName: product?.name || "Hardware",
      status: allocation.status,
    };
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
      allocation_id: newTask.allocation_id || null,
      status: "todo",
    } as any);
    setNewTask({ task_name: "", assigned_to: "", start_date: "", end_date: "", blocking_payment_id: "", dependency_id: "", allocation_id: "" });
    setShowNewTask(false);
  };

  const handleStatusChange = (task: ProjectTask, newStatus: string) => {
    if (isBlocked(task) && (newStatus === "done" || newStatus === "review" || newStatus === "in_progress")) return;
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
        <h3 className="font-semibold text-foreground">Schedule (WBS)</h3>
        <Button size="sm" onClick={() => setShowNewTask(true)} className="gap-1">
          <Plus className="h-4 w-4" /> New Task
        </Button>
      </div>

      {tasks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No tasks in the schedule. Click "New Task" to start.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => {
            const blocked = isBlocked(task);
            const blockingName = getBlockingPaymentName(task);
            const blockingAlloc = getBlockingAllocationInfo(task);
            return (
              <Card key={task.id} className={cn(blocked && "border-destructive/40 bg-destructive/5")}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {blocked && <Lock className="h-4 w-4 text-destructive shrink-0" />}
                        <span className={cn("font-medium text-sm text-foreground", blocked && "text-destructive")}>{task.task_name}</span>
                      </div>
                      {blocked && blockingName && (
                        <p className="text-xs text-destructive flex items-center gap-1 mt-0.5">
                          <AlertTriangle className="h-3 w-3" />
                          Blocked by payment: &quot;{blockingName}&quot;
                        </p>
                      )}
                      {blocked && blockingAlloc && (
                        <p className="text-xs text-destructive flex items-center gap-1 mt-0.5">
                          <Package className="h-3 w-3" />
                          Blocked by logistics (Current status: {blockingAlloc.status})
                        </p>
                      )}
                      <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                        {task.assigned_to && <span>👤 {staffMap.get(task.assigned_to) || "—"}</span>}
                        {task.start_date && <span>📅 {format(new Date(task.start_date), "dd MMM")}</span>}
                        {task.end_date && <span>→ {format(new Date(task.end_date), "dd MMM")}</span>}
                        {task.allocation_id && (() => {
                          const alloc = allocationMap.get(task.allocation_id);
                          const prod = alloc ? productMap.get(alloc.product_id) : null;
                          return prod ? <span>📦 {prod.name}</span> : null;
                        })()}
                      </div>
                    </div>

                    <Select
                      value={task.status}
                      onValueChange={(val) => handleStatusChange(task, val)}
                      disabled={blocked && task.status === "todo"}
                    >
                      <SelectTrigger className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(TASK_STATUS_LABELS).map(([val, label]) => (
                          <SelectItem
                            key={val}
                            value={val}
                            disabled={blocked && (val === "done" || val === "review" || val === "in_progress")}
                          >
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Badge variant="outline" className={cn("shrink-0 text-xs", TASK_STATUS_COLORS[task.status])}>
                      {TASK_STATUS_LABELS[task.status]}
                    </Badge>

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

      <Dialog open={showNewTask} onOpenChange={setShowNewTask}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Task</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Task Name *</Label>
              <Input value={newTask.task_name} onChange={(e) => setNewTask({ ...newTask, task_name: e.target.value })} placeholder="e.g. Install sensors floor 3" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input type="date" value={newTask.start_date} onChange={(e) => setNewTask({ ...newTask, start_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input type="date" value={newTask.end_date} onChange={(e) => setNewTask({ ...newTask, end_date: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Assigned To</Label>
              <Select value={newTask.assigned_to} onValueChange={(val) => setNewTask({ ...newTask, assigned_to: val })}>
                <SelectTrigger><SelectValue placeholder="Select resource" /></SelectTrigger>
                <SelectContent>
                  {staff.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Link Hardware (Optional)</Label>
              <Select value={newTask.allocation_id} onValueChange={(val) => setNewTask({ ...newTask, allocation_id: val })}>
                <SelectTrigger><SelectValue placeholder="No hardware linked" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No hardware linked</SelectItem>
                  {allocations.map((a) => {
                    const prod = productMap.get(a.product_id);
                    return (
                      <SelectItem key={a.id} value={a.id}>
                        {prod?.name || "Product"} — Qty: {a.quantity} ({a.status})
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Blocked by Payment</Label>
              <Select value={newTask.blocking_payment_id} onValueChange={(val) => setNewTask({ ...newTask, blocking_payment_id: val })}>
                <SelectTrigger><SelectValue placeholder="No block" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No block</SelectItem>
                  {payments.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.milestone_name} — €{Number(p.amount).toLocaleString("en-US")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Prerequisite Task</Label>
              <Select value={newTask.dependency_id} onValueChange={(val) => setNewTask({ ...newTask, dependency_id: val })}>
                <SelectTrigger><SelectValue placeholder="No dependency" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No dependency</SelectItem>
                  {tasks.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.task_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewTask(false)}>Cancel</Button>
            <Button onClick={handleCreateTask} disabled={createTask.isPending || !newTask.task_name.trim()}>
              {createTask.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

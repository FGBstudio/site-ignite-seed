import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { useAuth } from "@/contexts/AuthContext";
import {
  useResolveAlert,
  useCreateAlert,
  ALERT_TYPE_LABELS,
  ALERT_TYPE_COLORS,
  type TaskAlertType,
} from "@/hooks/useTaskAlerts";
import { useAdminTasksData } from "@/hooks/useAdminTasksData";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CheckCircle, ExternalLink, Inbox, AlertTriangle, Clock, Pause, FolderKanban, CalendarDays, Settings2, ChevronDown, Plus } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const TYPE_ICONS: Record<TaskAlertType, typeof AlertTriangle> = {
  timeline_to_configure: Clock,
  milestone_deadline: AlertTriangle,
  project_on_hold: Pause,
  pm_operational: Inbox,
  other_critical: AlertTriangle,
};

export default function AdminTasks() {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  
  const { data, isLoading } = useAdminTasksData(role, user?.id);
  const resolve = useResolveAlert();
  const createAlert = useCreateAlert();
  const alerts = data?.alerts || [];
  const allTasks = data?.tasks || [];

  // Stati per la creazione di un nuovo Alert
  const [showCreateAlert, setShowCreateAlert] = useState(false);
  const [newAlertTitle, setNewAlertTitle] = useState("");
  const [newAlertDesc, setNewAlertDesc] = useState("");
  const [newAlertType, setNewAlertType] = useState<TaskAlertType>("other_critical");
  const [newAlertCertId, setNewAlertCertId] = useState("");

  // Stati per i Filtri Incrociati
  const [selectedPM, setSelectedPM] = useState<string>("all");
  const [selectedProject, setSelectedProject] = useState<string>("all");

  const uniquePMs = useMemo(() => {
    const pms = new Map();
    allTasks.forEach(t => t.assigned_to && pms.set(t.assigned_to, t.pm_name));
    alerts.forEach(a => a.created_by && pms.set(a.created_by, a.pm_name));
    return Array.from(pms.entries());
  }, [allTasks, alerts]);

  const uniqueProjects = useMemo(() => {
    const projs = new Map();
    allTasks.forEach(t => t.certification_id && projs.set(t.certification_id, t.project_name));
    alerts.forEach(a => a.certification_id && projs.set(a.certification_id, a.certification_name));
    return Array.from(projs.entries());
  }, [allTasks, alerts]);

  // Motore di Filtraggio
  const filteredTasks = allTasks.filter(t => {
    const matchPM = selectedPM === "all" || t.assigned_to === selectedPM;
    const matchProject = selectedProject === "all" || t.certification_id === selectedProject;
    return matchPM && matchProject;
  });

  const filteredAlerts = alerts.filter(a => {
    const matchPM = selectedPM === "all" || a.created_by === selectedPM;
    const matchProject = selectedProject === "all" || a.certification_id === selectedProject;
    return matchPM && matchProject;
  });

  const colTodo = filteredTasks.filter(t => t.status === "todo");
  const colInProgress = filteredTasks.filter(t => t.status === "in_progress" || t.status === "review");
  const colDone = filteredTasks.filter(t => t.status === "done");

  // Separazione Alert Attivi e Risolti
  const activeAlerts = filteredAlerts.filter(a => !a.is_resolved);
  const resolvedAlerts = filteredAlerts.filter(a => a.is_resolved);

  const handleCreateAlert = () => {
    if (!user?.id || !newAlertCertId || !newAlertTitle.trim()) return;
    createAlert.mutate(
      {
        certification_id: newAlertCertId,
        created_by: user.id,
        alert_type: newAlertType,
        title: newAlertTitle.trim(),
        description: newAlertDesc.trim() || undefined,
        escalate_to_admin: true, // Come Admin, creiamo alert nativamente scalati
      },
      {
        onSuccess: () => {
          setShowCreateAlert(false);
          setNewAlertTitle("");
          setNewAlertDesc("");
          setNewAlertType("other_critical");
          setNewAlertCertId("");
        },
      }
    );
  };

  return (
    <MainLayout title="Tasks & Alerts" subtitle="Control room for PM operations and escalations">
      
      {/* SEZIONE FILTRI */}
      <div className="flex flex-col sm:flex-row items-center gap-3 mb-8 bg-card p-4 rounded-xl border border-border shadow-sm">
        <Select value={selectedPM} onValueChange={setSelectedPM}>
          <SelectTrigger className="w-full sm:w-[220px]">
            <SelectValue placeholder="Filter by PM" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Project Managers</SelectItem>
            {uniquePMs.map(([id, name]) => (
              <SelectItem key={id} value={id}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedProject} onValueChange={setSelectedProject}>
          <SelectTrigger className="w-full sm:w-[220px]">
            <SelectValue placeholder="Filter by Project" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {uniqueProjects.map(([id, name]) => (
              <SelectItem key={id} value={id}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex-1" />
        
        <div className="flex gap-2">
          <Badge variant="outline" className="text-xs bg-muted">
            {colTodo.length + colInProgress.length} Tasks
          </Badge>
          <Badge variant="destructive" className="text-xs">
            {activeAlerts.length} Alerts
          </Badge>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((col) => (
            <div key={col} className="space-y-3">
              <Skeleton className="h-6 w-1/3 mb-4" />
              {[1, 2].map((i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            
            {/* COLONNA 1: TO DO */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4" /> To Do ({colTodo.length})
              </h3>
              <div className="space-y-3">
                {colTodo.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Nessun task in attesa</p>
                ) : (
                  colTodo.map(task => <TaskCard key={task.id} task={task} />)
                )}
              </div>
            </div>

            {/* COLONNA 2: IN PROGRESS */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold flex items-center gap-2 text-primary">
                <FolderKanban className="h-4 w-4" /> In Progress / Review ({colInProgress.length})
              </h3>
              <div className="space-y-3">
                {colInProgress.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Nessun task in lavorazione</p>
                ) : (
                  colInProgress.map(task => <TaskCard key={task.id} task={task} />)
                )}
              </div>
            </div>

            {/* COLONNA 3: ALERTS */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-4 w-4" /> Scaled Alerts ({activeAlerts.length})
                </h3>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setShowCreateAlert(true)}>
                  <Plus className="h-3 w-3" /> New Alert
                </Button>
              </div>
              
              <div className="space-y-3">
                {activeAlerts.length === 0 ? (
                  <div className="bg-success/5 border border-success/20 rounded-xl p-4 text-center">
                    <CheckCircle className="h-8 w-8 text-success mx-auto mb-2" />
                    <p className="text-sm font-medium text-success">Zero anomalie</p>
                  </div>
                ) : (
                  activeAlerts.map(alert => (
                    <AlertCard 
                      key={alert.id} 
                      alert={alert} 
                      navigate={navigate} 
                      resolveAlert={() => resolve.mutate(alert.id)} 
                      isResolving={resolve.isPending} 
                    />
                  ))
                )}
              </div>
            </div>

          </div>

          {/* SEZIONE ATTIVITÀ COMPLETATE (TASKS) */}
          {colDone.length > 0 && (
            <div className="mt-8 border-t border-border pt-6">
              <Collapsible>
                <CollapsibleTrigger className="flex w-full items-center justify-between rounded-xl bg-success/10 border border-success/20 px-5 py-4 text-sm font-medium hover:bg-success/20 transition-colors group">
                  <div className="flex items-center gap-2.5 text-success">
                    <CheckCircle className="h-5 w-5" />
                    <span className="text-base font-semibold">Attività Completate Recenti</span>
                    <span className="rounded-full bg-success/20 px-2.5 py-0.5 text-xs font-bold">
                      {colDone.length}
                    </span>
                  </div>
                  <ChevronDown className="h-5 w-5 text-success transition-transform duration-200 group-data-[state=open]:rotate-180" />
                </CollapsibleTrigger>
                
                <CollapsibleContent className="mt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {colDone.map((task) => (
                      <div key={task.id} className="opacity-60 grayscale-[50%] pointer-events-none">
                        <TaskCard task={task} />
                      </div>
                    ))}
                  </div>
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
                
                <CollapsibleContent className="mt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {resolvedAlerts.map((alert) => (
                      <div key={alert.id} className="opacity-60 grayscale-[50%] pointer-events-none">
                        <AlertCard 
                          alert={alert} 
                          navigate={navigate} 
                          resolveAlert={() => {}} 
                          isResolving={false} 
                        />
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}

        </div>
      )}

      {/* CREATE ALERT DIALOG FOR ADMIN */}
      <Dialog open={showCreateAlert} onOpenChange={setShowCreateAlert}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Scaled Alert</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Project</Label>
              <Select value={newAlertCertId} onValueChange={setNewAlertCertId}>
                <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                <SelectContent>
                  {uniqueProjects.map(([id, name]) => (
                    <SelectItem key={id} value={id}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={newAlertType} onValueChange={(v) => setNewAlertType(v as TaskAlertType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="timeline_to_configure">Timeline to Configure</SelectItem>
                  <SelectItem value="milestone_deadline">Milestone Deadline</SelectItem>
                  <SelectItem value="project_on_hold">Project On Hold</SelectItem>
                  <SelectItem value="pm_operational">PM Operational</SelectItem>
                  <SelectItem value="other_critical">Other Critical</SelectItem>
                </SelectContent>
              </Select>
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
              Create Alert
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </MainLayout>
  );
}

function TaskCard({ task }: { task: any }) {
  return (
    <Card className={cn("hover:border-primary/50 transition-all shadow-sm", task.isSynthetic && "border-primary/30 bg-primary/5")}>
      <CardContent className="py-3 px-4 space-y-2">
        <div className="flex justify-between items-start gap-2">
          <p className="font-medium text-sm leading-tight text-foreground flex-1">{task.task_name}</p>
          {task.isSynthetic && (
            <Settings2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <FolderKanban className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{task.project_name}</span>
        </div>
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
          <span className="text-[10px] font-medium bg-secondary text-secondary-foreground px-2.5 py-1 rounded-md">
            {task.pm_name}
          </span>
          {task.end_date && (
            <span className={cn("flex items-center gap-1.5 text-[10px] font-medium", new Date(task.end_date) < new Date() && task.status !== 'done' ? "text-destructive" : "text-muted-foreground")}>
              <CalendarDays className="h-3.5 w-3.5" />
              {format(new Date(task.end_date), "dd MMM")}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AlertCard({ alert, navigate, resolveAlert, isResolving }: any) {
  const Icon = TYPE_ICONS[alert.alert_type as TaskAlertType] || AlertTriangle;
  return (
    <Card className="border-destructive/30 bg-destructive/5 hover:shadow-md transition-all">
      <CardContent className="py-3 px-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <Icon className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0 space-y-1.5">
              <p className="font-medium text-sm leading-tight text-foreground">{alert.title}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={cn("text-[10px]", ALERT_TYPE_COLORS[alert.alert_type as TaskAlertType])}>
                  {ALERT_TYPE_LABELS[alert.alert_type as TaskAlertType]}
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                <FolderKanban className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{alert.certification_name}</span>
              </div>
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-destructive/10">
                <span className="text-[10px] font-medium bg-background text-foreground px-2.5 py-1 rounded-md border border-border shadow-sm">
                  {alert.pm_name}
                </span>
              </div>
              {alert.description && (
                <p className="text-xs text-muted-foreground mt-2 bg-background/50 p-2 rounded-md italic">
                  {alert.description}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-background/80" onClick={() => navigate(`/projects/${alert.certification_id}`)}>
              <ExternalLink className="h-4 w-4" />
            </Button>
            {!alert.is_resolved && (
              <Button 
                size="icon" 
                variant="outline" 
                className="h-8 w-8 text-success hover:bg-success hover:text-success-foreground border-success/30" 
                disabled={isResolving} 
                onClick={resolveAlert}
              >
                <CheckCircle className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

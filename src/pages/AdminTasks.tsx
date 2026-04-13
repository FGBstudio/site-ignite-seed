import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MainLayout } from "@/components/layout/MainLayout";
import { useAuth } from "@/contexts/AuthContext";
import {
  useTaskAlerts,
  useResolveAlert,
  ALERT_TYPE_LABELS,
  ALERT_TYPE_COLORS,
  type TaskAlertType,
} from "@/hooks/useTaskAlerts";
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
import { CheckCircle, ExternalLink, Inbox, AlertTriangle, Clock, Pause, FolderKanban, CalendarDays } from "lucide-react";
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
  
  const { data: alerts = [], isLoading: alertsLoading } = useTaskAlerts(role, user?.id);
  const resolve = useResolveAlert();

  // 1. Fetching Globale di tutti i Task (To Do / In Progress)
  const { data: allTasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ["admin-all-tasks"],
    enabled: role === "ADMIN",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_tasks" as any)
        .select("*, certifications!project_tasks_certification_id_fkey(name, client)")
        .neq("status", "done")
        .order("end_date", { ascending: true });
      
      if (error) throw error;

      // Estrazione e mappatura dei nomi dei PM
      const pmIds = [...new Set((data || []).map((t: any) => t.assigned_to).filter(Boolean))] as string[];
      let profileMap = new Map<string, string>();
      if (pmIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", pmIds);
        if (profiles) profiles.forEach(p => profileMap.set(p.id, p.full_name));
      }

      return (data || []).map((t: any) => ({
        ...t,
        project_name: t.certifications?.name || "Unknown Project",
        pm_name: t.assigned_to ? profileMap.get(t.assigned_to) || "Unknown PM" : "Unassigned"
      }));
    }
  });

  // 2. Stati per i Filtri Incrociati
  const [selectedPM, setSelectedPM] = useState<string>("all");
  const [selectedProject, setSelectedProject] = useState<string>("all");

  // 3. Estrazione Dinamica per i Dropdown
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

  // 4. Motore di Filtraggio
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

  // 5. Smistamento Colonne
  const colTodo = filteredTasks.filter(t => t.status === "todo");
  const colInProgress = filteredTasks.filter(t => t.status === "in_progress" || t.status === "review");

  const isLoading = alertsLoading || tasksLoading;

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
            {filteredAlerts.length} Alerts
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
            <h3 className="text-sm font-semibold flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" /> Scaled Alerts ({filteredAlerts.length})
            </h3>
            <div className="space-y-3">
              {filteredAlerts.length === 0 ? (
                <div className="bg-success/5 border border-success/20 rounded-xl p-4 text-center">
                  <CheckCircle className="h-8 w-8 text-success mx-auto mb-2" />
                  <p className="text-sm font-medium text-success">Zero anomalie</p>
                </div>
              ) : (
                filteredAlerts.map(alert => (
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
      )}
    </MainLayout>
  );
}

// --- SOTTO-COMPONENTI UI ---

function TaskCard({ task }: { task: any }) {
  return (
    <Card className="hover:border-primary/50 transition-all shadow-sm">
      <CardContent className="py-3 px-4 space-y-2">
        <p className="font-medium text-sm leading-tight text-foreground">{task.task_name}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <FolderKanban className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{task.project_name}</span>
        </div>
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
          <span className="text-[10px] font-medium bg-secondary text-secondary-foreground px-2.5 py-1 rounded-md">
            {task.pm_name}
          </span>
          {task.end_date && (
            <span className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
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
            <Button 
              size="icon" 
              variant="outline" 
              className="h-8 w-8 text-success hover:bg-success hover:text-success-foreground border-success/30" 
              disabled={isResolving} 
              onClick={resolveAlert}
            >
              <CheckCircle className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  DollarSign,
  Layers3,
  Settings2,
  LayoutGrid,
  GanttChartSquare,
} from "lucide-react";
import { usePMDashboard, type PMProject } from "@/hooks/usePMDashboard";
import { useFinancialAlerts } from "@/hooks/useFinancialAlerts";
import { cn } from "@/lib/utils";
import { PMProjectConfigModal } from "@/components/projects/PMProjectConfigModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FGBPlanner } from "@/components/dashboard/FGBPlanner";

type PMProjectView = PMProject & {
  project_subtype?: string | null;
};

const STATUS_META = {
  da_configurare: {
    label: "To Configure",
    icon: AlertTriangle,
    className: "border-warning/30 bg-warning/10 text-warning",
    emptyMessage: "No projects to configure.",
  },
  in_corso: {
    label: "In Progress",
    icon: Clock3,
    className: "border-primary/30 bg-primary/10 text-primary",
    emptyMessage: "No projects in progress.",
  },
  certificato: {
    label: "Certified",
    icon: CheckCircle2,
    className: "border-success/30 bg-success/10 text-success",
    emptyMessage: "No certified projects.",
  },
} as const;

const MISSING_META: Record<string, string> = {
  Hardware: "Hardware",
  Timeline: "Timeline",
  Scorecard: "Scorecard",
};

function PMProjectCard({
  project,
  onConfigure,
  financialAlert,
}: {
  project: PMProjectView;
  onConfigure: (project: PMProjectView) => void;
  financialAlert?: { paymentDelay: number; paymentAmount: number; extraCanone: number };
}) {
  const statusMeta = STATUS_META[project.setup_status];
  const StatusIcon = statusMeta.icon;
  const daysLeft = Math.ceil((new Date(project.handover_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const timelineConfigured = !project.missing.includes("Timeline");
  const scorecardConfigured = !project.missing.includes("Scorecard");
  const hardwareConfigured = !project.missing.includes("Hardware");
  const hasFinancialAlert = !!financialAlert && (financialAlert.paymentDelay > 0 || financialAlert.extraCanone > 0);

  return (
    <Card
      className={cn(
        "border-border/70 bg-card transition-shadow hover:shadow-md",
        project.is_deadline_critical && "border-destructive/60 bg-destructive/5 ring-1 ring-destructive/20",
        hasFinancialAlert && !project.is_deadline_critical && "border-destructive/40 ring-1 ring-destructive/10"
      )}
    >
      <CardHeader className="space-y-4 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="text-base text-foreground">{project.name}</CardTitle>
            <CardDescription className="flex items-center gap-1.5 text-sm">
              <Building2 className="h-3.5 w-3.5" />
              {project.client}
            </CardDescription>
          </div>
          <Badge variant="outline" className={cn("shrink-0", statusMeta.className)}>
            <StatusIcon className="mr-1 h-3 w-3" />
            {statusMeta.label}
          </Badge>
        </div>

        {project.is_deadline_critical && (
          <Badge variant="outline" className="self-start border-destructive/60 bg-destructive/10 text-destructive">
            <AlertTriangle className="mr-1 h-3 w-3" />
            Critical deadline (&lt; 15 days)
          </Badge>
        )}

        {hasFinancialAlert && (
          <Badge variant="outline" className="self-start border-destructive/60 bg-destructive/10 text-destructive">
            <DollarSign className="mr-1 h-3 w-3" />
            Financial alert
            {financialAlert!.paymentAmount > 0 && ` · €${financialAlert!.paymentAmount.toLocaleString("en-US")}`}
            {financialAlert!.extraCanone > 0 && ` · Extra-Canone (${financialAlert!.extraCanone})`}
          </Badge>
        )}

        <div className="flex flex-wrap gap-2">
          {project.cert_type && <Badge variant="secondary">{project.cert_type}</Badge>}
          {project.cert_rating && <Badge variant="outline">{project.cert_rating}</Badge>}
          {project.project_subtype && <Badge variant="outline">{project.project_subtype}</Badge>}
          <Badge variant="outline">{project.region}</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Timeline</p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {timelineConfigured ? "Configured" : "To define"}
            </p>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Hardware</p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {hardwareConfigured ? `${project.project_allocations.length} requests` : "To request"}
            </p>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Scorecard</p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {scorecardConfigured ? "Filled" : "To fill"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" />
            {format(new Date(project.handover_date), "dd MMM yyyy")}
          </span>
          <span
            className={cn(
              "text-xs font-medium",
              project.is_deadline_critical
                ? "text-destructive"
                : daysLeft <= 30
                ? "text-warning"
                : "text-muted-foreground"
            )}
          >
            {daysLeft >= 0 ? `${daysLeft}d to handover` : `${Math.abs(daysLeft)}d overdue`}
          </span>
        </div>

        {project.missing.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {project.missing.map((item) => (
              <Badge key={item} variant="outline" className="border-warning/30 bg-warning/10 text-warning">
                <AlertTriangle className="mr-1 h-3 w-3" />
                Missing {MISSING_META[item] ?? item}
              </Badge>
            ))}
          </div>
        )}

        {project.setup_status !== "certificato" && (
          <Button className="w-full gap-2" onClick={() => onConfigure(project)}>
            <Settings2 className="h-4 w-4" />
            Configure Project
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function PMProjectsBoard() {
  const { data: projects = [], isLoading } = usePMDashboard();
  const { data: financialAlerts } = useFinancialAlerts();
  const [selectedProject, setSelectedProject] = useState<PMProjectView | null>(null);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const financialFilter = searchParams.get("filter") === "financial";

  const visibleProjects = useMemo(() => {
    if (!financialFilter || !financialAlerts) return projects as PMProjectView[];
    return (projects as PMProjectView[]).filter((p) => financialAlerts.byProject.has(p.id));
  }, [projects, financialFilter, financialAlerts]);

  const groupedProjects = useMemo(
    () => ({
      da_configurare: visibleProjects.filter((project) => project.setup_status === "da_configurare"),
      in_corso: visibleProjects.filter((project) => project.setup_status === "in_corso"),
      certificato: visibleProjects.filter((project) => project.setup_status === "certificato"),
    }),
    [visibleProjects],
  );

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center py-16 text-center">
          <Layers3 className="mb-4 h-10 w-10 text-muted-foreground" />
          <p className="text-lg font-medium text-foreground">No projects assigned</p>
          <p className="mt-1 text-sm text-muted-foreground">
            When an admin assigns you a project, you'll find it here organized by operational status.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Tabs defaultValue="kanban" className="w-full space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold tracking-tight">Projects Overview</h2>
            {financialFilter && (
              <Badge
                variant="outline"
                className="border-destructive/40 bg-destructive/10 text-destructive cursor-pointer"
                onClick={() => {
                  const next = new URLSearchParams(searchParams);
                  next.delete("filter");
                  setSearchParams(next);
                }}
              >
                Financial alerts only · clear ✕
              </Badge>
            )}
          </div>
          <TabsList className="bg-muted">
            <TabsTrigger value="kanban" className="gap-2">
              <LayoutGrid className="w-4 h-4" /> Kanban Board
            </TabsTrigger>
            <TabsTrigger value="planner" className="gap-2">
              <GanttChartSquare className="w-4 h-4" /> Global Planner
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="kanban" className="m-0 focus-visible:outline-none">
          <Tabs defaultValue="da_configurare" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              {Object.entries(STATUS_META).map(([key, meta]) => {
                const Icon = meta.icon;
                return (
                  <TabsTrigger key={key} value={key} className="gap-2">
                    <Icon className="h-4 w-4" />
                    {meta.label} ({groupedProjects[key as keyof typeof groupedProjects].length})
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {(Object.keys(STATUS_META) as Array<keyof typeof STATUS_META>).map((key) => (
              <TabsContent key={key} value={key} className="space-y-4">
                {groupedProjects[key].length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                      {STATUS_META[key].emptyMessage}
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-4 xl:grid-cols-2">
                    {groupedProjects[key].map((project) => (
                      <PMProjectCard key={project.id} project={project} onConfigure={setSelectedProject} />
                    ))}
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </TabsContent>

        <TabsContent value="planner" className="m-0 focus-visible:outline-none">
          <div className="h-[600px] border rounded-lg shadow-sm bg-background">
            <FGBPlanner 
              data={projects.map(p => ({
                ...p.plannerData,
                onClickUrl: `/projects/${p.id}` 
              }))} 
            />
          </div>
        </TabsContent>
      </Tabs>

      {selectedProject && (
        <PMProjectConfigModal
          project={selectedProject}
          open={Boolean(selectedProject)}
          onOpenChange={(open) => {
            if (!open) setSelectedProject(null);
          }}
        />
      )}
    </>
  );
}

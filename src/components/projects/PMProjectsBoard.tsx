import { useMemo, useState } from "react";
import { format } from "date-fns";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  Clock3,
  DollarSign,
  FolderKanban,
  Layers3,
  Radio,
  Settings2,
  LayoutGrid,
  GanttChartSquare,
} from "lucide-react";
import { usePMDashboard, type PMProject } from "@/hooks/usePMDashboard";
import { useFinancialAlerts } from "@/hooks/useFinancialAlerts";
import { cn } from "@/lib/utils";
import { PMProjectConfigModal } from "@/components/projects/PMProjectConfigModal";
import { MyProjectsCards } from "@/components/projects/MyProjectsCards";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";
import { FGBPlanner } from "@/components/dashboard/FGBPlanner";
import { PMPlanner } from "@/components/projects/pm/PMPlanner";
import { CalendarClock } from "lucide-react";
import {
  ColumnFilter,
  applyColumnFiltersAndSort,
  type ColFiltersMap,
  type SortConfig,
} from "@/components/common/ColumnFilter";

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
  completato: {
    label: "Completed",
    icon: CheckSquare,
    className: "border-violet-400/30 bg-violet-50 text-violet-700",
    emptyMessage: "No completed projects.",
  },
  certificato: {
    label: "Certified",
    icon: CheckCircle2,
    className: "border-success/30 bg-success/10 text-success",
    emptyMessage: "No certified projects.",
  },
  online: {
    label: "Online",
    icon: Radio,
    className: "border-primary/30 bg-primary/10 text-primary",
    emptyMessage: "No monitoring online.",
  },
} as const;

type StatusKey = keyof typeof STATUS_META;

/**
 * Le schede di un PM sono quelle di Operations meno le quotazioni.
 *
 * Un PM non vede "Quotations Approved": quel passaggio e' commerciale e non
 * gli appartiene. Per il resto l'elenco e' lo stesso, perche' lo stesso
 * progetto letto in due portali non puo' stare in due caselle diverse.
 *
 * "Online" compare solo se ha dentro qualcosa: su un portafoglio di sole
 * certificazioni sarebbe una scheda sempre vuota.
 */
const STATUS_ORDER: StatusKey[] = ["da_configurare", "in_corso", "completato", "certificato", "online"];

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
  // Stesso difetto del PM Portal, stessa cura. `usePMDashboard` lascia col
  // proprio stato le commesse che non sono lavoro operativo — potential,
  // quotation, quotation_approved, canceled — e nessuno di quei quattro sta in
  // STATUS_META. Su un PM che ne ha anche una sola, la scheda spariva insieme
  // a tutta la pagina.
  const statusMeta = STATUS_META[project.setup_status] ?? {
    label: (project.setup_status ?? "unknown").replace(/_/g, " "),
    icon: FolderKanban,
    className: "border-border bg-muted text-muted-foreground",
    emptyMessage: "",
  };
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
          {/* La medaglia sta dopo il subtype e il paese prima della regione,
              nello stesso ordine della tabella admin: chi passa dall'una
              all'altra ritrova le stesse informazioni nella stessa sequenza. */}
          {project.cert_level && <Badge variant="outline" className="font-medium">{project.cert_level}</Badge>}
          {project.sites?.country && <Badge variant="outline">{project.sites.country}</Badge>}
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

        {/* Su un lavoro arrivato in fondo non c'e' niente da configurare:
            certificato, consegnato o con i sensori accesi che trasmettono. */}
        {!["certificato", "completato", "online"].includes(project.setup_status as string) && (
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

  const [search, setSearch] = useState("");
  const [colFilters, setColFilters] = useState<ColFiltersMap>({});
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);

  const baseProjects = useMemo(() => {
    if (!financialFilter || !financialAlerts) return projects as PMProjectView[];
    return (projects as PMProjectView[]).filter((p) => financialAlerts.byProject.has(p.id));
  }, [projects, financialFilter, financialAlerts]);

  const resolvers = useMemo(
    () => ({
      client: (p: PMProjectView) => p.client || "",
      city: (p: PMProjectView) => p.sites?.city || "",
      country: (p: PMProjectView) => p.sites?.country || "",
      region: (p: PMProjectView) => p.region || "",
      status: (p: PMProjectView) => p.setup_status || "",
      cert_type: (p: PMProjectView) => p.cert_type || "",
      cert_level: (p: PMProjectView) => p.cert_level || "",
    }),
    []
  );

  const visibleProjects = useMemo(() => {
    // La ricerca guarda tutte le colonne che la tabella mostra, non il solo
    // nome: digitare una citta' o un cliente che si ha davanti agli occhi non
    // trovava niente.
    const term = search.trim().toLowerCase();
    const searched = term
      ? baseProjects.filter((p) =>
          [p.name, p.client, p.sites?.city, p.sites?.country, p.region, p.cert_type, p.cert_rating, p.cert_level, p.project_subtype]
            .some((v) => (v ?? "").toString().toLowerCase().includes(term)))
      : baseProjects;
    return applyColumnFiltersAndSort(searched, colFilters, sortConfig, resolvers);
  }, [baseProjects, search, colFilters, sortConfig, resolvers]);


  const groupedProjects = useMemo(() => {
    const byStatus = Object.fromEntries(
      STATUS_ORDER.map((key) => [key, visibleProjects.filter((p) => (p.setup_status as string) === key)]),
    ) as Record<StatusKey, PMProjectView[]>;
    return {
      ...byStatus,
      // "All" e' la somma delle schede operative, non tutto cio' che il PM ha
      // assegnato: le quotazioni e gli annullati restano fuori, come in
      // Operations. Sommare invece di rifiltrare tiene i conti d'accordo —
      // se un giorno una scheda cambia regola, il totale la segue da solo.
      all: STATUS_ORDER.flatMap((key) => byStatus[key]),
    };
  }, [visibleProjects]);

  /** Le schede da mostrare: "Online" solo quando ha dentro qualcosa. */
  const visibleTabs = useMemo(
    () => STATUS_ORDER.filter((key) => key !== "online" || groupedProjects.online.length > 0),
    [groupedProjects],
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
              <Layers3 className="w-4 h-4" /> Kanban Board
            </TabsTrigger>
            <TabsTrigger value="cards" className="gap-2">
              <LayoutGrid className="w-4 h-4" /> My projects
            </TabsTrigger>
            <TabsTrigger value="planner" className="gap-2">
              <GanttChartSquare className="w-4 h-4" /> Global Planner
            </TabsTrigger>
            <TabsTrigger value="pm-planner" className="gap-2">
              <CalendarClock className="w-4 h-4" /> PM Planner
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="cards" className="m-0 focus-visible:outline-none">
          <MyProjectsCards />
        </TabsContent>

        <TabsContent value="kanban" className="m-0 focus-visible:outline-none">
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search project name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap items-center gap-4 px-3 py-2 rounded-lg border border-border/60 bg-muted/30">
              <ColumnFilter title="Client" colKey="client" rows={baseProjects} getValue={resolvers.client} colFilters={colFilters} setColFilters={setColFilters} sortConfig={sortConfig} setSortConfig={setSortConfig} />
              <ColumnFilter title="City" colKey="city" rows={baseProjects} getValue={resolvers.city} colFilters={colFilters} setColFilters={setColFilters} sortConfig={sortConfig} setSortConfig={setSortConfig} />
              <ColumnFilter title="Country" colKey="country" rows={baseProjects} getValue={resolvers.country} colFilters={colFilters} setColFilters={setColFilters} sortConfig={sortConfig} setSortConfig={setSortConfig} />
              <ColumnFilter title="Region" colKey="region" rows={baseProjects} getValue={resolvers.region} colFilters={colFilters} setColFilters={setColFilters} sortConfig={sortConfig} setSortConfig={setSortConfig} />
              <ColumnFilter title="Status" colKey="status" rows={baseProjects} getValue={resolvers.status} colFilters={colFilters} setColFilters={setColFilters} sortConfig={sortConfig} setSortConfig={setSortConfig} />
              <ColumnFilter title="Cert Type" colKey="cert_type" rows={baseProjects} getValue={resolvers.cert_type} colFilters={colFilters} setColFilters={setColFilters} sortConfig={sortConfig} setSortConfig={setSortConfig} />
              <ColumnFilter title="Level" colKey="cert_level" rows={baseProjects} getValue={resolvers.cert_level} colFilters={colFilters} setColFilters={setColFilters} sortConfig={sortConfig} setSortConfig={setSortConfig} />
            </div>

          </div>
          <Tabs defaultValue="all" className="space-y-6">
            <TabsList
              className="grid w-full"
              style={{ gridTemplateColumns: `repeat(${visibleTabs.length + 1}, minmax(0, 1fr))` }}
            >
              <TabsTrigger value="all">All ({groupedProjects.all.length})</TabsTrigger>
              {visibleTabs.map((key) => {
                const Icon = STATUS_META[key].icon;
                return (
                  <TabsTrigger key={key} value={key} className="gap-2">
                    <Icon className="h-4 w-4" />
                    {STATUS_META[key].label} ({groupedProjects[key].length})
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {(["all", ...visibleTabs] as const).map((key) => (
              <TabsContent key={key} value={key} className="space-y-4">
                {groupedProjects[key].length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                      {key === "all" ? "No projects assigned." : STATUS_META[key].emptyMessage}
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-4 xl:grid-cols-2">
                    {groupedProjects[key].map((project) => (
                      <PMProjectCard
                        key={project.id}
                        project={project}
                        onConfigure={setSelectedProject}
                        financialAlert={financialAlerts?.byProject.get(project.id)}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </TabsContent>

        <TabsContent value="planner" className="m-0 focus-visible:outline-none">
          <div className="h-[calc(100vh-260px)] min-h-[560px]">
            <FGBPlanner
              data={projects.map(p => ({
                ...p.plannerData,
                onClickUrl: `/projects/${p.id}` 
              }))} 
            />
          </div>
        </TabsContent>

        <TabsContent value="pm-planner" className="m-0 focus-visible:outline-none">
          <PMPlanner />
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

import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  AlertTriangle, CheckCircle2, Clock3, LayoutGrid, GanttChartSquare, Building2, CalendarDays, Settings2,
} from "lucide-react";
import { useAdminPlannerData, type AdminPlannerProject } from "@/hooks/useAdminPlannerData";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FGBPlanner } from "@/components/dashboard/FGBPlanner";
import { useNavigate } from "react-router-dom";

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

function AdminProjectCard({ project }: { project: AdminPlannerProject }) {
  const navigate = useNavigate();
  const statusMeta = STATUS_META[project.setup_status];
  const StatusIcon = statusMeta.icon;
  const daysLeft = Math.ceil((new Date(project.handover_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  return (
    <Card className="border-border/70 bg-card transition-shadow hover:shadow-md cursor-pointer" onClick={() => navigate(`/projects/${project.id}`)}>
      <CardHeader className="space-y-3 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
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
        <div className="flex flex-wrap gap-2">
          {project.pm_name && (
            <Badge variant="secondary" className="bg-[#009293]/10 text-[#009293] border border-[#009293]/20">
              PM: {project.pm_name}
            </Badge>
          )}
          {project.cert_type && <Badge variant="outline">{project.cert_type}</Badge>}
          {project.cert_rating && <Badge variant="outline">{project.cert_rating}</Badge>}
          {project.brand_name && <Badge variant="outline">{project.brand_name}</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" />
            {format(new Date(project.handover_date), "dd MMM yyyy")}
          </span>
          <span className={cn("text-xs font-medium", daysLeft <= 30 ? "text-warning" : "text-muted-foreground")}>
            {daysLeft >= 0 ? `${daysLeft}d to handover` : `${Math.abs(daysLeft)}d overdue`}
          </span>
        </div>
        {project.missing.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {project.missing.map((item) => (
              <Badge key={item} variant="outline" className="border-warning/30 bg-warning/10 text-warning">
                <AlertTriangle className="mr-1 h-3 w-3" />
                Missing {item}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AdminTimeline() {
  const { data: projects = [], isLoading } = useAdminPlannerData();

  const [filterPM, setFilterPM] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCert, setFilterCert] = useState("all");
  const [filterBrand, setFilterBrand] = useState("all");

  const { pmOptions, certOptions, brandOptions } = useMemo(() => {
    const pms = new Map<string, string>();
    const certs = new Set<string>();
    const brands = new Set<string>();
    for (const p of projects) {
      if (p.pm_id && p.pm_name) pms.set(p.pm_id, p.pm_name);
      if (p.cert_type) certs.add(p.cert_type);
      if (p.brand_name) brands.add(p.brand_name);
    }
    return {
      pmOptions: Array.from(pms.entries()).map(([id, name]) => ({ id, name })),
      certOptions: Array.from(certs),
      brandOptions: Array.from(brands),
    };
  }, [projects]);

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      if (filterPM !== "all" && p.pm_id !== filterPM) return false;
      if (filterStatus !== "all" && p.setup_status !== filterStatus) return false;
      if (filterCert !== "all" && p.cert_type !== filterCert) return false;
      if (filterBrand !== "all" && p.brand_name !== filterBrand) return false;
      return true;
    });
  }, [projects, filterPM, filterStatus, filterCert, filterBrand]);

  const grouped = useMemo(() => ({
    da_configurare: filtered.filter((p) => p.setup_status === "da_configurare"),
    in_corso: filtered.filter((p) => p.setup_status === "in_corso"),
    certificato: filtered.filter((p) => p.setup_status === "certificato"),
  }), [filtered]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={filterPM} onValueChange={setFilterPM}>
          <SelectTrigger className="w-44"><SelectValue placeholder="PM" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All PMs</SelectItem>
            {pmOptions.map((pm) => (
              <SelectItem key={pm.id} value={pm.id}>{pm.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="da_configurare">To Configure</SelectItem>
            <SelectItem value="in_corso">In Progress</SelectItem>
            <SelectItem value="certificato">Certified</SelectItem>
          </SelectContent>
        </Select>

        {certOptions.length > 0 && (
          <Select value={filterCert} onValueChange={setFilterCert}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Certification" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Certs</SelectItem>
              {certOptions.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {brandOptions.length > 0 && (
          <Select value={filterBrand} onValueChange={setFilterBrand}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Brand" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Brands</SelectItem>
              {brandOptions.map((b) => (
                <SelectItem key={b} value={b}>{b}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {(filterPM !== "all" || filterStatus !== "all" || filterCert !== "all" || filterBrand !== "all") && (
          <button
            className="text-xs text-muted-foreground hover:text-foreground underline"
            onClick={() => { setFilterPM("all"); setFilterStatus("all"); setFilterCert("all"); setFilterBrand("all"); }}
          >
            Reset filters
          </button>
        )}

        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} / {projects.length} projects
        </span>
      </div>

      <Tabs defaultValue="kanban" className="w-full space-y-4">
        <TabsList className="bg-muted">
          <TabsTrigger value="kanban" className="gap-2">
            <LayoutGrid className="w-4 h-4" /> Kanban Board
          </TabsTrigger>
          <TabsTrigger value="planner" className="gap-2">
            <GanttChartSquare className="w-4 h-4" /> Global Planner
          </TabsTrigger>
        </TabsList>

        <TabsContent value="kanban" className="m-0">
          <Tabs defaultValue="da_configurare" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3">
              {Object.entries(STATUS_META).map(([key, meta]) => {
                const Icon = meta.icon;
                return (
                  <TabsTrigger key={key} value={key} className="gap-2">
                    <Icon className="h-4 w-4" />
                    {meta.label} ({grouped[key as keyof typeof grouped].length})
                  </TabsTrigger>
                );
              })}
            </TabsList>
            {(Object.keys(STATUS_META) as Array<keyof typeof STATUS_META>).map((key) => (
              <TabsContent key={key} value={key} className="space-y-4">
                {grouped[key].length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                      {STATUS_META[key].emptyMessage}
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-4 xl:grid-cols-2">
                    {grouped[key].map((project) => (
                      <AdminProjectCard key={project.id} project={project} />
                    ))}
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </TabsContent>

        <TabsContent value="planner" className="m-0">
          <div className="h-[600px] border rounded-lg shadow-sm bg-background">
            <FGBPlanner data={filtered.map((p) => p.plannerData)} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ProjectFormModal } from "@/components/projects/ProjectFormModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Plus, Pencil, BarChart3, FileUp, Eye, GanttChartSquare, AlertTriangle, Clock3, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ProcurementForecasting } from "@/components/dashboard/ProcurementForecasting";
import { DataImporter } from "@/components/admin/DataImporter";
import { PMProjectsBoard } from "@/components/projects/PMProjectsBoard";
import { AdminTimeline } from "@/components/admin/AdminTimeline";
import { useAdminPlannerData, type AdminPlannerProject } from "@/hooks/useAdminPlannerData";
import type { Project, ProjectAllocation } from "@/types/custom-tables";

const SETUP_STATUS_META = {
  da_configurare: { label: "To Configure", icon: AlertTriangle, className: "border-warning/30 bg-warning/10 text-warning" },
  in_corso: { label: "In Progress", icon: Clock3, className: "border-primary/30 bg-primary/10 text-primary" },
  certificato: { label: "Certified", icon: CheckCircle2, className: "border-success/30 bg-success/10 text-success" },
} as const;

export default function Projects() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const { data: allProjects = [], isLoading } = useAdminPlannerData();

  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState("all");
  const [pmFilter, setPmFilter] = useState("all");
  const [statusTab, setStatusTab] = useState("all");

  // Edit modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [editAllocations, setEditAllocations] = useState<ProjectAllocation[]>([]);

  const pmOptions = useMemo(() => {
    const pms = new Map<string, string>();
    for (const p of allProjects) {
      if (p.pm_id && p.pm_name) pms.set(p.pm_id, p.pm_name);
    }
    return Array.from(pms.entries()).map(([id, name]) => ({ id, name }));
  }, [allProjects]);

  const filtered = useMemo(() => {
    return allProjects.filter((p) => {
      if (statusTab !== "all" && p.setup_status !== statusTab) return false;
      const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.client.toLowerCase().includes(search.toLowerCase());
      const matchesRegion = regionFilter === "all" || p.region === regionFilter;
      const matchesPm = pmFilter === "all" || p.pm_id === pmFilter;
      return matchesSearch && matchesRegion && matchesPm;
    });
  }, [allProjects, statusTab, search, regionFilter, pmFilter]);

  const counts = useMemo(() => ({
    da_configurare: allProjects.filter((p) => p.setup_status === "da_configurare").length,
    in_corso: allProjects.filter((p) => p.setup_status === "in_corso").length,
    certificato: allProjects.filter((p) => p.setup_status === "certificato").length,
  }), [allProjects]);

  const openEdit = async (project: AdminPlannerProject) => {
    const { data } = await supabase
      .from("project_allocations" as any)
      .select("*")
      .eq("project_id", project.id);
    setEditProject(project as any);
    setEditAllocations((data || []) as any);
    setModalOpen(true);
  };

  if (!isAdmin) {
    return (
      <MainLayout title="My Projects" subtitle="Operational dashboard of assigned projects">
        <PMProjectsBoard />
      </MainLayout>
    );
  }

  return (
    <MainLayout title="All Projects" subtitle="Project management and hardware allocations">
      <Tabs defaultValue="timeline" className="space-y-6">
        <TabsList>
          <TabsTrigger value="timeline" className="gap-2">
            <GanttChartSquare className="h-4 w-4" /> Timeline
          </TabsTrigger>
          <TabsTrigger value="projects">Projects</TabsTrigger>
          <TabsTrigger value="forecast" className="gap-2">
            <BarChart3 className="h-4 w-4" /> Demand Analysis
          </TabsTrigger>
          <TabsTrigger value="import" className="gap-2">
            <FileUp className="h-4 w-4" /> Import CSV
          </TabsTrigger>
        </TabsList>

        <TabsContent value="timeline">
          <AdminTimeline />
        </TabsContent>

        <TabsContent value="projects" className="space-y-6">
          {/* Status category tabs */}
          <Tabs value={statusTab} onValueChange={setStatusTab} className="space-y-4">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="all">All ({allProjects.length})</TabsTrigger>
              <TabsTrigger value="da_configurare" className="gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" /> To Configure ({counts.da_configurare})
              </TabsTrigger>
              <TabsTrigger value="in_corso" className="gap-1.5">
                <Clock3 className="h-3.5 w-3.5" /> In Progress ({counts.in_corso})
              </TabsTrigger>
              <TabsTrigger value="certificato" className="gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" /> Certified ({counts.certificato})
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-3 flex-1">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search project or client..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Select value={regionFilter} onValueChange={setRegionFilter}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Region" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Regions</SelectItem>
                  <SelectItem value="Europe">Europe</SelectItem>
                  <SelectItem value="America">America</SelectItem>
                  <SelectItem value="APAC">APAC</SelectItem>
                  <SelectItem value="ME">ME</SelectItem>
                </SelectContent>
              </Select>
              <Select value={pmFilter} onValueChange={setPmFilter}>
                <SelectTrigger className="w-48"><SelectValue placeholder="Filter by PM" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All PMs</SelectItem>
                  {pmOptions.map((pm) => (
                    <SelectItem key={pm.id} value={pm.id}>{pm.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button onClick={() => navigate("/projects/new")} className="gap-2">
                <Plus className="h-4 w-4" /> New Project
              </Button>
            </div>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="flex justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="table-container p-12 text-center text-muted-foreground">No projects found.</div>
          ) : (
            <div className="table-container overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-4 font-medium text-muted-foreground">Project</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Client</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Region</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Certification</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Rating</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Subtype</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">PM</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Handover</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Config Status</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Hardware</th>
                    <th className="p-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((project) => {
                    const daysLeft = Math.ceil((new Date(project.handover_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                    const statusMeta = SETUP_STATUS_META[project.setup_status];
                    const StatusIcon = statusMeta.icon;
                    return (
                      <tr key={project.id} className="border-b last:border-b-0 hover:bg-muted/50 transition-colors">
                        <td className="p-4 font-medium text-foreground">{project.name}</td>
                        <td className="p-4 text-foreground">{project.client}</td>
                        <td className="p-4"><Badge variant="outline">{project.region}</Badge></td>
                        <td className="p-4">
                          {project.cert_type ? (
                            <Badge variant="secondary" className="text-xs">{project.cert_type}</Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="p-4">
                          {project.cert_rating ? (
                            <Badge variant="outline" className="text-xs">{project.cert_rating}</Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="p-4">
                          {project.project_subtype ? (
                            <Badge variant="outline" className="text-xs bg-accent/50">{project.project_subtype}</Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="p-4 text-foreground">{project.pm_name || "—"}</td>
                        <td className="p-4">
                          <span className={cn("font-medium", daysLeft <= 30 ? "text-warning" : "text-foreground")}>
                            {format(new Date(project.handover_date), "dd MMM yyyy")}
                          </span>
                          <span className="text-xs text-muted-foreground ml-1">({daysLeft}d)</span>
                        </td>
                        <td className="p-4">
                          <Badge variant="outline" className={cn("border", statusMeta.className)}>
                            <StatusIcon className="mr-1 h-3 w-3" />
                            {statusMeta.label}
                          </Badge>
                          {project.missing.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {project.missing.map((item) => (
                                <span key={item} className="text-[10px] text-warning">
                                  Missing {item}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="p-4">
                          {project.project_allocations.length === 0 ? (
                            <span className="text-muted-foreground text-xs">None</span>
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              {project.project_allocations.length} items
                            </Badge>
                          )}
                        </td>
                        <td className="p-4 flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => navigate(`/projects/${project.id}`)} className="gap-1">
                            <Eye className="h-3 w-3" /> Details
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => openEdit(project)} className="gap-1">
                            <Pencil className="h-3 w-3" /> Edit
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="forecast">
          <ProcurementForecasting />
        </TabsContent>

        <TabsContent value="import">
          <DataImporter />
        </TabsContent>
      </Tabs>

      <ProjectFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        project={editProject}
        existingAllocations={editAllocations}
        onSaved={() => window.location.reload()}
      />
    </MainLayout>
  );
}

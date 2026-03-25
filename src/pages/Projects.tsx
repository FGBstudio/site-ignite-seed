import { useEffect, useState } from "react";
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
import { Search, Plus, Pencil, BarChart3, FileUp, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { ProcurementForecasting } from "@/components/dashboard/ProcurementForecasting";
import { DataImporter } from "@/components/admin/DataImporter";
import type { Tables } from "@/integrations/supabase/types";

type Project = Tables<"projects">;
type Allocation = Tables<"project_allocations">;

const statusColors: Record<string, string> = {
  Design: "bg-primary/10 text-primary border-primary/20",
  Construction: "bg-warning/10 text-warning border-warning/20",
  Completed: "bg-success/10 text-success border-success/20",
  Cancelled: "bg-destructive/10 text-destructive border-destructive/20",
};

export default function Projects() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<(Project & { pm_name?: string; allocations_summary?: { name: string; certification: string; quantity: number }[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState("all");
  const [pmFilter, setPmFilter] = useState("all");
  const [pmList, setPmList] = useState<{ id: string; full_name: string }[]>([]);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [editAllocations, setEditAllocations] = useState<Allocation[]>([]);

  const fetchProjects = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("projects")
      .select("*, profiles!projects_pm_id_fkey(full_name), project_allocations(quantity, products(name, certification))")
      .order("handover_date", { ascending: true });

    const mapped = (data || []).map((p: any) => ({
      ...p,
      pm_name: p.profiles?.full_name || "—",
      allocations_summary: (p.project_allocations || []).map((a: any) => ({
        name: a.products?.name || "—",
        certification: a.products?.certification || "—",
        quantity: a.quantity,
      })),
    }));
    setProjects(mapped);
    setLoading(false);
  };

  useEffect(() => {
    fetchProjects();
    if (isAdmin) {
      supabase.from("profiles").select("id, full_name").then(({ data }) => setPmList(data || []));
    }
  }, [isAdmin]);

  const openEdit = async (project: Project) => {
    const { data } = await supabase
      .from("project_allocations")
      .select("*")
      .eq("project_id", project.id);
    setEditProject(project);
    setEditAllocations(data || []);
    setModalOpen(true);
  };

  const openNew = () => {
    setEditProject(null);
    setEditAllocations([]);
    setModalOpen(true);
  };

  const filtered = projects.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.client.toLowerCase().includes(search.toLowerCase());
    const matchesRegion = regionFilter === "all" || p.region === regionFilter;
    const matchesPm = pmFilter === "all" || p.pm_id === pmFilter;
    return matchesSearch && matchesRegion && matchesPm;
  });

  const filtersAndTable = renderFiltersAndTableContent(
    search, setSearch, regionFilter, setRegionFilter, pmFilter, setPmFilter,
    pmList, isAdmin, openNew, loading, filtered, openEdit, navigate,
  );

  return (
    <MainLayout title={isAdmin ? "Tutti i Cantieri" : "I Miei Cantieri"} subtitle="Gestione progetti e allocazioni hardware">
      {isAdmin ? (
        <Tabs defaultValue="projects" className="space-y-6">
          <TabsList>
            <TabsTrigger value="projects">Cantieri</TabsTrigger>
            <TabsTrigger value="forecast" className="gap-2">
              <BarChart3 className="h-4 w-4" /> Analisi Fabbisogno
            </TabsTrigger>
            <TabsTrigger value="import" className="gap-2">
              <FileUp className="h-4 w-4" /> Import CSV
            </TabsTrigger>
          </TabsList>

          <TabsContent value="projects" className="space-y-6">
            {filtersAndTable}
          </TabsContent>

          <TabsContent value="forecast">
            <ProcurementForecasting />
          </TabsContent>

          <TabsContent value="import">
            <DataImporter />
          </TabsContent>
        </Tabs>
      ) : (
        <div className="space-y-6">
          {filtersAndTable}
        </div>
      )}

      <ProjectFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        project={editProject}
        existingAllocations={editAllocations}
        onSaved={fetchProjects}
      />
    </MainLayout>
  );
}

function renderFiltersAndTableContent(
  search: string, setSearch: (v: string) => void,
  regionFilter: string, setRegionFilter: (v: string) => void,
  pmFilter: string, setPmFilter: (v: string) => void,
  pmList: { id: string; full_name: string }[],
  isAdmin: boolean, openNew: () => void,
  loading: boolean, filtered: any[], openEdit: (p: any) => void,
  navigate: (path: string) => void,
) {
  return (
    <>
      {/* Filters + Create */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-3 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Cerca progetto o cliente..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={regionFilter} onValueChange={setRegionFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Region" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte le Region</SelectItem>
              <SelectItem value="Europe">Europe</SelectItem>
              <SelectItem value="America">America</SelectItem>
              <SelectItem value="APAC">APAC</SelectItem>
              <SelectItem value="ME">ME</SelectItem>
            </SelectContent>
          </Select>
          {isAdmin && (
            <Select value={pmFilter} onValueChange={setPmFilter}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Filtra per PM" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i PM</SelectItem>
                {pmList.map((pm) => (
                  <SelectItem key={pm.id} value={pm.id}>{pm.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <Button onClick={openNew} className="gap-2 shrink-0">
          <Plus className="h-4 w-4" /> Nuovo Progetto
        </Button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="table-container p-12 text-center text-muted-foreground">Nessun progetto trovato.</div>
      ) : (
        <div className="table-container overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left p-4 font-medium text-muted-foreground">Progetto</th>
                <th className="text-left p-4 font-medium text-muted-foreground">Cliente</th>
                <th className="text-left p-4 font-medium text-muted-foreground">Region</th>
                <th className="text-left p-4 font-medium text-muted-foreground">Tipo</th>
                {isAdmin && <th className="text-left p-4 font-medium text-muted-foreground">PM</th>}
                <th className="text-left p-4 font-medium text-muted-foreground">Handover</th>
                <th className="text-left p-4 font-medium text-muted-foreground">Stato</th>
                <th className="text-left p-4 font-medium text-muted-foreground">Hardware Assegnati</th>
                <th className="p-4"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((project: any) => {
                const daysLeft = Math.ceil((new Date(project.handover_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                return (
                  <tr key={project.id} className="border-b last:border-b-0 hover:bg-muted/50 transition-colors">
                    <td className="p-4 font-medium text-foreground">{project.name}</td>
                    <td className="p-4 text-foreground">{project.client}</td>
                    <td className="p-4"><Badge variant="outline">{project.region}</Badge></td>
                    <td className="p-4">
                      {project.project_type ? (
                        <Badge variant="secondary" className="text-xs">{project.project_type}</Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    {isAdmin && <td className="p-4 text-foreground">{project.pm_name}</td>}
                    <td className="p-4">
                      <span className={cn("font-medium", daysLeft <= 30 ? "text-warning" : "text-foreground")}>
                        {format(new Date(project.handover_date), "dd MMM yyyy", { locale: it })}
                      </span>
                      <span className="text-xs text-muted-foreground ml-1">({daysLeft}gg)</span>
                    </td>
                    <td className="p-4">
                      <Badge variant="outline" className={cn("border", statusColors[project.status])}>
                        {project.status}
                      </Badge>
                    </td>
                    <td className="p-4">
                      {(project.allocations_summary || []).length === 0 ? (
                        <span className="text-muted-foreground text-xs">Nessuno</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {(project.allocations_summary || []).map((a: any, i: number) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              {a.certification} ×{a.quantity}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="p-4 flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => navigate(`/projects/${project.id}`)} className="gap-1">
                        <Eye className="h-3 w-3" /> Dettaglio
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(project)} className="gap-1">
                        <Pencil className="h-3 w-3" /> Modifica
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

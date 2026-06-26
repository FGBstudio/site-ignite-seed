import { useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ProjectFormModal } from "@/components/projects/ProjectFormModal";
import { NewQuotationWizard } from "@/components/projects/NewQuotationWizard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Plus, Pencil, BarChart3, Eye, GanttChartSquare, AlertTriangle, Clock3, CheckCircle2, FileText, XCircle, CheckSquare, Trash2, Loader2, Download } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ProcurementForecasting } from "@/components/dashboard/ProcurementForecasting";
import { DataImporter } from "@/components/admin/DataImporter";
import { PMProjectsBoard } from "@/components/projects/PMProjectsBoard";
import { AdminTimeline } from "@/components/admin/AdminTimeline";
import { ProjectsReports } from "@/components/projects/ProjectsReports";
import { useAdminPlannerData, type AdminPlannerProject } from "@/hooks/useAdminPlannerData";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { Project, ProjectAllocation } from "@/types/custom-tables";

const SETUP_STATUS_META = {
  quotation: { label: "Quotation", icon: FileText, className: "border-blue-400/30 bg-blue-50 text-blue-600" },
  da_configurare: { label: "To Configure", icon: AlertTriangle, className: "border-warning/30 bg-warning/10 text-warning" },
  in_corso: { label: "In Progress", icon: Clock3, className: "border-primary/30 bg-primary/10 text-primary" },
  completato: { label: "Completed", icon: CheckSquare, className: "border-violet-400/30 bg-violet-50 text-violet-700" },
  certificato: { label: "Certified", icon: CheckCircle2, className: "border-success/30 bg-success/10 text-success" },
  canceled: { label: "Canceled", icon: XCircle, className: "border-destructive/30 bg-destructive/10 text-destructive" },
} as const;

const CERT_DISPLAY_LABELS: Record<string, string> = {
  LEED: "LEED",
  WELL: "WELL",
  BREEAM: "BREEAM",
  ESG: "ESG - Taxonomy",
  GRESB: "GRESB",
  Energy_Audit: "Energy Audit",
};

export default function Projects() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: allProjects = [], isLoading } = useAdminPlannerData();

  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get("q") ?? "";
  const regionFilter = searchParams.get("region") ?? "all";
  const pmFilter = searchParams.get("pm") ?? "all";
  const statusTab = searchParams.get("tab") ?? "all";

  const setSearch = (val: string) => {
    setSearchParams(prev => {
      if (val) prev.set("q", val);
      else prev.delete("q");
      return prev;
    }, { replace: true });
  };
  const setRegionFilter = (val: string) => {
    setSearchParams(prev => {
      if (val && val !== "all") prev.set("region", val);
      else prev.delete("region");
      return prev;
    }, { replace: true });
  };
  const setPmFilter = (val: string) => {
    setSearchParams(prev => {
      if (val && val !== "all") prev.set("pm", val);
      else prev.delete("pm");
      return prev;
    }, { replace: true });
  };
  const setStatusTab = (val: string) => {
    setSearchParams(prev => {
      if (val && val !== "all") prev.set("tab", val);
      else prev.delete("tab");
      return prev;
    }, { replace: true });
  };

  // Cleanup tool dialog state
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [selectedCleanupIds, setSelectedCleanupIds] = useState<string[]>([]);
  const [deletingCleanup, setDeletingCleanup] = useState(false);

  // Hard delete confirmation state
  const [hardDeleteProject, setHardDeleteProject] = useState<AdminPlannerProject | null>(null);

  // New quotation wizard
  const [wizardOpen, setWizardOpen] = useState(false);

  // Edit / confirm modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [editAllocations, setEditAllocations] = useState<ProjectAllocation[]>([]);
  const [modalMode, setModalMode] = useState<"edit" | "confirm_project">("edit");

  const duplicates = useMemo(() => {
    const groups = new Map<string, AdminPlannerProject[]>();
    for (const p of allProjects) {
      const key = (p.name || "").toLowerCase().trim();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(p);
    }
    return Array.from(groups.values()).filter(g => g.length > 1).flat();
  }, [allProjects]);

  const testProjects = useMemo(() => {
    const keywords = ["test", "prova", "demo", "copy", "copia"];
    return allProjects.filter(p => {
      const name = (p.name || "").toLowerCase();
      return keywords.some(kw => name.includes(kw));
    });
  }, [allProjects]);

  const exportCSV = () => {
    const headers = ["Project", "Client", "Region", "Cert Type", "Rating", "PM", "Handover", "Status"];
    const rows = filtered.map(p => [
      p.name,
      p.client,
      p.region,
      p.cert_type ? (CERT_DISPLAY_LABELS[p.cert_type] ?? p.cert_type) : "",
      p.cert_rating ?? "",
      p.pm_name ?? "",
      p.handover_date ? format(new Date(p.handover_date), "dd MMM yyyy") : "",
      SETUP_STATUS_META[p.setup_status as keyof typeof SETUP_STATUS_META]?.label ?? p.setup_status
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `projects-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `projects-${format(new Date(), "yyyy-MM-dd")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
    quotation: allProjects.filter((p) => p.setup_status === "quotation").length,
    da_configurare: allProjects.filter((p) => p.setup_status === "da_configurare").length,
    in_corso: allProjects.filter((p) => p.setup_status === "in_corso").length,
    completato: allProjects.filter((p) => p.setup_status === "completato").length,
    certificato: allProjects.filter((p) => p.setup_status === "certificato").length,
    canceled: allProjects.filter((p) => p.setup_status === "canceled").length,
  }), [allProjects]);

  const openEdit = async (project: AdminPlannerProject) => {
    const { data } = await supabase
      .from("project_allocations" as any)
      .select("*")
      .eq("certification_id", project.id);
    setEditProject(project as any);
    setEditAllocations((data || []) as any);
    setModalMode("edit");
    setModalOpen(true);
  };

  const openConfirm = (project: AdminPlannerProject) => {
    setEditProject(project as any);
    setEditAllocations([]);
    setModalMode("confirm_project" as any);
    setModalOpen(true);
  };

  const handleCancel = async (project: AdminPlannerProject) => {
    const { error } = await supabase
      .from("certifications")
      .update({ status: "canceled" } as any)
      .eq("id", project.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Project canceled", description: `${project.name} has been moved to Canceled.` });
      queryClient.invalidateQueries({ queryKey: ["admin-planner-all-certifications"] });
    }
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
      <Tabs defaultValue="projects" className="space-y-6">
        <TabsList>
          <TabsTrigger value="projects">Projects</TabsTrigger>
          <TabsTrigger value="timeline" className="gap-2">
            <GanttChartSquare className="h-4 w-4" /> Timeline
          </TabsTrigger>
          <TabsTrigger value="forecast" className="gap-2">
            <BarChart3 className="h-4 w-4" /> Device Demand Analysis
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-2">
            <FileText className="h-4 w-4" /> Reports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="timeline">
          <AdminTimeline />
        </TabsContent>

        <TabsContent value="reports">
          <ProjectsReports />
        </TabsContent>

        <TabsContent value="forecast">
          <ProcurementForecasting />
        </TabsContent>


        <TabsContent value="projects" className="space-y-6">
          {/* Status category tabs */}
          <Tabs value={statusTab} onValueChange={setStatusTab} className="space-y-4">
            <TabsList className="grid w-full grid-cols-7">
              <TabsTrigger value="all">All ({allProjects.length})</TabsTrigger>
              <TabsTrigger value="quotation" className="gap-1.5">
                <FileText className="h-3.5 w-3.5" /> Quotation ({counts.quotation})
              </TabsTrigger>
              <TabsTrigger value="da_configurare" className="gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" /> To Configure ({counts.da_configurare})
              </TabsTrigger>
              <TabsTrigger value="in_corso" className="gap-1.5">
                <Clock3 className="h-3.5 w-3.5" /> In Progress ({counts.in_corso})
              </TabsTrigger>
              <TabsTrigger value="completato" className="gap-1.5">
                <CheckSquare className="h-3.5 w-3.5" /> Completed ({counts.completato})
              </TabsTrigger>
              <TabsTrigger value="certificato" className="gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" /> Certified ({counts.certificato})
              </TabsTrigger>
              <TabsTrigger value="canceled" className="gap-1.5">
                <XCircle className="h-3.5 w-3.5" /> Canceled ({counts.canceled})
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
            <div className="flex items-center gap-2 shrink-0">
              {isAdmin && (
                <Button onClick={() => setCleanupOpen(true)} variant="outline" className="gap-2 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800">
                  <Trash2 className="h-4 w-4" /> Admin Tools
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <Download className="h-4 w-4" /> Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem onClick={exportCSV}>Export as CSV</DropdownMenuItem>
                  <DropdownMenuItem onClick={exportJSON}>Export as JSON</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button onClick={() => setWizardOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" /> New
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
                    {statusTab === "quotation" ? (
                      <>
                        <th className="text-left p-4 font-medium text-muted-foreground">Total Fees</th>
                        <th className="text-left p-4 font-medium text-muted-foreground">Sent Date</th>
                      </>
                    ) : (
                      <>
                        <th className="text-left p-4 font-medium text-muted-foreground">Subtype</th>
                        <th className="text-left p-4 font-medium text-muted-foreground">PM</th>
                      </>
                    )}
                    <th className="text-left p-4 font-medium text-muted-foreground">Handover</th>
                    <th className="text-left p-4 font-medium text-muted-foreground">Config Status</th>
                    {statusTab !== "quotation" && statusTab !== "canceled" && (
                      <th className="text-left p-4 font-medium text-muted-foreground">Hardware</th>
                    )}
                    <th className="p-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((project) => {
                    const daysLeft = Math.ceil((new Date(project.handover_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                    const statusMeta = SETUP_STATUS_META[project.setup_status];
                    const StatusIcon = statusMeta.icon;
                    const isQuotation = project.setup_status === "quotation";
                    const isCanceled = project.setup_status === "canceled";

                    return (
                      <tr
                        key={project.id}
                        className={cn(
                          "border-b last:border-b-0 transition-colors",
                          project.is_deadline_critical
                            ? "bg-destructive/5 hover:bg-destructive/10"
                            : "hover:bg-muted/50"
                        )}
                      >
                        <td className="p-4 font-medium text-foreground">
                          <div className="flex items-center gap-2">
                            {project.is_deadline_critical && (
                              <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                            )}
                            {project.name}
                          </div>
                        </td>
                        <td className="p-4 text-foreground">{project.client}</td>
                        <td className="p-4"><Badge variant="outline">{project.region}</Badge></td>
                        <td className="p-4">
                          {project.cert_type ? (
                            <Badge variant="secondary" className="text-xs">{CERT_DISPLAY_LABELS[project.cert_type] ?? project.cert_type}</Badge>
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
                        {statusTab === "quotation" ? (
                          <>
                            <td className="p-4 font-medium">
                              {project.total_fees != null
                                ? `€${Number(project.total_fees).toLocaleString()}`
                                : "—"}
                            </td>
                            <td className="p-4 text-muted-foreground">
                              {project.quotation_sent_date
                                ? format(new Date(project.quotation_sent_date), "dd MMM yyyy")
                                : "—"}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="p-4">
                              {project.project_subtype ? (
                                <Badge variant="outline" className="text-xs bg-accent/50">{project.project_subtype}</Badge>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </td>
                            <td className="p-4 text-foreground">{project.pm_name || "—"}</td>
                          </>
                        )}
                        <td className="p-4">
                          <span
                            className={cn(
                              "font-medium",
                              project.is_deadline_critical
                                ? "text-destructive"
                                : daysLeft <= 30
                                ? "text-warning"
                                : "text-foreground"
                            )}
                          >
                            {format(new Date(project.handover_date), "dd MMM yyyy")}
                          </span>
                          <span className="text-xs text-muted-foreground ml-1">({daysLeft}d)</span>
                        </td>
                        <td className="p-4">
                          <Badge variant="outline" className={cn("border", statusMeta.className)}>
                            <StatusIcon className="mr-1 h-3 w-3" />
                            {statusMeta.label}
                          </Badge>
                          {project.is_deadline_critical && (
                            <div className="mt-1">
                              <span className="text-[10px] font-semibold text-destructive">
                                ⚠ Critical deadline (&lt; 15d)
                              </span>
                            </div>
                          )}
                          {!isQuotation && !isCanceled && project.missing.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {project.missing.map((item) => (
                                <span key={item} className="text-[10px] text-warning">
                                  Missing {item}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        {statusTab !== "quotation" && statusTab !== "canceled" && (
                          <td className="p-4">
                            {project.project_allocations.length === 0 ? (
                              <span className="text-muted-foreground text-xs">None</span>
                            ) : (
                              <Badge variant="outline" className="text-xs">
                                {project.project_allocations.length} items
                              </Badge>
                            )}
                          </td>
                        )}
                        <td className="p-4 flex gap-2">
                          {isQuotation ? (
                            <>
                              <Button size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => openConfirm(project)}>
                                <CheckSquare className="h-3 w-3" /> Confirmed
                              </Button>
                              <Button size="sm" variant="destructive" className="gap-1" onClick={() => handleCancel(project)}>
                                <XCircle className="h-3 w-3" /> Canceled
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => openEdit(project)} className="gap-1">
                                <Pencil className="h-3 w-3" /> Edit
                              </Button>
                            </>
                          ) : isCanceled ? (
                            <>
                              <Button size="sm" variant="outline" onClick={() => navigate(`/projects/${project.id}`)} className="gap-1">
                                <Eye className="h-3 w-3" /> Details
                              </Button>
                              {isAdmin && (
                                <Button size="sm" variant="destructive" className="gap-1" onClick={() => setHardDeleteProject(project)}>
                                  <Trash2 className="h-3 w-3" /> Delete Permanently
                                </Button>
                              )}
                            </>
                          ) : (
                            <>
                              <Button size="sm" variant="outline" onClick={() => navigate(`/projects/${project.id}`)} className="gap-1">
                                <Eye className="h-3 w-3" /> Details
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => openEdit(project)} className="gap-1">
                                <Pencil className="h-3 w-3" /> Edit
                              </Button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>


        <TabsContent value="import">
          <DataImporter />
        </TabsContent>
      </Tabs>

      <NewQuotationWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ["admin-planner-all-certifications"] })}
      />

      <ProjectFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        project={editProject}
        existingAllocations={editAllocations}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ["admin-planner-all-certifications"] })}
        mode={modalMode as any}
      />

      {/* Admin Cleanup Dialog */}
      <Dialog open={cleanupOpen} onOpenChange={setCleanupOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-red-700 flex items-center gap-2">
              <Trash2 className="h-5 w-5" /> Admin Cleanup Tools
            </DialogTitle>
            <DialogDescription>
              Identify and permanently delete test projects or duplicate entries. This will delete all allocations and milestones. **This action cannot be undone.**
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Section 1: Duplicates */}
            <div>
              <h3 className="text-sm font-semibold mb-2 flex items-center justify-between">
                <span>Duplicate Projects ({duplicates.length})</span>
                {duplicates.length > 0 && (
                  <button 
                    type="button" 
                    onClick={() => {
                      const dupIds = duplicates.map(p => p.id);
                      setSelectedCleanupIds(prev => {
                        const newIds = new Set([...prev, ...dupIds]);
                        return Array.from(newIds);
                      });
                    }}
                    className="text-xs text-primary hover:underline"
                  >
                    Select All
                  </button>
                )}
              </h3>
              {duplicates.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No duplicate project names found.</p>
              ) : (
                <div className="border rounded-md divide-y max-h-40 overflow-y-auto bg-slate-50/50">
                  {duplicates.map(p => (
                    <label key={p.id} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer select-none text-xs">
                      <Checkbox 
                        checked={selectedCleanupIds.includes(p.id)}
                        onCheckedChange={(checked) => {
                          setSelectedCleanupIds(prev => checked ? [...prev, p.id] : prev.filter(id => id !== p.id));
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-700 truncate">{p.name} <span className="text-muted-foreground font-normal">({p.client})</span></p>
                        <p className="text-[10px] text-slate-400 font-mono truncate">ID: {p.id} · Region: {p.region}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px] capitalize shrink-0">{p.setup_status}</Badge>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Section 2: Test Projects */}
            <div>
              <h3 className="text-sm font-semibold mb-2 flex items-center justify-between">
                <span>Test & Demo Projects ({testProjects.length})</span>
                {testProjects.length > 0 && (
                  <button 
                    type="button" 
                    onClick={() => {
                      const testIds = testProjects.map(p => p.id);
                      setSelectedCleanupIds(prev => {
                        const newIds = new Set([...prev, ...testIds]);
                        return Array.from(newIds);
                      });
                    }}
                    className="text-xs text-primary hover:underline"
                  >
                    Select All
                  </button>
                )}
              </h3>
              {testProjects.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No test or demo projects found.</p>
              ) : (
                <div className="border rounded-md divide-y max-h-40 overflow-y-auto bg-slate-50/50">
                  {testProjects.map(p => (
                    <label key={p.id} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer select-none text-xs">
                      <Checkbox 
                        checked={selectedCleanupIds.includes(p.id)}
                        onCheckedChange={(checked) => {
                          setSelectedCleanupIds(prev => checked ? [...prev, p.id] : prev.filter(id => id !== p.id));
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-700 truncate">{p.name} <span className="text-muted-foreground font-normal">({p.client})</span></p>
                        <p className="text-[10px] text-slate-400 font-mono truncate">ID: {p.id} · Region: {p.region}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px] capitalize shrink-0">{p.setup_status}</Badge>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setCleanupOpen(false); setSelectedCleanupIds([]); }} disabled={deletingCleanup}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              disabled={selectedCleanupIds.length === 0 || deletingCleanup}
              onClick={async () => {
                if (!window.confirm(`Are you absolutely sure you want to permanently delete the ${selectedCleanupIds.length} selected projects? This cannot be undone.`)) return;
                setDeletingCleanup(true);
                try {
                  const { error } = await supabase.from("certifications").delete().in("id", selectedCleanupIds);
                  if (error) throw error;
                  toast({ title: "Cleanup complete", description: `Successfully deleted ${selectedCleanupIds.length} projects.` });
                  setSelectedCleanupIds([]);
                  setCleanupOpen(false);
                  queryClient.invalidateQueries({ queryKey: ["admin-planner-all-certifications"] });
                } catch (err: any) {
                  toast({ title: "Deletion failed", description: err.message, variant: "destructive" });
                } finally {
                  setDeletingCleanup(false);
                }
              }}
            >
              {deletingCleanup ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Delete Selected ({selectedCleanupIds.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hard Delete Confirmation Alert Dialog */}
      <AlertDialog open={!!hardDeleteProject} onOpenChange={(open) => !open && setHardDeleteProject(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" /> Delete Permanently?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete <strong>{hardDeleteProject?.name}</strong>? This will permanently remove all associated milestones and allocations. This action is irreversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={async () => {
                if (!hardDeleteProject) return;
                try {
                  const { error } = await supabase.from("certifications").delete().eq("id", hardDeleteProject.id);
                  if (error) throw error;
                  toast({ title: "Project deleted", description: `${hardDeleteProject.name} has been permanently deleted.` });
                  queryClient.invalidateQueries({ queryKey: ["admin-planner-all-certifications"] });
                } catch (err: any) {
                  toast({ title: "Delete failed", description: err.message, variant: "destructive" });
                } finally {
                  setHardDeleteProject(null);
                }
              }}
            >
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}

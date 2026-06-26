import { useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ProjectFormModal } from "@/components/projects/ProjectFormModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Pencil, BarChart3, Eye, GanttChartSquare, AlertTriangle, Clock3, CheckCircle2, FileText, CheckSquare, Trash2, Loader2, Download, ArrowUp, ArrowDown, ArrowUpDown, Filter, X, UserPlus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";

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

/* ─────────── Excel Header Cell Helper functions ─────────── */
function getUniqueValues(colKey: string, rows: any[]): string[] {
  const values = new Set<string>();
  rows.forEach(r => {
    let val: any = '';
    if (colKey === 'name') val = r.name || '(Blanks)';
    else if (colKey === 'client') val = r.client || '(Blanks)';
    else if (colKey === 'region') val = r.region || '(Blanks)';
    else if (colKey === 'cert_type') val = r.cert_type ? (CERT_DISPLAY_LABELS[r.cert_type] ?? r.cert_type) : '(Blanks)';
    else if (colKey === 'cert_rating') val = r.cert_rating || '(Blanks)';
    else if (colKey === 'total_fees') val = r.total_fees !== undefined && r.total_fees !== null ? `€${Number(r.total_fees).toLocaleString()}` : '(Blanks)';
    else if (colKey === 'quotation_sent_date') val = r.quotation_sent_date ? format(new Date(r.quotation_sent_date), "dd MMM yyyy") : '(Blanks)';
    else if (colKey === 'project_subtype') val = r.project_subtype || '(Blanks)';
    else if (colKey === 'pm_name') val = r.pm_name || '(Blanks)';
    else if (colKey === 'handover_date') val = r.handover_date ? format(new Date(r.handover_date), "dd MMM yyyy") : '(Blanks)';
    else if (colKey === 'setup_status') val = SETUP_STATUS_META[r.setup_status as keyof typeof SETUP_STATUS_META]?.label || r.setup_status || '(Blanks)';
    
    if (val !== undefined && val !== null) {
      values.add(String(val));
    }
  });
  return Array.from(values).sort((a, b) => {
    if (a === '(Blanks)') return 1;
    if (b === '(Blanks)') return -1;
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  });
}

function matchRowValue(r: any, colKey: string, selectedValues: string[] | null | undefined): boolean {
  if (selectedValues === null || selectedValues === undefined) return true;
  
  let val: string = '';
  if (colKey === 'name') val = r.name || '(Blanks)';
  else if (colKey === 'client') val = r.client || '(Blanks)';
  else if (colKey === 'region') val = r.region || '(Blanks)';
  else if (colKey === 'cert_type') val = r.cert_type ? (CERT_DISPLAY_LABELS[r.cert_type] ?? r.cert_type) : '(Blanks)';
  else if (colKey === 'cert_rating') val = r.cert_rating || '(Blanks)';
  else if (colKey === 'total_fees') val = r.total_fees !== undefined && r.total_fees !== null ? `€${Number(r.total_fees).toLocaleString()}` : '(Blanks)';
  else if (colKey === 'quotation_sent_date') val = r.quotation_sent_date ? format(new Date(r.quotation_sent_date), "dd MMM yyyy") : '(Blanks)';
  else if (colKey === 'project_subtype') val = r.project_subtype || '(Blanks)';
  else if (colKey === 'pm_name') val = r.pm_name || '(Blanks)';
  else if (colKey === 'handover_date') val = r.handover_date ? format(new Date(r.handover_date), "dd MMM yyyy") : '(Blanks)';
  else if (colKey === 'setup_status') val = SETUP_STATUS_META[r.setup_status as keyof typeof SETUP_STATUS_META]?.label || r.setup_status || '(Blanks)';
  
  return selectedValues.includes(val);
}

/* ─────────── Excel Header Cell Component ─────────── */
function ExcelHeaderCell({
  title,
  colKey,
  rows,
  colFilters,
  setColFilters,
  sortConfig,
  setSortConfig,
  customContent,
  className
}: {
  title: string;
  colKey: string;
  rows: any[];
  colFilters: Record<string, { search: string; selectedValues: string[] | null | undefined }>;
  setColFilters: React.Dispatch<React.SetStateAction<Record<string, { search: string; selectedValues: string[] | null | undefined }>>>;
  sortConfig: { key: string; direction: 'asc' | 'desc' } | null;
  setSortConfig: React.Dispatch<React.SetStateAction<{ key: string; direction: 'asc' | 'desc' } | null>>;
  customContent?: React.ReactNode;
  className?: string;
}) {
  const uniqueValues = useMemo(() => {
    return getUniqueValues(colKey, rows);
  }, [colKey, rows]);

  const columnFilter = colFilters[colKey] || { search: "", selectedValues: undefined };
  const popoverSearch = columnFilter.search ?? "";

  const filteredChecklist = useMemo(() => {
    return uniqueValues.filter(v =>
      v.toLowerCase().includes(popoverSearch.toLowerCase())
    );
  }, [uniqueValues, popoverSearch]);

  const isSortedAsc = sortConfig?.key === colKey && sortConfig?.direction === 'asc';
  const isSortedDesc = sortConfig?.key === colKey && sortConfig?.direction === 'desc';
  const isFiltered = (columnFilter.selectedValues !== undefined && columnFilter.selectedValues !== null) || !!columnFilter.search;

  const handleSort = (direction: 'asc' | 'desc') => {
    setSortConfig({ key: colKey, direction });
  };

  const handleSelectAll = (checked: boolean) => {
    setColFilters(prev => ({
      ...prev,
      [colKey]: {
        ...prev[colKey],
        selectedValues: checked ? undefined : []
      }
    }));
  };

  const handleValueToggle = (value: string, checked: boolean) => {
    setColFilters(prev => {
      const current = prev[colKey] || { search: "", selectedValues: undefined };
      let nextSelected: string[];
      
      if (current.selectedValues === undefined || current.selectedValues === null) {
        nextSelected = [...uniqueValues];
      } else {
        nextSelected = [...current.selectedValues];
      }

      if (checked) {
        if (!nextSelected.includes(value)) nextSelected.push(value);
      } else {
        nextSelected = nextSelected.filter(v => v !== value);
      }

      if (nextSelected.length === uniqueValues.length) {
        return {
          ...prev,
          [colKey]: {
            ...current,
            selectedValues: undefined
          }
        };
      }

      return {
        ...prev,
        [colKey]: {
          ...current,
          selectedValues: nextSelected
        }
      };
    });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className={cn(
          "inline-flex items-center gap-1.5 hover:text-slate-800 transition-colors uppercase font-semibold text-[10px] tracking-wider py-1.5 select-none outline-none text-muted-foreground",
          (isSortedAsc || isSortedDesc || isFiltered) && "text-indigo-600 font-bold",
          className
        )}>
          <span>{title}</span>
          {isSortedAsc && <ArrowUp className="w-3.5 h-3.5 shrink-0" />}
          {isSortedDesc && <ArrowDown className="w-3.5 h-3.5 shrink-0" />}
          {!isSortedAsc && !isSortedDesc && <ArrowUpDown className="w-3.5 h-3.5 opacity-40 shrink-0 hover:opacity-100" />}
          {isFiltered && <Filter className="w-2.5 h-2.5 fill-indigo-600 shrink-0" />}
        </button>
      </PopoverTrigger>
      
      <PopoverContent className="w-56 p-2 bg-white border border-slate-200 shadow-xl rounded-xl z-50">
        <div className="space-y-1 text-xs">
          <button 
            onClick={() => handleSort('asc')}
            className={cn(
              "w-full text-left px-2 py-1.5 rounded-lg flex items-center gap-2 hover:bg-slate-50 transition-colors font-medium text-slate-700",
              isSortedAsc && "bg-indigo-50/50 text-indigo-700 font-bold"
            )}
          >
            <ArrowUp className="w-3.5 h-3.5" /> Sort A to Z
          </button>
          <button 
            onClick={() => handleSort('desc')}
            className={cn(
              "w-full text-left px-2 py-1.5 rounded-lg flex items-center gap-2 hover:bg-slate-50 transition-colors font-medium text-slate-700",
              isSortedDesc && "bg-indigo-50/50 text-indigo-700 font-bold"
            )}
          >
            <ArrowDown className="w-3.5 h-3.5" /> Sort Z to A
          </button>
          
          <div className="border-t border-slate-100 my-1.5" />
          
          <div className="relative px-1 mb-1.5">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <Input 
              value={popoverSearch}
              onChange={e => setColFilters(prev => ({
                ...prev,
                [colKey]: { ...(prev[colKey] || { search: "", selectedValues: undefined }), search: e.target.value }
              }))}
              placeholder="Search values..." 
              className="pl-8 pr-2 h-7 text-xs bg-slate-50/50 border-slate-200 focus-visible:ring-indigo-500/20"
            />
          </div>

          <div className="max-h-48 overflow-y-auto px-1 space-y-1.5">
            <label className="flex items-center gap-2 px-1 py-0.5 hover:bg-slate-50 rounded cursor-pointer select-none">
              <Checkbox 
                checked={columnFilter.selectedValues === undefined || columnFilter.selectedValues === null} 
                onCheckedChange={(checked) => handleSelectAll(!!checked)}
              />
              <span className="font-semibold text-slate-700">(Select All)</span>
            </label>
            
            {filteredChecklist.map(val => {
              const isChecked = columnFilter.selectedValues === undefined || 
                                columnFilter.selectedValues === null || 
                                columnFilter.selectedValues.includes(val);
              return (
                <label key={val} className="flex items-center gap-2 px-1 py-0.5 hover:bg-slate-50 rounded cursor-pointer select-none truncate">
                  <Checkbox 
                    checked={isChecked} 
                    onCheckedChange={(checked) => handleValueToggle(val, !!checked)}
                  />
                  <span className="text-slate-600 truncate">{val}</span>
                </label>
              );
            })}
          </div>

          {customContent}
        </div>
      </PopoverContent>
    </Popover>
  );
}

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

  const [colFilters, setColFilters] = useState<Record<string, { search: string; selectedValues: string[] | null | undefined }>>({});
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

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
    setColFilters({});
    setSortConfig(null);
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
    const rows = sortedAndFiltered.map(p => [
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
    const blob = new Blob([JSON.stringify(sortedAndFiltered, null, 2)], { type: "application/json;charset=utf-8;" });
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

  const baseFiltered = useMemo(() => {
    return allProjects.filter((p) => {
      // Operations never owns quotation/canceled — those live in /quotations
      if (p.setup_status === "quotation" || p.setup_status === "canceled") return false;
      if (statusTab !== "all" && p.setup_status !== statusTab) return false;
      const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.client.toLowerCase().includes(search.toLowerCase());
      const matchesRegion = regionFilter === "all" || p.region === regionFilter;
      const matchesPm = pmFilter === "all" || p.pm_id === pmFilter;
      return matchesSearch && matchesRegion && matchesPm;
    });
  }, [allProjects, statusTab, search, regionFilter, pmFilter]);

  const filtered = useMemo(() => {
    return baseFiltered.filter((r) => {
      for (const colKey of Object.keys(colFilters)) {
        const filter = colFilters[colKey];
        if (!filter) continue;

        if (filter.search) {
          let val = '';
          if (colKey === 'name') val = r.name || '';
          else if (colKey === 'client') val = r.client || '';
          else if (colKey === 'region') val = r.region || '';
          else if (colKey === 'cert_type') val = r.cert_type ? (CERT_DISPLAY_LABELS[r.cert_type] ?? r.cert_type) : '';
          else if (colKey === 'cert_rating') val = r.cert_rating || '';
          else if (colKey === 'total_fees') val = r.total_fees !== undefined && r.total_fees !== null ? String(r.total_fees) : '';
          else if (colKey === 'quotation_sent_date') val = r.quotation_sent_date ? format(new Date(r.quotation_sent_date), "dd MMM yyyy") : '';
          else if (colKey === 'project_subtype') val = r.project_subtype || '';
          else if (colKey === 'pm_name') val = r.pm_name || '';
          else if (colKey === 'handover_date') val = r.handover_date ? format(new Date(r.handover_date), "dd MMM yyyy") : '';
          else if (colKey === 'setup_status') val = SETUP_STATUS_META[r.setup_status as keyof typeof SETUP_STATUS_META]?.label || r.setup_status || '';

          if (!val.toLowerCase().includes(filter.search.toLowerCase())) {
            return false;
          }
        }

        if (filter.selectedValues !== undefined && filter.selectedValues !== null) {
          if (!matchRowValue(r, colKey, filter.selectedValues)) {
            return false;
          }
        }
      }
      return true;
    });
  }, [baseFiltered, colFilters]);

  const sortedAndFiltered = useMemo(() => {
    if (!sortConfig || sortConfig.direction === null) return filtered;

    return [...filtered].sort((a, b) => {
      let valA: any = a[sortConfig.key as keyof typeof a];
      let valB: any = b[sortConfig.key as keyof typeof b];

      if (sortConfig.key === 'total_fees') {
        valA = a.total_fees ?? 0;
        valB = b.total_fees ?? 0;
      }

      if (valA === undefined || valA === null) valA = '';
      if (valB === undefined || valB === null) valB = '';

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
      }

      valA = String(valA).toLowerCase();
      valB = String(valB).toLowerCase();

      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filtered, sortConfig]);

  const counts = useMemo(() => ({
    da_configurare: allProjects.filter((p) => p.setup_status === "da_configurare").length,
    in_corso: allProjects.filter((p) => p.setup_status === "in_corso").length,
    completato: allProjects.filter((p) => (p.setup_status as string) === "completato").length,
    certificato: allProjects.filter((p) => p.setup_status === "certificato").length,
  }), [allProjects]);

  const operationsTotal = counts.da_configurare + counts.in_corso + counts.completato + counts.certificato;

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
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="all">All ({operationsTotal})</TabsTrigger>
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

            </div>
          </div>

          {/* Active column filter indicator */}
          {Object.keys(colFilters).some(k => {
            const f = colFilters[k];
            return !!f?.search || (f?.selectedValues !== undefined && f?.selectedValues !== null);
          }) && (
            <div className="flex items-center gap-2 -mt-2 mb-1">
              <button
                onClick={() => setColFilters({})}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-600 text-xs font-medium hover:bg-indigo-100 transition-colors"
              >
                <X className="w-3 h-3" /> Clear filters
              </button>
            </div>
          )}

          {/* Table */}
          {isLoading ? (
            <div className="flex justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : (
            <div className="table-container overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-4">
                      <ExcelHeaderCell title="Project" colKey="name" rows={baseFiltered} colFilters={colFilters} setColFilters={setColFilters} sortConfig={sortConfig} setSortConfig={setSortConfig} />
                    </th>
                    <th className="p-4">
                      <ExcelHeaderCell title="Client" colKey="client" rows={baseFiltered} colFilters={colFilters} setColFilters={setColFilters} sortConfig={sortConfig} setSortConfig={setSortConfig} />
                    </th>
                    <th className="p-4">
                      <ExcelHeaderCell title="Region" colKey="region" rows={baseFiltered} colFilters={colFilters} setColFilters={setColFilters} sortConfig={sortConfig} setSortConfig={setSortConfig} />
                    </th>
                    <th className="p-4">
                      <ExcelHeaderCell title="Certification" colKey="cert_type" rows={baseFiltered} colFilters={colFilters} setColFilters={setColFilters} sortConfig={sortConfig} setSortConfig={setSortConfig} />
                    </th>
                    <th className="p-4">
                      <ExcelHeaderCell title="Rating" colKey="cert_rating" rows={baseFiltered} colFilters={colFilters} setColFilters={setColFilters} sortConfig={sortConfig} setSortConfig={setSortConfig} />
                    </th>
                    {statusTab === "quotation" ? (
                      <>
                        <th className="p-4">
                          <ExcelHeaderCell title="Total Fees" colKey="total_fees" rows={baseFiltered} colFilters={colFilters} setColFilters={setColFilters} sortConfig={sortConfig} setSortConfig={setSortConfig} className="justify-end" />
                        </th>
                        <th className="p-4">
                          <ExcelHeaderCell title="Sent Date" colKey="quotation_sent_date" rows={baseFiltered} colFilters={colFilters} setColFilters={setColFilters} sortConfig={sortConfig} setSortConfig={setSortConfig} />
                        </th>
                      </>
                    ) : (
                      <>
                        <th className="p-4">
                          <ExcelHeaderCell title="Subtype" colKey="project_subtype" rows={baseFiltered} colFilters={colFilters} setColFilters={setColFilters} sortConfig={sortConfig} setSortConfig={setSortConfig} />
                        </th>
                        <th className="p-4">
                          <ExcelHeaderCell title="PM" colKey="pm_name" rows={baseFiltered} colFilters={colFilters} setColFilters={setColFilters} sortConfig={sortConfig} setSortConfig={setSortConfig} />
                        </th>
                      </>
                    )}
                    <th className="p-4">
                      <ExcelHeaderCell title="Handover" colKey="handover_date" rows={baseFiltered} colFilters={colFilters} setColFilters={setColFilters} sortConfig={sortConfig} setSortConfig={setSortConfig} />
                    </th>
                    <th className="p-4">
                      <ExcelHeaderCell title="Config Status" colKey="setup_status" rows={baseFiltered} colFilters={colFilters} setColFilters={setColFilters} sortConfig={sortConfig} setSortConfig={setSortConfig} />
                    </th>
                    {statusTab !== "quotation" && statusTab !== "canceled" && (
                      <th className="text-left p-4 font-medium text-muted-foreground uppercase text-[10px] tracking-wider py-1.5 select-none">Hardware</th>
                    )}
                    <th className="p-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedAndFiltered.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-12 text-center text-muted-foreground">No projects found.</td>
                    </tr>
                  ) : null}
                  {sortedAndFiltered.map((project) => {
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
                          {project.setup_status === "da_configurare" && !project.pm_id ? (
                            <Button size="sm" className="gap-1" onClick={() => openEdit(project)}>
                              <UserPlus className="h-3 w-3" /> Assign PM
                            </Button>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => openEdit(project)} className="gap-1">
                              <Pencil className="h-3 w-3" /> Edit
                            </Button>
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

    </MainLayout>
  );
}

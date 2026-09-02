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
import { Search, Pencil, BarChart3, Eye, GanttChartSquare, AlertTriangle, Clock3, CheckCircle2, FileText, CheckSquare, Trash2, Loader2, Download, ArrowUp, ArrowDown, ArrowUpDown, Filter, X, UserPlus, Radio } from "lucide-react";
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
import { CapacityDashboard } from "@/components/dashboard/capacity/CapacityDashboard";
import { HoldToggleButton } from "@/components/projects/HoldToggleButton";
import { useAdminPlannerData, type AdminPlannerProject } from "@/hooks/useAdminPlannerData";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { Project, ProjectAllocation } from "@/types/custom-tables";
import { byPersonName } from "@/lib/personName";
import { formatMoney } from "@/lib/currency";
import { Money } from "@/components/common/Money";

const SETUP_STATUS_META = {
  potential: { label: "Potential", icon: FileText, className: "border-slate-400/30 bg-slate-50 text-slate-600" },
  quotation: { label: "Quotation", icon: FileText, className: "border-blue-400/30 bg-blue-50 text-blue-600" },
  quotation_approved: { label: "Quotation Approved", icon: FileText, className: "border-emerald-400/30 bg-emerald-50 text-emerald-700" },
  da_configurare: { label: "To Configure", icon: AlertTriangle, className: "border-warning/30 bg-warning/10 text-warning" },
  in_corso: { label: "In Progress", icon: Clock3, className: "border-primary/30 bg-primary/10 text-primary" },
  completato: { label: "Completed", icon: CheckSquare, className: "border-violet-400/30 bg-violet-50 text-violet-700" },
  certificato: { label: "Certified", icon: CheckCircle2, className: "border-success/30 bg-success/10 text-success" },
  // Il capolinea dei progetti di monitoraggio: i sensori trasmettono. Vale
  // quanto "Certified" e si veste allo stesso modo, nel verde acqua del marchio
  // invece del verde del certificato.
  online: { label: "Online", icon: Radio, className: "border-primary/30 bg-primary/10 text-primary" },
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

/**
 * Cosa vale una colonna, per una riga. Un posto solo.
 *
 * Questo elenco esisteva in tre copie — una per costruire la lista dei valori,
 * una per confrontare le spunte, una per la casella di ricerca — e le copie
 * erano divergenti: nella terza mancava `city`, per cui scrivere qualcosa nella
 * ricerca della colonna City lasciava il valore a stringa vuota e svuotava la
 * tabella. Con un elenco solo quel tipo di errore non si ripresenta.
 */
const COLUMN_VALUE: Record<string, (r: any) => string> = {
  name: r => r.name || '',
  client: r => r.client || '',
  city: r => r.city || '',
  region: r => r.region || '',
  cert_type: r => (r.cert_type ? (CERT_DISPLAY_LABELS[r.cert_type] ?? r.cert_type) : ''),
  cert_rating: r => r.cert_rating || '',
  total_fees: r => (r.total_fees !== undefined && r.total_fees !== null ? formatMoney(r.total_fees, r.currency) : ''),
  quotation_sent_date: r => (r.quotation_sent_date ? format(new Date(r.quotation_sent_date), "dd MMM yyyy") : ''),
  project_subtype: r => r.project_subtype || '',
  pm_name: r => r.pm_name || '',
  handover_date: r => (r.handover_date ? format(new Date(r.handover_date), "dd MMM yyyy") : ''),
  issued_date: r => (r.issued_date ? format(new Date(r.issued_date), "dd MMM yyyy") : ''),
  setup_status: r => SETUP_STATUS_META[r.setup_status as keyof typeof SETUP_STATUS_META]?.label || r.setup_status || '',
};

/** Il valore grezzo della colonna: stringa vuota se la riga non ce l'ha. */
function columnValue(r: any, colKey: string): string {
  return COLUMN_VALUE[colKey]?.(r) ?? '';
}

/** Lo stesso valore, ma come lo si legge nell'elenco delle spunte. */
function columnLabel(r: any, colKey: string): string {
  return columnValue(r, colKey) || '(Blanks)';
}

function getUniqueValues(colKey: string, rows: any[]): string[] {
  const values = new Set<string>();
  rows.forEach(r => values.add(columnLabel(r, colKey)));
  return Array.from(values).sort((a, b) => {
    if (a === '(Blanks)') return 1;
    if (b === '(Blanks)') return -1;
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  });
}

function matchRowValue(r: any, colKey: string, selectedValues: string[] | null | undefined): boolean {
  if (selectedValues === null || selectedValues === undefined) return true;
  return selectedValues.includes(columnLabel(r, colKey));
}

/**
 * Su cosa si ordina una colonna, che non sempre e' cio' che si legge.
 *
 * Le date si mostrano "dd MMM yyyy" ma si ordinano sulla forma ISO del
 * database: in ordine alfabetico "01 Apr 2026" verrebbe prima di "02 Feb 2025".
 * Gli importi si ordinano in euro, perche' 10.000 renminbi non valgono piu' di
 * 5.000 sterline solo perche' il numero e' piu' grande.
 */
function columnSortValue(r: any, colKey: string): string | number {
  if (colKey === 'total_fees') return r.total_fees_eur ?? r.total_fees ?? 0;
  if (colKey === 'handover_date') return r.handover_date ?? '';
  if (colKey === 'issued_date') return r.issued_date ?? '';
  if (colKey === 'quotation_sent_date') return r.quotation_sent_date ?? '';
  return columnValue(r, colKey).toLowerCase();
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

  /**
   * Le colonne dell'export sono quelle della tabella, non un elenco a parte.
   *
   * Prima l'export aveva otto colonne fisse — e nell'ordine sbagliato, Project
   * prima di Client — mentre la tabella ne mostra di diverse a seconda della
   * scheda: Total Fees e Sent Date sulle quotazioni, Issue Date sui certificati,
   * l'hardware sulle schede operative. Chi esportava non ritrovava cio' che
   * aveva davanti.
   *
   * Le condizioni su `statusTab` qui sotto ricalcano quelle del <thead>: se una
   * colonna cambia li', va cambiata anche qui.
   */
  const exportColumns = useMemo(() => {
    const d = (v: string | null | undefined) => (v ? format(new Date(v), "dd MMM yyyy") : "");
    const cols: Array<{ header: string; get: (p: AdminPlannerProject) => string }> = [
      { header: "Client", get: (p) => p.client ?? "" },
      { header: "City", get: (p) => p.city ?? "" },
      { header: "Project", get: (p) => p.name ?? "" },
      { header: "Region", get: (p) => p.region ?? "" },
      { header: "Certification", get: (p) => (p.cert_type ? CERT_DISPLAY_LABELS[p.cert_type] ?? p.cert_type : "") },
      { header: "Rating", get: (p) => p.cert_rating ?? "" },
    ];

    if (statusTab === "quotation") {
      // Tre colonne e non una: l'importo cosi' com'e' stato offerto, la valuta
      // in cui e' stato offerto, e lo stesso importo in euro. In un foglio di
      // calcolo solo l'ultima si puo' sommare.
      cols.push({ header: "Total Fees", get: (p) => (p.total_fees != null ? String(p.total_fees) : "") });
      cols.push({ header: "Currency", get: (p) => p.currency ?? "EUR" });
      cols.push({ header: "Total Fees (EUR)", get: (p) => (p.total_fees_eur != null ? String(p.total_fees_eur) : "") });
      cols.push({ header: "Sent Date", get: (p) => d(p.quotation_sent_date) });
    } else {
      cols.push({ header: "Subtype", get: (p) => p.project_subtype ?? "" });
      cols.push({ header: "PM", get: (p) => p.pm_name ?? "" });
    }

    cols.push(
      statusTab === "certificato"
        ? { header: "Issue Date", get: (p) => d(p.issued_date) }
        : { header: "Handover", get: (p) => d(p.handover_date) },
    );

    cols.push({
      header: "Config Status",
      get: (p) => SETUP_STATUS_META[p.setup_status as keyof typeof SETUP_STATUS_META]?.label ?? p.setup_status ?? "",
    });

    if (statusTab !== "quotation" && statusTab !== "canceled") {
      // In tabella sono due pastiglie nella stessa cella; in un foglio di
      // calcolo due colonne separate si sommano e si filtrano, una cella con
      // due numeri dentro no.
      cols.push({ header: "Hardware Requested", get: (p) => String(p.project_allocations.length) });
      cols.push({ header: "Hardware Installed", get: (p) => String(p.assigned_hardware_count) });
    }

    return cols;
  }, [statusTab]);

  const download = (content: string, mime: string, ext: string) => {
    const blob = new Blob([content], { type: `${mime};charset=utf-8;` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `projects-${format(new Date(), "yyyy-MM-dd")}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCSV = () => {
    // sortedAndFiltered e non allProjects: si esporta cio' che si vede, con i
    // filtri e l'ordinamento del momento.
    const rows = sortedAndFiltered.map((p) => exportColumns.map((c) => c.get(p)));
    const csv = [exportColumns.map((c) => c.header), ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    download(csv, "text/csv", "csv");
  };

  const exportJSON = () => {
    const rows = sortedAndFiltered.map((p) =>
      Object.fromEntries(exportColumns.map((c) => [c.header, c.get(p)])),
    );
    download(JSON.stringify(rows, null, 2), "application/json", "json");
  };

  /**
   * I PM che compaiono davvero nell'elenco, in ordine alfabetico di cognome.
   *
   * Prima uscivano nell'ordine in cui capitavano i progetti — cioe' in nessun
   * ordine — e scritti "Nome Cognome", che rende l'alfabetico inutile. Il nome
   * arriva gia' in forma "Cognome Nome" da useAdminPlannerData: qui si ordina
   * soltanto, perche' riconvertirlo una seconda volta lo rovescerebbe di nuovo.
   */
  const pmOptions = useMemo(() => {
    const pms = new Map<string, string>();
    for (const p of allProjects) {
      if (p.pm_id && p.pm_name) pms.set(p.pm_id, p.pm_name);
    }
    return Array.from(pms.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => byPersonName(a.name, b.name));
  }, [allProjects]);

  /**
   * Tutto ciò che la tabella mostra, appiattito in una stringa per progetto.
   *
   * La ricerca in alto guardava solo nome e cliente: digitare una città, un PM
   * o un tipo di certificazione non trovava niente, anche se quelle colonne
   * sono lì sotto gli occhi. Si indicizza una volta sola per elenco, non a ogni
   * battuta, perché i progetti sono più di mille.
   */
  const searchIndex = useMemo(() => {
    const index = new Map<string, string>();
    for (const p of allProjects) {
      index.set(
        p.id,
        [
          p.name,
          p.client,
          p.brand_name,
          p.holding_name,
          p.city,
          p.region,
          p.country,
          p.typology,
          p.cert_type,
          p.cert_type ? CERT_DISPLAY_LABELS[p.cert_type] : null,
          p.cert_rating,
          p.project_subtype,
          p.pm_name,
          SETUP_STATUS_META[p.setup_status as keyof typeof SETUP_STATUS_META]?.label ?? p.setup_status,
          p.handover_date ? format(new Date(p.handover_date), "dd MMM yyyy") : null,
          p.issued_date ? format(new Date(p.issued_date), "dd MMM yyyy") : null,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
      );
    }
    return index;
  }, [allProjects]);

  const baseFiltered = useMemo(() => {
    // Ogni parola digitata deve comparire da qualche parte, non tutte nello
    // stesso campo: "beverly rodeo" trova anche se la città sta in una colonna
    // e il nome del progetto in un'altra.
    const terms = search.toLowerCase().split(/\s+/).filter(Boolean);

    return allProjects.filter((p) => {
      // Operations never owns quotation/canceled — those live in /quotations
      if (p.setup_status === "potential" || p.setup_status === "quotation" || p.setup_status === "canceled") return false;
      if (statusTab !== "all" && p.setup_status !== statusTab) return false;
      const haystack = searchIndex.get(p.id) ?? "";
      const matchesSearch = terms.every((t) => haystack.includes(t));
      const matchesRegion = regionFilter === "all" || p.region === regionFilter;
      const matchesPm = pmFilter === "all" || p.pm_id === pmFilter;
      return matchesSearch && matchesRegion && matchesPm;
    });
  }, [allProjects, statusTab, search, regionFilter, pmFilter, searchIndex]);

  const filtered = useMemo(() => {
    return baseFiltered.filter((r) => {
      for (const colKey of Object.keys(colFilters)) {
        const filter = colFilters[colKey];
        if (!filter) continue;

        if (filter.search) {
          if (!columnValue(r, colKey).toLowerCase().includes(filter.search.toLowerCase())) {
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
      let valA: any = columnSortValue(a, sortConfig.key);
      let valB: any = columnSortValue(b, sortConfig.key);

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
    quotation_approved: allProjects.filter((p) => p.setup_status === "quotation_approved").length,
    da_configurare: allProjects.filter((p) => p.setup_status === "da_configurare").length,
    in_corso: allProjects.filter((p) => p.setup_status === "in_corso").length,
    completato: allProjects.filter((p) => (p.setup_status as string) === "completato").length,
    certificato: allProjects.filter((p) => p.setup_status === "certificato").length,
    online: allProjects.filter((p) => (p.setup_status as string) === "online").length,
  }), [allProjects]);

  const operationsTotal =
    counts.quotation_approved + counts.da_configurare + counts.in_corso +
    counts.completato + counts.certificato + counts.online;

  /** Quanti progetti ha la scheda scelta, prima di ricerca, region, PM e filtri di colonna. */
  const tabTotal =
    statusTab === "all"
      ? operationsTotal
      : counts[statusTab as keyof typeof counts] ?? allProjects.filter((p) => p.setup_status === statusTab).length;

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
          {isAdmin && (
            <TabsTrigger value="capacity" className="gap-2">
              <UserPlus className="h-4 w-4" /> Capacity
            </TabsTrigger>
          )}
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

        {isAdmin && (
          <TabsContent value="capacity">
            <CapacityDashboard />
          </TabsContent>
        )}




        <TabsContent value="projects" className="space-y-6">
          {/* Status category tabs */}
          <Tabs value={statusTab} onValueChange={setStatusTab} className="space-y-4">
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="all">All ({operationsTotal})</TabsTrigger>
              <TabsTrigger value="quotation_approved" className="gap-1.5">
                <FileText className="h-3.5 w-3.5" /> Quotations Approved ({counts.quotation_approved})
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
              {/* Compare solo quando c'e' qualcosa dentro: su un portafoglio di
                  sole certificazioni sarebbe una scheda sempre vuota. */}
              {counts.online > 0 && (
                <TabsTrigger value="online" className="gap-1.5">
                  <Radio className="h-3.5 w-3.5" /> Online ({counts.online})
                </TabsTrigger>
              )}
            </TabsList>
          </Tabs>


          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-3 flex-1">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search project, client, city, PM, certification..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
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
              {/*
                Quante righe si stanno guardando. I contatori delle schede in
                alto sono fissi sul totale della scheda e non reagiscono a
                ricerca, region, PM e filtri di colonna: senza questo numero,
                dopo aver filtrato non si sa piu' quanto e' grande cio' che si
                ha davanti.
              */}
              <div className="flex items-center text-sm text-muted-foreground whitespace-nowrap tabular-nums">
                {sortedAndFiltered.length === tabTotal
                  ? `${tabTotal} project${tabTotal === 1 ? "" : "s"}`
                  : `Showing ${sortedAndFiltered.length} of ${tabTotal}`}
              </div>
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
                      <ExcelHeaderCell title="Client" colKey="client" rows={baseFiltered} colFilters={colFilters} setColFilters={setColFilters} sortConfig={sortConfig} setSortConfig={setSortConfig} />
                    </th>
                    <th className="p-4">
                      <ExcelHeaderCell title="City" colKey="city" rows={baseFiltered} colFilters={colFilters} setColFilters={setColFilters} sortConfig={sortConfig} setSortConfig={setSortConfig} />
                    </th>
                    <th className="p-4">
                      <ExcelHeaderCell title="Project" colKey="name" rows={baseFiltered} colFilters={colFilters} setColFilters={setColFilters} sortConfig={sortConfig} setSortConfig={setSortConfig} />
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
                      {statusTab === "certificato" ? (
                        <ExcelHeaderCell title="Issue Date" colKey="issued_date" rows={baseFiltered} colFilters={colFilters} setColFilters={setColFilters} sortConfig={sortConfig} setSortConfig={setSortConfig} />
                      ) : (
                        <ExcelHeaderCell title="Handover" colKey="handover_date" rows={baseFiltered} colFilters={colFilters} setColFilters={setColFilters} sortConfig={sortConfig} setSortConfig={setSortConfig} />
                      )}
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
                    const isCertified = project.setup_status === "certificato";
                    // Un Energy o un Air che trasmette e' arrivato: vale quanto
                    // un certificato, e va letto allo stesso modo. Lo stato lo
                    // decide useAdminPlannerData, qui non si ricalcola: due
                    // opinioni sullo stesso fatto finiscono sempre per divergere.
                    const isOnline = (project.setup_status as string) === "online";
                    const isDone = isCertified || isOnline;

                    return (
                      <tr
                        key={project.id}
                        className={cn(
                          "border-b last:border-b-0 transition-colors",
                          // Un progetto certificato e' finito: nessuna scadenza
                          // lo riguarda piu'. La riga verde lo dice a colpo
                          // d'occhio, e prevale sull'allarme scadenza che
                          // altrimenti resterebbe acceso su un lavoro chiuso.
                          // Il monitoraggio online usa il verde acqua del
                          // marchio: accanto si distinguono, ma dicono la stessa
                          // cosa — questo lavoro e' arrivato in fondo.
                          isCertified
                            ? "bg-success/10 hover:bg-success/20"
                            : isOnline
                            ? "bg-primary/10 hover:bg-primary/20"
                            : project.on_hold
                            ? "bg-destructive/15 hover:bg-destructive/20"
                            : project.is_deadline_critical
                            ? "bg-destructive/5 hover:bg-destructive/10"
                            : "hover:bg-muted/50"
                        )}
                      >
                        <td className="p-4 font-semibold text-foreground uppercase">{project.client}</td>
                        <td className="p-4 text-muted-foreground uppercase">{project.city || "—"}</td>
                        <td className="p-4 text-foreground">
                          <div className="flex items-center gap-2">
                            {project.on_hold && (
                              <Badge variant="destructive" className="text-[10px] uppercase tracking-wide" title={project.on_hold_reason || undefined}>
                                On Hold
                              </Badge>
                            )}
                            {project.is_deadline_critical && !project.on_hold && (
                              <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                            )}
                            {project.name}
                          </div>
                        </td>
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
                              <Money
                                amount={project.total_fees}
                                currency={project.currency}
                                rateToEur={project.fx_rate_to_eur}
                              />
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
                          {statusTab === "certificato" ? (
                            <span className="font-medium text-foreground">
                              {project.issued_date ? format(new Date(project.issued_date), "dd MMM yyyy") : "—"}
                            </span>
                          ) : isDone ? (
                            /*
                              Nella scheda "All" i progetti certificati
                              comparivano con l'handover in arancione e un conto
                              alla rovescia negativo: un allarme su una consegna
                              gia' avvenuta. Resta la data, senza conteggio, nel
                              colore del traguardo — verde per il certificato,
                              verde acqua per il monitoraggio acceso.
                            */
                            <span className={cn("font-medium", isOnline ? "text-primary" : "text-success")}>
                              {format(new Date(project.handover_date), "dd MMM yyyy")}
                            </span>
                          ) : (
                            <>
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
                            </>
                          )}
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
                          {/*
                            Two different facts, never merged into one number:
                            the request Operations wrote (project_allocations)
                            and the devices that physically exist on the site
                            (hardwares). A device can arrive without a request —
                            Monitoring assigns it directly — so counting only
                            the requests showed "None" on projects that have a
                            sensor installed and reported as such everywhere
                            else in the app.
                          */}
                          {project.project_allocations.length === 0 && project.assigned_hardware_count === 0 ? (
                            <span className="text-muted-foreground text-xs">None</span>
                          ) : (
                            <div className="flex flex-wrap items-center gap-1">
                              {project.assigned_hardware_count > 0 && (
                                <Badge
                                  variant="outline"
                                  className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200"
                                  title="Devices physically assigned to this site"
                                >
                                  {project.assigned_hardware_count} assigned
                                </Badge>
                              )}
                              {project.project_allocations.length > 0 && (
                                <Badge
                                  variant="outline"
                                  className="text-xs"
                                  title="Hardware requests logged for this project"
                                >
                                  {project.project_allocations.length} items
                                </Badge>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="p-4 flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => navigate(`/projects/${project.id}`)} className="gap-1">
                            <Eye className="h-3 w-3" /> Details
                          </Button>
                          {project.setup_status === "quotation_approved" ? (
                            <Button size="sm" className="gap-1" onClick={async () => {
                              const { data } = await supabase
                                .from("project_allocations" as any)
                                .select("*")
                                .eq("certification_id", project.id);
                              setEditProject(project as any);
                              setEditAllocations((data || []) as any);
                              setModalMode("confirm_project");
                              setModalOpen(true);
                            }}>
                              <UserPlus className="h-3 w-3" /> Assign to PM
                            </Button>
                          ) : project.setup_status === "da_configurare" && !project.pm_id ? (
                            <Button size="sm" className="gap-1" onClick={() => openEdit(project)}>
                              <UserPlus className="h-3 w-3" /> Assign PM
                            </Button>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => openEdit(project)} className="gap-1">
                              <Pencil className="h-3 w-3" /> Edit
                            </Button>
                          )}
                          <HoldToggleButton certId={project.id} onHold={!!project.on_hold} reason={project.on_hold_reason} />
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

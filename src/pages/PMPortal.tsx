import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Package, LogOut, CalendarIcon, HardDrive, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type Project = Tables<"projects">;
type Allocation = Tables<"project_allocations">;
type Product = Tables<"products">;

export default function PMPortal() {
  const { user, profile, signOut } = useAuth();
  const { toast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [newHandoverDate, setNewHandoverDate] = useState<Date | undefined>();
  const [selectedProductId, setSelectedProductId] = useState("");
  const [requestQty, setRequestQty] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchProjects = async () => {
    const { data } = await supabase
      .from("projects")
      .select("*")
      .order("handover_date", { ascending: true });
    setProjects(data || []);
    setLoading(false);
  };

  const fetchAllocations = async (projectId: string) => {
    const [allocRes, prodRes] = await Promise.all([
      supabase.from("project_allocations").select("*").eq("project_id", projectId),
      supabase.from("products").select("*"),
    ]);
    setAllocations(allocRes.data || []);
    setProducts(prodRes.data || []);
  };

  useEffect(() => { fetchProjects(); }, []);

  const openProject = (project: Project) => {
    setSelectedProject(project);
    setNewHandoverDate(new Date(project.handover_date));
    fetchAllocations(project.id);
  };

  const handleUpdateHandover = async () => {
    if (!selectedProject || !newHandoverDate || !user) return;
    const oldDate = selectedProject.handover_date;
    const newDate = format(newHandoverDate, "yyyy-MM-dd");
    if (oldDate === newDate) return;

    const { error } = await supabase
      .from("projects")
      .update({ handover_date: newDate })
      .eq("id", selectedProject.id);

    if (error) {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
      return;
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      project_id: selectedProject.id,
      user_id: user.id,
      changed_field: "handover_date",
      old_value: oldDate,
      new_value: newDate,
    });

    toast({ title: "Handover aggiornata", description: `${oldDate} → ${newDate}` });
    setSelectedProject({ ...selectedProject, handover_date: newDate });
    fetchProjects();
  };

  const handleRequestAllocation = async () => {
    if (!selectedProject || !selectedProductId || !requestQty || !user) return;

    // Check: handover date must be real (not empty — it's required by DB, so always present)
    const targetDate = format(
      new Date(new Date(selectedProject.handover_date).getTime() - 15 * 24 * 60 * 60 * 1000),
      "yyyy-MM-dd"
    );

    const { error } = await supabase.from("project_allocations").insert({
      project_id: selectedProject.id,
      product_id: selectedProductId,
      quantity: parseInt(requestQty),
      status: "Requested",
      target_date: targetDate,
    });

    if (error) {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
      return;
    }

    await supabase.from("audit_logs").insert({
      project_id: selectedProject.id,
      user_id: user.id,
      changed_field: "allocation_requested",
      old_value: null,
      new_value: `${requestQty}x ${products.find(p => p.id === selectedProductId)?.name}`,
    });

    toast({ title: "Allocazione richiesta", description: "L'admin la verificherà." });
    setSelectedProductId("");
    setRequestQty("");
    fetchAllocations(selectedProject.id);
  };

  const daysUntil = (date: string) => Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  const statusColors: Record<string, string> = {
    Design: "bg-primary/10 text-primary",
    Construction: "bg-warning/10 text-warning",
    Completed: "bg-success/10 text-success",
    Cancelled: "bg-destructive/10 text-destructive",
  };

  const allocStatusColors: Record<string, string> = {
    Draft: "bg-muted text-muted-foreground",
    Allocated: "bg-primary/10 text-primary",
    Requested: "bg-warning/10 text-warning",
    Shipped: "bg-chart-3/10 text-chart-3",
    Installed_Online: "bg-success/10 text-success",
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b bg-card/80 backdrop-blur-sm px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
            <Package className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">I Miei Cantieri</h1>
            <p className="text-xs text-muted-foreground">{profile?.full_name} — PM Portal</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={signOut} className="gap-2">
          <LogOut className="h-4 w-4" /> Esci
        </Button>
      </header>

      {/* Project List */}
      <main className="max-w-5xl mx-auto p-6">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">Nessun cantiere assegnato.</div>
        ) : (
          <div className="table-container overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-4 font-medium text-muted-foreground">Progetto</th>
                  <th className="text-left p-4 font-medium text-muted-foreground">Cliente</th>
                  <th className="text-left p-4 font-medium text-muted-foreground">Region</th>
                  <th className="text-left p-4 font-medium text-muted-foreground">Handover</th>
                  <th className="text-left p-4 font-medium text-muted-foreground">Stato</th>
                  <th className="p-4"></th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => {
                  const days = daysUntil(p.handover_date);
                  return (
                    <tr key={p.id} className="border-b last:border-b-0 hover:bg-muted/50 transition-colors">
                      <td className="p-4 font-medium text-foreground">{p.name}</td>
                      <td className="p-4 text-foreground">{p.client}</td>
                      <td className="p-4"><Badge variant="outline">{p.region}</Badge></td>
                      <td className="p-4">
                        <span className={cn("font-medium", days <= 30 ? "text-destructive" : "text-foreground")}>
                          {format(new Date(p.handover_date), "dd MMM yyyy", { locale: it })}
                        </span>
                        <span className="text-xs text-muted-foreground ml-1">({days}gg)</span>
                      </td>
                      <td className="p-4">
                        <Badge variant="outline" className={cn("border-0", statusColors[p.status])}>{p.status}</Badge>
                      </td>
                      <td className="p-4">
                        <Button size="sm" variant="outline" onClick={() => openProject(p)}>Gestisci</Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Project Detail Dialog */}
      <Dialog open={!!selectedProject} onOpenChange={(open) => !open && setSelectedProject(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5 text-primary" />
              {selectedProject?.name}
            </DialogTitle>
          </DialogHeader>

          {selectedProject && (
            <div className="space-y-6">
              {/* Handover Date Update */}
              <div className="rounded-lg border p-4 space-y-3">
                <h3 className="font-semibold flex items-center gap-2 text-foreground">
                  <CalendarIcon className="h-4 w-4" /> Modifica Handover Date
                </h3>
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <Label className="text-xs text-muted-foreground">Nuova Data</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start text-left font-normal">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {newHandoverDate ? format(newHandoverDate, "dd MMM yyyy", { locale: it }) : "Seleziona"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar mode="single" selected={newHandoverDate} onSelect={setNewHandoverDate} initialFocus />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <Button onClick={handleUpdateHandover} size="sm">Salva</Button>
                </div>
                <p className="text-xs text-muted-foreground">La modifica verrà registrata nell'Audit Trail.</p>
              </div>

              {/* Current Allocations */}
              <div className="rounded-lg border p-4 space-y-3">
                <h3 className="font-semibold flex items-center gap-2 text-foreground">
                  <Clock className="h-4 w-4" /> Allocazioni Correnti
                </h3>
                {allocations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nessuna allocazione per questo cantiere.</p>
                ) : (
                  <div className="divide-y">
                    {allocations.map((a) => {
                      const prod = products.find((p) => p.id === a.product_id);
                      return (
                        <div key={a.id} className="py-2 flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-foreground">{prod?.name || "Prodotto"}</p>
                            <p className="text-xs text-muted-foreground">Qty: {a.quantity} — Target: {format(new Date(a.target_date), "dd MMM yyyy", { locale: it })}</p>
                          </div>
                          <Badge variant="outline" className={cn("border-0", allocStatusColors[a.status])}>{a.status}</Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Request Allocation */}
              <div className="rounded-lg border p-4 space-y-3">
                <h3 className="font-semibold text-foreground">Richiedi Allocazione Hardware</h3>
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <Label className="text-xs text-muted-foreground">Prodotto</Label>
                    <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                      <SelectTrigger><SelectValue placeholder="Seleziona prodotto" /></SelectTrigger>
                      <SelectContent>
                        {products.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-24">
                    <Label className="text-xs text-muted-foreground">Quantità</Label>
                    <Input type="number" min="1" value={requestQty} onChange={(e) => setRequestQty(e.target.value)} />
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button
                          size="sm"
                          onClick={handleRequestAllocation}
                          disabled={!selectedProductId || !requestQty}
                        >
                          Richiedi
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {(!selectedProductId || !requestQty) && (
                      <TooltipContent>Seleziona un prodotto e una quantità</TooltipContent>
                    )}
                  </Tooltip>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

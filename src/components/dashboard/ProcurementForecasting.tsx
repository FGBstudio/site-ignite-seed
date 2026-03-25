import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, CheckCircle, ChevronDown, Package, ShoppingCart } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type Product = Tables<"products">;
type Project = Tables<"projects">;
type Allocation = Tables<"project_allocations">;

interface ProjectDemand {
  projectId: string;
  projectName: string;
  client: string;
  region: string;
  quantity: number;
}

interface ForecastItem {
  product: Product;
  totalDemand: number;
  currentStock: number;
  coveredByStock: number;
  shortfallToOrder: number;
  projectBreakdown: ProjectDemand[];
}

export function ProcurementForecasting() {
  const [products, setProducts] = useState<Product[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [pmList, setPmList] = useState<{ id: string; full_name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [horizon, setHorizon] = useState("90");
  const [region, setRegion] = useState("all");
  const [pmFilter, setPmFilter] = useState("all");

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      const [prodRes, projRes, allocRes, pmRes] = await Promise.all([
        supabase.from("products").select("*"),
        supabase.from("projects").select("*").in("status", ["Design", "Construction"]),
        supabase.from("project_allocations").select("*").in("status", ["Draft", "Requested"]),
        supabase.from("profiles").select("id, full_name"),
      ]);
      setProducts(prodRes.data || []);
      setProjects(projRes.data || []);
      setAllocations(allocRes.data || []);
      setPmList(pmRes.data || []);
      setLoading(false);
    };
    fetchAll();
  }, []);

  const forecast = useMemo<ForecastItem[]>(() => {
    // Filter projects by horizon + region + pm
    const now = new Date();
    const cutoff = horizon === "all"
      ? null
      : new Date(now.getTime() + parseInt(horizon) * 24 * 60 * 60 * 1000);

    const filteredProjects = projects.filter((p) => {
      if (cutoff && new Date(p.handover_date) > cutoff) return false;
      if (region !== "all" && p.region !== region) return false;
      if (pmFilter !== "all" && p.pm_id !== pmFilter) return false;
      return true;
    });

    const projectIds = new Set(filteredProjects.map((p) => p.id));

    // Filter allocations to matching projects
    const filteredAllocations = allocations.filter((a) => projectIds.has(a.project_id));

    // Aggregate per product with project breakdown
    const demandMap = new Map<string, number>();
    const breakdownMap = new Map<string, Map<string, number>>();
    for (const a of filteredAllocations) {
      demandMap.set(a.product_id, (demandMap.get(a.product_id) || 0) + a.quantity);
      if (!breakdownMap.has(a.product_id)) breakdownMap.set(a.product_id, new Map());
      const pMap = breakdownMap.get(a.product_id)!;
      pMap.set(a.project_id, (pMap.get(a.project_id) || 0) + a.quantity);
    }

    // Build forecast items (only products with demand > 0)
    const items: ForecastItem[] = [];
    for (const product of products) {
      const totalDemand = demandMap.get(product.id) || 0;
      if (totalDemand === 0) continue;
      const currentStock = product.quantity_in_stock;
      const coveredByStock = Math.min(totalDemand, currentStock);
      const shortfallToOrder = Math.max(0, totalDemand - currentStock);

      const projectBreakdown: ProjectDemand[] = [];
      const pMap = breakdownMap.get(product.id);
      if (pMap) {
        for (const [projId, qty] of pMap) {
          const proj = filteredProjects.find((p) => p.id === projId);
          if (proj) {
            projectBreakdown.push({
              projectId: projId,
              projectName: proj.name,
              client: proj.client,
              region: proj.region,
              quantity: qty,
            });
          }
        }
      }
      projectBreakdown.sort((a, b) => b.quantity - a.quantity);

      items.push({ product, totalDemand, currentStock, coveredByStock, shortfallToOrder, projectBreakdown });
    }

    // Sort: shortfall descending
    items.sort((a, b) => b.shortfallToOrder - a.shortfallToOrder);
    return items;
  }, [products, projects, allocations, horizon, region, pmFilter]);

  const handleGenerateOrder = async (item: ForecastItem) => {
    const { error } = await supabase.from("supplier_orders").insert({
      product_id: item.product.id,
      quantity_requested: item.shortfallToOrder,
      supplier_name: "Da assegnare",
      expected_delivery_date: new Date(Date.now() + item.product.supplier_lead_time_days * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      status: "Draft",
    });
    if (error) {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Ordine creato", description: `Bozza ordine per ${item.shortfallToOrder}× ${item.product.name}` });
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <div className="flex flex-wrap gap-3 items-center p-4 rounded-xl bg-card border border-border/50">
        <span className="text-sm font-medium text-muted-foreground mr-1">Filtri:</span>
        <Select value={horizon} onValueChange={setHorizon}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="30">30 Giorni</SelectItem>
            <SelectItem value="90">90 Giorni</SelectItem>
            <SelectItem value="180">180 Giorni</SelectItem>
            <SelectItem value="all">Tutto l'anno</SelectItem>
          </SelectContent>
        </Select>
        <Select value={region} onValueChange={setRegion}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte le Region</SelectItem>
            <SelectItem value="Europe">Europe</SelectItem>
            <SelectItem value="America">America</SelectItem>
            <SelectItem value="APAC">APAC</SelectItem>
            <SelectItem value="ME">ME</SelectItem>
          </SelectContent>
        </Select>
        <Select value={pmFilter} onValueChange={setPmFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i PM</SelectItem>
            {pmList.map((pm) => (
              <SelectItem key={pm.id} value={pm.id}>{pm.full_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="stat-card flex items-center gap-3">
          <Package className="h-5 w-5 text-primary" />
          <div>
            <p className="text-2xl font-bold text-foreground">{forecast.length}</p>
            <p className="text-xs text-muted-foreground">Prodotti con domanda</p>
          </div>
        </div>
        <div className="stat-card flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-success" />
          <div>
            <p className="text-2xl font-bold text-foreground">{forecast.filter((f) => f.shortfallToOrder === 0).length}</p>
            <p className="text-xs text-muted-foreground">Coperti dallo stock</p>
          </div>
        </div>
        <div className="stat-card flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <div>
            <p className="text-2xl font-bold text-foreground">{forecast.filter((f) => f.shortfallToOrder > 0).length}</p>
            <p className="text-xs text-muted-foreground">Da riordinare</p>
          </div>
        </div>
      </div>

      {/* Forecast Cards */}
      {forecast.length === 0 ? (
        <div className="table-container p-12 text-center text-muted-foreground">
          Nessun fabbisogno nel periodo selezionato.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {forecast.map((item) => {
            const coveredPct = (item.coveredByStock / item.totalDemand) * 100;
            const shortfallPct = (item.shortfallToOrder / item.totalDemand) * 100;
            const hasShortfall = item.shortfallToOrder > 0;

            return (
              <Card key={item.product.id} className={hasShortfall ? "border-destructive/30" : "border-success/30"}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{item.product.name}</CardTitle>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground font-mono">{item.product.sku}</span>
                        <Badge variant="outline" className="text-xs">{item.product.certification}</Badge>
                      </div>
                      {/* Collapsible project list */}
                      <Collapsible>
                        <CollapsibleTrigger asChild>
                          <button className="flex items-center gap-1 mt-2 text-xs text-primary hover:text-primary/80 transition-colors">
                            <ChevronDown className="h-3 w-3" />
                            {item.projectBreakdown.length} cantier{item.projectBreakdown.length === 1 ? "e" : "i"} associat{item.projectBreakdown.length === 1 ? "o" : "i"}
                          </button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="mt-2 space-y-1.5">
                            {item.projectBreakdown.map((pb) => (
                              <div key={pb.projectId} className="flex items-center justify-between text-xs p-1.5 rounded bg-muted/50">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-foreground">{pb.projectName}</span>
                                  <span className="text-muted-foreground">{pb.client}</span>
                                  <Badge variant="outline" className="text-[10px] px-1 py-0">{pb.region}</Badge>
                                </div>
                                <span className="font-semibold text-foreground">×{pb.quantity}</span>
                              </div>
                            ))}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                    {hasShortfall && <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Metrics */}
                  <div className="flex gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Domanda: </span>
                      <span className="font-semibold text-foreground">{item.totalDemand}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">In Magazzino: </span>
                      <span className="font-semibold text-foreground">{item.currentStock}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Da Ordinare: </span>
                      <span className={`font-semibold ${hasShortfall ? "text-destructive" : "text-success"}`}>
                        {item.shortfallToOrder}
                      </span>
                    </div>
                  </div>

                  {/* Visual Bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Copertura stock</span>
                      <span>{Math.round(coveredPct)}%</span>
                    </div>
                    <div className="relative h-4 w-full rounded-full overflow-hidden bg-muted">
                      {/* Covered portion */}
                      <div
                        className="absolute inset-y-0 left-0 rounded-l-full bg-success transition-all duration-500"
                        style={{ width: `${coveredPct}%` }}
                      />
                      {/* Shortfall portion */}
                      {hasShortfall && (
                        <div
                          className="absolute inset-y-0 rounded-r-full bg-destructive transition-all duration-500"
                          style={{
                            left: `${coveredPct}%`,
                            width: `${shortfallPct}%`,
                            backgroundImage: "repeating-linear-gradient(135deg, transparent, transparent 3px, rgba(255,255,255,0.15) 3px, rgba(255,255,255,0.15) 6px)",
                          }}
                        />
                      )}
                    </div>
                  </div>

                  {/* Action */}
                  {hasShortfall && (
                    <Button
                      size="sm"
                      variant="destructive"
                      className="gap-2 w-full"
                      onClick={() => handleGenerateOrder(item)}
                    >
                      <ShoppingCart className="h-4 w-4" />
                      Genera Ordine Fornitore ({item.shortfallToOrder} unità)
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

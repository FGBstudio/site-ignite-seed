import { useEffect, useMemo, useState, Fragment } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, CheckCircle, Package, ShoppingCart, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { addDays, format } from "date-fns";
import type { Product, ProjectAllocation } from "@/types/custom-tables";

interface ProjectDemand {
  projectId: string;
  projectName: string;
  client: string;
  region: string;
  quantity: number;
  pmName: string;
  status: string;
  handoverDate: string;
}

interface ForecastItem {
  product: Product;
  totalDemand: number;
  currentStock: number;
  coveredByStock: number;
  shortfallToOrder: number;
  projectBreakdown: ProjectDemand[];
  allocationIds: string[];
}

export function ProcurementForecasting() {
  const [products, setProducts] = useState<Product[]>([]);
  const [certs, setCerts] = useState<any[]>([]);
  const [allocations, setAllocations] = useState<ProjectAllocation[]>([]);
  const [pmList, setPmList] = useState<{ id: string; full_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingOrder, setGeneratingOrder] = useState<string | null>(null);

  const [horizon, setHorizon] = useState("90");
  const [region, setRegion] = useState("all");
  const [pmFilter, setPmFilter] = useState("all");

  const fetchAll = async () => {
    setLoading(true);
    const [prodRes, certRes, allocRes, pmRes] = await Promise.all([
      supabase.from("products" as any).select("*"),
      supabase.from("certifications").select("*").not("status", "in", '("Completed","Cancelled")'),
      supabase.from("project_allocations" as any).select("*").neq("status", "Installed_Online"),
      supabase.from("profiles").select("id, full_name"),
    ]);
    if (prodRes.error) toast({ title: "Error", description: prodRes.error.message, variant: "destructive" });
    if (certRes.error) toast({ title: "Error", description: certRes.error.message, variant: "destructive" });
    if (allocRes.error) toast({ title: "Error", description: allocRes.error.message, variant: "destructive" });
    
    setProducts((prodRes.data || []) as any);
    setCerts((certRes.data || []) as any);
    setAllocations((allocRes.data || []) as any);
    setPmList((pmRes.data || []) as any);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const forecast = useMemo<ForecastItem[]>(() => {
    const now = new Date();
    const cutoff = horizon === "all"
      ? null
      : new Date(now.getTime() + parseInt(horizon) * 24 * 60 * 60 * 1000);

    const filteredCerts = certs.filter((c) => {
      if (cutoff && new Date(c.handover_date) > cutoff) return false;
      if (region !== "all" && c.region !== region) return false;
      if (pmFilter !== "all" && c.pm_id !== pmFilter) return false;
      return true;
    });

    const certIds = new Set(filteredCerts.map((c: any) => c.id));
    const filteredAllocations = allocations.filter((a) => certIds.has((a as any).certification_id));

    const demandMap = new Map<string, number>();
    const breakdownMap = new Map<string, Map<string, number>>();
    const allocIdMap = new Map<string, string[]>();
    
    for (const a of filteredAllocations) {
      demandMap.set(a.product_id, (demandMap.get(a.product_id) || 0) + a.quantity);
      if (!breakdownMap.has(a.product_id)) breakdownMap.set(a.product_id, new Map());
      const pMap = breakdownMap.get(a.product_id)!;
      const aId = (a as any).certification_id;
      pMap.set(aId, (pMap.get(aId) || 0) + a.quantity);
      if (!allocIdMap.has(a.product_id)) allocIdMap.set(a.product_id, []);
      allocIdMap.get(a.product_id)!.push(a.id);
    }

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
        for (const [certId, qty] of pMap) {
          const cert = filteredCerts.find((c: any) => c.id === certId);
          if (cert) {
            const pm = pmList.find(p => p.id === cert.pm_id);
            projectBreakdown.push({
              projectId: certId,
              projectName: cert.name || "Unnamed",
              client: cert.client,
              region: cert.region,
              quantity: qty,
              pmName: pm ? pm.full_name : "—",
              status: cert.status || cert.setup_status || "—",
              handoverDate: cert.handover_date,
            });
          }
        }
      }
      // Sort breakdown by Handover Date (closest first)
      projectBreakdown.sort((a, b) => new Date(a.handoverDate).getTime() - new Date(b.handoverDate).getTime());
      
      items.push({
        product, totalDemand, currentStock, coveredByStock, shortfallToOrder, projectBreakdown,
        allocationIds: allocIdMap.get(product.id) || [],
      });
    }

    // Sort ForecastItems by highest shortfall first
    items.sort((a, b) => b.shortfallToOrder - a.shortfallToOrder);
    return items;
  }, [products, certs, allocations, horizon, region, pmFilter, pmList]);

  const handleGenerateOrder = async (item: ForecastItem) => {
    setGeneratingOrder(item.product.id);
    try {
      const expectedDate = format(addDays(new Date(), item.product.supplier_lead_time_days), "yyyy-MM-dd");

      const { error: orderError } = await supabase.from("supplier_orders" as any).insert({
        product_id: item.product.id,
        quantity_requested: item.shortfallToOrder,
        supplier_name: "To be assigned",
        expected_delivery_date: expectedDate,
        status: "Draft",
      } as any);

      if (orderError) {
        toast({ title: "Error creating order", description: orderError.message, variant: "destructive" });
        return;
      }

      if (item.allocationIds.length > 0) {
        const { error: allocError } = await supabase
          .from("project_allocations" as any)
          .update({ status: "Allocated" } as any)
          .in("id", item.allocationIds);

        if (allocError) {
          toast({ title: "Error updating allocations", description: allocError.message, variant: "destructive" });
          return;
        }
      }

      toast({ title: "Order created", description: `Order for ${item.shortfallToOrder}× ${item.product.name}. Allocations updated to "Allocated".` });
      
      await fetchAll();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setGeneratingOrder(null);
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
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center p-4 rounded-xl bg-card border border-border/50">
        <span className="text-sm font-medium text-muted-foreground mr-1">Filters:</span>
        <Select value={horizon} onValueChange={setHorizon}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="30">30 Days</SelectItem>
            <SelectItem value="90">90 Days</SelectItem>
            <SelectItem value="180">180 Days</SelectItem>
            <SelectItem value="all">Full Year</SelectItem>
          </SelectContent>
        </Select>
        <Select value={region} onValueChange={setRegion}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Regions</SelectItem>
            <SelectItem value="Europe">Europe</SelectItem>
            <SelectItem value="America">America</SelectItem>
            <SelectItem value="APAC">APAC</SelectItem>
            <SelectItem value="ME">ME</SelectItem>
          </SelectContent>
        </Select>
        <Select value={pmFilter} onValueChange={setPmFilter}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All PMs</SelectItem>
            {pmList.map((pm) => (
              <SelectItem key={pm.id} value={pm.id}>{pm.full_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="stat-card flex items-center gap-3 p-4 border rounded-xl bg-card">
          <Package className="h-5 w-5 text-primary" />
          <div>
            <p className="text-2xl font-bold text-foreground">{forecast.length}</p>
            <p className="text-xs text-muted-foreground">Products with demand</p>
          </div>
        </div>
        <div className="stat-card flex items-center gap-3 p-4 border rounded-xl bg-card">
          <CheckCircle className="h-5 w-5 text-success" />
          <div>
            <p className="text-2xl font-bold text-foreground">{forecast.filter((f) => f.shortfallToOrder === 0).length}</p>
            <p className="text-xs text-muted-foreground">Covered by stock</p>
          </div>
        </div>
        <div className="stat-card flex items-center gap-3 p-4 border rounded-xl bg-card">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <div>
            <p className="text-2xl font-bold text-foreground">{forecast.filter((f) => f.shortfallToOrder > 0).length}</p>
            <p className="text-xs text-muted-foreground">To reorder</p>
          </div>
        </div>
      </div>

      {/* Forecast Table */}
      {forecast.length === 0 ? (
        <div className="table-container p-12 text-center text-muted-foreground bg-card border rounded-xl">
          No demand in the selected period.
        </div>
      ) : (
        <div className="table-container bg-card border rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="font-semibold">Device</TableHead>
                <TableHead className="font-semibold text-center">n°</TableHead>
                <TableHead className="font-semibold">PM</TableHead>
                <TableHead className="font-semibold">Area</TableHead>
                <TableHead className="font-semibold">Client</TableHead>
                <TableHead className="font-semibold">Project</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="font-semibold">Handover</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {forecast.map((item) => {
                const hasShortfall = item.shortfallToOrder > 0;
                const isGenerating = generatingOrder === item.product.id;

                return (
                  <Fragment key={item.product.id}>
                    {/* Device Summary Row */}
                    <TableRow className="bg-muted/20 border-t-2">
                      <TableCell colSpan={8} className="py-3">
                        <div className="flex items-center justify-between px-2">
                          <div className="flex items-center gap-4">
                            <span className="font-bold text-foreground text-base">{item.product.name}</span>
                            <div className="flex items-center gap-3 text-sm">
                              <span className="text-muted-foreground">Demand: <strong className="text-foreground">{item.totalDemand}</strong></span>
                              <span className="text-muted-foreground">Stock: <strong className="text-foreground">{item.currentStock}</strong></span>
                              <span className="text-muted-foreground">
                                Shortfall: <strong className={hasShortfall ? "text-destructive" : "text-success"}>{item.shortfallToOrder}</strong>
                              </span>
                            </div>
                          </div>
                          {hasShortfall && (
                            <Button
                              size="sm"
                              variant="destructive"
                              className="gap-2 h-8"
                              onClick={() => handleGenerateOrder(item)}
                              disabled={isGenerating}
                            >
                              {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShoppingCart className="h-3.5 w-3.5" />}
                              Order {item.shortfallToOrder} units
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>

                    {/* Breakdown Rows */}
                    {item.projectBreakdown.map((pb) => (
                      <TableRow key={`${item.product.id}-${pb.projectId}`} className="hover:bg-muted/30">
                        <TableCell className="font-medium text-muted-foreground">{item.product.name}</TableCell>
                        <TableCell className="text-center font-semibold">{pb.quantity}</TableCell>
                        <TableCell>{pb.pmName}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{pb.region}</Badge>
                        </TableCell>
                        <TableCell>{pb.client}</TableCell>
                        <TableCell>{pb.projectName}</TableCell>
                        <TableCell className="capitalize text-muted-foreground">
                          {pb.status.replace(/_/g, ' ')}
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-medium">
                          {format(new Date(pb.handoverDate), "MMM-yy")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

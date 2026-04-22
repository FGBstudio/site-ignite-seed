import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { MainLayout } from "@/components/layout/MainLayout";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Table as TableIcon } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Package, Layers, BoxSelect, ArrowRight, Clock, Truck, ShoppingCart } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { Product } from "@/types/custom-tables";

interface AllocationDetail {
  project_name: string;
  client: string;
  region: string;
  status: string;
  quantity: number;
  allocation_status: string;
  target_date: string;
}

interface HardwareItem {
  id: string;
  device_id: string;
  mac_address: string;
  product_id: string;
  site_id: string;
  status: string;
  shipment_date: string;
}

interface ProductBreakdown {
  total_stock: number;
  total_allocated: number;
  free_stock: number;
  requested: number;
  allocated: number;
  shipped: number;
  allocations: AllocationDetail[];
  serialized_items: HardwareItem[];
}

export default function Inventory() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [breakdown, setBreakdown] = useState<ProductBreakdown | null>(null);
  const [loadingBreakdown, setLoadingBreakdown] = useState(false);
  
  const navigate = useNavigate();

  const fetchInventoryData = async () => {
    setLoading(true);
    const { data: prodData } = await supabase.from("products" as any).select("*").order("name");
    const { data: siteData } = await supabase.from("sites").select("id, name");
    
    // Fetch live hardware counts
    const { data: hwCounts } = await (supabase as any)
      .from("hardwares")
      .select("product_id, status");

    const stockMap: Record<string, number> = {};
    hwCounts?.forEach(hw => {
      if (hw.status === 'In Stock') {
        stockMap[hw.product_id] = (stockMap[hw.product_id] || 0) + 1;
      }
    });

    const enrichedProducts = (prodData || []).map((p: any) => ({
      ...p,
      quantity_in_stock: stockMap[p.id] || 0
    }));
    
    setProducts(enrichedProducts as any);
    setSites(siteData || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchInventoryData();
  }, []);

  const handleProductClick = async (product: Product) => {
    setSelectedProduct(product);
    setLoadingBreakdown(true);

    // Fetch allocations separately, then resolve certifications
    const { data: allocData, error: allocError } = await supabase
      .from("project_allocations" as any)
      .select("*")
      .eq("product_id", product.id);

    if (allocError || !allocData || allocData.length === 0) {
      if (allocError) {
        toast({ title: "Error", description: allocError.message, variant: "destructive" });
      }
      setBreakdown({
        total_stock: product.quantity_in_stock,
        total_allocated: 0,
        free_stock: product.quantity_in_stock,
        requested: 0,
        allocated: 0,
        shipped: 0,
        allocations: [],
        serialized_items: [],
      });
      setLoadingBreakdown(false);
      return;
    }

    // Get unique certification IDs and fetch from certifications table
    const certIds = [...new Set((allocData as any[]).map((a) => a.certification_id))];
    const { data: certData } = await supabase
      .from("certifications")
      .select("id, name, client, region, status")
      .in("id", certIds);

    const certMap = new Map((certData || []).map((c: any) => [c.id, c]));

    const allocations: AllocationDetail[] = (allocData as any[]).map((row: any) => {
      const cert = certMap.get(row.certification_id) || {} as any;
      return {
        project_name: cert.name || "Unknown",
        client: cert.client || "",
        region: cert.region || "",
        status: cert.status || "",
        quantity: row.quantity,
        allocation_status: row.status,
        target_date: row.target_date,
      };
    });

    const activeAllocations = allocations.filter((a) => a.allocation_status !== "Installed_Online");
    const totalAllocated = activeAllocations.reduce((sum, a) => sum + a.quantity, 0);
    const requested = activeAllocations.filter(a => a.allocation_status === "Requested").reduce((s, a) => s + a.quantity, 0);
    const allocated = activeAllocations.filter(a => a.allocation_status === "Allocated").reduce((s, a) => s + a.quantity, 0);
    const shipped = activeAllocations.filter(a => a.allocation_status === "Shipped").reduce((s, a) => s + a.quantity, 0);

    // Fetch serialized items from the new hardwares table
    const { data: itemData } = await (supabase as any)
      .from("hardwares")
      .select("*")
      .eq("product_id", product.id);

    setBreakdown({
      total_stock: product.quantity_in_stock,
      total_allocated: totalAllocated,
      free_stock: Math.max(0, product.quantity_in_stock - totalAllocated),
      requested,
      allocated,
      shipped,
      allocations,
      serialized_items: itemData || [],
    });

    setLoadingBreakdown(false);
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "Draft": return "bg-muted text-muted-foreground";
      case "Allocated": return "bg-primary/15 text-primary";
      case "Requested": return "bg-warning/15 text-warning";
      case "Shipped": return "bg-accent text-accent-foreground";
      case "Installed_Online": return "bg-success/15 text-success";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const certColor = (cert: string) => {
    switch (cert) {
      case "WELL": return "border-primary text-primary";
      case "LEED": return "border-success text-success";
      case "CO2": return "border-warning text-warning";
      case "CO2-CO": return "border-destructive text-destructive";
      case "Energy": return "border-purple-500 text-purple-600";
      default: return "border-muted-foreground text-muted-foreground";
    }
  };

  return (
    <MainLayout title="Inventory Summary" subtitle="High-level hardware stock levels and allocations">
      <div className="mb-6 flex justify-end">
        <Button 
          variant="outline" 
          className="glass border-[#009193]/20 text-[#009193] flex items-center gap-2"
          onClick={() => navigate("/hardwares")}
        >
          <TableIcon className="h-4 w-4" /> View Detailed Hardware List
        </Button>
      </div>
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"
        >
          {products.map((product, idx) => (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.05 }}
            >
              <Card
                className="cursor-pointer premium-card group"
                onClick={() => handleProductClick(product)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className={certColor(product.certification)}>
                      {product.certification}
                    </Badge>
                    <span className="text-xs text-muted-foreground font-mono">{product.sku}</span>
                  </div>
                  <CardTitle className="text-base mt-2 group-hover:text-primary transition-colors">
                    {product.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-foreground">{product.quantity_in_stock}</span>
                    <span className="text-sm text-muted-foreground">in stock</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Package className="h-3.5 w-3.5" />
                    Lead time: {product.supplier_lead_time_days} days
                  </div>
                  <div className="flex items-center gap-1 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                    Click for details <ArrowRight className="h-3 w-3" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}

      <Dialog
        open={!!selectedProduct}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedProduct(null);
            setBreakdown(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedProduct && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <Badge variant="outline" className={certColor(selectedProduct.certification)}>
                    {selectedProduct.certification}
                  </Badge>
                  {selectedProduct.name}
                </DialogTitle>
                <p className="text-sm text-muted-foreground font-mono">{selectedProduct.sku}</p>
              </DialogHeader>

              {loadingBreakdown ? (
                <div className="flex justify-center py-10">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                </div>
              ) : breakdown ? (
                <div className="space-y-6 mt-2">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg border bg-card p-4 text-center">
                      <Layers className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
                      <p className="text-2xl font-bold text-foreground">{breakdown.total_stock}</p>
                      <p className="text-xs text-muted-foreground">Total Stock</p>
                    </div>
                    <div className="rounded-lg border bg-warning/5 border-warning/20 p-4 text-center">
                      <BoxSelect className="h-5 w-5 mx-auto text-warning mb-1" />
                      <p className="text-2xl font-bold text-warning">{breakdown.total_allocated}</p>
                      <p className="text-xs text-muted-foreground">Committed</p>
                    </div>
                    <div className="rounded-lg border bg-success/5 border-success/20 p-4 text-center">
                      <Package className="h-5 w-5 mx-auto text-success mb-1" />
                      <p className="text-2xl font-bold text-success">{breakdown.free_stock}</p>
                      <p className="text-xs text-muted-foreground">Available</p>
                    </div>
                  </div>

                  {breakdown.total_allocated > 0 && (
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-lg border p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5 mb-1">
                          <ShoppingCart className="h-4 w-4 text-warning" />
                          <span className="text-xs font-medium text-muted-foreground">Pending</span>
                        </div>
                        <p className="text-xl font-bold text-warning">{breakdown.requested}</p>
                        <p className="text-[10px] text-muted-foreground">Requested</p>
                      </div>
                      <div className="rounded-lg border p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5 mb-1">
                          <Clock className="h-4 w-4 text-primary" />
                          <span className="text-xs font-medium text-muted-foreground">Reserved</span>
                        </div>
                        <p className="text-xl font-bold text-primary">{breakdown.allocated}</p>
                        <p className="text-[10px] text-muted-foreground">Allocated</p>
                      </div>
                      <div className="rounded-lg border p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5 mb-1">
                          <Truck className="h-4 w-4 text-accent-foreground" />
                          <span className="text-xs font-medium text-muted-foreground">In Transit</span>
                        </div>
                        <p className="text-xl font-bold text-accent-foreground">{breakdown.shipped}</p>
                        <p className="text-[10px] text-muted-foreground">Shipped</p>
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Stock utilization</span>
                      <span>
                        {breakdown.total_stock > 0
                          ? Math.round((breakdown.total_allocated / breakdown.total_stock) * 100)
                          : 0}%
                      </span>
                    </div>
                    <Progress
                      value={
                        breakdown.total_stock > 0
                          ? (breakdown.total_allocated / breakdown.total_stock) * 100
                          : 0
                      }
                    />
                  </div>

                  <Separator />

                  <div>
                    <h4 className="text-sm font-semibold text-foreground mb-3">
                      Projects with allocations ({breakdown.allocations.length})
                    </h4>
                    {breakdown.allocations.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">
                        No allocations for this product.
                      </p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Project</TableHead>
                            <TableHead>Client</TableHead>
                            <TableHead>Region</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {breakdown.allocations
                            .sort((a, b) => b.quantity - a.quantity)
                            .map((alloc, i) => (
                              <TableRow key={i}>
                                <TableCell className="font-medium text-foreground">{alloc.project_name}</TableCell>
                                <TableCell className="text-muted-foreground">{alloc.client}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-xs">{alloc.region}</Badge>
                                </TableCell>
                                <TableCell className="text-right font-semibold">{alloc.quantity}</TableCell>
                                <TableCell>
                                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(alloc.allocation_status)}`}>
                                    {alloc.allocation_status.replace("_", " ")}
                                  </span>
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>

                  <Separator />

                  <div>
                    <h4 className="text-sm font-semibold text-foreground mb-3">
                      Serialized Items ({breakdown.serialized_items.length})
                    </h4>
                    {breakdown.serialized_items.length === 0 ? (
                      <div className="bg-muted/30 border border-dashed rounded-lg p-8 text-center">
                        <p className="text-sm text-muted-foreground mb-2">No serialized items found for this product.</p>
                        <p className="text-xs text-muted-foreground">Transition to Serialized Tracking is required.</p>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Serial Number</TableHead>
                            <TableHead>MAC Address</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Location</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {breakdown.serialized_items.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell className="font-mono text-xs">{item.device_id}</TableCell>
                              <TableCell className="font-mono text-xs">{item.mac_address || "-"}</TableCell>
                              <TableCell>
                                <Badge variant="secondary" className="text-[10px] uppercase font-bold">
                                  {item.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {sites.find(s => s.id === item.site_id)?.name || "Warehouse"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}

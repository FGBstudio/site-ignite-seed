import { useEffect, useState } from "react";
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
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Package, Layers, BoxSelect, ArrowRight } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Product = Tables<"products">;

interface AllocationDetail {
  project_name: string;
  client: string;
  region: string;
  status: string;
  quantity: number;
  allocation_status: string;
  target_date: string;
}

interface ProductBreakdown {
  total_stock: number;
  total_allocated: number;
  free_stock: number;
  allocations: AllocationDetail[];
}

export default function Inventory() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [breakdown, setBreakdown] = useState<ProductBreakdown | null>(null);
  const [loadingBreakdown, setLoadingBreakdown] = useState(false);

  useEffect(() => {
    const fetchProducts = async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("name");
      if (error) {
        console.error("Supabase fetch error:", error);
      }
      setProducts(data || []);
      setLoading(false);
    };
    fetchProducts();
  }, []);

  const handleProductClick = async (product: Product) => {
    setSelectedProduct(product);
    setLoadingBreakdown(true);

    const { data, error } = await supabase
      .from("project_allocations")
      .select(`
        quantity,
        status,
        target_date,
        projects!inner (
          name,
          client,
          region,
          status
        )
      `)
      .eq("product_id", product.id);

    if (error) {
      console.error("Supabase allocation fetch error:", error);
      setBreakdown({
        total_stock: product.quantity_in_stock,
        total_allocated: 0,
        free_stock: product.quantity_in_stock,
        allocations: [],
      });
    } else {
      const allocations: AllocationDetail[] = (data || []).map((row: any) => ({
        project_name: row.projects.name,
        client: row.projects.client,
        region: row.projects.region,
        status: row.projects.status,
        quantity: row.quantity,
        allocation_status: row.status,
        target_date: row.target_date,
      }));

      const totalAllocated = allocations
        .filter((a) => a.allocation_status !== "Installed_Online")
        .reduce((sum, a) => sum + a.quantity, 0);

      setBreakdown({
        total_stock: product.quantity_in_stock,
        total_allocated: totalAllocated,
        free_stock: Math.max(0, product.quantity_in_stock - totalAllocated),
        allocations,
      });
    }

    setLoadingBreakdown(false);
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "Draft":
        return "bg-muted text-muted-foreground";
      case "Allocated":
        return "bg-primary/15 text-primary";
      case "Requested":
        return "bg-warning/15 text-warning";
      case "Shipped":
        return "bg-accent text-accent-foreground";
      case "Installed_Online":
        return "bg-success/15 text-success";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const certColor = (cert: string) => {
    switch (cert) {
      case "WELL":
        return "border-primary text-primary";
      case "LEED":
        return "border-success text-success";
      case "CO2":
        return "border-warning text-warning";
      case "CO2-CO":
        return "border-destructive text-destructive";
      case "Energy":
        return "border-purple-500 text-purple-600";
      default:
        return "border-muted-foreground text-muted-foreground";
    }
  };

  return (
    <MainLayout title="Inventory" subtitle="Hardware stock levels and lead times">
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {products.map((product) => (
            <Card
              key={product.id}
              className="cursor-pointer transition-all hover:shadow-lg hover:border-primary/40 hover:-translate-y-0.5 group"
              onClick={() => handleProductClick(product)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <Badge
                    variant="outline"
                    className={certColor(product.certification)}
                  >
                    {product.certification}
                  </Badge>
                  <span className="text-xs text-muted-foreground font-mono">
                    {product.sku}
                  </span>
                </div>
                <CardTitle className="text-base mt-2 group-hover:text-primary transition-colors">
                  {product.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-foreground">
                    {product.quantity_in_stock}
                  </span>
                  <span className="text-sm text-muted-foreground">in stock</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Package className="h-3.5 w-3.5" />
                  Lead time: {product.supplier_lead_time_days} giorni
                </div>
                <div className="flex items-center gap-1 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                  Clicca per dettagli <ArrowRight className="h-3 w-3" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
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
                  <Badge
                    variant="outline"
                    className={certColor(selectedProduct.certification)}
                  >
                    {selectedProduct.certification}
                  </Badge>
                  {selectedProduct.name}
                </DialogTitle>
                <p className="text-sm text-muted-foreground font-mono">
                  {selectedProduct.sku}
                </p>
              </DialogHeader>

              {loadingBreakdown ? (
                <div className="flex justify-center py-10">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                </div>
              ) : breakdown ? (
                <div className="space-y-6 mt-2">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg border bg-card p-4 text-center">
                      <Layers className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
                      <p className="text-2xl font-bold text-foreground">
                        {breakdown.total_stock}
                      </p>
                      <p className="text-xs text-muted-foreground">Stock Totale</p>
                    </div>
                    <div className="rounded-lg border bg-warning/5 border-warning/20 p-4 text-center">
                      <BoxSelect className="h-5 w-5 mx-auto text-warning mb-1" />
                      <p className="text-2xl font-bold text-warning">
                        {breakdown.total_allocated}
                      </p>
                      <p className="text-xs text-muted-foreground">Assegnati</p>
                    </div>
                    <div className="rounded-lg border bg-success/5 border-success/20 p-4 text-center">
                      <Package className="h-5 w-5 mx-auto text-success mb-1" />
                      <p className="text-2xl font-bold text-success">
                        {breakdown.free_stock}
                      </p>
                      <p className="text-xs text-muted-foreground">Disponibili</p>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Utilizzo stock</span>
                      <span>
                        {breakdown.total_stock > 0
                          ? Math.round(
                              (breakdown.total_allocated / breakdown.total_stock) *
                                100
                            )
                          : 0}
                        %
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

                  {/* Allocations table */}
                  <div>
                    <h4 className="text-sm font-semibold text-foreground mb-3">
                      Progetti con allocazioni ({breakdown.allocations.length})
                    </h4>
                    {breakdown.allocations.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">
                        Nessuna allocazione per questo prodotto.
                      </p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Progetto</TableHead>
                            <TableHead>Cliente</TableHead>
                            <TableHead>Regione</TableHead>
                            <TableHead className="text-right">Qtà</TableHead>
                            <TableHead>Stato</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {breakdown.allocations
                            .sort((a, b) => b.quantity - a.quantity)
                            .map((alloc, i) => (
                              <TableRow key={i}>
                                <TableCell className="font-medium text-foreground">
                                  {alloc.project_name}
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                  {alloc.client}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-xs">
                                    {alloc.region}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right font-semibold">
                                  {alloc.quantity}
                                </TableCell>
                                <TableCell>
                                  <span
                                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(alloc.allocation_status)}`}
                                  >
                                    {alloc.allocation_status.replace("_", " ")}
                                  </span>
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

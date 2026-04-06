import { useEffect, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import type { Product, SupplierOrder } from "@/types/custom-tables";

const STATUS_FLOW = ["Draft", "Sent", "In_Transit", "Received"] as const;

const statusColors: Record<string, string> = {
  Draft: "bg-muted text-muted-foreground border-border",
  Sent: "bg-primary/10 text-primary border-primary/20",
  In_Transit: "bg-warning/10 text-warning border-warning/20",
  Received: "bg-success/10 text-success border-success/20",
};

export default function SupplierOrders() {
  const { isAdmin } = useAuth();
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    const [ordRes, prodRes] = await Promise.all([
      supabase.from("supplier_orders" as any).select("*").order("expected_delivery_date"),
      supabase.from("products" as any).select("*"),
    ]);
    if (ordRes.error) toast({ title: "Error", description: ordRes.error.message, variant: "destructive" });
    if (prodRes.error) toast({ title: "Error", description: prodRes.error.message, variant: "destructive" });
    setOrders((ordRes.data || []) as any);
    setProducts((prodRes.data || []) as any);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    const { error } = await supabase
      .from("supplier_orders" as any)
      .update({ status: newStatus } as any)
      .eq("id", orderId);

    if (error) {
      toast({ title: "Update error", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Status updated", description: `Order updated to "${newStatus.replace("_", " ")}"` });

    if (newStatus === "In_Transit") {
      const order = orders.find(o => o.id === orderId);
      if (order) {
        await supabase
          .from("project_allocations" as any)
          .update({ status: "Shipped" } as any)
          .eq("product_id", order.product_id)
          .eq("status", "Allocated");
      }
    }

    await fetchData();
  };

  return (
    <MainLayout title="Supplier Orders" subtitle="Track procurement and incoming stock">
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : (
        <div className="table-container overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left p-4 font-medium text-muted-foreground">Supplier</th>
                <th className="text-left p-4 font-medium text-muted-foreground">Product</th>
                <th className="text-left p-4 font-medium text-muted-foreground">Qty</th>
                <th className="text-left p-4 font-medium text-muted-foreground">Expected Delivery</th>
                <th className="text-left p-4 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const product = products.find((p) => p.id === order.product_id);
                return (
                  <tr key={order.id} className="border-b last:border-b-0 hover:bg-muted/50 transition-colors">
                    <td className="p-4 text-foreground">{order.supplier_name}</td>
                    <td className="p-4 text-foreground">{product?.name ?? order.product_id}</td>
                    <td className="p-4 text-foreground">{order.quantity_requested}</td>
                    <td className="p-4 text-foreground">
                      {format(new Date(order.expected_delivery_date), "dd MMM yyyy")}
                    </td>
                    <td className="p-4">
                      {isAdmin ? (
                        <Select
                          value={order.status}
                          onValueChange={(val) => handleStatusChange(order.id, val)}
                        >
                          <SelectTrigger className="w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_FLOW.map((s) => (
                              <SelectItem key={s} value={s}>
                                {s.replace("_", " ")}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="outline" className={cn("border", statusColors[order.status])}>
                          {order.status.replace("_", " ")}
                        </Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </MainLayout>
  );
}

import { useEffect, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import type { Tables } from "@/integrations/supabase/types";

type SupplierOrder = Tables<"supplier_orders">;
type Product = Tables<"products">;

const statusColors: Record<string, string> = {
  Draft: "bg-muted text-muted-foreground border-border",
  Sent: "bg-primary/10 text-primary border-primary/20",
  In_Transit: "bg-warning/10 text-warning border-warning/20",
  Received: "bg-success/10 text-success border-success/20",
};

export default function SupplierOrders() {
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const [ordRes, prodRes] = await Promise.all([
        supabase.from("supplier_orders").select("*").order("expected_delivery_date"),
        supabase.from("products").select("*"),
      ]);
      if (ordRes.error) console.error("Supabase fetch error:", ordRes.error);
      if (prodRes.error) console.error("Supabase fetch error:", prodRes.error);
      setOrders(ordRes.data || []);
      setProducts(prodRes.data || []);
      setLoading(false);
    };
    fetchData();
  }, []);

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
                      {format(new Date(order.expected_delivery_date), "dd MMM yyyy", { locale: it })}
                    </td>
                    <td className="p-4">
                      <Badge variant="outline" className={cn("border", statusColors[order.status])}>
                        {order.status.replace("_", " ")}
                      </Badge>
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

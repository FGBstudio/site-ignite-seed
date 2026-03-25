import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, PackageCheck, Warehouse, FileStack, ShoppingCart } from "lucide-react";
import type { KPIData } from "@/hooks/useDashboardData";
import { format } from "date-fns";
import { it } from "date-fns/locale";

interface KPICardsProps {
  data: KPIData;
}

const cards = [
  {
    key: "installed" as const,
    label: "Hardware Installed",
    icon: CheckCircle2,
    color: "text-success",
    bgColor: "bg-success/10",
  },
  {
    key: "confirmed" as const,
    label: "Assigned (Confirmed)",
    icon: PackageCheck,
    color: "text-primary",
    bgColor: "bg-primary/10",
  },
  {
    key: "inStock" as const,
    label: "In Stock",
    icon: Warehouse,
    color: "text-warning",
    bgColor: "bg-warning/10",
  },
  {
    key: "pipeline" as const,
    label: "Pipeline (Draft)",
    icon: FileStack,
    color: "text-muted-foreground",
    bgColor: "bg-muted",
  },
  {
    key: "toOrder" as const,
    label: "To Order",
    icon: ShoppingCart,
    color: "text-destructive",
    bgColor: "bg-destructive/10",
  },
];

export function KPICards({ data }: KPICardsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
      {cards.map((c) => {
        const Icon = c.icon;
        const value = data[c.key];
        const isToOrder = c.key === "toOrder";

        return (
          <Card
            key={c.key}
            className={`relative overflow-hidden border ${isToOrder && value > 0 ? "border-destructive/40 shadow-sm shadow-destructive/10" : "border-border/50"}`}
          >
            <CardContent className="p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${c.bgColor}`}>
                  <Icon className={`h-4.5 w-4.5 ${c.color}`} />
                </div>
                {isToOrder && value > 0 && (
                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0.5">
                    Urgente
                  </Badge>
                )}
              </div>
              <div>
                <p className="text-3xl font-bold tracking-tight text-foreground">{value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{c.label}</p>
              </div>
              {isToOrder && data.dropDeadDate && value > 0 && (
                <p className="text-[11px] text-destructive font-medium">
                  Ordinare entro {format(new Date(data.dropDeadDate), "dd MMM yyyy", { locale: it })}
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

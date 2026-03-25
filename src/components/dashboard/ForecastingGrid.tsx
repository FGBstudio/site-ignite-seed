import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronRight, AlertTriangle, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import type { RunwayRow } from "@/hooks/useDashboardData";
import { cn } from "@/lib/utils";

interface ForecastingGridProps {
  data: RunwayRow[];
}

const statusBadgeVariant = (status: string) => {
  switch (status) {
    case "Allocated": return "default";
    case "Requested": return "secondary";
    case "Shipped": return "outline";
    case "Draft": return "secondary";
    default: return "outline";
  }
};

const fmt = (iso: string) => format(new Date(iso), "dd MMM yyyy", { locale: it });

export function ForecastingGrid({ data }: ForecastingGridProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  if (data.length === 0) {
    return (
      <div className="table-container p-12 text-center text-muted-foreground">
        Nessun dato di forecast disponibile.
      </div>
    );
  }

  return (
    <div className="table-container overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/30">
            <th className="text-left p-4 font-medium text-muted-foreground w-8"></th>
            <th className="text-left p-4 font-medium text-muted-foreground">Prodotto</th>
            <th className="text-right p-4 font-medium text-muted-foreground">Stock Attuale</th>
            <th className="text-right p-4 font-medium text-muted-foreground">Domanda Totale</th>
            <th className="text-left p-4 font-medium text-muted-foreground">Runway</th>
            <th className="text-left p-4 font-medium text-muted-foreground">Suggerimento Ordine</th>
          </tr>
        </thead>
        {/* IL CORPO DELLA TABELLA INIZIA QUI: Eliminato il <tbody> globale */}
        {data.map((row) => {
          const isOpen = expanded.has(row.product.id);
          const hasShortfall = row.orderQty > 0;

          return (
            <Collapsible key={row.product.id} open={isOpen} onOpenChange={() => toggle(row.product.id)} asChild>
              {/* ORA OGNI ELEMENTO HA IL SUO TBODY - Questo risolve l'errore asChild e Fragment */}
              <tbody className="border-b-0">
                <CollapsibleTrigger asChild>
                  <tr
                    className={cn(
                      "border-b cursor-pointer hover:bg-muted/50 transition-colors",
                      hasShortfall && "bg-destructive/[0.03]"
                    )}
                  >
                    <td className="p-4">
                      <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{row.product.name}</span>
                        <span className="text-xs text-muted-foreground font-mono">{row.product.sku}</span>
                      </div>
                    </td>
                    <td className="p-4 text-right font-semibold text-foreground">{row.stock}</td>
                    <td className="p-4 text-right font-semibold text-foreground">{row.totalDemand}</td>
                    <td className="p-4">
                      {row.runwayDate && row.runwayDate !== "9999-12-31" ? (
                        <span className={cn("font-medium", hasShortfall ? "text-destructive" : "text-success")}>
                          {fmt(row.runwayDate)}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-success font-medium">
                          <CheckCircle className="h-3.5 w-3.5" /> Coperto
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      {hasShortfall ? (
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
                          <span className="text-destructive font-semibold">{row.orderQty} unità</span>
                          {row.orderByDate && (
                            <span className="text-xs text-muted-foreground">
                              entro {fmt(row.orderByDate)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-success text-xs font-medium">Nessun ordine necessario</span>
                      )}
                    </td>
                  </tr>
                </CollapsibleTrigger>
                <CollapsibleContent asChild>
                  <tr>
                    <td colSpan={6} className="p-0">
                      <div className="bg-muted/20 border-y">
                        {row.regions.map((reg) => (
                          <div key={reg.region} className="px-8 py-3 border-b last:border-b-0">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="outline" className="text-xs">{reg.region}</Badge>
                              <span className="text-xs text-muted-foreground">
                                {reg.totalQty} unità richieste
                              </span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                              {reg.projects.map((proj) => (
                                <div
                                  key={`${proj.id}-${proj.status}`}
                                  className="flex items-center justify-between p-2.5 rounded-lg bg-card border border-border/50 text-xs"
                                >
                                  <div className="space-y-0.5">
                                    <p className="font-medium text-foreground">{proj.name}</p>
                                    <p className="text-muted-foreground">Handover: {fmt(proj.handoverDate)}</p>
                                  </div>
                                  <div className="text-right space-y-0.5">
                                    <p className="font-bold text-foreground">×{proj.quantity}</p>
                                    <Badge variant={statusBadgeVariant(proj.status)} className="text-[10px] px-1.5 py-0">
                                      {proj.status}
                                    </Badge>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                </CollapsibleContent>
              </tbody>
            </Collapsible>
          );
        })}
      </table>
    </div>
  );
}

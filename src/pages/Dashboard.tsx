import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { KPICards } from "@/components/dashboard/KPICards";
import { ForecastingGrid } from "@/components/dashboard/ForecastingGrid";
import { DashboardExport } from "@/components/dashboard/DashboardExport";
import { useDashboardData } from "@/hooks/useDashboardData";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, TrendingUp } from "lucide-react";

export default function Dashboard() {
  const [productFilter, setProductFilter] = useState("all");
  const { products, kpi, runway, loading } = useDashboardData(productFilter);

  return (
    <MainLayout
      title="Executive Dashboard"
      subtitle="KPI Summary · Forecasting Timeline · Stock Runway"
    >
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : (
        <div className="space-y-8">
          {/* Filter + Export Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-muted-foreground">Filtra prodotto:</span>
              <Select value={productFilter} onValueChange={setProductFilter}>
                <SelectTrigger className="w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti i Prodotti</SelectItem>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DashboardExport kpi={kpi} runway={runway} />
          </div>

          {/* SECTION A: Executive Summary */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <BarChart3 className="h-4 w-4 text-primary" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">Executive Summary</h2>
            </div>
            <KPICards data={kpi} />
          </section>

          {/* SECTION B: Forecasting Data Grid */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning/10">
                <TrendingUp className="h-4 w-4 text-warning" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">Forecasting Timeline</h2>
              <span className="text-sm text-muted-foreground ml-2">
                Runway per prodotto con drill-down regionale
              </span>
            </div>
            <ForecastingGrid data={runway} />
          </section>
        </div>
      )}
    </MainLayout>
  );
}

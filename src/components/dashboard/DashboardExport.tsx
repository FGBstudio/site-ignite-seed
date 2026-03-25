import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { KPIData, RunwayRow } from "@/hooks/useDashboardData";
import { format } from "date-fns";
import { it } from "date-fns/locale";

interface DashboardExportProps {
  kpi: KPIData;
  runway: RunwayRow[];
}

const fmt = (iso: string | null) =>
  iso ? format(new Date(iso), "dd/MM/yyyy", { locale: it }) : "N/A";

export function DashboardExport({ kpi, runway }: DashboardExportProps) {
  const exportCSV = () => {
    const lines: string[] = [];

    // KPI Snapshot
    lines.push("=== EXECUTIVE SUMMARY ===");
    lines.push("Metrica,Valore");
    lines.push(`Hardware Installed,${kpi.installed}`);
    lines.push(`Assigned (Confirmed),${kpi.confirmed}`);
    lines.push(`In Stock,${kpi.inStock}`);
    lines.push(`Pipeline (Draft),${kpi.pipeline}`);
    lines.push(`To Order,${kpi.toOrder}`);
    if (kpi.dropDeadDate) lines.push(`Order Deadline,${fmt(kpi.dropDeadDate)}`);
    lines.push("");

    // Forecast grid
    lines.push("=== FORECASTING BREAKDOWN ===");
    lines.push("Prodotto,SKU,Stock,Domanda,Runway,Ordine Qty,Ordinare Entro,Region,Progetto,Handover,Qty Progetto,Stato");

    for (const row of runway) {
      if (row.regions.length === 0) {
        lines.push(
          `${row.product.name},${row.product.sku},${row.stock},${row.totalDemand},${fmt(row.runwayDate)},${row.orderQty},${fmt(row.orderByDate)},,,,`
        );
      }
      for (const reg of row.regions) {
        for (const proj of reg.projects) {
          lines.push(
            `${row.product.name},${row.product.sku},${row.stock},${row.totalDemand},${fmt(row.runwayDate)},${row.orderQty},${fmt(row.orderByDate)},${reg.region},${proj.name},${fmt(proj.handoverDate)},${proj.quantity},${proj.status}`
          );
        }
      }
    }

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dashboard-export-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "CSV esportato", description: "File scaricato con successo." });
  };

  const exportPDF = async () => {
    try {
      const { default: jsPDF } = await import("jspdf");
      const { default: autoTable } = await import("jspdf-autotable");

      const doc = new jsPDF({ orientation: "landscape" });

      // Title
      doc.setFontSize(16);
      doc.text("Executive Dashboard Report", 14, 20);
      doc.setFontSize(10);
      doc.text(`Generato il ${format(new Date(), "dd MMMM yyyy", { locale: it })}`, 14, 28);

      // KPI Table
      autoTable(doc, {
        startY: 35,
        head: [["Metrica", "Valore"]],
        body: [
          ["Hardware Installed", String(kpi.installed)],
          ["Assigned (Confirmed)", String(kpi.confirmed)],
          ["In Stock", String(kpi.inStock)],
          ["Pipeline (Draft)", String(kpi.pipeline)],
          ["To Order", String(kpi.toOrder)],
          ...(kpi.dropDeadDate ? [["Order Deadline", fmt(kpi.dropDeadDate)]] : []),
        ],
        theme: "grid",
        headStyles: { fillColor: [37, 99, 235] },
        styles: { fontSize: 9 },
      });

      // Forecast Table
      const forecastRows: string[][] = [];
      for (const row of runway) {
        for (const reg of row.regions) {
          for (const proj of reg.projects) {
            forecastRows.push([
              row.product.name,
              String(row.stock),
              String(row.totalDemand),
              fmt(row.runwayDate),
              String(row.orderQty),
              fmt(row.orderByDate),
              reg.region,
              proj.name,
              fmt(proj.handoverDate),
              String(proj.quantity),
              proj.status,
            ]);
          }
        }
      }

      const finalY = (doc as any).lastAutoTable?.finalY || 80;
      autoTable(doc, {
        startY: finalY + 10,
        head: [["Prodotto", "Stock", "Domanda", "Runway", "Ordine", "Entro", "Region", "Progetto", "Handover", "Qty", "Stato"]],
        body: forecastRows,
        theme: "striped",
        headStyles: { fillColor: [37, 99, 235] },
        styles: { fontSize: 7 },
      });

      doc.save(`dashboard-report-${format(new Date(), "yyyy-MM-dd")}.pdf`);
      toast({ title: "PDF esportato", description: "Report scaricato con successo." });
    } catch {
      toast({ title: "Errore", description: "Impossibile generare il PDF.", variant: "destructive" });
    }
  };

  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" className="gap-2" onClick={exportCSV}>
        <Download className="h-4 w-4" />
        Export CSV
      </Button>
      <Button variant="outline" size="sm" className="gap-2" onClick={exportPDF}>
        <Download className="h-4 w-4" />
        Export PDF
      </Button>
    </div>
  );
}

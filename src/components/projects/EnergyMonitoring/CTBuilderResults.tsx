import { Download, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CTResult } from "./types";
import { toCSV, downloadCSV } from "./lib/csvExport";

interface Props {
  result: CTResult;
  isAdmin: boolean;
}

const fmtInt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const fmtUSD = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const fmtPct = (n: number) => `${n.toFixed(2)}%`;

const KPI_BORDER = {
  alert: "border-l-[3px] border-l-destructive",
  warn: "border-l-[3px] border-l-amber-500",
  ok: "border-l-[3px] border-l-emerald-500",
  teal: "border-l-[3px] border-l-primary",
} as const;

function Kpi({
  label,
  value,
  sub,
  variant,
}: {
  label: string;
  value: string;
  sub?: string;
  variant: keyof typeof KPI_BORDER;
}) {
  return (
    <div
      className={cn(
        "bg-card border border-border rounded-lg px-4 py-2.5 min-w-[160px] flex-1",
        KPI_BORDER[variant],
      )}
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
        {label}
      </div>
      <div className="text-xl font-medium text-foreground tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

export function CTBuilderResults({ result, isAdmin }: Props) {
  const { rows, totalFacilityEnergy, totalSensors, sensorCost, totalProject, bom, bridgesNeeded, infraCost } =
    result;
  const criticalCount = rows.filter((r) => r.isCritical).length;

  const exportFullCSV = () => {
    const headers = [
      "Electrical Panel",
      "To monitor",
      "Load Type",
      "Amps",
      "Power [W]",
      "Energy [kWh/y]",
      "CT Model",
      "Sensors",
      "Percentage [%]",
      "Critical",
      ...(isAdmin ? ["Hardware Cost [$]"] : []),
    ];
    const data = rows.map((r) => [
      r.electricalPanel,
      r.toMonitor,
      r.loadType,
      r.amps,
      r.powerW,
      r.energyKWhY,
      r.ctModel,
      r.sensors,
      r.percentage,
      r.isCritical ? "Yes" : "No",
      ...(isAdmin ? [r.hardwareCost] : []),
    ]);
    downloadCSV("ct-strategy.csv", toCSV(headers, data));
  };

  const exportBOM = () => {
    const headers = ["Hardware", "Quantity", "Unit Cost", "Total Cost"];
    const data = bom.map((b) => [b.hardware, b.quantity, b.unitCost, b.totalCost]);
    downloadCSV("ct-bom.csv", toCSV(headers, data));
  };

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="flex flex-wrap gap-2.5">
        <Kpi
          label="Total Facility Energy"
          value={`${fmtInt(totalFacilityEnergy)} kWh/y`}
          sub={`${rows.length} circuits analyzed`}
          variant="teal"
        />
        <Kpi
          label="No. of Sensors"
          value={fmtInt(totalSensors)}
          sub={`${criticalCount} critical lines`}
          variant="warn"
        />
        {isAdmin && (
          <>
            <Kpi label="Sensors Cost" value={fmtUSD(sensorCost)} sub={`Bridges: ${bridgesNeeded}`} variant="ok" />
            <Kpi
              label="Total Hardware Cost"
              value={fmtUSD(totalProject)}
              sub={`Infra: ${fmtUSD(infraCost)}`}
              variant="alert"
            />
          </>
        )}
      </div>

      {/* Detailed table */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Detailed Monitoring Strategy</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Critical lines highlighted in red
              </p>
            </div>
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={exportFullCSV} className="gap-2">
                <Download className="h-4 w-4" /> Export CSV
              </Button>
            )}
          </div>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left">
                  <th className="p-2 font-medium text-muted-foreground">Panel</th>
                  <th className="p-2 font-medium text-muted-foreground">To monitor</th>
                  <th className="p-2 font-medium text-muted-foreground">Load Type</th>
                  <th className="p-2 font-medium text-muted-foreground text-right">Amps</th>
                  <th className="p-2 font-medium text-muted-foreground text-right">Power [W]</th>
                  <th className="p-2 font-medium text-muted-foreground text-right">Energy [kWh/y]</th>
                  <th className="p-2 font-medium text-muted-foreground">CT Model</th>
                  <th className="p-2 font-medium text-muted-foreground text-right">Sensors</th>
                  <th className="p-2 font-medium text-muted-foreground text-right">%</th>
                  {isAdmin && (
                    <th className="p-2 font-medium text-muted-foreground text-right">Cost [$]</th>
                  )}
                  <th className="p-2 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={i}
                    className={cn(
                      "border-t border-border",
                      r.isCritical && "bg-destructive/10",
                    )}
                  >
                    <td className="p-2 text-foreground">{r.electricalPanel}</td>
                    <td className="p-2 text-foreground">{r.toMonitor}</td>
                    <td className="p-2 text-muted-foreground">{r.loadType}</td>
                    <td className="p-2 text-right tabular-nums">{fmtInt(r.amps)}</td>
                    <td className="p-2 text-right tabular-nums">{fmtInt(r.powerW)}</td>
                    <td className="p-2 text-right tabular-nums">{fmtInt(r.energyKWhY)}</td>
                    <td className="p-2">
                      <Badge variant="outline">{r.ctModel}</Badge>
                    </td>
                    <td className="p-2 text-right tabular-nums">{r.sensors}</td>
                    <td className="p-2 text-right tabular-nums">{fmtPct(r.percentage)}</td>
                    {isAdmin && (
                      <td className="p-2 text-right tabular-nums">{fmtUSD(r.hardwareCost)}</td>
                    )}
                    <td className="p-2">
                      {r.isCritical ? (
                        <Badge
                          variant="outline"
                          className="border-destructive/40 bg-destructive/10 text-destructive gap-1"
                        >
                          <AlertTriangle className="h-3 w-3" /> Critical
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* BOM — admin only */}
      {isAdmin && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Bill of Materials</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Aggregated hardware required to deploy the strategy
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={exportBOM} className="gap-2">
                <Download className="h-4 w-4" /> Export BOM
              </Button>
            </div>
            {bom.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No critical lines — no hardware required.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr className="text-left">
                      <th className="p-2 font-medium text-muted-foreground">Hardware</th>
                      <th className="p-2 font-medium text-muted-foreground text-right">Qty</th>
                      <th className="p-2 font-medium text-muted-foreground text-right">Unit</th>
                      <th className="p-2 font-medium text-muted-foreground text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bom.map((b, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="p-2 text-foreground">{b.hardware}</td>
                        <td className="p-2 text-right tabular-nums">{b.quantity}</td>
                        <td className="p-2 text-right tabular-nums">{fmtUSD(b.unitCost)}</td>
                        <td className="p-2 text-right font-medium tabular-nums">
                          {fmtUSD(b.totalCost)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border bg-muted/30">
                      <td className="p-2 font-medium" colSpan={3}>
                        Total
                      </td>
                      <td className="p-2 text-right font-semibold tabular-nums">
                        {fmtUSD(totalProject)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

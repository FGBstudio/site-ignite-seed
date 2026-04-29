import { useMemo } from "react";
import { Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useCTBuilderStore } from "./store/useCTBuilderStore";
import { CTBuilderSettings } from "./CTBuilderSettings";
import { CTBuilderUpload } from "./CTBuilderUpload";
import { CTBuilderResults } from "./CTBuilderResults";
import { processRows } from "./lib/ctBuilder";

interface Props {
  certificationId: string;
  isAdmin: boolean;
}

export function EnergyMonitoringPanel({ certificationId, isAdmin }: Props) {
  const state = useCTBuilderStore((s) => s.byCert[certificationId]);
  const setSettings = useCTBuilderStore((s) => s.setSettings);
  const setData = useCTBuilderStore((s) => s.setData);
  const clearData = useCTBuilderStore((s) => s.clearData);

  const settings = state?.settings ?? useCTBuilderStore.getState().getState(certificationId).settings;
  const rawRows = state?.rawRows ?? null;
  const fileName = state?.fileName ?? null;

  const result = useMemo(
    () => (rawRows ? processRows(rawRows, settings) : null),
    [rawRows, settings],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Zap className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">Energy Monitoring (CT Builder)</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isAdmin
                ? "Upload the SLD CSV to compute monitoring strategy, sensors and BOM."
                : "Read-only monitoring strategy. Costs are visible to admins only."}
            </p>
          </div>
        </div>
        {isAdmin && (
          <CTBuilderSettings
            settings={settings}
            onChange={(next) => setSettings(certificationId, next)}
          />
        )}
      </div>

      {isAdmin && (
        <CTBuilderUpload
          fileName={fileName}
          rowCount={rawRows?.length ?? 0}
          onUpload={(rows, name) => setData(certificationId, rows, name)}
          onClear={() => clearData(certificationId)}
        />
      )}

      {result ? (
        <CTBuilderResults result={result} isAdmin={isAdmin} />
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {isAdmin
              ? "Upload an SLD CSV to generate the monitoring strategy."
              : "No monitoring strategy uploaded yet for this site."}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

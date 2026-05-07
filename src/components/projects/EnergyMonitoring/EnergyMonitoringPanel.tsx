import { useEffect, useMemo, useState } from "react";
import { Zap, CheckCircle2, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useCTBuilderStore } from "./store/useCTBuilderStore";
import { CTBuilderSettings } from "./CTBuilderSettings";
import { CTBuilderUpload } from "./CTBuilderUpload";
import { CTBuilderResults } from "./CTBuilderResults";
import { processRows } from "./lib/ctBuilder";
import {
  bomLabelToHardware,
  resolveCTBuilderProductIds,
  type CTBuilderHardware,
} from "@/lib/productMap";
import { useEnergyProductPrices } from "@/lib/productPricing";
import { useEnergyFinanceSettings, computeFinance } from "@/lib/energyFinance";
import type { CTResult } from "./types";

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

  const { data: priceInfo } = useEnergyProductPrices();
  const { data: financeSettings } = useEnergyFinanceSettings();

  const result = useMemo(
    () => (rawRows ? processRows(rawRows, settings, priceInfo?.prices) : null),
    [rawRows, settings, priceInfo],
  );

  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [acceptedAt, setAcceptedAt] = useState<string | null>(null);

  // Detect prior quote acceptance and hydrate snapshot (PM read-only path).
  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("site_energy_records" as never)
        .select("created_at, ct_builder_snapshot")
        .eq("certification_id", certificationId)
        .maybeSingle();
      if (!active || !data) return;
      const row = data as { created_at: string; ct_builder_snapshot: { rawRows?: unknown[]; settings?: unknown; fileName?: string } | null };
      setAcceptedAt(row.created_at);
      if (!rawRows && row.ct_builder_snapshot?.rawRows) {
        if (row.ct_builder_snapshot.settings) {
          setSettings(certificationId, row.ct_builder_snapshot.settings as never);
        }
        setData(
          certificationId,
          row.ct_builder_snapshot.rawRows as never,
          row.ct_builder_snapshot.fileName ?? "snapshot.csv",
        );
      }
    })();
    return () => {
      active = false;
    };
  }, [certificationId, rawRows, setData, setSettings]);

  const handleConfirmQuote = async () => {
    if (!result || !user) return;
    setConfirming(true);
    try {
      // 1. Resolve products for BOM lines
      const needed = Array.from(
        new Set(
          result.bom
            .map((b) => bomLabelToHardware(b.hardware))
            .filter((h): h is CTBuilderHardware => Boolean(h)),
        ),
      );
      const { map, missing } = await resolveCTBuilderProductIds(needed);
      if (missing.length > 0) {
        toast({
          title: "Missing products in catalog",
          description: `Add these to the products table first: ${missing.join(", ")}`,
          variant: "destructive",
        });
        setConfirming(false);
        return;
      }

      // 2. Replace any prior ct_builder allocations for this certification
      await supabase
        .from("project_allocations")
        .delete()
        .eq("certification_id", certificationId)
        .eq("source", "ct_builder");

      const allocRows = result.bom
        .map((b) => {
          const hw = bomLabelToHardware(b.hardware);
          if (!hw || !map[hw]) return null;
          return {
            certification_id: certificationId,
            product_id: map[hw],
            quantity: 0,
            requested_quantity: b.quantity,
            status: "Requested",
            category: "ENERGY",
            source: "ct_builder",
          };
        })
        .filter(Boolean) as Array<Record<string, unknown>>;

      if (allocRows.length > 0) {
        const { error: allocErr } = await supabase
          .from("project_allocations")
          .insert(allocRows as never);
        if (allocErr) throw allocErr;
      }

      // 3. Upsert site_energy_records
      const { data: cert } = await supabase
        .from("certifications")
        .select("id, site_id, pm_id, handover_date, sites(name, city, country, region, brand_id, brands(name))")
        .eq("id", certificationId)
        .maybeSingle();

      const site = (cert as { sites?: { name?: string; city?: string; country?: string; region?: string; brand_id?: string; brands?: { name?: string } } } | null)?.sites ?? undefined;

      const counts = countersFromResult(result);
      const recordPayload = {
        certification_id: certificationId,
        site_id: cert?.site_id ?? null,
        brand_id: site?.brand_id ?? null,
        pm_id: cert?.pm_id ?? null,
        project_name: site?.name ?? null,
        brand_name: site?.brands?.name ?? null,
        region: site?.region ?? null,
        country: site?.country ?? null,
        city: site?.city ?? null,
        status: "Upcoming",
        handover_date: cert?.handover_date ?? null,
        category: "Energy",
        total_sensors: counts.totalSensors,
        total_bridges: result.bridgesNeeded,
        no_pan10: counts.pan10,
        no_pan12: counts.pan12,
        no_pan14: counts.pan14,
        no_ct: counts.totalSensors,
        bridge_total_cost: result.infraCost,
        sensor_total_cost: result.sensorCost,
        total_package_cost_usd: result.totalProject,
        locked: true,
        ct_builder_snapshot: { rawRows, settings, fileName },
      };

      await supabase
        .from("site_energy_records" as never)
        .upsert(recordPayload as never, { onConflict: "certification_id" });

      // 4. Emit alert
      await supabase.from("task_alerts").insert({
        certification_id: certificationId,
        created_by: user.id,
        alert_type: "pm_operational",
        title: "Energy quote accepted — devices requested for site",
        description: `Monitoring Team confirmed: ${result.bom
          .map((b) => `${b.quantity}× ${b.hardware}`)
          .join(", ")}.`,
        escalate_to_admin: true,
      });

      qc.invalidateQueries({ queryKey: ["task-alerts"] });
      qc.invalidateQueries({ queryKey: ["site-energy-records"] });
      qc.invalidateQueries({ queryKey: ["project-allocations", certificationId] });

      setAcceptedAt(new Date().toISOString());
      toast({ title: "Quote accepted", description: "Devices registered and PM notified." });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast({ title: "Failed to confirm", description: message, variant: "destructive" });
    } finally {
      setConfirming(false);
    }
  };

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
        <>
          <CTBuilderResults result={result} isAdmin={isAdmin} />
          {isAdmin && (
            <Card>
              <CardContent className="pt-6 flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Quote acceptance</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {acceptedAt
                      ? `Quote accepted on ${format(new Date(acceptedAt), "dd MMM yyyy")}. Click again to replace with the latest BOM.`
                      : "Lock this BOM, register the requested devices on the site, and notify the PM."}
                  </p>
                </div>
                <Button onClick={handleConfirmQuote} disabled={confirming} className="gap-2">
                  {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {acceptedAt ? "Replace quote" : "Confirm quote accepted"}
                </Button>
              </CardContent>
            </Card>
          )}
        </>
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

function countersFromResult(result: CTResult) {
  let pan10 = 0;
  let pan12 = 0;
  let pan14 = 0;
  let totalSensors = 0;
  for (const r of result.rows) {
    if (!r.isCritical) continue;
    totalSensors += r.sensors;
    if (r.ctModel === "PAN-10") pan10 += r.sensors;
    if (r.ctModel === "PAN-12") pan12 += r.sensors;
    if (r.ctModel === "PAN-14") pan14 += r.sensors;
  }
  return { pan10, pan12, pan14, totalSensors };
}

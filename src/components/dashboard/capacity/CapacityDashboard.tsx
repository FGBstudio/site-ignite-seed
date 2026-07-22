import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  SaturationMatrix,
  SaturationLegend,
} from "@/components/capacity/SaturationMatrix";
import {
  useAllSaturationCerts,
  usePmProfiles,
} from "@/hooks/useSaturationMatrix";

export function CapacityDashboard() {
  const [horizon, setHorizon] = useState<number>(16);
  const { data: profiles = [] } = usePmProfiles();
  const { data: certs = [] } = useAllSaturationCerts();

  const users = useMemo(() => {
    // Only include PMs that actually own at least one certification (avoids empty rows).
    const owners = new Set(certs.map((c) => c.pm_id).filter(Boolean) as string[]);
    return (profiles as any[])
      .filter((p) => owners.has(p.id))
      .map((p) => ({
        id: p.id as string,
        label: (p.full_name || p.email || p.id.slice(0, 8)) as string,
      }));
  }, [profiles, certs]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Capacity — Saturation Matrix</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            PM × Week overview. Expand a PM to see their projects. Green = 32–40h saturated,
            yellow = under 30h, violet = unavailability, red diamond = deadline.
          </p>
        </div>
        <div className="flex items-center gap-1">
          {[8, 16, 26].map((n) => (
            <Button
              key={n}
              size="sm"
              variant={horizon === n ? "default" : "outline"}
              onClick={() => setHorizon(n)}
            >
              {n}w
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <SaturationLegend />
        <SaturationMatrix mode="read" users={users} certs={certs} weekCount={horizon} />
      </CardContent>
    </Card>
  );
}

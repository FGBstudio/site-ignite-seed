import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { SaturationMatrix, SaturationLegend } from "@/components/capacity/SaturationMatrix";
import { useMySaturationCerts } from "@/hooks/useSaturationMatrix";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

export function PMPlanner() {
  const { user } = useAuth();
  const [horizon, setHorizon] = useState<number>(16);

  const { data: certs = [] } = useMySaturationCerts(user?.id);

  const { data: me } = useQuery({
    queryKey: ["profile-self", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  const users = useMemo(
    () =>
      user?.id
        ? [
            {
              id: user.id,
              label: (me?.full_name || me?.email || "Me") as string,
            },
          ]
        : [],
    [user?.id, me],
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Weekly Saturation Matrix</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Distribute your project hours across the coming weeks. Weekly cap is 40h (hard limit).
              Violet columns are your HR unavailability. Red diamonds mark project deadlines.
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
          <SaturationMatrix
            mode="edit"
            users={users}
            certs={certs}
            weekCount={horizon}
            currentUserId={user?.id}
          />
        </CardContent>
      </Card>
    </div>
  );
}

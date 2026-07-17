import { useMemo, useState } from "react";
import { addDays, format, startOfWeek, startOfYear } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useCalendarSlots, useWeeklyCapacity, useMonthlyCapacity } from "@/hooks/useCapacityPlanner";

type Level = "tactical" | "operational" | "strategic";

function usePmProfiles() {
  return useQuery({
    queryKey: ["capacity", "pm-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email");
      if (error) throw error;
      return data ?? [];
    },
  });
}

function saturationClass(pct: number): string {
  if (pct >= 100) return "bg-destructive/25 text-destructive";
  if (pct >= 80) return "bg-success/25 text-success";
  if (pct > 0) return "bg-warning/20 text-warning";
  return "bg-muted text-muted-foreground";
}

export function CapacityDashboard() {
  const [level, setLevel] = useState<Level>("operational");
  const { data: profiles = [] } = usePmProfiles();
  const profileName = (id: string) =>
    (profiles.find((p: any) => p.id === id) as any)?.full_name ??
    (profiles.find((p: any) => p.id === id) as any)?.email ??
    id.slice(0, 8);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Capacity</CardTitle>
        <ToggleGroup type="single" size="sm" value={level} onValueChange={(v) => v && setLevel(v as Level)}>
          <ToggleGroupItem value="tactical">Tactical</ToggleGroupItem>
          <ToggleGroupItem value="operational">Operational</ToggleGroupItem>
          <ToggleGroupItem value="strategic">Strategic</ToggleGroupItem>
        </ToggleGroup>
      </CardHeader>
      <CardContent>
        {level === "tactical" && <TacticalView profileName={profileName} />}
        {level === "operational" && <OperationalView profileName={profileName} />}
        {level === "strategic" && <StrategicView profileName={profileName} />}
      </CardContent>
    </Card>
  );
}

function TacticalView({ profileName }: { profileName: (id: string) => string }) {
  const weekStart = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }), []);
  const from = weekStart.toISOString();
  const to = addDays(weekStart, 7).toISOString();
  const { data: slots = [], isLoading } = useCalendarSlots(from, to);

  const byUserByDay = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const s of slots) {
      const day = format(new Date(s.slot_start), "yyyy-MM-dd");
      if (!m.has(s.user_id)) m.set(s.user_id, new Map());
      const inner = m.get(s.user_id)!;
      inner.set(day, (inner.get(day) ?? 0) + s.duration_minutes / 60);
    }
    return m;
  }, [slots]);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  if (isLoading) return <div className="py-6 text-sm text-muted-foreground">Loading…</div>;
  if (byUserByDay.size === 0)
    return <div className="py-6 text-sm text-muted-foreground">No planned slots for this week.</div>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>PM</TableHead>
          {days.map((d) => (
            <TableHead key={d.toISOString()} className="text-center">
              {format(d, "EEE d")}
            </TableHead>
          ))}
          <TableHead className="text-right">Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from(byUserByDay.entries()).map(([userId, dayMap]) => {
          const total = Array.from(dayMap.values()).reduce((a, b) => a + b, 0);
          return (
            <TableRow key={userId}>
              <TableCell className="font-medium">{profileName(userId)}</TableCell>
              {days.map((d) => {
                const key = format(d, "yyyy-MM-dd");
                const h = dayMap.get(key) ?? 0;
                return (
                  <TableCell key={key} className="text-center tabular-nums">
                    {h > 0 ? `${h}h` : "—"}
                  </TableCell>
                );
              })}
              <TableCell className="text-right tabular-nums font-semibold">{total}h</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function OperationalView({ profileName }: { profileName: (id: string) => string }) {
  const today = useMemo(() => new Date(), []);
  const from = format(startOfWeek(addDays(today, -7 * 4), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const to = format(startOfWeek(addDays(today, 7 * 8), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const { data: rows = [], isLoading } = useWeeklyCapacity(from, to);

  const weeks = useMemo(() => {
    const set = new Set(rows.map((r) => r.week_start));
    return Array.from(set).sort();
  }, [rows]);

  const byUser = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const r of rows) {
      if (!m.has(r.user_id)) m.set(r.user_id, new Map());
      m.get(r.user_id)!.set(r.week_start, Number(r.saturation_pct));
    }
    return m;
  }, [rows]);

  if (isLoading) return <div className="py-6 text-sm text-muted-foreground">Loading…</div>;
  if (byUser.size === 0)
    return <div className="py-6 text-sm text-muted-foreground">No capacity data yet.</div>;

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 bg-background">PM</TableHead>
            {weeks.map((w) => (
              <TableHead key={w} className="text-center text-xs whitespace-nowrap">
                {format(new Date(w), "d MMM")}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from(byUser.entries()).map(([userId, weekMap]) => (
            <TableRow key={userId}>
              <TableCell className="sticky left-0 bg-background font-medium">{profileName(userId)}</TableCell>
              {weeks.map((w) => {
                const pct = weekMap.get(w) ?? 0;
                return (
                  <TableCell
                    key={w}
                    className={cn("text-center tabular-nums text-xs", saturationClass(pct))}
                  >
                    {pct > 0 ? `${Math.round(pct)}%` : "—"}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function StrategicView({ profileName }: { profileName: (id: string) => string }) {
  const year = new Date().getFullYear();
  const { data: rows = [], isLoading } = useMonthlyCapacity(year);

  const months = useMemo(
    () => Array.from({ length: 12 }, (_, i) => format(addDays(startOfYear(new Date(year, 0, 1)), i * 30 + i), "yyyy-MM")),
    [year],
  );

  const byUser = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const r of rows) {
      const key = r.month_start.slice(0, 7);
      if (!m.has(r.user_id)) m.set(r.user_id, new Map());
      m.get(r.user_id)!.set(key, Number(r.saturation_pct));
    }
    return m;
  }, [rows]);

  if (isLoading) return <div className="py-6 text-sm text-muted-foreground">Loading…</div>;
  if (byUser.size === 0)
    return <div className="py-6 text-sm text-muted-foreground">No monthly data for {year}.</div>;

  const monthKeys = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>PM</TableHead>
            {monthKeys.map((m) => (
              <TableHead key={m} className="text-center text-xs">
                {format(new Date(`${m}-01`), "MMM")}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from(byUser.entries()).map(([userId, monthMap]) => (
            <TableRow key={userId}>
              <TableCell className="font-medium">{profileName(userId)}</TableCell>
              {monthKeys.map((m) => {
                const pct = monthMap.get(m) ?? 0;
                return (
                  <TableCell key={m} className={cn("text-center tabular-nums text-xs", saturationClass(pct))}>
                    {pct > 0 ? `${Math.round(pct)}%` : "—"}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

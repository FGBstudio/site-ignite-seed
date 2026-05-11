import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WeeklyReportCanvas } from "./WeeklyReportCanvas";

interface PMOption {
  id: string;
  label: string;
}

export function AdminWeeklyReportsBrowser() {
  const [pms, setPms] = useState<PMOption[]>([]);
  const [selectedPm, setSelectedPm] = useState<string>("");

  useEffect(() => {
    (async () => {
      // Fetch distinct PMs from certifications + their profile names
      const { data: certs } = await supabase
        .from("certifications")
        .select("pm_id")
        .not("pm_id", "is", null);
      const ids = Array.from(new Set((certs ?? []).map((c) => c.pm_id).filter(Boolean))) as string[];
      if (ids.length === 0) {
        setPms([]);
        return;
      }
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, display_name, email")
        .in("id", ids);
      const opts: PMOption[] = (profiles ?? []).map((p) => ({
        id: p.id,
        label: p.full_name || p.display_name || p.email || p.id,
      }));
      opts.sort((a, b) => a.label.localeCompare(b.label));
      setPms(opts);
      if (!selectedPm && opts[0]) setSelectedPm(opts[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">View report for:</span>
        <Select value={selectedPm} onValueChange={setSelectedPm}>
          <SelectTrigger className="w-[260px]"><SelectValue placeholder="Select a PM…" /></SelectTrigger>
          <SelectContent>
            {pms.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {selectedPm && <WeeklyReportCanvas targetUserId={selectedPm} adminMode />}
    </div>
  );
}

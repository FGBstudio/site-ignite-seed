import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { WeeklyReport, WeeklyReportProjectEntry, WeeklyReportStatus } from "@/types/weekly-report";
import { format, startOfISOWeek, endOfISOWeek } from "date-fns";

const fmt = (d: Date) => format(d, "yyyy-MM-dd");

export function getWeekBounds(d: Date) {
  const start = startOfISOWeek(d);
  const end = endOfISOWeek(d);
  return { weekStart: fmt(start), weekEnd: fmt(end), startDate: start, endDate: end };
}

/** Fetches the weekly report row + the time entries needed for snapshot/auto-population. */
export function useWeeklyReport(targetUserId: string | null, weekStartISO: string) {
  const qc = useQueryClient();
  const { user, role } = useAuth();
  const userId = targetUserId || user?.id || null;

  const reportQuery = useQuery({
    queryKey: ["weekly-report", userId, weekStartISO],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_reports" as any)
        .select("*")
        .eq("user_id", userId!)
        .eq("week_start", weekStartISO)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as WeeklyReport | null;
    },
  });

  const weekEnd = format(endOfISOWeek(new Date(weekStartISO)), "yyyy-MM-dd");

  const entriesQuery = useQuery({
    queryKey: ["weekly-report-entries", userId, weekStartISO],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_entries" as any)
        .select("certification_id, hours, description, entry_date")
        .eq("user_id", userId!)
        .gte("entry_date", weekStartISO)
        .lte("entry_date", weekEnd);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        certification_id: string;
        hours: number;
        description: string | null;
        entry_date: string;
      }>;
    },
  });

  // Build auto-snapshot content from raw entries (used as fallback when no row yet)
  const autoContent: WeeklyReportProjectEntry[] = (() => {
    const map = new Map<string, { hours: number; descriptions: string[] }>();
    for (const e of entriesQuery.data ?? []) {
      const cur = map.get(e.certification_id) ?? { hours: 0, descriptions: [] };
      cur.hours += Number(e.hours);
      if (e.description?.trim()) cur.descriptions.push(`- ${e.description.trim()}`);
      map.set(e.certification_id, cur);
    }
    return Array.from(map.entries()).map(([certification_id, v]) => ({
      certification_id,
      hours_snapshot: Math.round(v.hours * 100) / 100,
      summary: v.descriptions.join("\n"),
    }));
  })();

  const save = useMutation({
    mutationFn: async (input: { content: WeeklyReportProjectEntry[]; status: WeeklyReportStatus }) => {
      if (!userId) throw new Error("No user");
      const payload = {
        user_id: userId,
        week_start: weekStartISO,
        content: input.content,
        status: input.status,
        last_edited_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from("weekly_reports" as any)
        .upsert(payload, { onConflict: "user_id,week_start" })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as WeeklyReport;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["weekly-report", userId, weekStartISO] });
    },
  });

  const unlock = useMutation({
    mutationFn: async () => {
      if (role !== "ADMIN") throw new Error("Only admins can unlock");
      if (!reportQuery.data?.id) throw new Error("No report");
      const { error } = await supabase
        .from("weekly_reports" as any)
        .update({ status: "saved", locked_at: null })
        .eq("id", reportQuery.data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["weekly-report", userId, weekStartISO] });
    },
  });

  return {
    report: reportQuery.data,
    isLoading: reportQuery.isLoading || entriesQuery.isLoading,
    autoContent,
    save,
    unlock,
  };
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addWeeks, format, startOfWeek } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

export interface PmWeeklyAllocation {
  id: string;
  user_id: string;
  certification_id: string;
  milestone_id: string | null;
  week_start: string; // yyyy-MM-dd
  planned_hours: number;
  note: string | null;
  has_conflict: boolean;
  has_overbudget: boolean;
}

export interface SaturationCert {
  id: string;
  name: string;
  pm_id: string | null;
  allocated_hours: number | null;
  handover_date: string | null;
  status: string | null;
}

export interface SaturationHrOff {
  user_id: string;
  date: string;
  status: string;
}

export function getMondayISO(d: Date = new Date()): string {
  return format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");
}

export function buildWeekRange(anchor: Date, count: number): string[] {
  const first = startOfWeek(anchor, { weekStartsOn: 1 });
  return Array.from({ length: count }, (_, i) => format(addWeeks(first, i), "yyyy-MM-dd"));
}

/** Fetch allocations in a week range. Optionally filter by user_id(s). */
export function useAllocations(fromWeek: string, toWeek: string, userIds?: string[]) {
  return useQuery({
    queryKey: ["pm-weekly-allocations", fromWeek, toWeek, userIds?.join(",") ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("pm_weekly_allocations" as any)
        .select("*")
        .gte("week_start", fromWeek)
        .lte("week_start", toWeek);
      if (userIds && userIds.length > 0) q = q.in("user_id", userIds);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as PmWeeklyAllocation[];
    },
  });
}

/** Certifications assigned to a PM (owner + guest collaborations). */
export function useMySaturationCerts(userId: string | undefined) {
  return useQuery({
    queryKey: ["saturation-my-certs", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: owned, error: e1 } = await supabase
        .from("certifications")
        .select("id, name, pm_id, allocated_hours, handover_date, status")
        .eq("pm_id", userId!);
      if (e1) throw e1;

      const { data: collabs } = await supabase
        .from("cert_collaborations" as any)
        .select("certification_id")
        .eq("guest_pm_id", userId!)
        .eq("status", "approved");
      const collabIds = ((collabs ?? []) as any[]).map((c) => c.certification_id).filter(Boolean);
      let guests: SaturationCert[] = [];
      if (collabIds.length > 0) {
        const { data: g } = await supabase
          .from("certifications")
          .select("id, name, pm_id, allocated_hours, handover_date, status")
          .in("id", collabIds);
        guests = (g ?? []) as any;
      }
      const map = new Map<string, SaturationCert>();
      [...(owned ?? []), ...guests].forEach((c: any) => map.set(c.id, c));
      return Array.from(map.values());
    },
  });
}

/** All certifications (admin view). */
export function useAllSaturationCerts() {
  return useQuery({
    queryKey: ["saturation-all-certs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("certifications")
        .select("id, name, pm_id, allocated_hours, handover_date, status")
        .not("pm_id", "is", null);
      if (error) throw error;
      return (data ?? []) as unknown as SaturationCert[];
    },
  });
}

/** PMs (profiles with a PM/ADMIN role). Simpler: read all profiles with matching ids from user_roles PM. */
export function usePmProfiles() {
  return useQuery({
    queryKey: ["saturation-pm-profiles"],
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role");
      const ids = Array.from(
        new Set(
          ((roles ?? []) as any[])
            .filter((r) => ["pm", "admin", "PM", "ADMIN"].includes(String(r.role)))
            .map((r) => r.user_id),
        ),
      );
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** HR off-days (vacation/sick/unavailable/permit) in a range. */
export function useHrOffDays(fromDate: string, toDate: string, userIds?: string[]) {
  return useQuery({
    queryKey: ["saturation-hr-off", fromDate, toDate, userIds?.join(",") ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("hr_availability")
        .select("user_id, date, status")
        .in("status", ["vacation", "sick", "unavailable", "permit"])
        .gte("date", fromDate)
        .lte("date", toDate);
      if (userIds && userIds.length > 0) q = q.in("user_id", userIds);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as SaturationHrOff[];
    },
  });
}

/** Upsert (insert or update) a weekly allocation. */
export function useUpsertAllocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      user_id: string;
      certification_id: string;
      milestone_id?: string | null;
      week_start: string;
      planned_hours: number;
    }) => {
      if (input.id) {
        const { data, error } = await supabase
          .from("pm_weekly_allocations" as any)
          .update({ planned_hours: input.planned_hours })
          .eq("id", input.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .from("pm_weekly_allocations" as any)
        .insert({
          user_id: input.user_id,
          certification_id: input.certification_id,
          milestone_id: input.milestone_id ?? null,
          week_start: input.week_start,
          planned_hours: input.planned_hours,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pm-weekly-allocations"] });
    },
  });
}

export function useDeleteAllocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pm_weekly_allocations" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pm-weekly-allocations"] }),
  });
}

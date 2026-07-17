import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface CalendarSlot {
  id: string;
  user_id: string;
  certification_id: string | null;
  milestone_id: string | null;
  slot_start: string;
  duration_minutes: number;
  kind: "project" | "admin" | "pto" | "sick" | "training";
  note: string | null;
}

export interface WeeklyCapacity {
  user_id: string;
  week_start: string;
  planned_hours: number;
  logged_hours: number;
  contract_hours: number;
  saturation_pct: number;
}

export interface MonthlyCapacity {
  user_id: string;
  month_start: string;
  planned_hours: number;
  logged_hours: number;
  workable_hours: number;
  saturation_pct: number;
}

export interface ChangeRequest {
  id: string;
  certification_id: string;
  milestone_id: string | null;
  requested_by: string;
  delta_hours: number;
  reason: string;
  status: "pending" | "approved" | "rejected";
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
}

/** All slots (admin) or own slots (PM) between two ISO timestamps. */
export function useCalendarSlots(fromIso: string, toIso: string, userId?: string) {
  return useQuery({
    queryKey: ["calendar-slots", userId ?? "all", fromIso, toIso],
    queryFn: async () => {
      let q = supabase
        .from("pm_calendar_slots" as any)
        .select("*")
        .gte("slot_start", fromIso)
        .lt("slot_start", toIso)
        .order("slot_start", { ascending: true });
      if (userId) q = q.eq("user_id", userId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as CalendarSlot[];
    },
  });
}

export function useCreateSlot() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: Omit<CalendarSlot, "id" | "user_id">) => {
      if (!user?.id) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("pm_calendar_slots" as any)
        .insert({ ...input, user_id: user.id })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as CalendarSlot;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar-slots"] });
      qc.invalidateQueries({ queryKey: ["weekly-capacity"] });
      qc.invalidateQueries({ queryKey: ["monthly-capacity"] });
    },
  });
}

export function useDeleteSlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pm_calendar_slots" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar-slots"] });
      qc.invalidateQueries({ queryKey: ["weekly-capacity"] });
      qc.invalidateQueries({ queryKey: ["monthly-capacity"] });
    },
  });
}

export function useWeeklyCapacity(fromDate?: string, toDate?: string) {
  return useQuery({
    queryKey: ["weekly-capacity", fromDate ?? "all", toDate ?? "all"],
    queryFn: async () => {
      let q = supabase.from("view_user_weekly_capacity" as any).select("*");
      if (fromDate) q = q.gte("week_start", fromDate);
      if (toDate) q = q.lte("week_start", toDate);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as WeeklyCapacity[];
    },
  });
}

export function useMonthlyCapacity(year: number) {
  return useQuery({
    queryKey: ["monthly-capacity", year],
    queryFn: async () => {
      const from = `${year}-01-01`;
      const to = `${year}-12-31`;
      const { data, error } = await supabase
        .from("view_user_monthly_capacity" as any)
        .select("*")
        .gte("month_start", from)
        .lte("month_start", to);
      if (error) throw error;
      return (data ?? []) as unknown as MonthlyCapacity[];
    },
  });
}

export function useCreateChangeRequest() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      certification_id: string;
      milestone_id?: string | null;
      delta_hours: number;
      reason: string;
    }) => {
      if (!user?.id) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("change_requests" as any)
        .insert({ ...input, requested_by: user.id })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as ChangeRequest;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["change-requests"] }),
  });
}

export function useChangeRequests() {
  return useQuery({
    queryKey: ["change-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("change_requests" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ChangeRequest[];
    },
  });
}

/** Milestone budgets — reuses certification_milestones.allocated_hours. */
export function useUpdateMilestoneBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, allocated_hours }: { id: string; allocated_hours: number | null }) => {
      const { error } = await supabase
        .from("certification_milestones")
        .update({ allocated_hours })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["certification-milestones"] });
      qc.invalidateQueries({ queryKey: ["hours-burn"] });
    },
  });
}

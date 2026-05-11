import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { TimeEntry } from "@/types/time-tracking";

/** Time entries for the current user within a date range (inclusive). */
export function useMyTimeEntries(fromDate: string, toDate: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["time-entries", user?.id, fromDate, toDate],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_entries" as any)
        .select("*")
        .eq("user_id", user!.id)
        .gte("entry_date", fromDate)
        .lte("entry_date", toDate)
        .order("entry_date", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as TimeEntry[];
    },
  });
}

export interface CreateTimeEntryInput {
  certification_id: string;
  milestone_id?: string | null;
  entry_date: string;
  hours: number;
  description?: string | null;
  overbudget_note?: string | null;
  is_overbudget?: boolean;
}

export function useCreateTimeEntry() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: CreateTimeEntryInput) => {
      if (!user?.id) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("time_entries" as any)
        .insert({
          user_id: user.id,
          certification_id: input.certification_id,
          milestone_id: input.milestone_id ?? null,
          entry_date: input.entry_date,
          hours: input.hours,
          description: input.description ?? null,
          overbudget_note: input.overbudget_note ?? null,
          is_overbudget: input.is_overbudget ?? false,
        })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as TimeEntry;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["time-entries"] });
      qc.invalidateQueries({ queryKey: ["hours-burn"] });
      qc.invalidateQueries({ queryKey: ["resource-utilization"] });
    },
  });
}

export function useDeleteTimeEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("time_entries" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["time-entries"] });
      qc.invalidateQueries({ queryKey: ["hours-burn"] });
      qc.invalidateQueries({ queryKey: ["resource-utilization"] });
    },
  });
}

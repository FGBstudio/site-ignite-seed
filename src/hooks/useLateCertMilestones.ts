import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { differenceInDays, format } from "date-fns";

export interface LateMilestoneInfo {
  certification_id: string;
  requirement: string;
  due_date: string;
  daysLate: number;
}

/**
 * Overdue timeline milestones (not achieved), keeping the worst one per certification.
 * Shared between ProjectsReports and PortfolioFollowUp.
 */
export function useLateCertMilestones() {
  return useQuery({
    queryKey: ["projects-reports-late-milestones"],
    queryFn: async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("certification_milestones")
        .select("certification_id, requirement, due_date, status")
        .eq("milestone_type", "timeline")
        .lt("due_date", today)
        .neq("status", "achieved");
      if (error) throw error;
      const todayDate = new Date();
      const rows = (data || []).map((m: any) => ({
        certification_id: m.certification_id as string,
        requirement: (m.requirement as string) || "Milestone",
        due_date: m.due_date as string,
        daysLate: differenceInDays(todayDate, new Date(m.due_date)),
      }));
      const byCert = new Map<string, LateMilestoneInfo>();
      for (const r of rows) {
        const existing = byCert.get(r.certification_id);
        if (!existing || r.daysLate > existing.daysLate) byCert.set(r.certification_id, r);
      }
      return Array.from(byCert.values());
    },
  });
}

export interface TimeEntry {
  id: string;
  user_id: string;
  certification_id: string;
  milestone_id: string | null;
  entry_date: string; // YYYY-MM-DD
  hours: number;
  description: string | null;
  overbudget_note: string | null;
  is_overbudget: boolean;
  created_at: string;
  updated_at: string;
}

export type TimeEntryInsert = Omit<TimeEntry, "id" | "created_at" | "updated_at" | "is_overbudget"> & {
  is_overbudget?: boolean;
};

export interface CertHoursBurn {
  certification_id: string;
  certification_name: string | null;
  client: string;
  pm_id: string | null;
  allocated_hours: number;
  consumed_hours: number;
  pct_used: number | null;
  overrun_alerts: number;
}

export interface MilestoneHoursBurn {
  milestone_id: string;
  certification_id: string;
  requirement: string;
  allocated_hours: number;
  consumed_hours: number;
  pct_used: number | null;
}

export interface UserWeeklySaturation {
  user_id: string;
  week_start: string;
  total_hours: number;
  active_projects: number;
}

export type BudgetStatus = "green" | "yellow" | "red" | "none";

export function getBudgetStatus(consumed: number, allocated: number): BudgetStatus {
  if (!allocated || allocated <= 0) return "none";
  const pct = (consumed / allocated) * 100;
  if (pct >= 100) return "red";
  if (pct >= 80) return "yellow";
  return "green";
}

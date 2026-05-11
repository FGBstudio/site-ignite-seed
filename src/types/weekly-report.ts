export type WeeklyReportStatus = "draft" | "saved" | "locked";

export interface WeeklyReportProjectEntry {
  certification_id: string;
  hours_snapshot: number;
  summary: string;
}

export interface WeeklyReport {
  id: string;
  user_id: string;
  week_start: string; // YYYY-MM-DD (Monday)
  content: WeeklyReportProjectEntry[];
  status: WeeklyReportStatus;
  locked_at: string | null;
  last_edited_at: string;
  created_at: string;
  updated_at: string;
}

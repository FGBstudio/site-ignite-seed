// Team Workspace types — extend the project_tasks model with team/sprint context.

export type TeamMemberRole = "lead" | "member";

export interface Team {
  id: string;
  name: string;
  description: string | null;
  color: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  role: TeamMemberRole;
  created_at: string;
}

export interface TeamMemberWithProfile extends TeamMember {
  profile?: {
    id: string;
    display_name: string | null;
    full_name: string | null;
    email: string | null;
  } | null;
}

export interface TeamSprint {
  id: string;
  team_id: string;
  label: string;
  start_date: string | null;
  end_date: string | null;
  meeting_notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type TeamTaskStatus = "todo" | "in_progress" | "review" | "done";
export type TeamTaskKind = "project" | "general";
export type TeamTaskPriority = "low" | "medium" | "high";

export interface TeamTask {
  id: string;
  certification_id: string | null;
  team_id: string | null;
  sprint_id: string | null;
  assigned_to: string | null;
  task_name: string;
  title: string | null;
  description: string | null;
  task_kind: TeamTaskKind;
  status: TeamTaskStatus;
  priority: TeamTaskPriority | null;
  start_date: string | null;
  end_date: string | null;
  due_date: string | null;
  created_at: string;
  // joined / enriched
  certification?: { id: string; name: string; client: string | null } | null;
  team?: { id: string; name: string; color: string } | null;
  sprint?: { id: string; label: string } | null;
  assignee?: { id: string; display_name: string | null; full_name: string | null; email: string | null } | null;
}

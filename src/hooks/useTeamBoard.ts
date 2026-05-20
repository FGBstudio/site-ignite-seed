import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import type {
  Team,
  TeamMemberWithProfile,
  TeamSprint,
  TeamTask,
  TeamTaskKind,
  TeamTaskPriority,
  TeamTaskStatus,
} from "@/types/team-board";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

/** Teams the current user can see (RLS already filters). */
export function useTeams() {
  return useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("teams")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data || []) as Team[];
    },
  });
}

export function useTeamMembers(teamId: string | undefined) {
  return useQuery({
    queryKey: ["team-members", teamId],
    queryFn: async () => {
      if (!teamId) return [];
      const { data, error } = await sb
        .from("team_members")
        .select("*")
        .eq("team_id", teamId);
      if (error) throw error;
      const rows = (data || []) as TeamMemberWithProfile[];
      const ids = rows.map((r) => r.user_id);
      if (ids.length === 0) return rows;
      const { data: profiles } = await sb
        .from("profiles")
        .select("id, display_name, full_name, email")
        .in("id", ids);
      const map = new Map((profiles || []).map((p: { id: string }) => [p.id, p]));
      return rows.map((r) => ({ ...r, profile: map.get(r.user_id) ?? null }));
    },
    enabled: !!teamId,
  });
}

export function useTeamSprints(teamId: string | undefined) {
  return useQuery({
    queryKey: ["team-sprints", teamId],
    queryFn: async () => {
      if (!teamId) return [];
      const { data, error } = await sb
        .from("team_sprints")
        .select("*")
        .eq("team_id", teamId)
        .order("start_date", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data || []) as TeamSprint[];
    },
    enabled: !!teamId,
  });
}

/** Fetch tasks for a team (optionally filtered by sprint). */
export function useTeamTasks(teamId: string | undefined, sprintId?: string | null) {
  return useQuery({
    queryKey: ["team-tasks", teamId, sprintId ?? "all"],
    queryFn: async () => {
      if (!teamId) return [];
      let query = sb
        .from("project_tasks")
        .select(
          "*, certifications:certification_id(id, name, client), teams:team_id(id, name, color), team_sprints:sprint_id(id, label)"
        )
        .eq("team_id", teamId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (sprintId) query = query.eq("sprint_id", sprintId);
      const { data, error } = await query;
      if (error) throw error;

      const rows = (data || []) as Array<TeamTask & {
        certifications?: TeamTask["certification"];
        teams?: TeamTask["team"];
        team_sprints?: TeamTask["sprint"];
      }>;

      // assignees (union of primary + array)
      const assigneeIds = [
        ...new Set(
          rows.flatMap((r) => {
            const ids = Array.isArray(r.assignees) ? r.assignees : [];
            return [...ids, r.assigned_to].filter((v): v is string => !!v);
          })
        ),
      ];
      const assigneeMap = new Map<string, NonNullable<TeamTask["assignee"]>>();
      if (assigneeIds.length) {
        const { data: profiles } = await sb
          .from("profiles")
          .select("id, display_name, full_name, email")
          .in("id", assigneeIds);
        for (const p of (profiles || []) as Array<NonNullable<TeamTask["assignee"]>>) {
          assigneeMap.set(p.id, p);
        }
      }

      return rows.map<TeamTask>((r) => {
        const ids = Array.isArray(r.assignees) ? r.assignees : [];
        return {
          ...r,
          assignees: ids,
          title: r.title ?? r.task_name ?? "",
          certification: r.certifications ?? null,
          team: r.teams ?? null,
          sprint: r.team_sprints ?? null,
          assignee: r.assigned_to ? assigneeMap.get(r.assigned_to) ?? null : null,
          assignee_profiles: ids
            .map((id) => assigneeMap.get(id))
            .filter((p): p is NonNullable<TeamTask["assignee"]> => !!p),
        };
      });
    },
    enabled: !!teamId,
  });
}

// ── Mutations ────────────────────────────────────────────────────────────────

export function useCreateTeam() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (payload: { name: string; description?: string; color?: string }) => {
      if (!user?.id) throw new Error("Not authenticated");
      const { data, error } = await sb
        .from("teams")
        .insert({ ...payload, created_by: user.id })
        .select()
        .single();
      if (error) throw error;
      // creator becomes lead
      await sb.from("team_members").insert({
        team_id: (data as Team).id,
        user_id: user.id,
        role: "lead",
      });
      return data as Team;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teams"] });
      toast({ title: "Team created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useAddTeamMember(teamId: string | undefined) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ userId, role = "member" }: { userId: string; role?: "lead" | "member" }) => {
      if (!teamId) throw new Error("Missing team");
      const { error } = await sb
        .from("team_members")
        .insert({ team_id: teamId, user_id: userId, role });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-members", teamId] });
      toast({ title: "Member added" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useRemoveTeamMember(teamId: string | undefined) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await sb.from("team_members").delete().eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-members", teamId] });
      toast({ title: "Member removed" });
    },
  });
}

export function useCreateSprint(teamId: string | undefined) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (payload: { label: string; start_date?: string; end_date?: string; meeting_notes?: string }) => {
      if (!teamId) throw new Error("Missing team");
      const { data, error } = await sb
        .from("team_sprints")
        .insert({ ...payload, team_id: teamId, created_by: user?.id ?? null })
        .select()
        .single();
      if (error) throw error;
      return data as TeamSprint;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-sprints", teamId] });
      toast({ title: "Sprint created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateSprint(teamId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<TeamSprint> & { id: string }) => {
      const { error } = await sb.from("team_sprints").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team-sprints", teamId] }),
  });
}

export interface CreateTeamTaskInput {
  team_id: string;
  sprint_id?: string | null;
  certification_id?: string | null;
  assigned_to?: string | null;
  title: string;
  description?: string | null;
  priority?: TeamTaskPriority | null;
  due_date?: string | null;
  status?: TeamTaskStatus;
}

export function useCreateTeamTask() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: CreateTeamTaskInput) => {
      const kind: TeamTaskKind = input.certification_id ? "project" : "general";
      const { data, error } = await sb
        .from("project_tasks")
        .insert({
          team_id: input.team_id,
          sprint_id: input.sprint_id ?? null,
          certification_id: input.certification_id ?? null,
          assigned_to: input.assigned_to ?? null,
          task_name: input.title,
          title: input.title,
          description: input.description ?? null,
          priority: input.priority ?? null,
          due_date: input.due_date ?? null,
          end_date: input.due_date ?? null,
          status: input.status ?? "todo",
          task_kind: kind,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["team-tasks", vars.team_id] });
      qc.invalidateQueries({ queryKey: ["my-tasks"] });
      if (vars.certification_id) {
        qc.invalidateQueries({ queryKey: ["certification-tasks", vars.certification_id] });
      }
      toast({ title: "Task created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateTeamTask(teamId: string | undefined) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<TeamTask> & { id: string }) => {
      const { error } = await sb.from("project_tasks").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-tasks", teamId] });
      qc.invalidateQueries({ queryKey: ["my-tasks"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteTeamTask(teamId: string | undefined) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("project_tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-tasks", teamId] });
      qc.invalidateQueries({ queryKey: ["my-tasks"] });
      toast({ title: "Task deleted" });
    },
  });
}

/** General/team tasks assigned to the current user (no certification). */
export function useMyGeneralTasks() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-general-tasks", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await sb
        .from("project_tasks")
        .select("*, teams:team_id(id, name, color), team_sprints:sprint_id(id, label)")
        .eq("assigned_to", user.id)
        .is("certification_id", null)
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(200);
      if (error) throw error;
      return ((data || []) as Array<TeamTask & {
        teams?: TeamTask["team"]; team_sprints?: TeamTask["sprint"];
      }>).map<TeamTask>((r) => ({
        ...r,
        title: r.title ?? r.task_name ?? "",
        team: r.teams ?? null,
        sprint: r.team_sprints ?? null,
      }));
    },
    enabled: !!user?.id,
  });
}

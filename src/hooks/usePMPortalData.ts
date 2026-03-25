import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CertWbsPhase, CertTask, CertTaskStatus } from "@/types/custom-tables";

// ─── PM's projects ───
export function usePMProjects(userId: string | undefined) {
  return useQuery({
    queryKey: ["pm-projects", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("projects")
        .select("*, profiles!projects_pm_id_fkey(full_name), sites!projects_site_id_fkey(name, city)")
        .eq("pm_id", userId)
        .order("handover_date", { ascending: true });
      if (error) throw error;
      return (data || []) as any[];
    },
  });
}

// ─── Cert WBS Phases for a project ───
export function useCertPhases(projectId: string | undefined) {
  return useQuery({
    queryKey: ["cert-phases", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("cert_wbs_phases")
        .select("*")
        .eq("project_id", projectId)
        .order("order_index", { ascending: true });
      if (error) throw error;
      return (data || []) as CertWbsPhase[];
    },
  });
}

// ─── Cert Tasks for a project ───
export function useCertTasksByProject(projectId: string | undefined) {
  return useQuery({
    queryKey: ["cert-tasks-project", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("cert_tasks")
        .select("*, profiles!cert_tasks_assignee_id_fkey(id, full_name)")
        .eq("project_id", projectId)
        .order("start_date", { ascending: true });
      if (error) throw error;
      return (data || []) as (CertTask & { profiles?: { id: string; full_name: string | null } })[];
    },
  });
}

// ─── All cert tasks for all PM projects ───
export function useAllPMCertTasks(projectIds: string[]) {
  return useQuery({
    queryKey: ["cert-tasks-all-pm", projectIds],
    enabled: projectIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("cert_tasks")
        .select("*, profiles!cert_tasks_assignee_id_fkey(id, full_name), projects!cert_tasks_project_id_fkey(id, name)")
        .in("project_id", projectIds)
        .order("start_date", { ascending: true });
      if (error) throw error;
      return (data || []) as any[];
    },
  });
}

// ─── Operational profiles (DM, specialist, cxa, energy_modeler) ───
export function useOperationalProfiles() {
  return useQuery({
    queryKey: ["operational-profiles"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["document_manager", "specialist", "cxa", "energy_modeler"]);
      if (error) throw error;
      const userIds = [...new Set((data || []).map((r: any) => r.user_id))] as string[];
      if (userIds.length === 0) return [];
      const { data: profiles, error: pErr } = await (supabase as any)
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);
      if (pErr) throw pErr;
      // Attach roles
      return (profiles || []).map((p: any) => ({
        ...p,
        roles: (data || []).filter((r: any) => r.user_id === p.id).map((r: any) => r.role),
      }));
    },
  });
}

// ─── Tasks for a specific assignee ───
export function useCertTasksByAssignee(assigneeId: string | undefined) {
  return useQuery({
    queryKey: ["cert-tasks-assignee", assigneeId],
    enabled: !!assigneeId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("cert_tasks")
        .select("*, projects!cert_tasks_project_id_fkey(id, name), cert_wbs_phases!cert_tasks_phase_id_fkey(id, name)")
        .eq("assignee_id", assigneeId)
        .order("start_date", { ascending: true });
      if (error) throw error;
      return (data || []) as any[];
    },
  });
}

// ─── Mutations ───
export function useAddPhase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, name, orderIndex }: { projectId: string; name: string; orderIndex: number }) => {
      const { data, error } = await (supabase as any)
        .from("cert_wbs_phases")
        .insert({ project_id: projectId, name, order_index: orderIndex })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["cert-phases", vars.projectId] });
    },
  });
}

export function useAddCertTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (task: {
      project_id: string;
      phase_id?: string | null;
      title: string;
      description?: string;
      status?: CertTaskStatus;
      start_date?: string;
      end_date?: string;
      assignee_id?: string | null;
      dependencies?: string[];
    }) => {
      const { data, error } = await (supabase as any)
        .from("cert_tasks")
        .insert(task)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["cert-tasks-project", vars.project_id] });
      qc.invalidateQueries({ queryKey: ["cert-tasks-all-pm"] });
      qc.invalidateQueries({ queryKey: ["cert-tasks-assignee"] });
    },
  });
}

export function useDeletePhase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ phaseId, projectId }: { phaseId: string; projectId: string }) => {
      const { error } = await (supabase as any)
        .from("cert_wbs_phases")
        .delete()
        .eq("id", phaseId);
      if (error) throw error;
      return projectId;
    },
    onSuccess: (projectId) => {
      qc.invalidateQueries({ queryKey: ["cert-phases", projectId] });
    },
  });
}

export function useDeleteCertTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, projectId }: { taskId: string; projectId: string }) => {
      const { error } = await (supabase as any)
        .from("cert_tasks")
        .delete()
        .eq("id", taskId);
      if (error) throw error;
      return projectId;
    },
    onSuccess: (projectId) => {
      qc.invalidateQueries({ queryKey: ["cert-tasks-project", projectId] });
      qc.invalidateQueries({ queryKey: ["cert-tasks-all-pm"] });
    },
  });
}

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { differenceInDays } from "date-fns";

export interface CertTaskRow {
  id: string;
  project_id: string;
  phase_id: string | null;
  title: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  assignee_id: string | null;
  dependencies: string[];
  created_at: string;
  projects?: { id: string; name: string; client: string; region: string; pm_id: string | null; handover_date: string; status: string; site_id: string | null };
  profiles?: { id: string; full_name: string | null };
}

export interface CertPaymentRow {
  id: string;
  project_id: string;
  name: string;
  amount: number;
  due_date: string | null;
  status: string;
  trigger_task_id: string | null;
  projects?: { id: string; name: string; client: string };
  trigger_task?: { id: string; title: string; status: string } | null;
}

export interface ProjectRow {
  id: string;
  name: string;
  client: string;
  region: string;
  pm_id: string | null;
  handover_date: string;
  status: string;
  site_id: string | null;
  profiles?: { full_name: string | null };
}

export function useCertTasks() {
  return useQuery({
    queryKey: ["ceo-cert-tasks"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("cert_tasks")
        .select("*, projects!cert_tasks_project_id_fkey(id, name, client, region, pm_id, handover_date, status, site_id), profiles!cert_tasks_assignee_id_fkey(id, full_name)")
        .order("end_date", { ascending: true });
      if (error) throw error;
      return (data || []) as CertTaskRow[];
    },
  });
}

export function useCertPayments() {
  return useQuery({
    queryKey: ["ceo-cert-payments"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("cert_payment_milestones")
        .select("*, projects!cert_payment_milestones_project_id_fkey(id, name, client), trigger_task:cert_tasks!cert_payment_milestones_trigger_task_id_fkey(id, title, status)")
        .order("due_date", { ascending: true });
      if (error) throw error;
      return (data || []) as CertPaymentRow[];
    },
  });
}

export function useActiveProjects() {
  return useQuery({
    queryKey: ["ceo-active-projects-v2"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("projects")
        .select("*, profiles!projects_pm_id_fkey(full_name)")
        .in("status", ["Design", "Construction"])
        .order("handover_date", { ascending: true });
      if (error) throw error;
      return (data || []) as ProjectRow[];
    },
  });
}

// Derived computations
export function computeProjectStatus(tasks: CertTaskRow[]) {
  const today = new Date();
  const byProject = new Map<string, { name: string; tasks: CertTaskRow[] }>();

  for (const t of tasks) {
    const pid = t.project_id;
    if (!byProject.has(pid)) {
      byProject.set(pid, { name: t.projects?.name || pid, tasks: [] });
    }
    byProject.get(pid)!.tasks.push(t);
  }

  let late = 0, inProgress = 0, toStart = 0;
  const lateProjects: { name: string; daysLate: number }[] = [];

  for (const [, proj] of byProject) {
    const incompleteTasks = proj.tasks.filter(t => t.status !== "Completed");
    const hasLate = incompleteTasks.some(t => t.end_date && new Date(t.end_date) < today);

    if (hasLate) {
      late++;
      const maxDays = Math.max(
        ...incompleteTasks
          .filter(t => t.end_date && new Date(t.end_date) < today)
          .map(t => differenceInDays(today, new Date(t.end_date!)))
      );
      lateProjects.push({ name: proj.name, daysLate: maxDays });
    } else if (incompleteTasks.some(t => t.status === "In_Progress")) {
      inProgress++;
    } else {
      toStart++;
    }
  }

  return { late, inProgress, toStart, lateProjects, byProject };
}

export function computeOverduePayments(payments: CertPaymentRow[]) {
  const today = new Date();
  const overdue = payments.filter(p => p.status === "Overdue" && p.due_date);

  const byProject = new Map<string, { name: string; daysOverdue: number; amount: number }>();
  for (const p of overdue) {
    const days = differenceInDays(today, new Date(p.due_date!));
    const key = p.project_id;
    const existing = byProject.get(key);
    if (!existing || days > existing.daysOverdue) {
      byProject.set(key, {
        name: p.projects?.name || key,
        daysOverdue: days,
        amount: (existing?.amount || 0) + Number(p.amount),
      });
    } else {
      existing.amount += Number(p.amount);
    }
  }

  return Array.from(byProject.values());
}

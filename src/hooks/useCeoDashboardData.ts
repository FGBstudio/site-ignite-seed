import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { differenceInDays } from "date-fns";

export interface CertTaskRow {
  id: string;
  certification_id: string;
  phase_id: string | null;
  title: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  assignee_id: string | null;
  dependencies: string[];
  created_at: string;
  certifications?: { id: string; name: string; client: string; region: string; pm_id: string | null; handover_date: string; status: string; site_id: string | null };
  profiles?: { id: string; full_name: string | null };
}

export interface CertPaymentRow {
  id: string;
  certification_id: string;
  name: string;
  amount: number;
  due_date: string | null;
  status: string;
  trigger_task_id: string | null;
  certifications?: { id: string; name: string; client: string };
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
  cert_type: string | null;
  cert_rating: string | null;
  pm_display_name?: string | null;
}

export function useCertTasks() {
  return useQuery({
    queryKey: ["ceo-cert-tasks"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("cert_tasks")
        .select("*, certifications!cert_tasks_certification_id_fkey(id, name, client, region, pm_id, handover_date, status, site_id), profiles!cert_tasks_assignee_id_fkey(id, full_name)")
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
        .select("*, certifications!cert_payment_milestones_certification_id_fkey(id, name, client), trigger_task:cert_tasks!cert_payment_milestones_trigger_task_id_fkey(id, title, status)")
        .order("due_date", { ascending: true });
      if (error) throw error;
      return (data || []) as CertPaymentRow[];
    },
  });
}

export function useActiveProjects() {
  return useQuery({
    queryKey: ["ceo-all-certifications"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("certifications")
        .select("*")
        .order("handover_date", { ascending: true });
      if (error) throw error;
      const certs = (data || []) as any[];

      // Fetch PM profiles separately
      const pmIds = [...new Set(certs.map((c) => c.pm_id).filter(Boolean))] as string[];
      let profileMap = new Map<string, string>();
      if (pmIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, display_name, email")
          .in("id", pmIds);
        if (profiles) {
          for (const pr of profiles) {
            profileMap.set(pr.id, pr.display_name || pr.full_name || pr.email || pr.id);
          }
        }
      }

      return certs.map((c): ProjectRow => ({
        id: c.id,
        name: c.name || c.cert_type || "Unnamed",
        client: c.client,
        region: c.region,
        pm_id: c.pm_id,
        handover_date: c.handover_date,
        status: c.status,
        site_id: c.site_id,
        cert_type: c.cert_type,
        cert_rating: c.cert_rating || c.level,
        pm_display_name: c.pm_id ? profileMap.get(c.pm_id) || null : null,
      }));
    },
  });
}

// Derived computations
export function computeProjectStatus(projects: ProjectRow[], tasks: CertTaskRow[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tasksByProject = new Map<string, CertTaskRow[]>();
  for (const t of tasks) {
    if (!tasksByProject.has(t.certification_id)) tasksByProject.set(t.certification_id, []);
    tasksByProject.get(t.certification_id)!.push(t);
  }

  let inRitardo = 0;
  let inCorso = 0;
  let daConfigurare = 0;
  let certificati = 0;
  const lateProjects: { name: string; daysLate: number }[] = [];

  for (const p of projects) {
    if (p.status === "certificato" || p.status === "certified" || p.status === "active") {
      certificati++;
      continue;
    }

    if (!p.status || p.status === "pending" || p.status === "da_configurare" || p.status === "in_progress") {
      // Check if it's actually configured
      const pTasks = tasksByProject.get(p.id) || [];
      if (pTasks.length === 0 && (!p.status || p.status === "pending" || p.status === "da_configurare")) {
        daConfigurare++;
        continue;
      }
    }

    let isLate = false;
    let maxDaysLate = 0;

    if (p.handover_date) {
      const handover = new Date(p.handover_date);
      if (handover < today) {
        isLate = true;
        maxDaysLate = Math.max(maxDaysLate, differenceInDays(today, handover));
      }
    }

    const pTasks = tasksByProject.get(p.id) || [];
    const incompleteTasks = pTasks.filter(t => t.status !== "Completed");
    for (const t of incompleteTasks) {
      if (t.end_date) {
        const endDate = new Date(t.end_date);
        if (endDate < today) {
          isLate = true;
          maxDaysLate = Math.max(maxDaysLate, differenceInDays(today, endDate));
        }
      }
    }

    if (isLate) {
      inRitardo++;
      lateProjects.push({ name: p.name, daysLate: maxDaysLate });
    } else {
      inCorso++;
    }
  }

  return { inRitardo, inCorso, daConfigurare, certificati, lateProjects };
}

export function computeOverduePayments(payments: CertPaymentRow[]) {
  const today = new Date();
  const overdue = payments.filter(p => p.status === "Overdue" && p.due_date);

  const byProject = new Map<string, { name: string; daysOverdue: number; amount: number }>();
  for (const p of overdue) {
    const days = differenceInDays(today, new Date(p.due_date!));
    const key = p.certification_id;
    const existing = byProject.get(key);
    if (!existing || days > existing.daysOverdue) {
      byProject.set(key, {
        name: p.certifications?.name || key,
        daysOverdue: days,
        amount: (existing?.amount || 0) + Number(p.amount),
      });
    } else {
      existing.amount += Number(p.amount);
    }
  }

  return Array.from(byProject.values());
}

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
    queryKey: ["ceo-all-projects-v3"], // Cache key aggiornata
    queryFn: async () => {
      // FIX: Rimosso il filtro di stato per includere Da Configurare e Certificati
      const { data, error } = await (supabase as any)
        .from("projects")
        .select("*, profiles!projects_pm_id_fkey(full_name)")
        .order("handover_date", { ascending: true });
      if (error) throw error;
      return (data || []) as ProjectRow[];
    },
  });
}

// Derived computations (Nuova logica connessa agli status del PM)
export function computeProjectStatus(projects: ProjectRow[], tasks: CertTaskRow[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tasksByProject = new Map<string, CertTaskRow[]>();
  for (const t of tasks) {
    if (!tasksByProject.has(t.project_id)) tasksByProject.set(t.project_id, []);
    tasksByProject.get(t.project_id)!.push(t);
  }

  let inRitardo = 0;
  let inCorso = 0;
  let daConfigurare = 0;
  let certificati = 0;
  const lateProjects: { name: string; daysLate: number }[] = [];

  for (const p of projects) {
    // 1. Certificati (Stato definitivo chiuso dal PM)
    if (p.status === "certificato" || p.status === "certified") {
      certificati++;
      continue;
    }

    // 2. Da Configurare (Progetti nuovi appena assegnati o non inizializzati)
    if (!p.status || p.status === "pending" || p.status === "da_configurare") {
      daConfigurare++;
      continue;
    }

    // 3. In Corso vs In Ritardo (Se non è certificato né da configurare, è attivo)
    let isLate = false;
    let maxDaysLate = 0;

    // A. Controllo sul ritardo del progetto generale (Handover Date)
    if (p.handover_date) {
      const handover = new Date(p.handover_date);
      if (handover < today) {
        isLate = true;
        maxDaysLate = Math.max(maxDaysLate, differenceInDays(today, handover));
      }
    }

    // B. Controllo sulle singole Task operative assegnate (Gantt)
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

    // Smistamento finale
    if (isLate) {
      inRitardo++;
      lateProjects.push({ name: p.name, daysLate: maxDaysLate });
    } else {
      inCorso++; // Il cantiere è attivo e le scadenze (task e handover) sono in regola
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

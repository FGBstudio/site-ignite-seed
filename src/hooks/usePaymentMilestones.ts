import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface PaymentMilestone {
  id: string;
  project_id: string;
  milestone_name: string;
  amount: number;
  status: "pending" | "invoiced" | "paid";
  due_date: string | null;
  created_at: string;
}

export function usePaymentMilestones(projectId: string | undefined) {
  return useQuery({
    queryKey: ["payment-milestones", projectId],
    queryFn: async () => {
      if (!projectId) throw new Error("No project ID");
      const { data, error } = await supabase
        .from("payment_milestones" as any)
        .select("*")
        .eq("project_id", projectId)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as PaymentMilestone[];
    },
    enabled: !!projectId,
  });
}

export function useAllOverduePayments() {
  return useQuery({
    queryKey: ["overdue-payments"],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("payment_milestones" as any)
        .select("*, projects!payment_milestones_project_id_fkey(name, client)")
        .eq("status", "pending")
        .lt("due_date", today)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return (data || []) as any[];
    },
  });
}

export function useCreatePayment(projectId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (payment: Partial<PaymentMilestone>) => {
      const { data, error } = await supabase
        .from("payment_milestones" as any)
        .insert({ ...payment, project_id: projectId } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-milestones", projectId] });
      queryClient.invalidateQueries({ queryKey: ["overdue-payments"] });
      toast({ title: "Tranche di pagamento creata" });
    },
    onError: (err: any) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });
}

export function useUpdatePayment(projectId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<PaymentMilestone> & { id: string }) => {
      const { error } = await supabase
        .from("payment_milestones" as any)
        .update(updates as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-milestones", projectId] });
      queryClient.invalidateQueries({ queryKey: ["overdue-payments"] });
      // Also invalidate tasks since blocking logic depends on payment status
      queryClient.invalidateQueries({ queryKey: ["project-tasks", projectId] });
      toast({ title: "Pagamento aggiornato" });
    },
    onError: (err: any) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });
}

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface PaymentMilestone {
  id: string;
  certification_id: string;
  milestone_name: string;
  amount: number;
  status: "pending" | "invoiced" | "paid";
  due_date: string | null;
  created_at: string;
}

export function usePaymentMilestones(certificationId: string | undefined) {
  return useQuery({
    queryKey: ["payment-milestones", certificationId],
    queryFn: async () => {
      if (!certificationId) throw new Error("No certification ID");
      const { data, error } = await supabase
        .from("payment_milestones" as any)
        .select("*")
        .eq("certification_id", certificationId)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as PaymentMilestone[];
    },
    enabled: !!certificationId,
  });
}

export function useAllOverduePayments() {
  return useQuery({
    queryKey: ["overdue-payments"],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const { data, error } = await (supabase as any)
        .from("payment_milestones")
        .select("*, certifications!payment_milestones_certification_id_fkey(name, client)")
        .eq("status", "pending")
        .lt("due_date", today)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return (data || []) as any[];
    },
  });
}

export function useCreatePayment(certificationId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (payment: Partial<PaymentMilestone>) => {
      const { data, error } = await supabase
        .from("payment_milestones" as any)
        .insert({ ...payment, certification_id: certificationId } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-milestones", certificationId] });
      queryClient.invalidateQueries({ queryKey: ["overdue-payments"] });
      toast({ title: "Tranche di pagamento creata" });
    },
    onError: (err: any) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });
}

export function useUpdatePayment(certificationId: string | undefined) {
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
      queryClient.invalidateQueries({ queryKey: ["payment-milestones", certificationId] });
      queryClient.invalidateQueries({ queryKey: ["overdue-payments"] });
      queryClient.invalidateQueries({ queryKey: ["certification-tasks", certificationId] });
      toast({ title: "Pagamento aggiornato" });
    },
    onError: (err: any) => {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    },
  });
}

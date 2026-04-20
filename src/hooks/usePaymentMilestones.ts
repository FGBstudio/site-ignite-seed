import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import type { PaymentSchemeId, TriggerEvent } from "@/lib/paymentSchemes";

export type PaymentStatus = "Pending" | "Due" | "Invoiced" | "Paid" | "Overdue";

export interface PaymentMilestone {
  id: string;
  certification_id: string;
  name: string;
  amount: number;
  status: PaymentStatus;
  due_date: string | null;
  created_at: string;
  // Scheme metadata
  payment_scheme: PaymentSchemeId | null;
  tranche_pct: number | null;
  tranche_order: number | null;
  trigger_event: TriggerEvent | null;
  // Admin confirmation
  invoice_sent_date: string | null;
  invoice_sent_by: string | null;
  payment_received_date: string | null;
  payment_received_by: string | null;
  trigger_task_id: string | null;
}

export function usePaymentMilestones(certificationId: string | undefined) {
  return useQuery({
    queryKey: ["cert-payment-milestones", certificationId],
    queryFn: async () => {
      if (!certificationId) throw new Error("No certification ID");
      const { data, error } = await (supabase as any)
        .from("cert_payment_milestones")
        .select("*")
        .eq("certification_id", certificationId)
        .order("tranche_order", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });
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
        .from("cert_payment_milestones")
        .select("*, certifications!cert_payment_milestones_certification_id_fkey(name, client)")
        .in("status", ["Pending", "Due"])
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
      const { data, error } = await (supabase as any)
        .from("cert_payment_milestones")
        .insert({ ...payment, certification_id: certificationId })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cert-payment-milestones", certificationId] });
      queryClient.invalidateQueries({ queryKey: ["overdue-payments"] });
      toast({ title: "Payment tranche created" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useUpdatePayment(certificationId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<PaymentMilestone> & { id: string }) => {
      const { error } = await (supabase as any)
        .from("cert_payment_milestones")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cert-payment-milestones", certificationId] });
      queryClient.invalidateQueries({ queryKey: ["overdue-payments"] });
      queryClient.invalidateQueries({ queryKey: ["financial-alerts"] });
      toast({ title: "Payment updated" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

/**
 * Admin-only: confirm an invoice has been issued for a tranche.
 * Updates the row, writes a Project Canvas entry, and resolves any open
 * billing_due alerts for the same tranche.
 */
export function useConfirmInvoiceSent(certificationId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ payment, date, note }: { payment: PaymentMilestone; date: string; note?: string }) => {
      if (!user?.id) throw new Error("Not authenticated");

      // 1) update the payment row
      const { error: upErr } = await (supabase as any)
        .from("cert_payment_milestones")
        .update({
          status: "Invoiced",
          invoice_sent_date: date,
          invoice_sent_by: user.id,
        })
        .eq("id", payment.id);
      if (upErr) throw upErr;

      // 2) write a canvas entry
      const content = `Invoice issued — ${payment.name}\nAmount: €${Number(payment.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}\nDate: ${date}${note ? `\nNote: ${note}` : ""}`;
      await (supabase as any)
        .from("project_canvas_entries")
        .insert({
          certification_id: payment.certification_id,
          author_id: user.id,
          entry_type: "payment_invoice_sent",
          content,
        });

      // 3) auto-resolve open billing_due alerts for this certification
      await (supabase as any)
        .from("task_alerts")
        .update({ is_resolved: true, resolved_at: new Date().toISOString() })
        .eq("certification_id", payment.certification_id)
        .eq("alert_type", "billing_due")
        .eq("is_resolved", false);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cert-payment-milestones", certificationId] });
      queryClient.invalidateQueries({ queryKey: ["canvas-entries", certificationId] });
      queryClient.invalidateQueries({ queryKey: ["task-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["financial-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["overdue-payments"] });
      toast({ title: "Invoice confirmed", description: "Canvas updated and alert resolved." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

/**
 * Admin-only: confirm a payment has been received for a tranche.
 * Updates the row and writes a Project Canvas entry.
 */
export function useConfirmPaymentReceived(certificationId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ payment, date, note }: { payment: PaymentMilestone; date: string; note?: string }) => {
      if (!user?.id) throw new Error("Not authenticated");

      const { error: upErr } = await (supabase as any)
        .from("cert_payment_milestones")
        .update({
          status: "Paid",
          payment_received_date: date,
          payment_received_by: user.id,
        })
        .eq("id", payment.id);
      if (upErr) throw upErr;

      const content = `Payment received — ${payment.name}\nAmount: €${Number(payment.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}\nDate: ${date}${note ? `\nNote: ${note}` : ""}`;
      await (supabase as any)
        .from("project_canvas_entries")
        .insert({
          certification_id: payment.certification_id,
          author_id: user.id,
          entry_type: "payment_received",
          content,
        });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cert-payment-milestones", certificationId] });
      queryClient.invalidateQueries({ queryKey: ["canvas-entries", certificationId] });
      queryClient.invalidateQueries({ queryKey: ["financial-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["overdue-payments"] });
      toast({ title: "Payment confirmed", description: "Canvas updated." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

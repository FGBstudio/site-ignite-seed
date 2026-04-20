import { useMemo, useState } from "react";
import {
  usePaymentMilestones,
  useUpdatePayment,
  useConfirmInvoiceSent,
  useConfirmPaymentReceived,
  type PaymentMilestone,
  type PaymentStatus,
} from "@/hooks/usePaymentMilestones";
import { useAuth } from "@/contexts/AuthContext";
import { PAYMENT_SCHEMES, TRIGGER_LABELS, type TriggerEvent } from "@/lib/paymentSchemes";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Loader2, CheckCircle, Clock, FileText, Receipt, AlertCircle, Euro } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const STATUS_META: Record<PaymentStatus, { label: string; color: string; Icon: any }> = {
  Pending:  { label: "Pending",   color: "bg-muted text-muted-foreground border-border",                Icon: Clock },
  Due:      { label: "Due",       color: "bg-warning/10 text-warning border-warning/30",                Icon: AlertCircle },
  Invoiced: { label: "Invoiced",  color: "bg-primary/10 text-primary border-primary/20",                Icon: FileText },
  Paid:     { label: "Paid",      color: "bg-success/10 text-success border-success/20",                Icon: CheckCircle },
  Overdue:  { label: "Overdue",   color: "bg-destructive/10 text-destructive border-destructive/30",   Icon: AlertCircle },
};

interface Props {
  projectId: string;
}

export function ProjectPayments({ projectId }: Props) {
  const { isAdmin } = useAuth();
  const { data: payments = [], isLoading } = usePaymentMilestones(projectId);
  const updatePayment = useUpdatePayment(projectId);
  const confirmInvoice = useConfirmInvoiceSent(projectId);
  const confirmReceived = useConfirmPaymentReceived(projectId);

  const [invoiceDialog, setInvoiceDialog] = useState<{ payment: PaymentMilestone; date: string; note: string } | null>(null);
  const [receivedDialog, setReceivedDialog] = useState<{ payment: PaymentMilestone; date: string; note: string } | null>(null);

  const { totalAmount, paidAmount, invoicedAmount, dueAmount, scheme } = useMemo(() => {
    const total = payments.reduce((s, p) => s + Number(p.amount), 0);
    const paid = payments.filter((p) => p.status === "Paid").reduce((s, p) => s + Number(p.amount), 0);
    const invoiced = payments.filter((p) => p.status === "Invoiced").reduce((s, p) => s + Number(p.amount), 0);
    const due = payments.filter((p) => p.status === "Due" || p.status === "Overdue").reduce((s, p) => s + Number(p.amount), 0);
    const sch = payments.find((p) => p.payment_scheme)?.payment_scheme ?? null;
    return { totalAmount: total, paidAmount: paid, invoicedAmount: invoiced, dueAmount: due, scheme: sch };
  }, [payments]);

  const pct = (n: number) => (totalAmount > 0 ? (n / totalAmount) * 100 : 0);

  const openInvoice = (p: PaymentMilestone) =>
    setInvoiceDialog({ payment: p, date: new Date().toISOString().slice(0, 10), note: "" });

  const openReceived = (p: PaymentMilestone) =>
    setReceivedDialog({ payment: p, date: new Date().toISOString().slice(0, 10), note: "" });

  const handleConfirmInvoice = async () => {
    if (!invoiceDialog) return;
    await confirmInvoice.mutateAsync({ payment: invoiceDialog.payment, date: invoiceDialog.date, note: invoiceDialog.note || undefined });
    setInvoiceDialog(null);
  };

  const handleConfirmReceived = async () => {
    if (!receivedDialog) return;
    await confirmReceived.mutateAsync({ payment: receivedDialog.payment, date: receivedDialog.date, note: receivedDialog.note || undefined });
    setReceivedDialog(null);
  };

  // Mark Due if a Pending/Due tranche is past due_date and not yet invoiced/paid (visual hint)
  const today = new Date().toISOString().slice(0, 10);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header summary */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Euro className="h-4 w-4 text-primary" /> Invoicing & Payments
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {scheme ? `Scheme: ${PAYMENT_SCHEMES[scheme].label}` : "No scheme assigned"} · Total €{totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </p>
        </div>
        {!isAdmin && (
          <Badge variant="outline" className="text-[10px] gap-1 border-muted">
            Read-only · You'll receive an alert when a tranche is due
          </Badge>
        )}
      </div>

      {/* Stacked progress bar */}
      {payments.length > 0 && totalAmount > 0 && (
        <div className="space-y-2">
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="bg-success" style={{ width: `${pct(paidAmount)}%` }} />
            <div className="bg-primary" style={{ width: `${pct(invoicedAmount)}%` }} />
            <div className="bg-warning" style={{ width: `${pct(dueAmount)}%` }} />
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-success" />Paid €{paidAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary" />Invoiced €{invoicedAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-warning" />Due €{dueAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
      )}

      {payments.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            No payment tranches yet. The invoicing scheme is selected during quotation creation.
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="border-b">
                <th className="text-left p-3 font-medium text-muted-foreground w-10">#</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Tranche</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Trigger</th>
                <th className="text-right p-3 font-medium text-muted-foreground">Amount</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Due Date</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                {isAdmin && <th className="text-right p-3 font-medium text-muted-foreground">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {payments.map((p, i) => {
                const overdue =
                  (p.status === "Pending" || p.status === "Due") && p.due_date && p.due_date < today;
                const effectiveStatus: PaymentStatus = overdue ? "Overdue" : p.status;
                const meta = STATUS_META[effectiveStatus] || STATUS_META.Pending;
                const StatusIcon = meta.Icon;
                const trigger = (p.trigger_event as TriggerEvent | null) || "manual_sal";

                return (
                  <tr key={p.id} className={cn("border-b last:border-b-0 transition-colors", overdue && "bg-destructive/5")}>
                    <td className="p-3 text-muted-foreground font-mono text-xs">{p.tranche_order ?? i + 1}</td>
                    <td className="p-3 font-medium text-foreground">
                      {p.name}
                      {p.tranche_pct != null && (
                        <span className="ml-1.5 text-xs text-muted-foreground">({p.tranche_pct}%)</span>
                      )}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">{TRIGGER_LABELS[trigger]}</td>
                    <td className="p-3 text-right font-mono text-foreground">
                      €{Number(p.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-3">
                      {p.due_date ? (
                        <span className={cn(overdue && "text-destructive font-medium")}>
                          {format(new Date(p.due_date), "dd MMM yyyy")}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className={cn("text-xs gap-1", meta.color)}>
                        <StatusIcon className="h-3 w-3" />
                        {meta.label}
                      </Badge>
                    </td>
                    {isAdmin && (
                      <td className="p-3">
                        <div className="flex justify-end gap-1.5">
                          {(p.status === "Pending" || p.status === "Due" || effectiveStatus === "Overdue") && (
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => openInvoice(p)}>
                              <FileText className="h-3 w-3" /> Invoice sent
                            </Button>
                          )}
                          {p.status === "Invoiced" && (
                            <Button size="sm" className="h-7 text-xs gap-1 bg-success hover:bg-success/90" onClick={() => openReceived(p)}>
                              <Receipt className="h-3 w-3" /> Payment received
                            </Button>
                          )}
                          {p.status === "Paid" && (
                            <span className="text-xs text-success font-medium flex items-center gap-1">
                              <CheckCircle className="h-3 w-3" /> Settled
                            </span>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirm Invoice Sent dialog (Admin) */}
      <Dialog open={!!invoiceDialog} onOpenChange={(o) => !o && setInvoiceDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileText className="h-4 w-4" /> Confirm invoice sent</DialogTitle>
            <DialogDescription>
              Records the invoice issuance, updates the project canvas and resolves the billing alert.
            </DialogDescription>
          </DialogHeader>
          {invoiceDialog && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <p className="font-medium text-foreground">{invoiceDialog.payment.name}</p>
                <p className="text-muted-foreground text-xs mt-0.5">
                  €{Number(invoiceDialog.payment.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Invoice date</Label>
                <Input type="date" value={invoiceDialog.date} onChange={(e) => setInvoiceDialog({ ...invoiceDialog, date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Note (optional)</Label>
                <Textarea
                  placeholder="e.g. Invoice number INV-2024-001"
                  value={invoiceDialog.note}
                  onChange={(e) => setInvoiceDialog({ ...invoiceDialog, note: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvoiceDialog(null)}>Cancel</Button>
            <Button onClick={handleConfirmInvoice} disabled={confirmInvoice.isPending || !invoiceDialog?.date}>
              {confirmInvoice.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Payment Received dialog (Admin) */}
      <Dialog open={!!receivedDialog} onOpenChange={(o) => !o && setReceivedDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Receipt className="h-4 w-4" /> Confirm payment received</DialogTitle>
            <DialogDescription>
              Marks the tranche as paid and records it in the project canvas.
            </DialogDescription>
          </DialogHeader>
          {receivedDialog && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <p className="font-medium text-foreground">{receivedDialog.payment.name}</p>
                <p className="text-muted-foreground text-xs mt-0.5">
                  €{Number(receivedDialog.payment.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Payment date</Label>
                <Input type="date" value={receivedDialog.date} onChange={(e) => setReceivedDialog({ ...receivedDialog, date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Note (optional)</Label>
                <Textarea
                  placeholder="e.g. Wire transfer, ref. ABC-123"
                  value={receivedDialog.note}
                  onChange={(e) => setReceivedDialog({ ...receivedDialog, note: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceivedDialog(null)}>Cancel</Button>
            <Button onClick={handleConfirmReceived} disabled={confirmReceived.isPending || !receivedDialog?.date}>
              {confirmReceived.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

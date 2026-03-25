import { useState } from "react";
import { usePaymentMilestones, useCreatePayment, useUpdatePayment, PaymentMilestone } from "@/hooks/usePaymentMilestones";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Loader2, CheckCircle, Clock, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { it } from "date-fns/locale";

const STATUS_LABELS: Record<string, string> = {
  pending: "In attesa",
  invoiced: "Fatturato",
  paid: "Pagato",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-warning/10 text-warning border-warning/20",
  invoiced: "bg-primary/10 text-primary border-primary/20",
  paid: "bg-success/10 text-success border-success/20",
};

const STATUS_ICONS: Record<string, any> = {
  pending: Clock,
  invoiced: FileText,
  paid: CheckCircle,
};

interface Props {
  projectId: string;
}

export function ProjectPayments({ projectId }: Props) {
  const { data: payments = [], isLoading } = usePaymentMilestones(projectId);
  const createPayment = useCreatePayment(projectId);
  const updatePayment = useUpdatePayment(projectId);

  const [showNew, setShowNew] = useState(false);
  const [newPayment, setNewPayment] = useState({ milestone_name: "", amount: "", due_date: "" });

  const handleCreate = async () => {
    if (!newPayment.milestone_name.trim() || !newPayment.amount) return;
    await createPayment.mutateAsync({
      milestone_name: newPayment.milestone_name,
      amount: Number(newPayment.amount),
      due_date: newPayment.due_date || null,
      status: "pending",
    } as any);
    setNewPayment({ milestone_name: "", amount: "", due_date: "" });
    setShowNew(false);
  };

  const handleStatusChange = (payment: PaymentMilestone, newStatus: string) => {
    updatePayment.mutate({ id: payment.id, status: newStatus } as any);
  };

  const totalAmount = payments.reduce((s, p) => s + Number(p.amount), 0);
  const paidAmount = payments.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.amount), 0);

  if (isLoading) {
    return (
      <Card><CardContent className="py-12 flex justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-foreground">Piano Pagamenti</h3>
          <p className="text-xs text-muted-foreground">
            Incassato: €{paidAmount.toLocaleString("it-IT", { minimumFractionDigits: 2 })} / €{totalAmount.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <Button size="sm" onClick={() => setShowNew(true)} className="gap-1">
          <Plus className="h-4 w-4" /> Nuova Tranche
        </Button>
      </div>

      {payments.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nessuna tranche di pagamento. Clicca "Nuova Tranche" per inserire.
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left p-3 font-medium text-muted-foreground">Tranche</th>
                <th className="text-right p-3 font-medium text-muted-foreground">Importo</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Scadenza</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Stato</th>
                <th className="p-3 font-medium text-muted-foreground">Azione</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => {
                const isOverdue = p.status === "pending" && p.due_date && new Date(p.due_date) < new Date();
                const StatusIcon = STATUS_ICONS[p.status];
                return (
                  <tr key={p.id} className={cn("border-b last:border-b-0", isOverdue && "bg-destructive/5")}>
                    <td className="p-3 font-medium text-foreground">{p.milestone_name}</td>
                    <td className="p-3 text-right font-mono text-foreground">€{Number(p.amount).toLocaleString("it-IT", { minimumFractionDigits: 2 })}</td>
                    <td className="p-3">
                      {p.due_date ? (
                        <span className={cn(isOverdue && "text-destructive font-medium")}>
                          {format(new Date(p.due_date), "dd MMM yyyy", { locale: it })}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className={cn("text-xs gap-1", STATUS_COLORS[p.status])}>
                        <StatusIcon className="h-3 w-3" />
                        {STATUS_LABELS[p.status]}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Select value={p.status} onValueChange={(val) => handleStatusChange(p, val)}>
                        <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">In attesa</SelectItem>
                          <SelectItem value="invoiced">Fatturato</SelectItem>
                          <SelectItem value="paid">Pagato</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* New Payment Dialog */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nuova Tranche di Pagamento</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome Tranche *</Label>
              <Input value={newPayment.milestone_name} onChange={(e) => setNewPayment({ ...newPayment, milestone_name: e.target.value })} placeholder="es. Acconto 30%, SAL 1, Saldo finale" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Importo (€) *</Label>
                <Input type="number" min="0" step="0.01" value={newPayment.amount} onChange={(e) => setNewPayment({ ...newPayment, amount: e.target.value })} placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label>Scadenza</Label>
                <Input type="date" value={newPayment.due_date} onChange={(e) => setNewPayment({ ...newPayment, due_date: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Annulla</Button>
            <Button onClick={handleCreate} disabled={createPayment.isPending || !newPayment.milestone_name.trim() || !newPayment.amount}>
              {createPayment.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Crea Tranche
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

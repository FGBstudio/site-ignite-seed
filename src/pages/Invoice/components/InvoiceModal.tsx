import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useInvoiceStore } from "../store/useInvoiceStore";
import { calcDPO } from "../utils";
import type { Currency, Entity, Invoice, InvoiceState } from "../types";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  edit?: Invoice | null;
}

const EMPTY: Omit<Invoice, "id"> = {
  date: "",
  clientEntity: "",
  invoiceNumber: "",
  projectActivity: "",
  activity: "",
  currency: "EUR",
  exchangeRate: "1",
  totPaid: 0,
  vat: "",
  paymentMethod: "",
  dueDate: "",
  notPaid: 0,
  notPaidVat: 0,
  dateOfPayment: "",
  paymentDay: "",
  state: "Unpaid",
  refOrderPO: "",
  totCommessa: 0,
  percFatturato: "",
  percProgressivo: "",
  entrateVere: 0,
  emailRef: "",
  decurtBancarie: 0,
  recall: "",
  statementOfAccount: "",
  entity: "FGB UK",
  dpo: "",
};

export function InvoiceModal({ open, onOpenChange, edit }: Props) {
  const upsert = useInvoiceStore((s) => s.upsertInvoice);
  const { toast } = useToast();
  const [f, setF] = useState<Omit<Invoice, "id"> & { id?: string }>(EMPTY);

  useEffect(() => {
    if (open) setF(edit ? { ...edit } : { ...EMPTY });
  }, [open, edit]);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const num = (v: string) => (v === "" ? 0 : parseFloat(v) || 0);

  const submit = () => {
    if (!f.clientEntity.trim()) {
      toast({ title: "Client entity obbligatorio", variant: "destructive" });
      return;
    }
    upsert({ ...f, dpo: calcDPO(f) });
    toast({ title: edit ? "Fattura aggiornata" : "Fattura aggiunta" });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{edit ? "Modifica fattura" : "Nuova fattura"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2.5">
          <Field label="Data"><Input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} /></Field>
          <Field label="Client Entity"><Input value={f.clientEntity} onChange={(e) => set("clientEntity", e.target.value)} placeholder="es. PRADA SPA" /></Field>
          <Field label="Invoice Number"><Input value={f.invoiceNumber} onChange={(e) => set("invoiceNumber", e.target.value)} placeholder="es. Invoice n.2.942" /></Field>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Project / Activity"><Input value={f.projectActivity} onChange={(e) => set("projectActivity", e.target.value)} placeholder="es. PRADA Cortina" /></Field>
          <Field label="Activity"><Input value={f.activity} onChange={(e) => set("activity", e.target.value)} placeholder="es. LEED ID+C GOLD 100%" /></Field>
        </div>

        <SectionTitle>Valori economici</SectionTitle>

        <div className="grid grid-cols-4 gap-2.5">
          <Field label="Currency">
            <Select value={f.currency} onValueChange={(v) => set("currency", v as Currency)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["EUR","GBP","USD","CHF","JPY","TWD","HKD"] as Currency[]).map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Exchange Rate"><Input type="number" step="0.0001" value={f.exchangeRate} onChange={(e) => set("exchangeRate", e.target.value)} /></Field>
          <Field label="Tot Paid"><Input type="number" value={f.totPaid} onChange={(e) => set("totPaid", num(e.target.value))} /></Field>
          <Field label="VAT (%)"><Input type="number" value={f.vat} onChange={(e) => set("vat", e.target.value)} placeholder="es. 22" /></Field>
        </div>

        <div className="grid grid-cols-4 gap-2.5">
          <Field label="Not Paid"><Input type="number" value={f.notPaid} onChange={(e) => set("notPaid", num(e.target.value))} /></Field>
          <Field label="Not Paid VAT"><Input type="number" value={f.notPaidVat} onChange={(e) => set("notPaidVat", num(e.target.value))} /></Field>
          <Field label="Entrate Vere"><Input type="number" value={f.entrateVere} onChange={(e) => set("entrateVere", num(e.target.value))} /></Field>
          <Field label="Decurt. Bancarie"><Input type="number" value={f.decurtBancarie} onChange={(e) => set("decurtBancarie", num(e.target.value))} /></Field>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          <Field label="Tot Commessa"><Input type="number" value={f.totCommessa} onChange={(e) => set("totCommessa", num(e.target.value))} /></Field>
          <Field label="% Fatturato"><Input type="number" step="0.01" value={f.percFatturato} onChange={(e) => set("percFatturato", e.target.value)} /></Field>
          <Field label="% Progressivo"><Input type="number" step="0.01" value={f.percProgressivo} onChange={(e) => set("percProgressivo", e.target.value)} /></Field>
        </div>

        <SectionTitle>Date e pagamento</SectionTitle>

        <div className="grid grid-cols-4 gap-2.5">
          <Field label="Due Date"><Input type="date" value={f.dueDate} onChange={(e) => set("dueDate", e.target.value)} /></Field>
          <Field label="Date of Payment"><Input type="date" value={f.dateOfPayment} onChange={(e) => set("dateOfPayment", e.target.value)} /></Field>
          <Field label="Payment Day"><Input value={f.paymentDay} onChange={(e) => set("paymentDay", e.target.value)} placeholder="es. fine mese" /></Field>
          <Field label="DPO (auto)"><Input value={calcDPO(f)} disabled /></Field>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          <Field label="Payment Method">
            <Select value={f.paymentMethod || "-"} onValueChange={(v) => set("paymentMethod", v === "-" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="-">—</SelectItem>
                <SelectItem value="Wire Transfer">Wire Transfer</SelectItem>
                <SelectItem value="SEPA">SEPA</SelectItem>
                <SelectItem value="Cheque">Cheque</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="State">
            <Select value={f.state} onValueChange={(v) => set("state", v as InvoiceState)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["Unpaid","Partial","Paid","Overdue"] as InvoiceState[]).map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Ref. Order PO"><Input value={f.refOrderPO} onChange={(e) => set("refOrderPO", e.target.value)} placeholder="es. PO-2024-001" /></Field>
        </div>

        <SectionTitle>Contatti e note</SectionTitle>

        <Field label="E-mail Riferimento"><Input value={f.emailRef} onChange={(e) => set("emailRef", e.target.value)} placeholder="es. accountspayable@cliente.com" /></Field>

        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Recall"><Input value={f.recall} onChange={(e) => set("recall", e.target.value)} placeholder="es. 1° recall 15/03/2026" /></Field>
          <Field label="Statement of Account"><Input value={f.statementOfAccount} onChange={(e) => set("statementOfAccount", e.target.value)} placeholder="es. Inviato 20/03/2026" /></Field>
        </div>

        <Field label="Entità legale FGB">
          <Select value={f.entity} onValueChange={(v) => set("entity", v as Entity)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(["FGB UK","FGB Italy","FGB China"] as Entity[]).map((e) => (
                <SelectItem key={e} value={e}>{e}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={submit}>Salva fattura</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontFamily: "'Futura','Futura PT','Century Gothic',sans-serif" }}>
        {label}
      </Label>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[10px] uppercase tracking-wider text-muted-foreground border-t border-border pt-2 mt-1"
      style={{ fontFamily: "'Futura','Futura PT','Century Gothic',sans-serif", letterSpacing: "0.08em" }}
    >
      {children}
    </div>
  );
}

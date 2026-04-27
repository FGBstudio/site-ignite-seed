import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useInvoiceStore } from "../store/useInvoiceStore";
import type { Sollecito, SollecitoStatus } from "../types";

const EMPTY: Omit<Sollecito, "id"> = {
  client: "", invNum: "", date: "", dueDate: "", project: "",
  amount: 0, n: 0, lastDate: "", email: "", note: "", status: "attivo",
};

export function SollecitoModal({
  open, onOpenChange, edit,
}: { open: boolean; onOpenChange: (o: boolean) => void; edit?: Sollecito | null }) {
  const upsert = useInvoiceStore((s) => s.upsertSO);
  const { toast } = useToast();
  const [f, setF] = useState<Omit<Sollecito, "id"> & { id?: string }>(EMPTY);
  useEffect(() => { if (open) setF(edit ? { ...edit } : { ...EMPTY }); }, [open, edit]);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{edit ? "Modifica sollecito" : "Aggiungi sollecito"}</DialogTitle></DialogHeader>

        <div className="grid grid-cols-2 gap-2.5">
          <L label="Cliente"><Input value={f.client} onChange={(e) => set("client", e.target.value)} /></L>
          <L label="N° Fattura"><Input value={f.invNum} onChange={(e) => set("invNum", e.target.value)} /></L>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <L label="Data fattura"><Input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} /></L>
          <L label="Scadenza"><Input type="date" value={f.dueDate} onChange={(e) => set("dueDate", e.target.value)} /></L>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <L label="Progetto"><Input value={f.project} onChange={(e) => set("project", e.target.value)} /></L>
          <L label="Non pagato (€)"><Input type="number" value={f.amount} onChange={(e) => set("amount", parseFloat(e.target.value) || 0)} /></L>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          <L label="N° solleciti"><Input type="number" min={0} value={f.n} onChange={(e) => set("n", parseInt(e.target.value) || 0)} /></L>
          <L label="Ultimo recall"><Input type="date" value={f.lastDate} onChange={(e) => set("lastDate", e.target.value)} /></L>
          <L label="Stato">
            <Select value={f.status} onValueChange={(v) => set("status", v as SollecitoStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="attivo">In corso</SelectItem>
                <SelectItem value="pagato">Pagato</SelectItem>
                <SelectItem value="bloccato">Bloccato</SelectItem>
              </SelectContent>
            </Select>
          </L>
        </div>
        <L label="Email destinatario"><Textarea rows={2} value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="TO: ... CC: ..." /></L>
        <L label="Note stato"><Textarea rows={3} value={f.note} onChange={(e) => set("note", e.target.value)} /></L>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={() => { if (!f.client.trim()) { toast({ title: "Cliente obbligatorio", variant: "destructive" }); return; } upsert(f); toast({ title: edit ? "Aggiornato" : "Aggiunto" }); onOpenChange(false); }}>Salva</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontFamily: "'Futura','Futura PT','Century Gothic',sans-serif" }}>{label}</Label>
      {children}
    </div>
  );
}

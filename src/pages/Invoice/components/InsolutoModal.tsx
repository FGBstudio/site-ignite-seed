import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useInvoiceStore } from "../store/useInvoiceStore";
import type { Insoluto, InsolutoStatus } from "../types";

const EMPTY: Omit<Insoluto, "id"> = {
  year: String(new Date().getFullYear()), invNum: "", date: "",
  client: "", project: "", dueDate: "", amount: 0, status: "aperto", note: "",
};

export function InsolutoModal({
  open, onOpenChange, edit,
}: { open: boolean; onOpenChange: (o: boolean) => void; edit?: Insoluto | null }) {
  const upsert = useInvoiceStore((s) => s.upsertINS);
  const { toast } = useToast();
  const [f, setF] = useState<Omit<Insoluto, "id"> & { id?: string }>(EMPTY);
  useEffect(() => { if (open) setF(edit ? { ...edit } : { ...EMPTY }); }, [open, edit]);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{edit ? "Modifica insoluto" : "Aggiungi insoluto"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-3 gap-2.5">
          <L label="Anno">
            <Select value={f.year} onValueChange={(v) => set("year", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["2026","2025","2024","2023"].map((y) => (<SelectItem key={y} value={y}>{y}</SelectItem>))}
              </SelectContent>
            </Select>
          </L>
          <L label="N° Fattura"><Input value={f.invNum} onChange={(e) => set("invNum", e.target.value)} /></L>
          <L label="Data fattura"><Input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} /></L>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <L label="Cliente"><Input value={f.client} onChange={(e) => set("client", e.target.value)} /></L>
          <L label="Progetto"><Input value={f.project} onChange={(e) => set("project", e.target.value)} /></L>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          <L label="Scadenza"><Input type="date" value={f.dueDate} onChange={(e) => set("dueDate", e.target.value)} /></L>
          <L label="Non pagato (€)"><Input type="number" value={f.amount} onChange={(e) => set("amount", parseFloat(e.target.value) || 0)} /></L>
          <L label="Stato">
            <Select value={f.status} onValueChange={(v) => set("status", v as InsolutoStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="aperto">Aperto</SelectItem>
                <SelectItem value="in_verifica">In verifica</SelectItem>
                <SelectItem value="coperto">Coperto da NC</SelectItem>
                <SelectItem value="chiuso">Chiuso</SelectItem>
              </SelectContent>
            </Select>
          </L>
        </div>
        <L label="Note"><Textarea rows={3} value={f.note} onChange={(e) => set("note", e.target.value)} /></L>
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

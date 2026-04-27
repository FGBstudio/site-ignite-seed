import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useInvoiceStore } from "../store/useInvoiceStore";
import type { NCStatus, NotaCredito } from "../types";

const EMPTY: Omit<NotaCredito, "id"> = {
  invNum: "", client: "", project: "", amount: 0,
  ncNum: "", status: "da_fare", reason: "", note: "",
};

export function NoteCreditoModal({
  open, onOpenChange, edit,
}: { open: boolean; onOpenChange: (o: boolean) => void; edit?: NotaCredito | null }) {
  const upsert = useInvoiceStore((s) => s.upsertNC);
  const { toast } = useToast();
  const [f, setF] = useState<Omit<NotaCredito, "id"> & { id?: string }>(EMPTY);
  useEffect(() => { if (open) setF(edit ? { ...edit } : { ...EMPTY }); }, [open, edit]);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{edit ? "Modifica nota credito" : "Aggiungi nota credito"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-2.5">
          <L label="N° Fattura originale"><Input value={f.invNum} onChange={(e) => set("invNum", e.target.value)} /></L>
          <L label="Cliente"><Input value={f.client} onChange={(e) => set("client", e.target.value)} /></L>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <L label="Progetto"><Input value={f.project} onChange={(e) => set("project", e.target.value)} /></L>
          <L label="Importo (€)"><Input type="number" value={f.amount} onChange={(e) => set("amount", parseFloat(e.target.value) || 0)} /></L>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <L label="N° NC emessa"><Input value={f.ncNum} onChange={(e) => set("ncNum", e.target.value)} /></L>
          <L label="Stato">
            <Select value={f.status} onValueChange={(v) => set("status", v as NCStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="da_fare">Da emettere</SelectItem>
                <SelectItem value="emessa">Emessa</SelectItem>
                <SelectItem value="in_attesa">In attesa</SelectItem>
              </SelectContent>
            </Select>
          </L>
        </div>
        <L label="Motivo"><Input value={f.reason} onChange={(e) => set("reason", e.target.value)} /></L>
        <L label="Note"><Textarea rows={3} value={f.note} onChange={(e) => set("note", e.target.value)} /></L>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={() => { if (!f.invNum.trim()) { toast({ title: "N° fattura obbligatorio", variant: "destructive" }); return; } upsert(f); toast({ title: edit ? "Aggiornato" : "Aggiunto" }); onOpenChange(false); }}>Salva</Button>
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

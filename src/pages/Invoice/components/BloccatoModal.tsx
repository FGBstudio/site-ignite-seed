import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useInvoiceStore } from "../store/useInvoiceStore";
import type { Bloccato, BloccatoSeverity, BloccatoType } from "../types";

const EMPTY: Omit<Bloccato, "id"> = {
  invNum: "", project: "", client: "", amount: 0,
  type: "altro", severity: "normal", cause: "", solution: "",
};

export function BloccatoModal({
  open, onOpenChange, edit,
}: { open: boolean; onOpenChange: (o: boolean) => void; edit?: Bloccato | null }) {
  const upsert = useInvoiceStore((s) => s.upsertBL);
  const { toast } = useToast();
  const [f, setF] = useState<Omit<Bloccato, "id"> & { id?: string }>(EMPTY);
  useEffect(() => { if (open) setF(edit ? { ...edit } : { ...EMPTY }); }, [open, edit]);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{edit ? "Modifica recall bloccato" : "Aggiungi recall bloccato"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-2.5">
          <L label="N° Fattura"><Input value={f.invNum} onChange={(e) => set("invNum", e.target.value)} /></L>
          <L label="Progetto"><Input value={f.project} onChange={(e) => set("project", e.target.value)} /></L>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <L label="Cliente"><Input value={f.client} onChange={(e) => set("client", e.target.value)} /></L>
          <L label="Importo bloccato (€)"><Input type="number" value={f.amount} onChange={(e) => set("amount", parseFloat(e.target.value) || 0)} /></L>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <L label="Tipo di blocco">
            <Select value={f.type} onValueChange={(v) => set("type", v as BloccatoType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="legale">Legale/Giudiziale</SelectItem>
                <SelectItem value="contratto">Contrattuale</SelectItem>
                <SelectItem value="tecnico">Tecnica</SelectItem>
                <SelectItem value="altro">Altro</SelectItem>
              </SelectContent>
            </Select>
          </L>
          <L label="Gravità">
            <Select value={f.severity} onValueChange={(v) => set("severity", v as BloccatoSeverity)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normale</SelectItem>
                <SelectItem value="critical">Critica</SelectItem>
              </SelectContent>
            </Select>
          </L>
        </div>
        <L label="Causa blocco"><Textarea rows={3} value={f.cause} onChange={(e) => set("cause", e.target.value)} /></L>
        <L label="Proposta per sblocco"><Textarea rows={3} value={f.solution} onChange={(e) => set("solution", e.target.value)} /></L>
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

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useInvoiceStore } from "../store/useInvoiceStore";
import type { DaEmettere, Entity, Priority } from "../types";

const EMPTY: Omit<DaEmettere, "id"> = {
  brand: "", project: "", step: "", value: 0,
  priority: "Medium", entity: "FGB UK", eoc: "", problem: "", solution: "",
};

export function DaEmettereModal({
  open, onOpenChange, edit,
}: { open: boolean; onOpenChange: (o: boolean) => void; edit?: DaEmettere | null }) {
  const upsert = useInvoiceStore((s) => s.upsertDE);
  const { toast } = useToast();
  const [f, setF] = useState<Omit<DaEmettere, "id"> & { id?: string }>(EMPTY);

  useEffect(() => { if (open) setF(edit ? { ...edit } : { ...EMPTY }); }, [open, edit]);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{edit ? "Modifica step" : "Aggiungi step da fatturare"}</DialogTitle></DialogHeader>

        <div className="grid grid-cols-2 gap-2.5">
          <FieldL label="Brand"><Input value={f.brand} onChange={(e) => set("brand", e.target.value)} /></FieldL>
          <FieldL label="Progetto"><Input value={f.project} onChange={(e) => set("project", e.target.value)} /></FieldL>
        </div>
        <FieldL label="Step da fatturare"><Input value={f.step} onChange={(e) => set("step", e.target.value)} placeholder="es. 50% LEED + 50% EU Taxonomy" /></FieldL>
        <div className="grid grid-cols-3 gap-2.5">
          <FieldL label="Valore (€)"><Input type="number" value={f.value} onChange={(e) => set("value", parseFloat(e.target.value) || 0)} /></FieldL>
          <FieldL label="Priorità">
            <Select value={f.priority} onValueChange={(v) => set("priority", v as Priority)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Low">Bassa</SelectItem>
                <SelectItem value="Medium">Media</SelectItem>
                <SelectItem value="High">Alta</SelectItem>
              </SelectContent>
            </Select>
          </FieldL>
          <FieldL label="Entità">
            <Select value={f.entity} onValueChange={(v) => set("entity", v as Entity)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["FGB UK","FGB Italy","FGB China"] as Entity[]).map((e) => (<SelectItem key={e} value={e}>{e}</SelectItem>))}
              </SelectContent>
            </Select>
          </FieldL>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <FieldL label="Fine costruzione stimata"><Input value={f.eoc} onChange={(e) => set("eoc", e.target.value)} placeholder="es. 01/07/2026" /></FieldL>
          <FieldL label="Problema / Blocco"><Input value={f.problem} onChange={(e) => set("problem", e.target.value)} /></FieldL>
        </div>
        <FieldL label="Soluzione / Azione"><Textarea value={f.solution} onChange={(e) => set("solution", e.target.value)} rows={2} /></FieldL>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={() => { if (!f.brand.trim() && !f.project.trim()) { toast({ title: "Brand o progetto obbligatorio", variant: "destructive" }); return; } upsert(f); toast({ title: edit ? "Aggiornato" : "Aggiunto" }); onOpenChange(false); }}>Salva</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FieldL({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontFamily: "'Futura','Futura PT','Century Gothic',sans-serif" }}>{label}</Label>
      {children}
    </div>
  );
}

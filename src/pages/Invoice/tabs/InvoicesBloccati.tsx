import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Trash2 } from "lucide-react";
import { useInvoiceStore } from "../store/useInvoiceStore";
import { fEur } from "../utils";
import { BloccatoModal } from "../components/BloccatoModal";
import type { Bloccato } from "../types";

export function InvoicesBloccati() {
  const items = useInvoiceStore((s) => s.bloccati);
  const remove = useInvoiceStore((s) => s.remove);
  const [q, setQ] = useState("");
  const [ft, setFt] = useState("");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Bloccato | null>(null);

  const rows = useMemo(() => {
    const ql = q.toLowerCase();
    return items.filter((r) =>
      (!ql || (r.invNum || "").toLowerCase().includes(ql) || (r.project || "").toLowerCase().includes(ql))
      && (!ft || r.type === ft)
    );
  }, [items, q, ft]);

  return (
    <div>
      <SecHeader title="Recall Bloccati" desc="Fatture non sollecitabili — causa e proposta di sblocco"
        actions={<Button size="sm" onClick={() => { setEdit(null); setOpen(true); }}>+ Aggiungi</Button>} />
      <div className="flex flex-wrap gap-2 mb-4">
        <Input placeholder="N° fattura, progetto..." value={q} onChange={(e) => setQ(e.target.value)} className="flex-1 min-w-[200px] h-9" />
        <select className="h-9 px-2.5 rounded-lg border border-border bg-card text-sm" value={ft} onChange={(e) => setFt(e.target.value)}>
          <option value="">Tutte le cause</option>
          <option value="legale">Legale</option>
          <option value="contratto">Contrattuale</option>
          <option value="tecnico">Tecnica</option>
          <option value="altro">Altro</option>
        </select>
      </div>

      <div className="flex flex-col gap-2.5">
        {rows.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground bg-card border border-border rounded-xl">Nessun recall bloccato</div>
        ) : rows.map((r) => (
          <div key={r.id} className={`bg-card border border-border rounded-xl p-4 border-l-[3px] ${r.severity === "critical" ? "border-l-destructive" : "border-l-amber-500"}`}>
            <div className="flex items-start gap-3 flex-wrap mb-2">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontFamily: "'Futura','Futura PT','Century Gothic',sans-serif" }}>{r.invNum}</span>
              <span className="text-sm font-medium text-foreground flex-1">{r.project} — {r.client}</span>
              <span className="text-sm font-semibold whitespace-nowrap">{fEur(r.amount)}</span>
              <div className="flex gap-1">
                <button onClick={() => { setEdit(r); setOpen(true); }} className="w-7 h-7 rounded border border-border flex items-center justify-center text-muted-foreground hover:bg-background"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={() => remove("bloccati", r.id)} className="w-7 h-7 rounded border border-border flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontFamily: "'Futura','Futura PT','Century Gothic',sans-serif" }}>Causa blocco ({r.type})</label>
                <p className="text-xs text-foreground/80 leading-snug mt-1">{r.cause || "—"}</p>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontFamily: "'Futura','Futura PT','Century Gothic',sans-serif" }}>Proposta di sblocco</label>
                <p className="text-xs text-foreground/80 leading-snug mt-1">{r.solution || "—"}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="py-2 text-xs text-muted-foreground">{rows.length} elementi</div>
      <BloccatoModal open={open} onOpenChange={setOpen} edit={edit} />
    </div>
  );
}

function SecHeader({ title, desc, actions }: { title: string; desc: string; actions: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-4 flex-wrap gap-2.5">
      <div>
        <div className="text-foreground" style={{ fontFamily: "'Futura','Futura PT','Century Gothic',sans-serif", fontSize: 12, letterSpacing: "0.09em", textTransform: "uppercase" }}>{title}</div>
        <div className="text-muted-foreground text-xs mt-1">{desc}</div>
      </div>
      <div className="flex gap-2">{actions}</div>
    </div>
  );
}

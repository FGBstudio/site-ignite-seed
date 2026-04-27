import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Trash2 } from "lucide-react";
import { useInvoiceStore } from "../store/useInvoiceStore";
import { fEur } from "../utils";
import { NoteCreditoModal } from "../components/NoteCreditoModal";
import type { NotaCredito } from "../types";

const ST_LABEL: Record<string, string> = { da_fare: "Da emettere", emessa: "Emessa", in_attesa: "In attesa" };
const ST_BADGE: Record<string, string> = {
  da_fare: "bg-amber-500/10 text-amber-600",
  emessa: "bg-emerald-500/10 text-emerald-600",
  in_attesa: "bg-primary/10 text-primary",
};

export function InvoicesNoteCredito() {
  const items = useInvoiceStore((s) => s.nc);
  const remove = useInvoiceStore((s) => s.remove);
  const [q, setQ] = useState("");
  const [fs, setFs] = useState("");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<NotaCredito | null>(null);

  const rows = useMemo(() => {
    const ql = q.toLowerCase();
    return items.filter((r) =>
      (!ql || (r.invNum || "").toLowerCase().includes(ql) || (r.client || "").toLowerCase().includes(ql))
      && (!fs || r.status === fs)
    );
  }, [items, q, fs]);

  return (
    <div>
      <SecHeader title="Note di Credito" desc="Stornature, rettifiche e annullamenti"
        actions={<Button size="sm" onClick={() => { setEdit(null); setOpen(true); }}>+ Aggiungi</Button>} />
      <div className="flex flex-wrap gap-2 mb-4">
        <Input placeholder="N° fattura, cliente..." value={q} onChange={(e) => setQ(e.target.value)} className="flex-1 min-w-[200px] h-9" />
        <select className="h-9 px-2.5 rounded-lg border border-border bg-card text-sm" value={fs} onChange={(e) => setFs(e.target.value)}>
          <option value="">Tutti gli stati</option>
          <option value="da_fare">Da emettere</option>
          <option value="emessa">Emessa</option>
          <option value="in_attesa">In attesa</option>
        </select>
      </div>
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-background">
                {["N° Ft originale","Cliente","Progetto","Importo €","N° NC emessa","Stato","Motivo","Note","#"].map((h) => (
                  <th key={h} className="text-left px-2.5 py-2 text-[9px] uppercase tracking-wider text-muted-foreground border-b border-border whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-8 text-sm text-muted-foreground">Nessuna nota di credito</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id} className="border-b border-border hover:bg-primary/[0.03]">
                  <td className="px-2.5 py-2 text-xs"><b>{r.invNum || "—"}</b></td>
                  <td className="px-2.5 py-2 text-xs">{r.client || "—"}</td>
                  <td className="px-2.5 py-2 text-xs">{r.project || "—"}</td>
                  <td className="px-2.5 py-2 text-xs"><b>{fEur(r.amount)}</b></td>
                  <td className="px-2.5 py-2 text-xs">{r.ncNum || "—"}</td>
                  <td className="px-2.5 py-2 text-xs"><span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${ST_BADGE[r.status]}`}>{ST_LABEL[r.status]}</span></td>
                  <td className="px-2.5 py-2 text-xs">{r.reason || "—"}</td>
                  <td className="px-2.5 py-2 text-xs max-w-[220px] truncate text-muted-foreground">{r.note || "—"}</td>
                  <td className="px-2.5 py-2 text-xs">
                    <div className="flex gap-1">
                      <button onClick={() => { setEdit(r); setOpen(true); }} className="w-6 h-6 rounded border border-border flex items-center justify-center text-muted-foreground hover:bg-background"><Pencil className="w-3 h-3" /></button>
                      <button onClick={() => remove("nc", r.id)} className="w-6 h-6 rounded border border-border flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="py-2 text-xs text-muted-foreground">{rows.length} note di credito</div>
      <NoteCreditoModal open={open} onOpenChange={setOpen} edit={edit} />
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

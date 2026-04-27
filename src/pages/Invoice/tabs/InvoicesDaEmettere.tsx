import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Trash2 } from "lucide-react";
import { useInvoiceStore } from "../store/useInvoiceStore";
import { exportCSV, fEur, entityBadgeClass } from "../utils";
import { DaEmettereModal } from "../components/DaEmettereModal";
import type { DaEmettere } from "../types";

const PRIO_DOT: Record<string, string> = {
  High: "before:bg-destructive",
  Medium: "before:bg-amber-500",
  Low: "before:bg-emerald-500",
};

export function InvoicesDaEmettere() {
  const items = useInvoiceStore((s) => s.daEmettere);
  const remove = useInvoiceStore((s) => s.remove);
  const [q, setQ] = useState("");
  const [fp, setFp] = useState("");
  const [fe, setFe] = useState("");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<DaEmettere | null>(null);

  const rows = useMemo(() => {
    const ql = q.toLowerCase();
    return items.filter((r) =>
      (!ql || (r.brand || "").toLowerCase().includes(ql) || (r.project || "").toLowerCase().includes(ql))
      && (!fp || r.priority === fp)
      && (!fe || r.entity === fe)
    );
  }, [items, q, fp, fe]);

  return (
    <div>
      <SecHeader title="Da Emettere" desc="Step di progetto pronti per la fatturazione"
        actions={<Button size="sm" onClick={() => { setEdit(null); setOpen(true); }}>+ Aggiungi</Button>} />
      <div className="flex flex-wrap gap-2 mb-4">
        <Input placeholder="Brand, progetto..." value={q} onChange={(e) => setQ(e.target.value)} className="flex-1 min-w-[200px] h-9" />
        <select className="h-9 px-2.5 rounded-lg border border-border bg-card text-sm" value={fp} onChange={(e) => setFp(e.target.value)}>
          <option value="">Tutte le priorità</option><option value="High">Alta</option><option value="Medium">Media</option><option value="Low">Bassa</option>
        </select>
        <select className="h-9 px-2.5 rounded-lg border border-border bg-card text-sm" value={fe} onChange={(e) => setFe(e.target.value)}>
          <option value="">Tutte le entità</option><option>FGB UK</option><option>FGB Italy</option><option>FGB China</option>
        </select>
      </div>
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-background">
                {["Brand","Progetto","Step da fatturare","Valore €","Priorità","Entità","Fine costruzione","Blocco / Note","#"].map((h) => (
                  <th key={h} className="text-left px-2.5 py-2 text-[9px] uppercase tracking-wider text-muted-foreground border-b border-border whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-8 text-sm text-muted-foreground">Nessun elemento</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id} className="border-b border-border hover:bg-primary/[0.03]">
                  <td className="px-2.5 py-2 text-xs"><b>{r.brand || "—"}</b></td>
                  <td className="px-2.5 py-2 text-xs">{r.project || "—"}</td>
                  <td className="px-2.5 py-2 text-xs">{r.step || "—"}</td>
                  <td className="px-2.5 py-2 text-xs"><b>{fEur(r.value)}</b></td>
                  <td className="px-2.5 py-2 text-xs">
                    <span className={`relative pl-3.5 before:content-[''] before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:w-2 before:h-2 before:rounded-full ${PRIO_DOT[r.priority] || ""}`}>
                      {r.priority === "High" ? "Alta" : r.priority === "Medium" ? "Media" : "Bassa"}
                    </span>
                  </td>
                  <td className="px-2.5 py-2 text-xs"><span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${entityBadgeClass(r.entity)}`}>{r.entity}</span></td>
                  <td className="px-2.5 py-2 text-xs">{r.eoc || "—"}</td>
                  <td className="px-2.5 py-2 text-xs max-w-[280px] truncate text-muted-foreground">{r.problem || r.solution || "—"}</td>
                  <td className="px-2.5 py-2 text-xs">
                    <div className="flex gap-1">
                      <button onClick={() => { setEdit(r); setOpen(true); }} className="w-6 h-6 rounded border border-border flex items-center justify-center text-muted-foreground hover:bg-background"><Pencil className="w-3 h-3" /></button>
                      <button onClick={() => remove("daEmettere", r.id)} className="w-6 h-6 rounded border border-border flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="flex justify-between items-center py-2 text-xs text-muted-foreground">
        <span>{rows.length} elementi</span>
        <Button size="sm" variant="outline" onClick={() => exportCSV("da-emettere", items)}>Esporta CSV ↗</Button>
      </div>
      <DaEmettereModal open={open} onOpenChange={setOpen} edit={edit} />
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

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Trash2 } from "lucide-react";
import { useInvoiceStore } from "../store/useInvoiceStore";
import { exportCSV, fD, fEur } from "../utils";
import { SollecitoModal } from "../components/SollecitoModal";
import type { Sollecito } from "../types";

const STATUS_BADGE: Record<string, string> = {
  attivo: "bg-amber-500/10 text-amber-600",
  pagato: "bg-emerald-500/10 text-emerald-600",
  bloccato: "bg-destructive/10 text-destructive",
};

export function InvoicesSolleciti() {
  const items = useInvoiceStore((s) => s.solleciti);
  const remove = useInvoiceStore((s) => s.remove);
  const [q, setQ] = useState("");
  const [fs, setFs] = useState("");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Sollecito | null>(null);

  const rows = useMemo(() => {
    const ql = q.toLowerCase();
    return items.filter((r) =>
      (!ql || (r.client || "").toLowerCase().includes(ql) || (r.invNum || "").toLowerCase().includes(ql))
      && (!fs || r.status === fs)
    );
  }, [items, q, fs]);

  return (
    <div>
      <SecHeader title="Solleciti Attivi" desc="Fatture in recall — registra un nuovo sollecito"
        actions={<Button size="sm" onClick={() => { setEdit(null); setOpen(true); }}>+ Aggiungi</Button>} />

      <div className="flex flex-wrap gap-2 mb-4">
        <Input placeholder="Cliente, n° fattura..." value={q} onChange={(e) => setQ(e.target.value)} className="flex-1 min-w-[200px] h-9" />
        <select className="h-9 px-2.5 rounded-lg border border-border bg-card text-sm" value={fs} onChange={(e) => setFs(e.target.value)}>
          <option value="">Tutti gli stati</option>
          <option value="attivo">In corso</option>
          <option value="pagato">Pagato</option>
          <option value="bloccato">Bloccato</option>
        </select>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-background">
                {["Cliente","N° Fattura","Progetto","Scadenza","Non pagato €","N° Soll.","Ultimo recall","Stato","Note","#"].map((h) => (
                  <th key={h} className="text-left px-2.5 py-2 text-[9px] uppercase tracking-wider text-muted-foreground border-b border-border whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-8 text-sm text-muted-foreground">Nessun sollecito</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id} className="border-b border-border hover:bg-primary/[0.03]">
                  <td className="px-2.5 py-2 text-xs"><b>{r.client || "—"}</b></td>
                  <td className="px-2.5 py-2 text-xs">{r.invNum || "—"}</td>
                  <td className="px-2.5 py-2 text-xs">{r.project || "—"}</td>
                  <td className="px-2.5 py-2 text-xs">{fD(r.dueDate)}</td>
                  <td className="px-2.5 py-2 text-xs text-destructive font-semibold">{fEur(r.amount)}</td>
                  <td className="px-2.5 py-2 text-xs">{r.n}</td>
                  <td className="px-2.5 py-2 text-xs">{fD(r.lastDate)}</td>
                  <td className="px-2.5 py-2 text-xs"><span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[r.status]}`}>{r.status === "attivo" ? "In corso" : r.status === "pagato" ? "Pagato" : "Bloccato"}</span></td>
                  <td className="px-2.5 py-2 text-xs max-w-[220px] truncate text-muted-foreground">{r.note || "—"}</td>
                  <td className="px-2.5 py-2 text-xs">
                    <div className="flex gap-1">
                      <button onClick={() => { setEdit(r); setOpen(true); }} className="w-6 h-6 rounded border border-border flex items-center justify-center text-muted-foreground hover:bg-background"><Pencil className="w-3 h-3" /></button>
                      <button onClick={() => remove("solleciti", r.id)} className="w-6 h-6 rounded border border-border flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-between items-center py-2 text-xs text-muted-foreground">
        <span>{rows.length} solleciti</span>
        <Button size="sm" variant="outline" onClick={() => exportCSV("solleciti", items)}>Esporta CSV ↗</Button>
      </div>

      <SollecitoModal open={open} onOpenChange={setOpen} edit={edit} />
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

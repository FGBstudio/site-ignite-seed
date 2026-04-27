import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Trash2 } from "lucide-react";
import { useInvoiceStore } from "../store/useInvoiceStore";
import { exportCSV, fD, fEur, isOverdue } from "../utils";
import { InvoiceModal } from "../components/InvoiceModal";
import type { Invoice } from "../types";

const STATE_BADGE: Record<string, string> = {
  Paid: "bg-emerald-500/10 text-emerald-600",
  Partial: "bg-primary/10 text-primary",
  Unpaid: "bg-amber-500/10 text-amber-600",
  Overdue: "bg-destructive/10 text-destructive",
};

export function InvoicesEmesse() {
  const invoices = useInvoiceStore((s) => s.invoices);
  const remove = useInvoiceStore((s) => s.remove);
  const [q, setQ] = useState("");
  const [fState, setFState] = useState("");
  const [fEntity, setFEntity] = useState("");
  const [fYear, setFYear] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [edit, setEdit] = useState<Invoice | null>(null);

  const rows = useMemo(() => {
    const ql = q.toLowerCase();
    return invoices.filter((r) => {
      if (ql && !(r.clientEntity || "").toLowerCase().includes(ql)
        && !(r.invoiceNumber || "").toLowerCase().includes(ql)
        && !(r.projectActivity || "").toLowerCase().includes(ql)) return false;
      if (fState && r.state !== fState) return false;
      if (fEntity && r.entity !== fEntity) return false;
      if (fYear && !(r.date || "").startsWith(fYear)) return false;
      return true;
    });
  }, [invoices, q, fState, fEntity, fYear]);

  const totals = useMemo(() => {
    const t = { tp: 0, np: 0, npv: 0, ev: 0, db: 0, tc: 0 };
    rows.forEach((r) => {
      t.tp += r.totPaid || 0; t.np += r.notPaid || 0; t.npv += r.notPaidVat || 0;
      t.ev += r.entrateVere || 0; t.db += r.decurtBancarie || 0; t.tc += r.totCommessa || 0;
    });
    return t;
  }, [rows]);

  const grand = useMemo(() => {
    const t = { tp: 0, np: 0, npv: 0, ev: 0, db: 0, tc: 0 };
    invoices.forEach((r) => {
      t.tp += r.totPaid || 0; t.np += r.notPaid || 0; t.npv += r.notPaidVat || 0;
      t.ev += r.entrateVere || 0; t.db += r.decurtBancarie || 0; t.tc += r.totCommessa || 0;
    });
    return t;
  }, [invoices]);

  return (
    <div>
      <SecHeader
        title="Fatture Emesse"
        desc="Registro completo di tutte le fatture"
        actions={
          <>
            <Button size="sm" onClick={() => { setEdit(null); setModalOpen(true); }}>+ Nuova fattura</Button>
            <Button size="sm" variant="outline" onClick={() => exportCSV("fatture", invoices)}>Esporta CSV ↗</Button>
          </>
        }
      />

      <div className="flex flex-wrap gap-2 items-center mb-4">
        <Input placeholder="Cliente, progetto, n° fattura..." value={q} onChange={(e) => setQ(e.target.value)} className="flex-1 min-w-[200px] h-9" />
        <select className="h-9 px-2.5 rounded-lg border border-border bg-card text-sm" value={fState} onChange={(e) => setFState(e.target.value)}>
          <option value="">Tutti gli stati</option><option>Paid</option><option>Partial</option><option>Unpaid</option><option>Overdue</option>
        </select>
        <select className="h-9 px-2.5 rounded-lg border border-border bg-card text-sm" value={fEntity} onChange={(e) => setFEntity(e.target.value)}>
          <option value="">Tutte le entità</option><option>FGB UK</option><option>FGB Italy</option><option>FGB China</option>
        </select>
        <select className="h-9 px-2.5 rounded-lg border border-border bg-card text-sm" value={fYear} onChange={(e) => setFYear(e.target.value)}>
          <option value="">Tutti gli anni</option><option>2026</option><option>2025</option><option>2024</option><option>2023</option>
        </select>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: 2400 }}>
            <thead>
              <tr className="bg-background sticky top-0">
                {["Data","Client Entity","Invoice N.","Project / Activity","Currency","Exch. Rate","Tot Paid","VAT","Payment Method","Due Date","Not Paid","Not Paid VAT","Date of Payment","DPO","State","Ref. Order PO","Activity","Tot Commessa","% Fatturato","% Progressivo","Payment Day","Entrate Vere","E-mail Rif.","Decurt. Bancarie","Recall","Statement","#"].map((h) => (
                  <th key={h} className="text-left px-2.5 py-2 text-[9px] uppercase tracking-wider text-muted-foreground border-b border-border whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={27} className="text-center py-10 text-sm text-muted-foreground">Nessuna fattura trovata</td></tr>
              ) : (
                <>
                  {rows.map((r) => {
                    const ov = isOverdue(r);
                    return (
                      <tr key={r.id} className={`border-b border-border hover:bg-primary/[0.03] ${ov ? "bg-destructive/[0.04]" : ""}`}>
                        <Td>{fD(r.date)}</Td>
                        <Td>{r.clientEntity || "—"}</Td>
                        <Td><b>{r.invoiceNumber || "—"}</b></Td>
                        <Td>{r.projectActivity || "—"}</Td>
                        <Td>{r.currency}</Td>
                        <Td>{r.exchangeRate || "1"}</Td>
                        <Td><b>{fEur(r.totPaid, r.currency)}</b></Td>
                        <Td>{r.vat ? r.vat + "%" : "—"}</Td>
                        <Td>{r.paymentMethod || "—"}</Td>
                        <Td className={ov ? "text-destructive font-semibold" : ""}>{fD(r.dueDate)}</Td>
                        <Td className="text-destructive font-semibold">{fEur(r.notPaid, r.currency)}</Td>
                        <Td>{fEur(r.notPaidVat, r.currency)}</Td>
                        <Td>{fD(r.dateOfPayment)}</Td>
                        <Td>{r.dpo || "—"}</Td>
                        <Td><span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATE_BADGE[r.state] || ""}`}>{r.state}</span></Td>
                        <Td>{r.refOrderPO || "—"}</Td>
                        <Td>{r.activity || "—"}</Td>
                        <Td>{fEur(r.totCommessa, r.currency)}</Td>
                        <Td>{r.percFatturato ? r.percFatturato + "%" : "—"}</Td>
                        <Td>{r.percProgressivo ? r.percProgressivo + "%" : "—"}</Td>
                        <Td>{r.paymentDay || "—"}</Td>
                        <Td>{fEur(r.entrateVere, r.currency)}</Td>
                        <Td className="max-w-[180px] truncate">{r.emailRef || "—"}</Td>
                        <Td>{fEur(r.decurtBancarie, r.currency)}</Td>
                        <Td className="max-w-[140px] truncate">{r.recall || "—"}</Td>
                        <Td className="max-w-[140px] truncate">{r.statementOfAccount || "—"}</Td>
                        <Td>
                          <div className="flex gap-1">
                            <button onClick={() => { setEdit(r); setModalOpen(true); }} className="w-6 h-6 rounded border border-border flex items-center justify-center text-muted-foreground hover:bg-background"><Pencil className="w-3 h-3" /></button>
                            <button onClick={() => remove("invoices", r.id)} className="w-6 h-6 rounded border border-border flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
                          </div>
                        </Td>
                      </tr>
                    );
                  })}
                  <TotRow label="TOT (filtro corrente)" totals={totals} variant="sub" />
                  <TotRow label="TOT GENERALE" totals={grand} variant="grand" />
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-between items-center py-2 text-xs text-muted-foreground">
        <span>{rows.length} fattur{rows.length === 1 ? "a" : "e"}</span>
      </div>

      <InvoiceModal open={modalOpen} onOpenChange={setModalOpen} edit={edit} />
    </div>
  );
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-2.5 py-2 text-xs text-foreground border-b border-border whitespace-nowrap ${className}`}>{children}</td>;
}

function TotRow({ label, totals, variant }: { label: string; totals: { tp: number; np: number; npv: number; ev: number; db: number; tc: number }; variant: "sub" | "grand" }) {
  const cls = variant === "grand"
    ? "bg-primary/[0.06] border-t-2 border-t-primary font-semibold"
    : "bg-primary/[0.03] font-medium text-muted-foreground";
  return (
    <tr className={cls}>
      <td colSpan={6} className="px-2.5 py-2 text-xs"><b>{label}</b></td>
      <td className="px-2.5 py-2 text-xs"><b>{fEur(totals.tp)}</b></td>
      <td colSpan={3} />
      <td className="px-2.5 py-2 text-xs"><b>{fEur(totals.np)}</b></td>
      <td className="px-2.5 py-2 text-xs"><b>{fEur(totals.npv)}</b></td>
      <td colSpan={6} />
      <td className="px-2.5 py-2 text-xs"><b>{fEur(totals.tc)}</b></td>
      <td colSpan={3} />
      <td className="px-2.5 py-2 text-xs"><b>{fEur(totals.ev)}</b></td>
      <td />
      <td className="px-2.5 py-2 text-xs"><b>{fEur(totals.db)}</b></td>
      <td colSpan={3} />
    </tr>
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

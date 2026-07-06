import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { PAYMENT_SCHEMES, TRIGGER_LABELS, generateTranches, type PaymentSchemeId } from "@/lib/paymentSchemes";
import { useInvoiceStore } from "../store/useInvoiceStore";
import { CheckCircle2, FileText, Loader2, Receipt, Plus, ArrowRight } from "lucide-react";

interface Cert {
  id: string;
  name: string;
  client: string;
  total_fees: number | null;
  status: string;
  region: string | null;
  sites: { city: string | null } | null;
}

interface Tranche {
  id: string;
  certification_id: string;
  name: string;
  amount: number;
  status: string;
  tranche_pct: number | null;
  tranche_order: number | null;
  trigger_event: string | null;
  payment_scheme: string | null;
  invoice_sent_date: string | null;
  due_date: string | null;
}

function useApprovedCerts() {
  return useQuery({
    queryKey: ["payments-approved-certs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("certifications")
        .select("id, name, client, total_fees, status, region, sites ( city )")
        .in("status", ["quotation_approved", "da_configurare", "in_corso", "completato", "certificato"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as Cert[];
    },
  });
}

function useAllTranches() {
  return useQuery({
    queryKey: ["payments-all-tranches"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("cert_payment_milestones")
        .select("*")
        .order("tranche_order", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data || []) as unknown as Tranche[];
    },
  });
}

export function QuotationsToInvoicePanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: certs = [], isLoading: certsLoading } = useApprovedCerts();
  const { data: tranches = [], isLoading: tLoading } = useAllTranches();
  const addInvoiceLocal = useInvoiceStore((s) => (s as any).addInvoice as ((...args: any[]) => any) | undefined);

  const [search, setSearch] = useState("");
  const [schemeDialog, setSchemeDialog] = useState<Cert | null>(null);
  const [schemeChoice, setSchemeChoice] = useState<PaymentSchemeId>("quotation_construction_50_50");
  const [creatingScheme, setCreatingScheme] = useState(false);
  const [creatingInvoiceId, setCreatingInvoiceId] = useState<string | null>(null);

  const tranchesByCert = useMemo(() => {
    const map = new Map<string, Tranche[]>();
    for (const t of tranches) {
      const arr = map.get(t.certification_id) || [];
      arr.push(t);
      map.set(t.certification_id, arr);
    }
    return map;
  }, [tranches]);

  const filterFn = (c: Cert) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return c.name.toLowerCase().includes(s) || (c.client || "").toLowerCase().includes(s);
  };

  const readyToInvoice = certs.filter((c) => (tranchesByCert.get(c.id) || []).length === 0).filter(filterFn);
  const activeCerts = certs.filter((c) => (tranchesByCert.get(c.id) || []).length > 0).filter(filterFn);

  const createSchemeMut = useMutation({
    mutationFn: async ({ cert, scheme }: { cert: Cert; scheme: PaymentSchemeId }) => {
      const total = Number(cert.total_fees || 0);
      if (!total) throw new Error("Certification has no total_fees set; cannot split into tranches.");
      const rows = generateTranches(scheme, total, cert.id);
      if (!rows.length) throw new Error("Selected scheme has no predefined tranches.");
      const { error } = await (supabase as any).from("cert_payment_milestones").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Tranches created", description: "You can now generate an invoice for each tranche." });
      qc.invalidateQueries({ queryKey: ["payments-all-tranches"] });
      setSchemeDialog(null);
    },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const createInvoiceForTranche = async (cert: Cert, t: Tranche) => {
    setCreatingInvoiceId(t.id);
    try {
      const today = format(new Date(), "yyyy-MM-dd");
      const { error } = await (supabase as any)
        .from("cert_payment_milestones")
        .update({ status: "Invoiced", invoice_sent_date: today })
        .eq("id", t.id);
      if (error) throw error;

      // Push into local Invoice store so it appears in "Fatture Emesse"
      if (typeof addInvoiceLocal === "function") {
        try {
          addInvoiceLocal({
            id: `TRN-${t.id.slice(0, 8)}`,
            date: today,
            client: cert.client,
            project: cert.name,
            description: t.name,
            amount: t.amount,
            state: "Emessa",
            notPaid: t.amount,
          } as any);
        } catch { /* store shape may differ — silent */ }
      }

      toast({ title: "Invoice created", description: `${t.name} — €${Number(t.amount).toLocaleString()}` });
      qc.invalidateQueries({ queryKey: ["payments-all-tranches"] });
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setCreatingInvoiceId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Input placeholder="Search project or client..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Ready-to-invoice quotations */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ArrowRight className="h-4 w-4 text-primary" />
            Quotation Approved — Ready to invoice
            <Badge variant="outline">{readyToInvoice.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {certsLoading ? (
            <div className="space-y-2">{[0,1,2].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : readyToInvoice.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">No approved quotations awaiting tranche creation.</div>
          ) : (
            <div className="table-container overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b">
                  <th className="text-left p-3 font-medium text-muted-foreground">Project</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Client</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Total Fees</th>
                  <th className="p-3" />
                </tr></thead>
                <tbody>
                  {readyToInvoice.map((c) => (
                    <tr key={c.id} className="border-b last:border-b-0 hover:bg-muted/40">
                      <td className="p-3 font-medium">{c.name}</td>
                      <td className="p-3">{c.client}</td>
                      <td className="p-3">{c.total_fees != null ? `€${Number(c.total_fees).toLocaleString()}` : "—"}</td>
                      <td className="p-3 text-right">
                        <Button size="sm" className="gap-1.5" onClick={() => { setSchemeChoice("quotation_construction_50_50"); setSchemeDialog(c); }}>
                          <Receipt className="h-3.5 w-3.5" /> Invoice
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active tranches per certification */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Active tranches
            <Badge variant="outline">{activeCerts.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {tLoading || certsLoading ? (
            <div className="space-y-2">{[0,1,2].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>
          ) : activeCerts.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">No active tranches yet.</div>
          ) : (
            activeCerts.map((c) => {
              const ts = (tranchesByCert.get(c.id) || []).sort((a,b) => (a.tranche_order || 0) - (b.tranche_order || 0));
              return (
                <div key={c.id} className="rounded-lg border">
                  <div className="p-3 border-b bg-muted/30 flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{c.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{c.client}</div>
                    </div>
                    <Badge variant="outline" className="capitalize">{c.status.replace(/_/g, " ")}</Badge>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 p-3">
                    {ts.map((t) => {
                      const invoiced = t.status === "Invoiced" || t.status === "Paid" || !!t.invoice_sent_date;
                      return (
                        <div key={t.id} className="rounded-md border p-3 flex flex-col gap-2 bg-card">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-medium truncate">{t.name}</div>
                            <Badge variant="outline" className="shrink-0">{t.tranche_pct ?? "—"}%</Badge>
                          </div>
                          <div className="text-lg font-semibold">€{Number(t.amount || 0).toLocaleString()}</div>
                          <div className="text-xs text-muted-foreground">
                            {t.trigger_event ? TRIGGER_LABELS[t.trigger_event as keyof typeof TRIGGER_LABELS] : "—"}
                          </div>
                          {invoiced ? (
                            <Badge variant="outline" className="gap-1 text-success border-success/30 bg-success/10 self-start">
                              <CheckCircle2 className="h-3 w-3" /> Invoiced{t.invoice_sent_date ? ` · ${format(new Date(t.invoice_sent_date), "dd MMM yyyy")}` : ""}
                            </Badge>
                          ) : (
                            <Button size="sm" className="gap-1.5 mt-1" disabled={creatingInvoiceId === t.id} onClick={() => createInvoiceForTranche(c, t)}>
                              {creatingInvoiceId === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                              Create Invoice
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Scheme picker */}
      <Dialog open={!!schemeDialog} onOpenChange={(o) => !o && setSchemeDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Split quotation into tranches</DialogTitle>
            <DialogDescription>
              Select the payment scheme for <strong>{schemeDialog?.name}</strong>.
              Total: <strong>€{Number(schemeDialog?.total_fees || 0).toLocaleString()}</strong>
            </DialogDescription>
          </DialogHeader>
          <RadioGroup value={schemeChoice} onValueChange={(v) => setSchemeChoice(v as PaymentSchemeId)} className="space-y-2">
            {Object.values(PAYMENT_SCHEMES).map((sch) => (
              <label key={sch.id} htmlFor={`sch-${sch.id}`} className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/40">
                <RadioGroupItem value={sch.id} id={`sch-${sch.id}`} className="mt-0.5" />
                <div className="flex-1">
                  <div className="font-medium text-sm">{sch.label}</div>
                  <div className="text-xs text-muted-foreground">{sch.description}</div>
                  {sch.tranches.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {sch.tranches.map((t, i) => (
                        <Badge key={i} variant="outline" className="text-xs">{t.pct}% · {TRIGGER_LABELS[t.trigger]}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              </label>
            ))}
          </RadioGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSchemeDialog(null)} disabled={createSchemeMut.isPending}>Cancel</Button>
            <Button
              disabled={createSchemeMut.isPending || PAYMENT_SCHEMES[schemeChoice].tranches.length === 0}
              onClick={() => schemeDialog && createSchemeMut.mutate({ cert: schemeDialog, scheme: schemeChoice })}
            >
              {createSchemeMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Create tranches
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { MainLayout } from "@/components/layout/MainLayout";
import { externalSupabase as supabase } from "@/integrations/supabase/externalClient";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { NewQuotationWizard } from "@/components/projects/NewQuotationWizard";
import { Money } from "@/components/common/Money";
import { formatMoney } from "@/lib/currency";
import { Plus, Search, FileText, CheckCircle2, Loader2, ArrowRight, XCircle, Ban, Sparkles, RotateCcw, ChevronDown, ChevronRight as ChevronRightIcon, Save, Pencil, FilePlus2, FileDown } from "lucide-react";
import { OffertaDialog } from "@/components/quotations/OffertaDialog";

interface QuotationRow {
  id: string;
  name: string;
  client: string;
  region: string | null;
  /** Nella valuta dell'offerta: vedi `currency`. Per sommare c'e' total_fees_eur. */
  total_fees: number | null;
  currency: string | null;
  fx_rate_to_eur: number | null;
  total_fees_eur: number | null;
  handover_date: string | null;
  quotation_sent_date: string | null;
  quotation_approved_at: string | null;
  created_at: string | null;
  status: string;
  quotation_notes?: string | null;
  quotation_group_id?: string | null;
  cert_type?: string | null;
  sites?: { city: string | null } | null;
}

interface CachedAdminProject {
  id: string;
  status: string;
  setup_status: string;
  plannerData?: { currentActivity?: string; status?: string };
}

function readableError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const m = error as { message?: unknown; error?: unknown; details?: unknown };
    const parts = [m.message, m.error, m.details].filter((p): p is string => typeof p === "string" && p.trim().length > 0);
    if (parts.length > 0) return parts.join(" — ");
  }
  try { return JSON.stringify(error); } catch { return "Unknown error"; }
}

async function readableFunctionError(error: unknown): Promise<string> {
  if (error && typeof error === "object" && "context" in error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const payload = await context.clone().json() as { error?: unknown; message?: unknown };
        if (typeof payload.error === "string") return payload.error;
        if (typeof payload.message === "string") return payload.message;
      } catch {
        try { const t = await context.clone().text(); if (t.trim()) return t; } catch { return readableError(error); }
      }
    }
  }
  return readableError(error);
}

function useQuotations() {
  return useQuery({
    queryKey: ["quotations-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("certifications")
        .select("id, name, client, region, total_fees, currency, fx_rate_to_eur, total_fees_eur, handover_date, quotation_sent_date, quotation_approved_at, created_at, status, quotation_notes, quotation_group_id, cert_type, sites(city)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw new Error(await readableFunctionError(error));
      return (data || []) as unknown as QuotationRow[];
    },
  });
}

export default function Quotations() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuotations();

  const [tab, setTab] = useState<"potential" | "pending" | "approved" | "canceled">("pending");
  const [search, setSearch] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [resumeCertId, setResumeCertId] = useState<string | undefined>(undefined);
  /** L'offerta che si sta modificando: il wizard si riapre sui suoi dati. */
  const [modificaCertId, setModificaCertId] = useState<string | undefined>(undefined);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [expandedCanceled, setExpandedCanceled] = useState<Record<string, boolean>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [savingNote, setSavingNote] = useState<string | null>(null);
  const [resumeDialog, setResumeDialog] = useState<QuotationRow | null>(null);
  const [resumingId, setResumingId] = useState<string | null>(null);
  /** La quotazione per cui si sta emettendo l'offerta. */
  const [offertaId, setOffertaId] = useState<string | null>(null);
  const [openingEditId, setOpeningEditId] = useState<string | null>(null);
  const [completeRow, setCompleteRow] = useState<QuotationRow | null>(null);
  const [completePoDate, setCompletePoDate] = useState("");
  const [completeNotes, setCompleteNotes] = useState("");
  const [savingComplete, setSavingComplete] = useState(false);

  const potential = useMemo(() => rows.filter((r) => r.status === "potential"), [rows]);
  const pending = useMemo(() => rows.filter((r) => r.status === "quotation"), [rows]);
  const approved = useMemo(
    () => rows.filter((r) => r.status !== "quotation" && r.status !== "canceled" && r.status !== "potential"),
    [rows]
  );
  const canceled = useMemo(() => rows.filter((r) => r.status === "canceled"), [rows]);

  const filterFn = (r: QuotationRow) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return r.name.toLowerCase().includes(s) || (r.client || "").toLowerCase().includes(s);
  };

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["quotations-list"] });
    qc.invalidateQueries({ queryKey: ["admin-planner-all-certifications"] });
    qc.invalidateQueries({ queryKey: ["task-alerts"] });
  };

  const refreshApprovedSources = async () => {
    await Promise.all([
      qc.refetchQueries({ queryKey: ["quotations-list"], type: "all" }),
      qc.refetchQueries({ queryKey: ["admin-planner-all-certifications"], type: "all" }),
      qc.refetchQueries({ queryKey: ["task-alerts"], type: "all" }),
    ]);
  };

  const pushApprovedToOperationsCache = (id: string) => {
    qc.setQueryData<CachedAdminProject[]>(["admin-planner-all-certifications"], (current = []) =>
      current.map((project) => project.id === id ? {
        ...project, status: "quotation_approved", setup_status: "quotation_approved",
        plannerData: project.plannerData ? { ...project.plannerData, currentActivity: "Quotation Approved", status: "pending" } : project.plannerData,
      } : project)
    );
  };

  const handleApprove = async (id: string, groupIds?: string[]) => {
    setApprovingId(id);
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw new Error(userError.message);
      const userId = userData.user?.id;
      if (!userId) throw new Error("Session expired. Please sign in again.");

      const approvedAt = new Date().toISOString();
      const ids = groupIds && groupIds.length > 0 ? groupIds : [id];

      /*
        Qui la data di consegna diventa vincolante.

        Mandare un'offerta senza sapere quando si consegna e' normale, e infatti
        in fase di registrazione il campo e' libero. Approvarla e' un'altra
        cosa: da quel momento il progetto entra in Operations, il PM ci
        costruisce sopra la timeline e ogni scadenza si conta da li'. Senza
        data non c'e' niente da cui contare.

        Si controllano tutte le righe del gruppo, non solo quella cliccata: su
        un'offerta unificata basta che una non abbia la data perche' entri in
        Operations monca.
        */
      const senzaData = rows.filter((r) => ids.includes(r.id) && !r.handover_date);
      if (senzaData.length > 0) {
        const elenco = senzaData.map((r) => r.name).join(", ");
        throw new Error(
          senzaData.length === 1
            ? `Manca la data di consegna di "${elenco}". Aprila con Edit, inseriscila e riprova.`
            : `Manca la data di consegna di ${senzaData.length} progetti dell'offerta: ${elenco}. Inseriscile con Edit e riprova.`,
        );
      }
      const { data, error } = await supabase
        .from("certifications")
        .update({ status: "quotation_approved", quotation_approved_at: approvedAt, quotation_approved_by: userId })
        .in("id", ids).eq("status", "quotation")
        .select("id, name, client, status, quotation_approved_at");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("The quotation was not updated.");
      const approvedIds = new Set(data.map((r) => r.id));
      qc.setQueryData<QuotationRow[]>(["quotations-list"], (current = []) =>
        current.map((row) => approvedIds.has(row.id) ? { ...row, status: "quotation_approved", quotation_approved_at: approvedAt } : row)
      );
      approvedIds.forEach((rid) => pushApprovedToOperationsCache(rid));
      toast({
        title: ids.length > 1 ? `${data.length} quotations approved` : "Quotation approved",
        description: "Moved to Operations › Quotations Approved.",
      });
      await refreshApprovedSources();
    } catch (err) {
      toast({ title: "Approval failed", description: await readableFunctionError(err), variant: "destructive" });
    } finally { setApprovingId(null); }
  };

  const handleCancel = async (row: QuotationRow, groupIds?: string[]) => {
    const isGroup = groupIds && groupIds.length > 1;
    const msg = isGroup
      ? `Cancel this unified quotation (${groupIds!.length} certifications) for ${row.name}?`
      : `Cancel quotation for ${row.name}?\n\nIf this is the only quotation on its site, the site will also be frozen and hidden from the frontend.`;
    if (!window.confirm(msg)) return;
    setCancelingId(row.id);
    try {
      const ids = groupIds && groupIds.length > 0 ? groupIds : [row.id];
      const { error } = await supabase.from("certifications").update({ status: "canceled" }).in("id", ids);
      if (error) throw error;
      toast({ title: "Quotation canceled", description: `${row.name} moved to Canceled.` });
      invalidateAll();
    } catch (err) {
      toast({ title: "Cancel failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally { setCancelingId(null); }
  };

  const handleSaveNote = async (row: QuotationRow) => {
    const draft = noteDrafts[row.id] ?? row.quotation_notes ?? "";
    setSavingNote(row.id);
    try {
      const { error } = await supabase.from("certifications").update({ quotation_notes: draft }).eq("id", row.id);
      if (error) throw error;
      toast({ title: "Note saved" });
      invalidateAll();
    } catch (err) {
      toast({ title: "Save failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally { setSavingNote(null); }
  };

  const handleResume = async (row: QuotationRow, target: "quotation" | "quotation_approved") => {
    setResumingId(row.id);
    try {
      const patch: any = { status: target };
      if (target === "quotation_approved") {
        const { data: userData } = await supabase.auth.getUser();
        patch.quotation_approved_at = new Date().toISOString();
        patch.quotation_approved_by = userData.user?.id ?? null;
      }
      const { error } = await supabase.from("certifications").update(patch).eq("id", row.id);
      if (error) throw error;
      toast({ title: "Quotation resumed", description: target === "quotation" ? "Moved back to Pending." : "Moved to Approved." });
      setResumeDialog(null);
      invalidateAll();
    } catch (err) {
      toast({ title: "Resume failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally { setResumingId(null); }
  };

  /**
   * Apre la modale di modifica su una quotazione gia' registrata.
   *
   * L'elenco carica solo le colonne che mostra, mentre la modale ha bisogno
   * della riga intera — sito, PM, tipo, subtype, fee — quindi la si rilegge
   * qui, insieme alle allocazioni hardware gia' richieste, che altrimenti la
   * modale salverebbe come "nessuna" cancellandole.
   */
  /**
   * Modifica un'offerta: si riapre il wizard con cui è stata scritta.
   *
   * Prima si apriva un form diverso — «Review & Config» — che nel tempo si era
   * allontanato: non aveva la versione dello standard, né il tipo di
   * quotazione, né lo schema di pagamento con le sue tranche, e chiamava le
   * stesse cose con altri nomi. Chi tornava a correggere un nome sbagliato si
   * trovava in un posto che non riconosceva, e metà di quello che aveva
   * compilato non era più raggiungibile.
   */
  const openEdit = (id: string) => {
    setModificaCertId(id);
    setWizardOpen(true);
  };

  /**
   * "Complete": le informazioni che arrivano DOPO l'approvazione.
   *
   * Un'offerta approvata e' un documento firmato: importi, valuta, monte ore,
   * schema e livello non si toccano piu'. Quello che invece si sa solo dopo —
   * quando il cliente firma l'ordine — si aggiunge qui.
   *
   * Si legge la riga intera perche' l'elenco carica solo le colonne che mostra:
   * il livello e il monte ore, che nel riquadro vanno letti, non ci sono.
   */
  const openComplete = async (r: QuotationRow) => {
    setCompleteRow(r);
    setCompletePoDate("");
    setCompleteNotes(r.quotation_notes ?? "");
    const { data } = await supabase
      .from("certifications")
      .select("po_sign_date, quotation_notes, allocated_hours, cert_level, cert_rating")
      .eq("id", r.id)
      .maybeSingle();
    if (data) {
      setCompletePoDate((data as any).po_sign_date ?? "");
      setCompleteNotes((data as any).quotation_notes ?? "");
      setCompleteRow((prev) => (prev ? { ...prev, ...(data as any) } : prev));
    }
  };

  const saveComplete = async () => {
    if (!completeRow) return;
    setSavingComplete(true);
    try {
      const { error } = await supabase
        .from("certifications")
        .update({
          po_sign_date: completePoDate || null,
          quotation_notes: completeNotes.trim() || null,
        })
        .eq("id", completeRow.id);
      if (error) throw error;
      toast({ title: "Saved", description: "Additional information updated." });
      setCompleteRow(null);
      invalidateAll();
    } catch (err) {
      toast({ title: "Save failed", description: readableError(err), variant: "destructive" });
    } finally {
      setSavingComplete(false);
    }
  };

  const EditButton = ({ id }: { id: string }) => (
    <Button
      size="sm"
      variant="outline"
      className="gap-1.5"
      disabled={openingEditId === id}
      onClick={() => openEdit(id)}
      title="Edit this quotation"
    >
      {openingEditId === id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />}
      Edit
    </Button>
  );

  const renderPotential = () => {
    const filtered = potential.filter(filterFn);
    if (isLoading) return <div className="space-y-2">{[0,1,2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>;
    if (filtered.length === 0) return (
      <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No potential quotations. Use "New Quotation" and flag as Potential to save Site &amp; Project only.</CardContent></Card>
    );
    return (
      <div className="table-container overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b">
            <th className="text-left p-3 font-medium text-muted-foreground">Client</th>
            <th className="text-left p-3 font-medium text-muted-foreground">City</th>
            <th className="text-left p-3 font-medium text-muted-foreground">Project</th>
            <th className="text-left p-3 font-medium text-muted-foreground">Region</th>
            <th className="text-left p-3 font-medium text-muted-foreground">Handover</th>
            <th className="text-left p-3 font-medium text-muted-foreground">Created</th>
            <th className="p-3" />
          </tr></thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-b last:border-b-0 hover:bg-muted/50">
                <td className="p-3 font-semibold text-foreground uppercase">{r.client}</td>
                <td className="p-3 text-muted-foreground uppercase">{r.sites?.city || "—"}</td>
                <td className="p-3 text-foreground">{r.name}</td>
                <td className="p-3">{r.region ? <Badge variant="outline">{r.region}</Badge> : "—"}</td>
                <td className="p-3 text-muted-foreground">{r.handover_date ? format(new Date(r.handover_date), "dd MMM yyyy") : "—"}</td>
                <td className="p-3 text-muted-foreground">{r.created_at ? format(new Date(r.created_at), "dd MMM yyyy") : "—"}</td>
                <td className="p-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <EditButton id={r.id} />
                    <Button size="sm" className="gap-1.5" onClick={() => { setResumeCertId(r.id); setWizardOpen(true); }}>
                      <ArrowRight className="h-3.5 w-3.5" /> Go on with Services &amp; Quote
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderCanceled = () => {
    const filtered = canceled.filter(filterFn);
    if (isLoading) return <div className="space-y-2">{[0,1,2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>;
    if (filtered.length === 0) return (
      <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No canceled quotations.</CardContent></Card>
    );
    return (
      <div className="table-container overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b">
            <th className="p-3 w-8" />
            <th className="text-left p-3 font-medium text-muted-foreground">Client</th>
            <th className="text-left p-3 font-medium text-muted-foreground">City</th>
            <th className="text-left p-3 font-medium text-muted-foreground">Project</th>
            <th className="text-left p-3 font-medium text-muted-foreground">Region</th>
            <th className="text-left p-3 font-medium text-muted-foreground">Total Fees</th>
            <th className="text-left p-3 font-medium text-muted-foreground">Handover</th>
            <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
            <th className="p-3" />
          </tr></thead>
          <tbody>
            {filtered.map((r) => {
              const open = !!expandedCanceled[r.id];
              const draft = noteDrafts[r.id] ?? r.quotation_notes ?? "";
              return (
                <React.Fragment key={r.id}>
                  <tr className="border-b hover:bg-muted/50 cursor-pointer" onClick={() => setExpandedCanceled((s) => ({ ...s, [r.id]: !s[r.id] }))}>
                    <td className="p-3 text-muted-foreground">{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}</td>
                    <td className="p-3 font-semibold text-foreground uppercase">{r.client}</td>
                    <td className="p-3 text-muted-foreground uppercase">{r.sites?.city || "—"}</td>
                    <td className="p-3 text-foreground">{r.name}</td>
                    <td className="p-3">{r.region ? <Badge variant="outline">{r.region}</Badge> : "—"}</td>
                    <td className="p-3 font-medium"><Money amount={r.total_fees} currency={r.currency} rateToEur={r.fx_rate_to_eur} /></td>
                    <td className="p-3 text-muted-foreground">{r.handover_date ? format(new Date(r.handover_date), "dd MMM yyyy") : "—"}</td>
                    <td className="p-3">
                      <Badge variant="outline" className="gap-1 text-destructive border-destructive/30 bg-destructive/10">
                        <Ban className="h-3 w-3" /> Canceled
                      </Badge>
                    </td>
                    <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" className="gap-1.5" onClick={() => setResumeDialog(r)}>
                        <RotateCcw className="h-3 w-3" /> Resume
                      </Button>
                    </td>
                  </tr>
                  {open && (
                    <tr className="border-b bg-muted/20">
                      <td />
                      <td colSpan={8} className="p-4 space-y-3">
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-muted-foreground">Reason for cancellation / rejection notes</label>
                          <Textarea
                            placeholder="Add the reason why this quotation was canceled or rejected…"
                            value={draft}
                            onChange={(e) => setNoteDrafts((s) => ({ ...s, [r.id]: e.target.value }))}
                            className="min-h-[80px] text-sm bg-background"
                          />
                        </div>
                        <div className="flex items-center justify-end gap-2">
                          <Button size="sm" variant="outline" className="gap-1.5" disabled={savingNote === r.id} onClick={() => handleSaveNote(r)}>
                            {savingNote === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                            Save note
                          </Button>
                          <Button size="sm" className="gap-1.5" onClick={() => setResumeDialog(r)}>
                            <RotateCcw className="h-3 w-3" /> Resume
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  // Collapse rows sharing quotation_group_id into a single display row.
  const groupRows = (rows: QuotationRow[]) => {
    type Display = QuotationRow & { _groupIds: string[]; _certTypes: string[] };
    const map = new Map<string, Display>();
    const out: Display[] = [];
    for (const r of rows) {
      const gid = r.quotation_group_id;
      if (gid) {
        const existing = map.get(gid);
        if (existing) {
          existing._groupIds.push(r.id);
          if (r.cert_type) existing._certTypes.push(r.cert_type);
          // Le righe di un'offerta unificata possono essere in valute diverse:
          // si sommano gli euro, che e' l'unica somma che significa qualcosa, e
          // il totale mostrato diventa quello in euro.
          existing.total_fees_eur = (existing.total_fees_eur ?? 0) + (r.total_fees_eur ?? 0);
          if (r.currency !== existing.currency) {
            existing.currency = "EUR";
            existing.fx_rate_to_eur = 1;
            existing.total_fees = existing.total_fees_eur;
          } else {
            existing.total_fees = (existing.total_fees ?? 0) + (r.total_fees ?? 0);
          }
        } else {
          const d: Display = { ...r, _groupIds: [r.id], _certTypes: r.cert_type ? [r.cert_type] : [] };
          map.set(gid, d);
          out.push(d);
        }
      } else {
        out.push({ ...r, _groupIds: [r.id], _certTypes: r.cert_type ? [r.cert_type] : [] });
      }
    }
    return out;
  };

  const renderTable = (data: QuotationRow[], mode: "pending" | "approved") => {
    const filtered = groupRows(data.filter(filterFn));
    if (isLoading) return <div className="space-y-2">{[0,1,2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>;
    if (filtered.length === 0) return (
      <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
        {mode === "pending" ? "No quotations pending approval." : "No approved quotations yet."}
      </CardContent></Card>
    );
    return (
      <div className="table-container overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b">
            <th className="text-left p-3 font-medium text-muted-foreground">Client</th>
            <th className="text-left p-3 font-medium text-muted-foreground">City</th>
            <th className="text-left p-3 font-medium text-muted-foreground">Project</th>
            <th className="text-left p-3 font-medium text-muted-foreground">Certifications</th>
            <th className="text-left p-3 font-medium text-muted-foreground">Region</th>
            <th className="text-left p-3 font-medium text-muted-foreground">Total Fees</th>
            <th className="text-left p-3 font-medium text-muted-foreground">Handover</th>
            <th className="text-left p-3 font-medium text-muted-foreground">{mode === "pending" ? "Sent" : "Approved"}</th>
            <th className="p-3" />
          </tr></thead>
          <tbody>
            {filtered.map((r) => {
              const isGroup = r._groupIds.length > 1;
              return (
                <tr key={r.quotation_group_id ?? r.id} className="border-b last:border-b-0 hover:bg-muted/50">
                  <td className="p-3 font-semibold text-foreground uppercase">{r.client}</td>
                  <td className="p-3 text-muted-foreground uppercase">{r.sites?.city || "—"}</td>
                  <td className="p-3 text-foreground">
                    {r.name}
                    {isGroup && <Badge variant="outline" className="ml-2 text-[10px] border-primary/30 text-primary bg-primary/5">Unified · {r._groupIds.length}</Badge>}
                  </td>
                  <td className="p-3">
                    {r._certTypes.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {r._certTypes.map((t) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
                      </div>
                    ) : "—"}
                  </td>
                  <td className="p-3">{r.region ? <Badge variant="outline">{r.region}</Badge> : "—"}</td>
                  <td className="p-3 font-medium"><Money amount={r.total_fees} currency={r.currency} rateToEur={r.fx_rate_to_eur} /></td>
                  <td className="p-3 text-muted-foreground">{r.handover_date ? format(new Date(r.handover_date), "dd MMM yyyy") : "—"}</td>
                  <td className="p-3 text-muted-foreground">
                    {mode === "pending"
                      ? (r.quotation_sent_date ? format(new Date(r.quotation_sent_date), "dd MMM yyyy") : "—")
                      : (r.quotation_approved_at ? format(new Date(r.quotation_approved_at), "dd MMM yyyy") : "—")}
                  </td>
                  <td className="p-3 text-right">
                    {mode === "pending" ? (
                      <div className="flex items-center justify-end gap-2">
                        {/* L'offerta si emette da qui: e' il momento in cui si
                            decide a chi si intesta e cosa si sta vendendo. */}
                        <Button
                          size="sm" variant="outline" className="gap-1"
                          title="Genera il PDF dell'offerta"
                          onClick={() => setOffertaId(r.id)}
                        >
                          <FileDown className="h-3 w-3" /> Offerta
                        </Button>
                        <EditButton id={r.id} />
                        <Button size="sm" className="gap-1" disabled={approvingId === r.id} onClick={() => handleApprove(r.id, r._groupIds)}>
                          {approvingId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                          {isGroup ? "Approve all" : "Mark as Approved"}
                        </Button>
                        <Button size="sm" variant="destructive" className="gap-1" disabled={cancelingId === r.id} onClick={() => handleCancel(r, r._groupIds)}>
                          {cancelingId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-2">
                        <Badge variant="outline" className="gap-1 text-success border-success/30 bg-success/10">
                          <CheckCircle2 className="h-3 w-3" /> Approved
                        </Badge>
                        {/* Un'offerta approvata non si modifica piu': i suoi
                            valori sono quelli firmati. "Complete" aggiunge
                            quello che si sa dopo, senza toccarli. */}
                        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openComplete(r)}>
                          <FilePlus2 className="h-3.5 w-3.5" /> Complete
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <MainLayout title="Quotations" subtitle="Draft, approve or cancel quotations before they enter Operations">
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search project or client..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button onClick={() => { setResumeCertId(undefined); setWizardOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> New Quotation
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="potential" className="gap-2"><Sparkles className="h-4 w-4" /> Potential ({potential.length})</TabsTrigger>
          <TabsTrigger value="pending" className="gap-2"><FileText className="h-4 w-4" /> Pending ({pending.length})</TabsTrigger>
          <TabsTrigger value="approved" className="gap-2"><ArrowRight className="h-4 w-4" /> Approved ({approved.length})</TabsTrigger>
          <TabsTrigger value="canceled" className="gap-2"><Ban className="h-4 w-4" /> Canceled ({canceled.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="potential" className="mt-4">{renderPotential()}</TabsContent>
        <TabsContent value="pending" className="mt-4">{renderTable(pending, "pending")}</TabsContent>
        <TabsContent value="approved" className="mt-4">{renderTable(approved, "approved")}</TabsContent>
        <TabsContent value="canceled" className="mt-4">{renderCanceled()}</TabsContent>
      </Tabs>

      <OffertaDialog
        open={!!offertaId}
        onOpenChange={(o) => { if (!o) setOffertaId(null); }}
        certificationId={offertaId}
      />

      <NewQuotationWizard
        open={wizardOpen}
        onOpenChange={(o) => {
          setWizardOpen(o);
          if (!o) { setResumeCertId(undefined); setModificaCertId(undefined); }
        }}
        resumeCertId={resumeCertId}
        modificaCertId={modificaCertId}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["quotations-list"] });
          qc.invalidateQueries({ queryKey: ["admin-planner-all-certifications"] });
        }}
      />

      {/* Complete: si aggiunge, non si corregge */}
      <Dialog open={!!completeRow} onOpenChange={(o) => !o && setCompleteRow(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Complete {completeRow?.name}</DialogTitle>
            <DialogDescription>
              Add what is known after the approval. The figures agreed in the quotation are shown for
              reference and cannot be changed here.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total fees</span>
              <span className="font-medium">
                {formatMoney(completeRow?.total_fees, completeRow?.currency)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Hourly budget</span>
              <span className="font-medium">
                {(completeRow as any)?.allocated_hours != null ? `${Number((completeRow as any).allocated_hours)} h` : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Rating · Level</span>
              <span className="font-medium">
                {[(completeRow as any)?.cert_rating, (completeRow as any)?.cert_level].filter(Boolean).join(" · ") || "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Quotation sign date</span>
              <span className="font-medium">
                {completeRow?.quotation_approved_at ? format(new Date(completeRow.quotation_approved_at), "dd MMM yyyy") : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Handover</span>
              <span className="font-medium">
                {completeRow?.handover_date ? format(new Date(completeRow.handover_date), "dd MMM yyyy") : "—"}
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">PO sign date</label>
              <Input type="date" value={completePoDate} onChange={(e) => setCompletePoDate(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">
                Quando il cliente ha firmato l'ordine. Diverso dalla data di approvazione
                dell'offerta, che la registra il sistema.
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Notes</label>
              <Textarea rows={3} value={completeNotes} onChange={(e) => setCompleteNotes(e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteRow(null)}>Cancel</Button>
            <Button onClick={saveComplete} disabled={savingComplete} className="gap-1.5">
              {savingComplete ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resumeDialog} onOpenChange={(o) => !o && setResumeDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resume quotation</DialogTitle>
            <DialogDescription>
              Where should <strong>{resumeDialog?.name}</strong> be moved?
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
            <Button variant="outline" className="h-auto py-4 flex-col gap-1 items-start" disabled={!!resumingId} onClick={() => resumeDialog && handleResume(resumeDialog, "quotation")}>
              <div className="flex items-center gap-2 font-medium"><FileText className="h-4 w-4" /> Back to Pending</div>
              <div className="text-xs text-muted-foreground">Re-open for approval</div>
            </Button>
            <Button className="h-auto py-4 flex-col gap-1 items-start" disabled={!!resumingId} onClick={() => resumeDialog && handleResume(resumeDialog, "quotation_approved")}>
              <div className="flex items-center gap-2 font-medium"><CheckCircle2 className="h-4 w-4" /> Move to Approved</div>
              <div className="text-xs opacity-80">Skip to Operations</div>
            </Button>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setResumeDialog(null)} disabled={!!resumingId}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}

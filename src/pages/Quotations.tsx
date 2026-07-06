import { useMemo, useState } from "react";
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
import { Plus, Search, FileText, CheckCircle2, Loader2, ArrowRight, XCircle, Ban, Sparkles, RotateCcw, ChevronDown, ChevronRight as ChevronRightIcon, Save } from "lucide-react";

interface QuotationRow {
  id: string;
  name: string;
  client: string;
  region: string | null;
  total_fees: number | null;
  handover_date: string | null;
  quotation_sent_date: string | null;
  quotation_approved_at: string | null;
  created_at: string | null;
  status: string;
  quotation_notes?: string | null;
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
        .select("id, name, client, region, total_fees, handover_date, quotation_sent_date, quotation_approved_at, created_at, status, quotation_notes, sites(city)")
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
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [expandedCanceled, setExpandedCanceled] = useState<Record<string, boolean>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [savingNote, setSavingNote] = useState<string | null>(null);
  const [resumeDialog, setResumeDialog] = useState<QuotationRow | null>(null);
  const [resumingId, setResumingId] = useState<string | null>(null);

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

  const handleApprove = async (id: string) => {
    setApprovingId(id);
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw new Error(userError.message);
      const userId = userData.user?.id;
      if (!userId) throw new Error("Session expired. Please sign in again.");

      const approvedAt = new Date().toISOString();
      const { data, error } = await supabase
        .from("certifications")
        .update({ status: "quotation_approved", quotation_approved_at: approvedAt, quotation_approved_by: userId })
        .eq("id", id).eq("status", "quotation")
        .select("id, name, client, status, quotation_approved_at").maybeSingle();
      if (error) throw error;
      if (!data || data.status !== "quotation_approved") throw new Error("The quotation was not updated.");
      qc.setQueryData<QuotationRow[]>(["quotations-list"], (current = []) =>
        current.map((row) => row.id === id ? { ...row, status: "quotation_approved", quotation_approved_at: data.quotation_approved_at ?? approvedAt } : row)
      );
      pushApprovedToOperationsCache(id);
      toast({ title: "Quotation approved", description: "Moved to Operations › Quotations Approved." });
      await refreshApprovedSources();
    } catch (err) {
      toast({ title: "Approval failed", description: await readableFunctionError(err), variant: "destructive" });
    } finally { setApprovingId(null); }
  };

  const handleCancel = async (row: QuotationRow) => {
    if (!window.confirm(`Cancel quotation for ${row.name}?\n\nIf this is the only quotation on its site, the site will also be frozen and hidden from the frontend.`)) return;
    setCancelingId(row.id);
    try {
      const { error } = await supabase.from("certifications").update({ status: "canceled" }).eq("id", row.id);
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

  const renderPotential = () => {
    const filtered = potential.filter(filterFn);
    if (isLoading) return <div className="space-y-2">{[0,1,2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>;
    if (filtered.length === 0) return (
      <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No potential quotations. Use "New Quotation" and flag as Potential to save Site &amp; Project only.</CardContent></Card>
    );
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((r) => (
          <Card key={r.id} className="border-slate-200">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start gap-2">
                <Sparkles className="h-4 w-4 text-slate-500 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-foreground truncate">{r.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{r.client}</div>
                </div>
                <Badge variant="outline" className="border-slate-300 text-slate-600 bg-slate-50">Potential</Badge>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {r.region && <Badge variant="outline">{r.region}</Badge>}
                {r.handover_date && <span>Handover {format(new Date(r.handover_date), "dd MMM yyyy")}</span>}
              </div>
              <Button size="sm" className="w-full gap-1.5" onClick={() => { setResumeCertId(r.id); setWizardOpen(true); }}>
                <ArrowRight className="h-3.5 w-3.5" /> Go on with Services &amp; Quote
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  const renderCanceled = () => {
    const filtered = canceled.filter(filterFn);
    if (isLoading) return <div className="space-y-2">{[0,1,2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;
    if (filtered.length === 0) return (
      <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No canceled quotations.</CardContent></Card>
    );
    return (
      <div className="space-y-2">
        {filtered.map((r) => {
          const open = !!expandedCanceled[r.id];
          const draft = noteDrafts[r.id] ?? r.quotation_notes ?? "";
          return (
            <Card key={r.id} className="border-destructive/20">
              <CardContent className="p-0">
                <button
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/40"
                  onClick={() => setExpandedCanceled((s) => ({ ...s, [r.id]: !s[r.id] }))}
                >
                  {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground truncate">{r.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {r.client} {r.region ? `· ${r.region}` : ""} {r.total_fees != null ? `· €${Number(r.total_fees).toLocaleString()}` : ""}
                    </div>
                  </div>
                  <Badge variant="outline" className="gap-1 text-destructive border-destructive/30 bg-destructive/10">
                    <Ban className="h-3 w-3" /> Canceled
                  </Badge>
                </button>
                {open && (
                  <div className="border-t p-4 space-y-3 bg-muted/20">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div><div className="text-muted-foreground">Total Fees</div><div className="font-medium">{r.total_fees != null ? `€${Number(r.total_fees).toLocaleString()}` : "—"}</div></div>
                      <div><div className="text-muted-foreground">Handover</div><div className="font-medium">{r.handover_date ? format(new Date(r.handover_date), "dd MMM yyyy") : "—"}</div></div>
                      <div><div className="text-muted-foreground">Sent</div><div className="font-medium">{r.quotation_sent_date ? format(new Date(r.quotation_sent_date), "dd MMM yyyy") : "—"}</div></div>
                      <div><div className="text-muted-foreground">Created</div><div className="font-medium">{r.created_at ? format(new Date(r.created_at), "dd MMM yyyy") : "—"}</div></div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Reason for cancellation / rejection notes</label>
                      <Textarea
                        placeholder="Add the reason why this quotation was canceled or rejected…"
                        value={draft}
                        onChange={(e) => setNoteDrafts((s) => ({ ...s, [r.id]: e.target.value }))}
                        className="min-h-[80px] text-sm"
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
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  };

  const renderTable = (data: QuotationRow[], mode: "pending" | "approved") => {
    const filtered = data.filter(filterFn);
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
            <th className="text-left p-3 font-medium text-muted-foreground">Region</th>
            <th className="text-left p-3 font-medium text-muted-foreground">Total Fees</th>
            <th className="text-left p-3 font-medium text-muted-foreground">Handover</th>
            <th className="text-left p-3 font-medium text-muted-foreground">{mode === "pending" ? "Sent" : "Approved"}</th>
            <th className="p-3" />
          </tr></thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-b last:border-b-0 hover:bg-muted/50">
                <td className="p-3 font-semibold text-foreground">{r.client}</td>
                <td className="p-3 text-muted-foreground">{r.sites?.city || "—"}</td>
                <td className="p-3 text-foreground">{r.name}</td>
                <td className="p-3">{r.region ? <Badge variant="outline">{r.region}</Badge> : "—"}</td>
                <td className="p-3 font-medium">{r.total_fees != null ? `€${Number(r.total_fees).toLocaleString()}` : "—"}</td>
                <td className="p-3 text-muted-foreground">{r.handover_date ? format(new Date(r.handover_date), "dd MMM yyyy") : "—"}</td>
                <td className="p-3 text-muted-foreground">
                  {mode === "pending"
                    ? (r.quotation_sent_date ? format(new Date(r.quotation_sent_date), "dd MMM yyyy") : "—")
                    : (r.quotation_approved_at ? format(new Date(r.quotation_approved_at), "dd MMM yyyy") : "—")}
                </td>
                <td className="p-3 text-right">
                  {mode === "pending" ? (
                    <div className="flex items-center justify-end gap-2">
                      <Button size="sm" className="gap-1" disabled={approvingId === r.id} onClick={() => handleApprove(r.id)}>
                        {approvingId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                        Mark as Approved
                      </Button>
                      <Button size="sm" variant="destructive" className="gap-1" disabled={cancelingId === r.id} onClick={() => handleCancel(r)}>
                        {cancelingId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Badge variant="outline" className="gap-1 text-success border-success/30 bg-success/10">
                      <CheckCircle2 className="h-3 w-3" /> Approved
                    </Badge>
                  )}
                </td>
              </tr>
            ))}
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

      <NewQuotationWizard
        open={wizardOpen}
        onOpenChange={(o) => { setWizardOpen(o); if (!o) setResumeCertId(undefined); }}
        resumeCertId={resumeCertId}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["quotations-list"] });
          qc.invalidateQueries({ queryKey: ["admin-planner-all-certifications"] });
        }}
      />

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

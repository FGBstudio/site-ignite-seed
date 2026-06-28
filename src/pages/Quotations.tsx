import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { MainLayout } from "@/components/layout/MainLayout";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { NewQuotationWizard } from "@/components/projects/NewQuotationWizard";
import { Plus, Search, FileText, CheckCircle2, Loader2, ArrowRight, XCircle, Ban } from "lucide-react";

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
}

function useQuotations() {
  return useQuery({
    queryKey: ["quotations-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("certifications")
        .select(
          "id, name, client, region, total_fees, handover_date, quotation_sent_date, quotation_approved_at, created_at, status"
        )
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as unknown as QuotationRow[];
    },
  });
}

export default function Quotations() {
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuotations();

  const [tab, setTab] = useState<"pending" | "approved" | "canceled">("pending");
  const [search, setSearch] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  const pending = useMemo(() => rows.filter((r) => r.status === "quotation"), [rows]);
  const approved = useMemo(
    () => rows.filter((r) => r.status !== "quotation" && r.status !== "canceled"),
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

  const handleApprove = async (id: string) => {
    setApprovingId(id);
    try {
      const { error } = await supabase
        .from("certifications")
        .update({
          status: "quotation_approved",
          quotation_approved_at: new Date().toISOString(),
          quotation_approved_by: user?.id ?? null,
        } as any)
        .eq("id", id);
      if (error) throw error;
      toast({
        title: "Quotation approved",
        description: "Moved to Operations › Quotations Approved.",
      });
      invalidateAll();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast({ title: "Approval failed", description: message, variant: "destructive" });
    } finally {
      setApprovingId(null);
    }
  };

  const handleCancel = async (row: QuotationRow) => {
    const confirmed = window.confirm(`Cancel quotation for ${row.name}? It will be moved to the canceled history.`);
    if (!confirmed) return;
    setCancelingId(row.id);
    try {
      const { error } = await supabase
        .from("certifications")
        .update({ status: "canceled" })
        .eq("id", row.id);
      if (error) throw error;
      toast({
        title: "Quotation canceled",
        description: `${row.name} moved to Canceled.`,
      });
      invalidateAll();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast({ title: "Cancel failed", description: message, variant: "destructive" });
    } finally {
      setCancelingId(null);
    }
  };

  const renderTable = (data: QuotationRow[], mode: "pending" | "approved" | "canceled") => {
    const filtered = data.filter(filterFn);
    if (isLoading) {
      return (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      );
    }
    if (filtered.length === 0) {
      return (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {mode === "pending"
              ? "No quotations pending approval."
              : mode === "approved"
              ? "No approved quotations yet."
              : "No canceled quotations."}
          </CardContent>
        </Card>
      );
    }
    return (
      <div className="table-container overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left p-3 font-medium text-muted-foreground">Project</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Client</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Region</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Total Fees</th>
              {mode !== "canceled" && (
                <th className="text-left p-3 font-medium text-muted-foreground">Handover</th>
              )}
              <th className="text-left p-3 font-medium text-muted-foreground">
                {mode === "pending" ? "Sent" : mode === "approved" ? "Approved" : "Canceled"}
              </th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-b last:border-b-0 hover:bg-muted/50">
                <td className="p-3 font-medium text-foreground">{r.name}</td>
                <td className="p-3 text-foreground">{r.client}</td>
                <td className="p-3">
                  {r.region ? <Badge variant="outline">{r.region}</Badge> : "—"}
                </td>
                <td className="p-3 font-medium">
                  {r.total_fees != null ? `€${Number(r.total_fees).toLocaleString()}` : "—"}
                </td>
                {mode !== "canceled" && (
                  <td className="p-3 text-muted-foreground">
                    {r.handover_date ? format(new Date(r.handover_date), "dd MMM yyyy") : "—"}
                  </td>
                )}
                <td className="p-3 text-muted-foreground">
                  {mode === "pending"
                    ? r.quotation_sent_date
                      ? format(new Date(r.quotation_sent_date), "dd MMM yyyy")
                      : "—"
                    : mode === "approved"
                    ? r.quotation_approved_at
                      ? format(new Date(r.quotation_approved_at), "dd MMM yyyy")
                      : "—"
                    : r.quotation_sent_date || r.created_at
                    ? format(new Date(r.quotation_sent_date || r.created_at || ""), "dd MMM yyyy")
                    : "—"}
                </td>
                <td className="p-3 text-right">
                  {mode === "pending" ? (
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        className="gap-1"
                        disabled={approvingId === r.id}
                        onClick={() => handleApprove(r.id)}
                      >
                        {approvingId === r.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-3 w-3" />
                        )}
                        Mark as Approved
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="gap-1"
                        disabled={cancelingId === r.id}
                        onClick={() => handleCancel(r)}
                      >
                        {cancelingId === r.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <XCircle className="h-3 w-3" />
                        )}
                        Cancel
                      </Button>
                    </div>
                  ) : mode === "approved" ? (
                    <Badge variant="outline" className="gap-1 text-success border-success/30 bg-success/10">
                      <CheckCircle2 className="h-3 w-3" /> Approved
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1 text-destructive border-destructive/30 bg-destructive/10">
                      <Ban className="h-3 w-3" /> Canceled
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
          <Input
            placeholder="Search project or client..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={() => setWizardOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> New Quotation
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="pending" className="gap-2">
            <FileText className="h-4 w-4" /> Pending ({pending.length})
          </TabsTrigger>
          <TabsTrigger value="approved" className="gap-2">
            <ArrowRight className="h-4 w-4" /> Approved ({approved.length})
          </TabsTrigger>
          <TabsTrigger value="canceled" className="gap-2">
            <Ban className="h-4 w-4" /> Canceled ({canceled.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          {renderTable(pending, "pending")}
        </TabsContent>
        <TabsContent value="approved" className="mt-4">
          {renderTable(approved, "approved")}
        </TabsContent>
        <TabsContent value="canceled" className="mt-4">
          {renderTable(canceled, "canceled")}
        </TabsContent>
      </Tabs>

      <NewQuotationWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["quotations-list"] });
          qc.invalidateQueries({ queryKey: ["admin-planner-all-certifications"] });
        }}
      />

    </MainLayout>
  );
}

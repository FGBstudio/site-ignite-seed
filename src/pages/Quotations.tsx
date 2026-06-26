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
import { NewQuotationWizard } from "@/components/projects/NewQuotationWizard";
import { Plus, Search, FileText, CheckCircle2, Loader2, ArrowRight } from "lucide-react";

interface QuotationRow {
  id: string;
  name: string;
  client: string;
  region: string | null;
  total_fees: number | null;
  handover_date: string | null;
  quotation_sent_date: string | null;
  quotation_approved_at: string | null;
  status: string;
}

function useQuotations() {
  return useQuery({
    queryKey: ["quotations-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("certifications")
        .select(
          "id, name, client, region, total_fees, handover_date, quotation_sent_date, quotation_approved_at, status"
        )
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as QuotationRow[];
    },
  });
}

export default function Quotations() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuotations();

  const [tab, setTab] = useState<"pending" | "approved">("pending");
  const [search, setSearch] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  // Pending = quotation status; Approved = anything past quotation that has approval timestamp,
  // OR projects whose status is no longer 'quotation' (legacy approved before this feature shipped).
  const pending = useMemo(
    () => rows.filter((r) => r.status === "quotation"),
    [rows]
  );
  const approved = useMemo(
    () => rows.filter((r) => r.status !== "quotation"),
    [rows]
  );

  const filterFn = (r: QuotationRow) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return r.name.toLowerCase().includes(s) || (r.client || "").toLowerCase().includes(s);
  };

  const handleApprove = async (id: string) => {
    setApprovingId(id);
    try {
      const { error } = await supabase.functions.invoke("approve-quotation", {
        body: { certification_id: id },
      });
      if (error) throw error;
      toast({
        title: "Quotation approved",
        description: "Operations and Payments have been notified.",
      });
      qc.invalidateQueries({ queryKey: ["quotations-list"] });
      qc.invalidateQueries({ queryKey: ["admin-planner-all-certifications"] });
      qc.invalidateQueries({ queryKey: ["task-alerts"] });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast({ title: "Approval failed", description: message, variant: "destructive" });
    } finally {
      setApprovingId(null);
    }
  };

  const renderTable = (data: QuotationRow[], isPending: boolean) => {
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
            {isPending ? "No quotations pending approval." : "No approved quotations yet."}
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
              <th className="text-left p-3 font-medium text-muted-foreground">Handover</th>
              <th className="text-left p-3 font-medium text-muted-foreground">
                {isPending ? "Sent" : "Approved"}
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
                <td className="p-3 text-muted-foreground">
                  {r.handover_date ? format(new Date(r.handover_date), "dd MMM yyyy") : "—"}
                </td>
                <td className="p-3 text-muted-foreground">
                  {isPending
                    ? r.quotation_sent_date
                      ? format(new Date(r.quotation_sent_date), "dd MMM yyyy")
                      : "—"
                    : r.quotation_approved_at
                    ? format(new Date(r.quotation_approved_at), "dd MMM yyyy")
                    : "—"}
                </td>
                <td className="p-3 text-right">
                  {isPending ? (
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
    <MainLayout title="Quotations" subtitle="Draft and approve quotations, then hand them over to Operations and Payments">
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

      <Tabs value={tab} onValueChange={(v) => setTab(v as "pending" | "approved")}>
        <TabsList>
          <TabsTrigger value="pending" className="gap-2">
            <FileText className="h-4 w-4" /> Pending ({pending.length})
          </TabsTrigger>
          <TabsTrigger value="approved" className="gap-2">
            <ArrowRight className="h-4 w-4" /> Approved ({approved.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          {renderTable(pending, true)}
        </TabsContent>
        <TabsContent value="approved" className="mt-4">
          {renderTable(approved, false)}
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

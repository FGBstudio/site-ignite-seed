import { MainLayout } from "@/components/layout/MainLayout";
import { useAllOverduePayments } from "@/hooks/usePaymentMilestones";
import { useResourceSaturation } from "@/hooks/useResourceSaturation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Users, FolderKanban, DollarSign } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

const statusColors: Record<string, string> = {
  Design: "bg-primary/10 text-primary border-primary/20",
  Construction: "bg-warning/10 text-warning border-warning/20",
  Completed: "bg-success/10 text-success border-success/20",
  Cancelled: "bg-destructive/10 text-destructive border-destructive/20",
};

export default function CeoDashboard() {
  const navigate = useNavigate();
  const { data: overduePayments = [], isLoading: loadingPayments, isError: errorPayments } = useAllOverduePayments();
  const { data: saturation = [], isLoading: loadingSaturation, isError: errorSaturation } = useResourceSaturation();

  const { data: activeProjects = [], isLoading: loadingProjects, isError: errorProjects } = useQuery({
    queryKey: ["ceo-active-projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*, profiles!projects_pm_id_fkey(full_name)")
        .in("status", ["Design", "Construction"])
        .order("handover_date", { ascending: true });
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const totalOverdueAmount = overduePayments.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
  const maxTasks = Math.max(...saturation.map((s) => s.total_active_tasks), 1);

  return (
    <MainLayout title="CEO Dashboard" subtitle="Overview finanziaria, risorse e portfolio">
      {/* KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pagamenti Scaduti</p>
              {loadingPayments ? <Skeleton className="h-8 w-16" /> : (
                <>
                  <p className="text-2xl font-bold text-foreground">{overduePayments.length}</p>
                  <p className="text-xs text-muted-foreground">
                    Totale: €{totalOverdueAmount.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                  </p>
                </>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Risorse Attive</p>
              {loadingSaturation ? <Skeleton className="h-8 w-16" /> : (
                <>
                  <p className="text-2xl font-bold text-foreground">{saturation.length}</p>
                  <p className="text-xs text-muted-foreground">
                    Task totali: {saturation.reduce((s, r) => s + r.total_active_tasks, 0)}
                  </p>
                </>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
              <FolderKanban className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Cantieri Attivi</p>
              {loadingProjects ? <Skeleton className="h-8 w-16" /> : (
                <p className="text-2xl font-bold text-foreground">{activeProjects.length}</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Widget: Ritardi Finanziari */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-destructive" />
              Ritardi Finanziari
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingPayments ? (
              <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
            ) : errorPayments ? (
              <p className="text-sm text-destructive text-center py-6">Errore nel caricamento dei pagamenti.</p>
            ) : overduePayments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nessun pagamento scaduto 🎉</p>
            ) : (
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {overduePayments.map((p: any) => {
                  const daysOverdue = p.due_date ? differenceInDays(new Date(), new Date(p.due_date)) : 0;
                  return (
                    <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border border-destructive/20 bg-destructive/5">
                      <div>
                        <p className="font-medium text-sm text-foreground">{p.milestone_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.projects?.name || "—"} • {p.projects?.client || ""}
                        </p>
                        <p className="text-xs text-destructive mt-0.5">
                          Scaduto da {daysOverdue} giorni ({p.due_date ? format(new Date(p.due_date), "dd MMM yyyy", { locale: it }) : "—"})
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-foreground">€{Number(p.amount).toLocaleString("it-IT", { minimumFractionDigits: 2 })}</p>
                        <Badge variant="outline" className="text-destructive border-destructive/30 text-xs">Scaduto</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Widget: Saturazione Risorse */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Saturazione Risorse
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingSaturation ? (
              <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : errorSaturation ? (
              <p className="text-sm text-destructive text-center py-6">Errore nel caricamento risorse.</p>
            ) : saturation.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nessun task assegnato</p>
            ) : (
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {saturation.sort((a, b) => b.total_active_tasks - a.total_active_tasks).map((r) => (
                  <div key={r.user_id} className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-foreground">{r.full_name}</span>
                      <span className="text-xs text-muted-foreground">{r.total_active_tasks} task</span>
                    </div>
                    <Progress value={(r.total_active_tasks / maxTasks) * 100} className="h-2" />
                    {r.next_deadline && (
                      <p className="text-xs text-muted-foreground">
                        Prossima scadenza: {format(new Date(r.next_deadline), "dd MMM", { locale: it })}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Master Project List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Portfolio Cantieri Attivi</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingProjects ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : errorProjects ? (
            <p className="text-sm text-destructive text-center py-6">Errore nel caricamento dei progetti.</p>
          ) : activeProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nessun cantiere attivo.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 font-medium text-muted-foreground">Progetto</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Cliente</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">PM</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Tipo</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Handover</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Stato</th>
                  </tr>
                </thead>
                <tbody>
                  {activeProjects.map((p: any) => {
                    const daysLeft = Math.ceil((new Date(p.handover_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                    return (
                      <tr
                        key={p.id}
                        className="border-b last:border-b-0 hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => navigate(`/projects/${p.id}`)}
                      >
                        <td className="p-3 font-medium text-foreground">{p.name}</td>
                        <td className="p-3 text-foreground">{p.client}</td>
                        <td className="p-3 text-muted-foreground">{p.profiles?.full_name || "—"}</td>
                        <td className="p-3">
                          {p.project_type ? <Badge variant="secondary" className="text-xs">{p.project_type}</Badge> : "—"}
                        </td>
                        <td className="p-3">
                          <span className={cn("font-medium", daysLeft <= 30 ? "text-destructive" : "text-foreground")}>
                            {format(new Date(p.handover_date), "dd MMM yyyy", { locale: it })}
                          </span>
                          <span className="text-xs text-muted-foreground ml-1">({daysLeft}gg)</span>
                        </td>
                        <td className="p-3">
                          <Badge variant="outline" className={cn("border text-xs", statusColors[p.status])}>{p.status}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </MainLayout>
  );
}

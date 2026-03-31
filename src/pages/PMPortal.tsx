import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { usePMDashboard, type PMProject } from "@/hooks/usePMDashboard";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { AlertTriangle, ArrowRight, Building2, CalendarIcon, CheckCircle2, Clock3, FolderKanban } from "lucide-react";
import { PMCalendar } from "@/components/dashboard/PMCalendar";

type PMProjectView = PMProject & { project_subtype?: string | null };

const STATUS_META = {
  da_configurare: {
    label: "Da Configurare",
    icon: AlertTriangle,
    className: "border-warning/30 bg-warning/10 text-warning",
  },
  in_corso: {
    label: "In Corso",
    icon: Clock3,
    className: "border-primary/30 bg-primary/10 text-primary",
  },
  certificato: {
    label: "Certificati",
    icon: CheckCircle2,
    className: "border-success/30 bg-success/10 text-success",
  },
} as const;

export default function PMPortal() {
  const navigate = useNavigate();
  const { data: projects = [], isLoading } = usePMDashboard();

  const daConfigurare = projects.filter((p) => p.setup_status === "da_configurare");
  const inCorso = projects.filter((p) => p.setup_status === "in_corso");
  const certificati = projects.filter((p) => p.setup_status === "certificato");
  const recentProjects = useMemo(
    () =>
      [...projects]
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        .slice(0, 5) as PMProjectView[],
    [projects],
  );

  return (
    <MainLayout title="Dashboard PM" subtitle="Recap operativo dei progetti assegnati">
      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : projects.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FolderKanban className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
            <p className="text-lg font-medium text-foreground">Nessun cantiere assegnato</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Quando un admin ti assegna un progetto, vedrai qui il recap e in “I Miei Cantieri” la dashboard operativa.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="border-warning/30 bg-card">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
                  <AlertTriangle className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{daConfigurare.length}</p>
                  <p className="text-xs text-muted-foreground">Da Configurare</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-primary/30 bg-card">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Clock3 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{inCorso.length}</p>
                  <p className="text-xs text-muted-foreground">In Corso</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-success/30 bg-card">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{certificati.length}</p>
                  <p className="text-xs text-muted-foreground">Certificati</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Ultimi progetti assegnati</CardTitle>
                <CardDescription>Recap rapido dei cantieri su cui stai lavorando.</CardDescription>
              </div>
              <Button variant="outline" className="gap-2" onClick={() => navigate("/projects")}>
                Apri I Miei Cantieri
                <ArrowRight className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentProjects.map((project) => {
                const statusMeta = STATUS_META[project.setup_status];
                const StatusIcon = statusMeta.icon;
                return (
                  <div
                    key={project.id}
                    className="flex flex-col gap-3 rounded-lg border border-border/70 bg-muted/20 p-4 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-foreground">{project.name}</h3>
                        <Badge variant="outline" className={cn(statusMeta.className)}>
                          <StatusIcon className="mr-1 h-3 w-3" />
                          {statusMeta.label}
                        </Badge>
                      </div>
                      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Building2 className="h-3.5 w-3.5" />
                        {project.client}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {project.cert_type && <Badge variant="secondary">{project.cert_type}</Badge>}
                        {project.cert_rating && <Badge variant="outline">{project.cert_rating}</Badge>}
                        {project.project_subtype && <Badge variant="outline">{project.project_subtype}</Badge>}
                      </div>
                    </div>

                    <div className="flex flex-col items-start gap-2 text-sm text-muted-foreground lg:items-end">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarIcon className="h-3.5 w-3.5" />
                        {format(new Date(project.handover_date), "dd MMM yyyy", { locale: it })}
                      </span>
                      <Button size="sm" variant="ghost" className="gap-2 px-0" onClick={() => navigate("/projects")}>
                        Vai alla dashboard operativa
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}
    </MainLayout>
  );
}

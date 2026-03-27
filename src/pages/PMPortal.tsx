import { usePMDashboard, type PMProject } from "@/hooks/usePMDashboard";
import { MainLayout } from "@/components/layout/MainLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PMProjectConfigModal } from "@/components/projects/PMProjectConfigModal";
import { useState } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Settings2, CheckCircle2, Clock, AlertTriangle, MapPin, CalendarIcon, Building2 } from "lucide-react";

const MISSING_LABELS: Record<string, { label: string; color: string }> = {
  Hardware: { label: "Manca Hardware", color: "bg-destructive/10 text-destructive border-destructive/30" },
  Target: { label: "Manca Target", color: "bg-warning/10 text-warning border-warning/30" },
  Timeline: { label: "Manca Timeline", color: "bg-warning/10 text-warning border-warning/30" },
};

function ProjectCard({ project, onConfigure }: { project: PMProject; onConfigure: (p: PMProject) => void }) {
  const daysLeft = Math.ceil((new Date(project.handover_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const siteName = project.sites?.name || "Sito non assegnato";
  const siteLocation = [project.sites?.city, project.sites?.country].filter(Boolean).join(", ");

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base">{project.name}</CardTitle>
            <CardDescription className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" />
              {project.client}
            </CardDescription>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "shrink-0",
              project.setup_status === "certificato" && "bg-success/10 text-success border-success/30",
              project.setup_status === "in_corso" && "bg-primary/10 text-primary border-primary/30",
              project.setup_status === "da_configurare" && "bg-muted text-muted-foreground",
            )}
          >
            {project.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {siteName}{siteLocation ? ` — ${siteLocation}` : ""}
          </span>
          <span className={cn("flex items-center gap-1 font-medium", daysLeft <= 30 ? "text-destructive" : "text-foreground")}>
            <CalendarIcon className="h-3.5 w-3.5" />
            {format(new Date(project.handover_date), "dd MMM yyyy", { locale: it })}
            <span className="text-xs text-muted-foreground font-normal">({daysLeft}gg)</span>
          </span>
        </div>

        {project.setup_status === "da_configurare" && project.missing.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {project.missing.map((m) => {
              const conf = MISSING_LABELS[m];
              return (
                <Badge key={m} variant="outline" className={cn("text-xs", conf?.color)}>
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  {conf?.label || m}
                </Badge>
              );
            })}
          </div>
        )}

        {project.setup_status !== "certificato" && (
          <Button size="sm" className="w-full gap-1.5 mt-1" onClick={() => onConfigure(project)}>
            <Settings2 className="h-4 w-4" />
            Configura Progetto
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default function PMPortal() {
  const { data: projects = [], isLoading } = usePMDashboard();
  const [configProject, setConfigProject] = useState<PMProject | null>(null);

  const daConfigurare = projects.filter((p) => p.setup_status === "da_configurare");
  const inCorso = projects.filter((p) => p.setup_status === "in_corso");
  const certificati = projects.filter((p) => p.setup_status === "certificato");

  const renderGrid = (items: PMProject[], emptyMsg: string) =>
    items.length === 0 ? (
      <div className="text-center py-12 text-muted-foreground">{emptyMsg}</div>
    ) : (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((p) => (
          <ProjectCard key={p.id} project={p} onConfigure={setConfigProject} />
        ))}
      </div>
    );

  return (
    <MainLayout title="Dashboard PM" subtitle="Gestione setup e avanzamento progetti">
      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">Nessun cantiere assegnato.</div>
      ) : (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <Card className="border-warning/30">
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
            <Card className="border-primary/30">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Clock className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{inCorso.length}</p>
                  <p className="text-xs text-muted-foreground">In Corso</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-success/30">
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

          <Tabs defaultValue="da_configurare" className="space-y-4">
            <TabsList>
              <TabsTrigger value="da_configurare" className="gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" /> Da Configurare ({daConfigurare.length})
              </TabsTrigger>
              <TabsTrigger value="in_corso" className="gap-1.5">
                <Clock className="h-3.5 w-3.5" /> In Corso ({inCorso.length})
              </TabsTrigger>
              <TabsTrigger value="certificati" className="gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" /> Certificati ({certificati.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="da_configurare">
              {renderGrid(daConfigurare, "Tutti i progetti sono stati configurati! 🎉")}
            </TabsContent>
            <TabsContent value="in_corso">
              {renderGrid(inCorso, "Nessun progetto in corso.")}
            </TabsContent>
            <TabsContent value="certificati">
              {renderGrid(certificati, "Nessun progetto certificato.")}
            </TabsContent>
          </Tabs>
        </>
      )}

      {configProject && (
        <PMProjectConfigModal
          project={configProject}
          open={!!configProject}
          onOpenChange={(open) => !open && setConfigProject(null)}
        />
      )}
    </MainLayout>
  );
}

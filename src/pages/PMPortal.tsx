import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { MainLayout } from "@/components/layout/MainLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Settings, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { usePMDashboard, type PMProject, type SetupStatus } from "@/hooks/usePMDashboard";
import { PMProjectConfigModal } from "@/components/projects/PMProjectConfigModal";

function ProjectCard({ project, onConfigure }: { project: PMProject; onConfigure: () => void }) {
  const statusConfig: Record<SetupStatus, { icon: React.ReactNode; badgeClass: string; label: string }> = {
    da_configurare: {
      icon: <AlertTriangle className="h-4 w-4" />,
      badgeClass: "bg-destructive/10 text-destructive border-destructive/30",
      label: "Da Configurare",
    },
    in_corso: {
      icon: <Clock className="h-4 w-4" />,
      badgeClass: "bg-warning/10 text-warning border-warning/30",
      label: "In Corso",
    },
    certificato: {
      icon: <CheckCircle2 className="h-4 w-4" />,
      badgeClass: "bg-success/10 text-success border-success/30",
      label: "Certificato",
    },
  };

  const config = statusConfig[project.setup_status];

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base">{project.name}</CardTitle>
            <p className="text-sm text-muted-foreground">{project.client}</p>
          </div>
          <Badge variant="outline" className={config.badgeClass}>
            {config.icon}
            <span className="ml-1">{config.label}</span>
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-muted-foreground">Sito: </span>
            <span className="font-medium text-foreground">
              {project.sites?.name || "Non assegnato"}
              {project.sites?.city && `, ${project.sites.city}`}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Handover: </span>
            <span className="font-medium text-foreground">
              {format(new Date(project.handover_date), "dd MMM yyyy", { locale: it })}
            </span>
          </div>
        </div>

        {project.setup_status === "da_configurare" && project.missing.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {project.missing.map((m) => (
              <Badge key={m} variant="outline" className="text-xs bg-destructive/5 text-destructive border-destructive/20">
                Manca {m}
              </Badge>
            ))}
          </div>
        )}

        {project.setup_status === "da_configurare" && (
          <Button onClick={onConfigure} className="w-full gap-2">
            <Settings className="h-4 w-4" />
            Configura Progetto
          </Button>
        )}
        {project.setup_status === "in_corso" && (
          <Button onClick={onConfigure} variant="outline" className="w-full gap-2">
            <Settings className="h-4 w-4" />
            Modifica Configurazione
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default function PMPortal() {
  const { profile } = useAuth();
  const { data: projects = [], isLoading } = usePMDashboard();
  const [configProject, setConfigProject] = useState<PMProject | null>(null);

  const daConfigurare = projects.filter((p) => p.setup_status === "da_configurare");
  const inCorso = projects.filter((p) => p.setup_status === "in_corso");
  const certificati = projects.filter((p) => p.setup_status === "certificato");

  const renderGrid = (items: PMProject[], emptyMsg: string) => {
    if (isLoading) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48 w-full rounded-lg" />)}
        </div>
      );
    }
    if (items.length === 0) {
      return <p className="text-center text-muted-foreground py-12">{emptyMsg}</p>;
    }
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((p) => (
          <ProjectCard key={p.id} project={p} onConfigure={() => setConfigProject(p)} />
        ))}
      </div>
    );
  };

  return (
    <MainLayout title="PM Dashboard" subtitle={`${profile?.full_name || ""} — Panoramica Progetti`}>
      <Tabs defaultValue="da_configurare" className="space-y-6">
        <TabsList>
          <TabsTrigger value="da_configurare" className="gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Da Configurare
            {daConfigurare.length > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 min-w-5 text-[10px] px-1.5">
                {daConfigurare.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="in_corso" className="gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            In Corso
            {inCorso.length > 0 && (
              <Badge className="ml-1 h-5 min-w-5 text-[10px] px-1.5 bg-warning text-warning-foreground">
                {inCorso.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="certificati" className="gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Certificati
          </TabsTrigger>
        </TabsList>

        <TabsContent value="da_configurare">
          {renderGrid(daConfigurare, "Nessun progetto da configurare. 🎉")}
        </TabsContent>
        <TabsContent value="in_corso">
          {renderGrid(inCorso, "Nessun progetto in corso.")}
        </TabsContent>
        <TabsContent value="certificati">
          {renderGrid(certificati, "Nessun progetto certificato.")}
        </TabsContent>
      </Tabs>

      {configProject && (
        <PMProjectConfigModal
          project={configProject}
          open={!!configProject}
          onOpenChange={(open) => { if (!open) setConfigProject(null); }}
        />
      )}
    </MainLayout>
  );
}

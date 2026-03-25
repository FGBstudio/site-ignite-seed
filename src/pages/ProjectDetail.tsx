import { useParams, useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { useProjectDetails, useCertification, useProjectAllocations } from "@/hooks/useProjectDetails";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScorecardEditor } from "@/components/projects/ScorecardEditor";
import { ProjectWBS } from "@/components/projects/ProjectWBS";
import { ProjectPayments } from "@/components/projects/ProjectPayments";
import { ArrowLeft, MapPin, Calendar, User, Cpu } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";

const statusColors: Record<string, string> = {
  Design: "bg-primary/10 text-primary border-primary/20",
  Construction: "bg-warning/10 text-warning border-warning/20",
  Completed: "bg-success/10 text-success border-success/20",
  Cancelled: "bg-destructive/10 text-destructive border-destructive/20",
};

export default function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { data: project, isLoading } = useProjectDetails(projectId);
  const { data: certification } = useCertification(projectId);
  const { data: allocations } = useProjectAllocations(projectId);

  if (isLoading) {
    return (
      <MainLayout title="Caricamento...">
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </MainLayout>
    );
  }

  if (!project) {
    return (
      <MainLayout title="Progetto non trovato">
        <div className="text-center py-20 text-muted-foreground">
          Progetto non trovato.
          <Button variant="link" onClick={() => navigate("/projects")}>Torna ai cantieri</Button>
        </div>
      </MainLayout>
    );
  }

  const hasCert = project.project_type === "LEED" || project.project_type === "WELL";
  const pmName = (project as any).profiles?.full_name || "—";
  const siteName = (project as any).sites?.name;
  const siteCity = (project as any).sites?.city;
  const siteCountry = (project as any).sites?.country;

  return (
    <MainLayout
      title={project.name}
      subtitle={`${project.client} — ${project.region}`}
    >
      <Button variant="ghost" size="sm" onClick={() => navigate("/projects")} className="gap-2 mb-4">
        <ArrowLeft className="h-4 w-4" /> Torna ai Cantieri
      </Button>

      {/* Project header cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <MapPin className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Sito</p>
              <p className="font-medium text-sm text-foreground">{siteName || "Non assegnato"}</p>
              {siteCity && <p className="text-xs text-muted-foreground">{siteCity}{siteCountry ? `, ${siteCountry}` : ""}</p>}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Handover</p>
              <p className="font-medium text-sm text-foreground">{format(new Date(project.handover_date), "dd MMM yyyy", { locale: it })}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <User className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">PM</p>
              <p className="font-medium text-sm text-foreground">{pmName}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <Cpu className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Stato / Tipo</p>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="outline" className={cn("border text-xs", statusColors[project.status])}>{project.status}</Badge>
                {project.project_type && <Badge variant="secondary" className="text-xs">{project.project_type}</Badge>}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue={hasCert ? "scorecard" : "wbs"} className="space-y-4">
        <TabsList>
          <TabsTrigger value="hardware">Hardware</TabsTrigger>
          {hasCert && <TabsTrigger value="scorecard">Scorecard {project.project_type}</TabsTrigger>}
          <TabsTrigger value="wbs">Cronoprogramma</TabsTrigger>
          <TabsTrigger value="payments">Pagamenti</TabsTrigger>
        </TabsList>

        <TabsContent value="hardware">
          {!allocations || allocations.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Nessun hardware allocato a questo progetto.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-medium text-muted-foreground">Prodotto</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">SKU</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Certificazione</th>
                      <th className="text-center p-3 font-medium text-muted-foreground">Quantità</th>
                      <th className="text-center p-3 font-medium text-muted-foreground">Stato</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocations.map((a: any) => (
                      <tr key={a.id} className="border-b last:border-b-0">
                        <td className="p-3 font-medium text-foreground">{a.products?.name || "—"}</td>
                        <td className="p-3 text-muted-foreground font-mono text-xs">{a.products?.sku}</td>
                        <td className="p-3"><Badge variant="outline">{a.products?.certification}</Badge></td>
                        <td className="p-3 text-center font-medium">{a.quantity}</td>
                        <td className="p-3 text-center"><Badge variant="outline">{a.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {hasCert && (
          <TabsContent value="scorecard">
            {certification ? (
              <ScorecardEditor
                certificationId={certification.id}
                currentScore={Number(certification.score)}
                targetScore={Number(certification.target_score)}
              />
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  Nessuna scorecard trovata per questo progetto.
                </CardContent>
              </Card>
            )}
          </TabsContent>
        )}

        <TabsContent value="wbs">
          <ProjectWBS projectId={projectId!} />
        </TabsContent>

        <TabsContent value="payments">
          <ProjectPayments projectId={projectId!} />
        </TabsContent>
      </Tabs>
    </MainLayout>
  );
}

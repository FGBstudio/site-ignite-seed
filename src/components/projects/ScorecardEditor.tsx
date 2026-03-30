import { useState, useRef, useMemo } from "react";
import { useMilestones } from "@/hooks/useProjectDetails";
import { useUpdateMilestone, useUploadEvidence } from "@/hooks/useScorecardMutations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Upload, FileCheck, Loader2, ExternalLink, AlertTriangle, PlusCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getLeedLevel, LEED_MAX_TOTAL } from "@/data/leedTemplate";
import { getCertificationTemplate, getMaxTotal } from "@/data/certificationTemplates";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const statusColors: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  in_progress: "bg-warning/10 text-warning border-warning/30",
  completed: "bg-success/10 text-success border-success/30",
};

interface Props {
  certificationId: string;
  currentScore: number;
  targetScore: number;
  certType?: string;
  certRating?: string;
  projectSubtype?: string | null;
}

export function ScorecardEditor({ 
  certificationId, 
  currentScore, 
  targetScore,
  certType,
  certRating,
  projectSubtype 
}: Props) {
  const { data: dbMilestones, isLoading } = useMilestones(certificationId);
  const updateMutation = useUpdateMilestone(certificationId);
  const uploadMutation = useUploadEvidence();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isInitializing, setIsInitializing] = useState(false);

  // 1. Risolvi il template dinamico dal Cervello
  const template = useMemo(() => {
    return getCertificationTemplate(certType, certRating, projectSubtype);
  }, [certType, certRating, projectSubtype]);

  const templateScorecard = template?.scorecard || [];

  // 2. MERGE STRATEGICO: Uniamo i dati del DB con il Template
  const grouped = useMemo(() => {
    const groups: Record<string, any[]> = {};

    // Se abbiamo un template, lo usiamo come asse portante visivo
    if (templateScorecard.length > 0) {
      templateScorecard.forEach(t => {
        // Cerca la corrispondenza esatta nel DB
        const dbRow = dbMilestones?.find(
          m => m.category === t.category && m.requirement === t.requirement
        );

        if (!groups[t.category]) groups[t.category] = [];
        groups[t.category].push({
          id: dbRow?.id || `temp-${t.category}-${t.requirement}`,
          category: t.category,
          requirement: t.requirement,
          max_score: t.max_score,
          score: dbRow?.score || 0,
          status: dbRow?.status || 'pending',
          evidence_url: dbRow?.evidence_url || null,
          isSaved: !!dbRow // Flag fondamentale per bloccare le modifiche su righe inesistenti nel db
        });
      });
    } else if (dbMilestones && dbMilestones.length > 0) {
      // Fallback: se il template non viene trovato ma esistono dati pregressi nel DB
      dbMilestones.forEach(m => {
        if (!groups[m.category]) groups[m.category] = [];
        groups[m.category].push({ ...m, isSaved: true });
      });
    }

    return groups;
  }, [dbMilestones, templateScorecard]);

  // Controlliamo se ci sono righe del template mancanti nel DB
  const hasMissingDbRows = useMemo(() => {
    if (!dbMilestones) return false;
    return templateScorecard.some(t =>
      !dbMilestones.find(m => m.category === t.category && m.requirement === t.requirement)
    );
  }, [dbMilestones, templateScorecard]);

  // 3. Funzione di autorigenerazione per inserire le righe mancanti nel DB
  const handleInitialize = async () => {
    setIsInitializing(true);
    try {
      const missingItems = templateScorecard.filter(t =>
        !dbMilestones?.find(m => m.category === t.category && m.requirement === t.requirement)
      );

      const scorecardToInsert = missingItems.map(item => ({
        certification_id: certificationId,
        category: item.category,
        requirement: item.requirement,
        score: 0,
        max_score: item.max_score,
        milestone_type: 'scorecard',
        status: 'pending'
      }));

      if (scorecardToInsert.length > 0) {
        const { error } = await supabase.from('certification_milestones').insert(scorecardToInsert);
        if (error) throw error;
      }

      toast({
        title: "Scorecard Inizializzata",
        description: "Le categorie sono state generate correttamente nel database.",
      });

      // Forza l'aggiornamento dei dati
      queryClient.invalidateQueries({ queryKey: ['milestones'] });
      queryClient.invalidateQueries({ queryKey: ['certifications'] });
    } catch (e) {
      console.error("Errore durante l'inizializzazione:", e);
      toast({
        title: "Errore",
        description: "Impossibile salvare la griglia nel database.",
        variant: "destructive"
      });
    } finally {
      setIsInitializing(false);
    }
  };

  const isLeed = certType?.toUpperCase().includes('LEED');
  const maxScoreTotal = templateScorecard.length > 0 ? getMaxTotal(templateScorecard) : LEED_MAX_TOTAL;
  const leedLevel = isLeed ? getLeedLevel(currentScore) : null;
  const progressPercent = Math.min(100, (currentScore / maxScoreTotal) * 100);

  const handleScoreChange = (milestoneId: string, value: string, maxScore: number) => {
    const numVal = Math.min(Math.max(0, Number(value) || 0), maxScore);
    updateMutation.mutate({ milestoneId, updates: { score: numVal } });
  };

  const handleStatusChange = (milestoneId: string, status: string) => {
    updateMutation.mutate({ milestoneId, updates: { status } });
  };

  const handleFileUpload = async (milestoneId: string, file: File) => {
    setUploadingId(milestoneId);
    const url = await uploadMutation.mutateAsync({ file, milestoneId });
    updateMutation.mutate({ milestoneId, updates: { evidence_url: url } });
    setUploadingId(null);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Avviso Inizializzazione Scorecard DB */}
      {hasMissingDbRows && (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h4 className="font-semibold text-amber-800 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Scorecard da Inizializzare
            </h4>
            <p className="text-sm text-amber-700 mt-1">
              Il template per <strong>{certType} {certRating}</strong> è caricato, ma le righe non sono ancora persistite nel database. 
              Devi inizializzare la griglia prima di poter assegnare i punteggi.
            </p>
          </div>
          <Button 
            onClick={handleInitialize} 
            disabled={isInitializing} 
            className="bg-amber-600 hover:bg-amber-700 text-white shrink-0"
          >
            {isInitializing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <PlusCircle className="h-4 w-4 mr-2" />}
            Inizializza Scorecard
          </Button>
        </div>
      )}

      {/* Score Summary */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-3xl font-bold text-foreground">
                {currentScore} <span className="text-lg text-muted-foreground">/ {maxScoreTotal}</span>
              </div>
              {leedLevel && isLeed && (
                <Badge className="mt-1" style={{ backgroundColor: leedLevel.color, color: "#fff" }}>
                  {leedLevel.label}
                </Badge>
              )}
              {!leedLevel && isLeed && currentScore < 40 && (
                <span className="text-sm text-muted-foreground mt-1 block">
                  Ancora {40 - currentScore} punti per la certificazione
                </span>
              )}
            </div>
            {targetScore > 0 && (
              <div className="text-right">
                <span className="text-sm text-muted-foreground">Target</span>
                <div className="text-xl font-semibold text-foreground">{targetScore}</div>
              </div>
            )}
          </div>
          <Progress value={progressPercent} className="h-3" />
        </CardContent>
      </Card>

      {/* Category Groups */}
      {Object.entries(grouped).map(([category, items]) => {
        const catScore = items.reduce((s, m) => s + Number(m.score), 0);
        const catMax = items.reduce((s, m) => s + Number(m.max_score), 0);
        const completedCount = items.filter((m) => m.status === "completed").length;

        return (
          <Collapsible key={category} defaultOpen>
            <Card>
              <CollapsibleTrigger className="w-full">
                <CardHeader className="flex flex-row items-center justify-between py-4 px-6">
                  <div className="flex items-center gap-3">
                    <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform" />
                    <CardTitle className="text-base">{category}</CardTitle>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="text-xs">
                      {completedCount}/{items.length} completati
                    </Badge>
                    <span className="font-semibold text-sm text-foreground">
                      {catScore}/{catMax} pts
                    </span>
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0 px-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-t bg-muted/50">
                          <th className="text-left p-3 pl-6 font-medium text-muted-foreground w-[40%]">Requisito</th>
                          <th className="text-center p-3 font-medium text-muted-foreground w-[80px]">Punti</th>
                          <th className="text-center p-3 font-medium text-muted-foreground w-[80px]">Max</th>
                          <th className="text-center p-3 font-medium text-muted-foreground w-[140px]">Stato</th>
                          <th className="text-center p-3 font-medium text-muted-foreground w-[120px]">Evidenza</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((m) => {
                          const isPrereq = m.max_score === 0;
                          return (
                            <tr
                              key={m.id}
                              className={cn(
                                "border-b last:border-b-0 transition-colors",
                                isPrereq ? "bg-muted/30" : "hover:bg-muted/20",
                                !m.isSaved && "opacity-60" // Feedback visivo se la riga non è ancora a DB
                              )}
                            >
                              <td className="p-3 pl-6">
                                <span className={cn("text-foreground", isPrereq && "font-medium text-muted-foreground")}>
                                  {m.requirement}
                                </span>
                                {isPrereq && (
                                  <Badge variant="outline" className="ml-2 text-[10px]">
                                    Prerequisito
                                  </Badge>
                                )}
                              </td>
                              <td className="p-3 text-center">
                                {isPrereq ? (
                                  <span className="text-muted-foreground">—</span>
                                ) : (
                                  <Input
                                    type="number"
                                    min={0}
                                    max={m.max_score}
                                    value={m.score}
                                    disabled={!m.isSaved} // Previene scritture se il record non esiste nel db
                                    onChange={(e) => handleScoreChange(m.id, e.target.value, Number(m.max_score))}
                                    className="w-16 h-8 text-center mx-auto"
                                  />
                                )}
                              </td>
                              <td className="p-3 text-center text-muted-foreground font-medium">
                                {m.max_score > 0 ? m.max_score : "—"}
                              </td>
                              <td className="p-3 text-center">
                                <Select
                                  value={m.status}
                                  disabled={!m.isSaved} // Previene modifiche se il record non esiste nel db
                                  onValueChange={(v) => handleStatusChange(m.id, v)}
                                >
                                  <SelectTrigger className="h-8 text-xs w-[130px] mx-auto">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="pending">⏳ Pending</SelectItem>
                                    <SelectItem value="in_progress">🔄 In Progress</SelectItem>
                                    <SelectItem value="completed">✅ Completed</SelectItem>
                                  </SelectContent>
                                </Select>
                              </td>
                              <td className="p-3 text-center">
                                {m.evidence_url ? (
                                  <a
                                    href={m.evidence_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-primary hover:underline text-xs"
                                  >
                                    <FileCheck className="h-3 w-3" /> Apri
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 text-xs gap-1"
                                    disabled={uploadingId === m.id || !m.isSaved}
                                    onClick={() => {
                                      const input = document.createElement("input");
                                      input.type = "file";
                                      input.accept = ".pdf,.jpg,.jpeg,.png,.doc,.docx";
                                      input.onchange = (e) => {
                                        const file = (e.target as HTMLInputElement).files?.[0];
                                        if (file) handleFileUpload(m.id, file);
                                      };
                                      input.click();
                                    }}
                                  >
                                    {uploadingId === m.id ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Upload className="h-3 w-3" />
                                    )}
                                    Upload
                                  </Button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        );
      })}
    </div>
  );
}

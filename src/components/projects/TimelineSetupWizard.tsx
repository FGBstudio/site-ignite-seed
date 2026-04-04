import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ChevronLeft, ChevronRight, SkipForward, CalendarIcon, Lock, User, PartyPopper, Sparkles, TableProperties } from "lucide-react";
import { format, parseISO, addDays } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { TimelineStep } from "@/data/certificationTemplates";

interface TimelineSetupWizardProps {
  milestones: any[];
  templateSteps: TimelineStep[];
  certId: string;
  projectName: string;
  onComplete: () => void;
  onSwitchToGrid: () => void;
}

/** Given milestones and the template, compute calculated deadline dates */
function computeCalculatedDate(
  templateSteps: TimelineStep[],
  milestones: any[],
  currentIndex: number,
  localDates: Record<string, { start_date: string | null; due_date: string | null }>
): string | null {
  const step = templateSteps[currentIndex];
  if (step.type !== "calculated_deadline" || !step.offset_days) return null;

  let baseDate: string | null = null;
  for (let i = currentIndex - 1; i >= 0; i--) {
    const prevStep = templateSteps[i];
    if (prevStep.type === "manual_input") {
      const prevMilestone = milestones.find(
        (m: any) => m.requirement === prevStep.name && m.milestone_type === "timeline"
      );
      if (prevMilestone) {
        const localData = localDates[prevMilestone.id];
        baseDate = localData?.due_date || prevMilestone.due_date;
      }
      break;
    }
  }

  if (!baseDate) return null;
  return format(addDays(parseISO(baseDate), step.offset_days), "yyyy-MM-dd");
}

export function TimelineSetupWizard({
  milestones,
  templateSteps,
  certId,
  projectName,
  onComplete,
  onSwitchToGrid,
}: TimelineSetupWizardProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  // Local dates for current editing: { milestoneId: { start_date, due_date } }
  const [localDates, setLocalDates] = useState<Record<string, { start_date: string | null; due_date: string | null }>>({});

  const total = milestones.length;
  const isComplete = currentIndex >= total;

  // Get current milestone & template step
  const currentMilestone = !isComplete ? milestones[currentIndex] : null;
  const currentStep = !isComplete ? templateSteps[currentIndex] : null;
  const nextMilestone = currentIndex + 1 < total ? milestones[currentIndex + 1] : null;
  const nextStep = currentIndex + 1 < total ? templateSteps[currentIndex + 1] : null;

  // Parse step metadata
  const getStepMeta = (m: any) => {
    try { return JSON.parse(m.notes || "{}"); } catch { return {}; }
  };

  // Get dates for current milestone (local overrides DB)
  const getCurrentDates = () => {
    if (!currentMilestone) return { start_date: null, due_date: null };
    const local = localDates[currentMilestone.id];
    return {
      start_date: local?.start_date ?? currentMilestone.start_date ?? null,
      due_date: local?.due_date ?? currentMilestone.due_date ?? null,
    };
  };

  const setLocalDate = (field: "start_date" | "due_date", value: string | null) => {
    if (!currentMilestone) return;
    setLocalDates((prev) => ({
      ...prev,
      [currentMilestone.id]: {
        ...prev[currentMilestone.id],
        start_date: prev[currentMilestone.id]?.start_date ?? currentMilestone.start_date ?? null,
        due_date: prev[currentMilestone.id]?.due_date ?? currentMilestone.due_date ?? null,
        [field]: value,
      },
    }));
  };

  const isCalculated = currentStep?.type === "calculated_deadline";
  const dates = getCurrentDates();

  // For calculated steps, compute dates automatically
  const calculatedDate = isCalculated && currentStep
    ? computeCalculatedDate(templateSteps, milestones, currentIndex, localDates)
    : null;

  const effectiveDueDate = isCalculated ? calculatedDate : dates.due_date;
  const effectiveStartDate = isCalculated ? calculatedDate : dates.start_date;

  const canSave = isCalculated
    ? !!calculatedDate
    : !!(dates.start_date && dates.due_date);

  // Save current step
  const handleSave = async () => {
    if (!currentMilestone) return;
    setSaving(true);
    try {
      const updates: any = {};
      if (isCalculated && calculatedDate) {
        updates.start_date = calculatedDate;
        updates.due_date = calculatedDate;
      } else {
        updates.start_date = dates.start_date;
        updates.due_date = dates.due_date;
      }
      await supabase
        .from("certification_milestones")
        .update(updates)
        .eq("id", currentMilestone.id);

      // Update local milestone data for downstream calculations
      currentMilestone.start_date = updates.start_date;
      currentMilestone.due_date = updates.due_date;

      qc.invalidateQueries({ queryKey: ["timeline-milestones", certId] });
      setCurrentIndex((prev) => prev + 1);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Errore", description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = () => {
    setCurrentIndex((prev) => prev + 1);
  };

  const handleBack = () => {
    if (currentIndex > 0) setCurrentIndex((prev) => prev - 1);
  };

  // ─── Completion Screen ───
  if (isComplete) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-6">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
          <PartyPopper className="w-10 h-10 text-primary" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-foreground">Pianificazione Completata!</h2>
          <p className="text-muted-foreground max-w-md">
            Hai configurato con successo la timeline del progetto. 
            Ora puoi tornare alla dashboard dove vedrai il Gantt popolato.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onSwitchToGrid}>
            <TableProperties className="w-4 h-4 mr-2" />
            Rivedi in Griglia
          </Button>
          <Button onClick={onComplete}>
            <Sparkles className="w-4 h-4 mr-2" />
            Chiudi e Vai alla Dashboard
          </Button>
        </div>
      </div>
    );
  }

  const meta = getStepMeta(currentMilestone);
  const roleLabel = currentStep?.assigned_to_role || meta.assigned_to_role || "PM";
  const description = currentStep?.description || "Inserisci le date per questa fase del progetto.";

  // Role color mapping
  const roleColors: Record<string, string> = {
    PM: "bg-primary/10 text-primary border-primary/30",
    GC: "bg-amber-500/10 text-amber-700 border-amber-300",
    Client: "bg-blue-500/10 text-blue-700 border-blue-300",
    Assessor: "bg-purple-500/10 text-purple-700 border-purple-300",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
              Pianificazione Progetto
            </p>
            <h2 className="text-lg font-bold text-foreground">{projectName}</h2>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={onSwitchToGrid} className="text-xs text-muted-foreground">
              <TableProperties className="w-3.5 h-3.5 mr-1.5" />
              Vista Griglia
            </Button>
            <Badge variant="secondary" className="text-xs">
              Step {currentIndex + 1} di {total}
            </Badge>
          </div>
        </div>
        <Progress value={((currentIndex) / total) * 100} className="h-2" />
      </div>

      {/* Split Screen */}
      <div className="grid grid-cols-5 gap-6 min-h-[340px]">
        {/* Left Column: Current Step (3/5 = 60%) */}
        <div className="col-span-3">
          <Card className="h-full border-2 border-primary/20">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <CardTitle className="text-lg">{currentMilestone?.requirement}</CardTitle>
                </div>
                <Badge variant="outline" className={cn("text-xs", roleColors[roleLabel] || "")}>
                  <User className="h-3 w-3 mr-1" />
                  {roleLabel}
                </Badge>
                {isCalculated && (
                  <Badge variant="secondary" className="text-xs">
                    <Lock className="h-3 w-3 mr-1" />
                    Auto +{currentStep?.offset_days}gg
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Educational Panel */}
              <div className="rounded-lg bg-accent/50 border border-accent p-4">
                <p className="text-sm text-foreground/80 leading-relaxed">{description}</p>
              </div>

              {/* Date Inputs */}
              {isCalculated ? (
                <div className="space-y-3">
                  <div className="rounded-lg bg-muted/50 p-4 border">
                    <p className="text-xs text-muted-foreground uppercase font-medium mb-1">Data Calcolata</p>
                    <p className="text-lg font-semibold text-foreground">
                      {calculatedDate
                        ? format(parseISO(calculatedDate), "d MMMM yyyy", { locale: it })
                        : "⚠️ Compila prima le date dello step manuale precedente"}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <DatePickerField
                    label="Data Inizio"
                    value={dates.start_date}
                    onChange={(v) => setLocalDate("start_date", v)}
                  />
                  <DatePickerField
                    label="Data Fine / Scadenza"
                    value={dates.due_date}
                    onChange={(v) => setLocalDate("due_date", v)}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Next Step Preview (2/5 = 40%) */}
        <div className="col-span-2">
          {nextMilestone && nextStep ? (
            <Card className="h-full opacity-40 pointer-events-none border border-border/50">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm text-muted-foreground">
                    {nextMilestone.requirement}
                  </CardTitle>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="outline" className="text-[10px]">
                    <User className="h-3 w-3 mr-1" />
                    {nextStep.assigned_to_role}
                  </Badge>
                  {nextStep.type === "calculated_deadline" && (
                    <Badge variant="secondary" className="text-[10px]">
                      <Lock className="h-3 w-3 mr-1" />
                      Auto
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg bg-muted/30 p-3 border border-dashed">
                  <p className="text-xs text-muted-foreground line-clamp-3">
                    {nextStep.description || "Prossimo step della timeline..."}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="h-full opacity-40 pointer-events-none border border-dashed flex items-center justify-center">
              <div className="text-center p-6">
                <PartyPopper className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Ultimo step!</p>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Footer Navigation */}
      <div className="flex items-center justify-between pt-4 border-t">
        <Button
          variant="ghost"
          onClick={handleBack}
          disabled={currentIndex === 0}
          className="text-sm"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Indietro
        </Button>

        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            onClick={handleSkip}
            className="text-sm text-muted-foreground"
          >
            Salta per ora
            <SkipForward className="w-4 h-4 ml-1" />
          </Button>
          <Button
            onClick={handleSave}
            disabled={!canSave || saving}
            className="min-w-[180px]"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2" />
            )}
            Salva e Continua
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Date Picker Field ───
function DatePickerField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const dateValue = value ? parseISO(value) : undefined;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-full justify-start text-left font-normal h-11",
              !value && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {dateValue ? format(dateValue, "d MMMM yyyy", { locale: it }) : "Seleziona data..."}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={dateValue}
            onSelect={(d) => onChange(d ? format(d, "yyyy-MM-dd") : null)}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

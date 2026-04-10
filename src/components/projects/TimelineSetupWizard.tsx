import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ChevronLeft, ChevronRight, SkipForward, CalendarIcon, Lock, User, PartyPopper, Sparkles, TableProperties } from "lucide-react";
import { format, parseISO, addDays } from "date-fns";
import { cn } from "@/lib/utils";
import type { TimelineStep } from "@/data/certificationTemplates";

/** Milestones where PM cannot edit dates after initial setup (admin-only) */
const PM_LOCKED_MILESTONES_ALL_DATES = ["LEED Project Submission", "LEED Certification Attainment", "WELL Project Submission", "Certification Attainment WELL"];
const PM_LOCKED_END_DATE_ONLY = ["Construction phase"];
const SINGLE_DATE_MILESTONES = ["Construction end (Handover)"];
const CONSTRUCTION_PHASE_NAME = "Construction phase";
const CONSTRUCTION_END_NAME = "Construction end (Handover)";

interface TimelineSetupWizardProps {
  milestones: any[];
  templateSteps: TimelineStep[];
  certId: string;
  projectName: string;
  onComplete: () => void;
  onSwitchToGrid: () => void;
}

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
  const { role } = useAuth();
  const qc = useQueryClient();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [localDates, setLocalDates] = useState<Record<string, { start_date: string | null; due_date: string | null }>>({});

  const total = milestones.length;
  const isComplete = currentIndex >= total;

  const currentMilestone = !isComplete ? milestones[currentIndex] : null;
  const currentStep = !isComplete ? templateSteps[currentIndex] : null;
  const nextMilestone = currentIndex + 1 < total ? milestones[currentIndex + 1] : null;
  const nextStep = currentIndex + 1 < total ? templateSteps[currentIndex + 1] : null;

  const milestoneName = currentMilestone?.requirement || "";
  const isSingleDate = SINGLE_DATE_MILESTONES.includes(milestoneName);
  const isPmLockedAllDates = PM_LOCKED_MILESTONES_ALL_DATES.includes(milestoneName);
  const isPmLockedEndOnly = PM_LOCKED_END_DATE_ONLY.includes(milestoneName);
  const isPM = role !== "ADMIN";

  // For PM-locked milestones that already have dates, PM can only flag "Completed"
  const hasExistingDates = !!(currentMilestone?.start_date || currentMilestone?.due_date);
  const isDateEditDisabled = isPM && isPmLockedAllDates && hasExistingDates && currentMilestone?.edit_locked_for_pm;
  const isEndDateDisabledForPM = isPM && isPmLockedEndOnly && hasExistingDates && currentMilestone?.edit_locked_for_pm;

  const getStepMeta = (m: any) => {
    try { return JSON.parse(m.notes || "{}"); } catch { return {}; }
  };

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
    setLocalDates((prev) => {
      const current = {
        start_date: prev[currentMilestone.id]?.start_date ?? currentMilestone.start_date ?? null,
        due_date: prev[currentMilestone.id]?.due_date ?? currentMilestone.due_date ?? null,
        [field]: value,
      };

      // Auto-fill: when start_date is set, auto-set due_date to the same value if due_date hasn't been manually changed
      if (field === "start_date" && value) {
        const existingDueDate = prev[currentMilestone.id]?.due_date ?? currentMilestone.due_date;
        if (!existingDueDate || existingDueDate === (prev[currentMilestone.id]?.start_date ?? currentMilestone.start_date)) {
          current.due_date = value;
        }
      }

      // Single-date mode: both dates are always the same
      if (isSingleDate && value) {
        current.start_date = value;
        current.due_date = value;
      }

      return { ...prev, [currentMilestone.id]: current };
    });
  };

  const isCalculated = currentStep?.type === "calculated_deadline";
  const dates = getCurrentDates();

  const calculatedDate = isCalculated && currentStep
    ? computeCalculatedDate(templateSteps, milestones, currentIndex, localDates)
    : null;

  const effectiveDueDate = isCalculated ? calculatedDate : dates.due_date;
  const effectiveStartDate = isCalculated ? calculatedDate : dates.start_date;

  const canSave = isCalculated
    ? !!calculatedDate
    : !!(dates.start_date && dates.due_date);

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

      // Lock PM-restricted milestones after first save
      if (isPmLockedAllDates || isPmLockedEndOnly) {
        updates.edit_locked_for_pm = true;
      }

      await supabase
        .from("certification_milestones")
        .update(updates)
        .eq("id", currentMilestone.id);

      currentMilestone.start_date = updates.start_date;
      currentMilestone.due_date = updates.due_date;
      if (updates.edit_locked_for_pm) currentMilestone.edit_locked_for_pm = true;

      // Sync: when Construction Phase end date is set, auto-sync Construction end (Handover)
      // and set planned/actual handover dates on the certification
      if (milestoneName === CONSTRUCTION_PHASE_NAME && updates.due_date) {
        const handoverMilestone = milestones.find((m: any) => m.requirement === CONSTRUCTION_END_NAME);
        if (handoverMilestone && !handoverMilestone.start_date && !handoverMilestone.due_date) {
          await supabase
            .from("certification_milestones")
            .update({ start_date: updates.due_date, due_date: updates.due_date })
            .eq("id", handoverMilestone.id);
          handoverMilestone.start_date = updates.due_date;
          handoverMilestone.due_date = updates.due_date;
        }
        // Set dual handover tracking dates on the certification
        await (supabase as any)
          .from("certifications")
          .update({ planned_handover_date: updates.due_date, actual_handover_date: updates.due_date })
          .eq("id", certId);
      }

      // When Construction end (Handover) is updated, sync actual_handover_date
      if (milestoneName === CONSTRUCTION_END_NAME && updates.due_date) {
        await (supabase as any)
          .from("certifications")
          .update({ actual_handover_date: updates.due_date })
          .eq("id", certId);
      }

      qc.invalidateQueries({ queryKey: ["timeline-milestones", certId] });
      setCurrentIndex((prev) => prev + 1);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
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

  if (isComplete) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-6">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
          <PartyPopper className="w-10 h-10 text-primary" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-foreground">Planning Complete!</h2>
          <p className="text-muted-foreground max-w-md">
            You have successfully configured the project timeline.
            You can now return to the dashboard where you'll see the populated Gantt chart.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onSwitchToGrid}>
            <TableProperties className="w-4 h-4 mr-2" />
            Review in Grid
          </Button>
          <Button onClick={onComplete}>
            <Sparkles className="w-4 h-4 mr-2" />
            Close & Go to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  const meta = getStepMeta(currentMilestone);
  const roleLabel = currentStep?.assigned_to_role || meta.assigned_to_role || "PM";
  const description = currentStep?.description || "Enter the dates for this project phase.";

  const roleColors: Record<string, string> = {
    PM: "bg-primary/10 text-primary border-primary/30",
    GC: "bg-amber-500/10 text-amber-700 border-amber-300",
    Client: "bg-blue-500/10 text-blue-700 border-blue-300",
    Assessor: "bg-purple-500/10 text-purple-700 border-purple-300",
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
              Project Planning
            </p>
            <h2 className="text-lg font-bold text-foreground">{projectName}</h2>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={onSwitchToGrid} className="text-xs text-muted-foreground">
              <TableProperties className="w-3.5 h-3.5 mr-1.5" />
              Grid View
            </Button>
            <Badge variant="secondary" className="text-xs">
              Step {currentIndex + 1} of {total}
            </Badge>
          </div>
        </div>
        <Progress value={((currentIndex) / total) * 100} className="h-2" />
      </div>

      <div className="grid grid-cols-5 gap-6 min-h-[340px]">
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
                    Auto +{currentStep?.offset_days}d
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-lg bg-accent/50 border border-accent p-4">
                <p className="text-sm text-foreground/80 leading-relaxed">{description}</p>
              </div>

              {isDateEditDisabled ? (
                <div className="space-y-3">
                  <div className="rounded-lg bg-muted/50 p-4 border border-warning/30">
                    <p className="text-xs text-muted-foreground uppercase font-medium mb-1">🔒 Admin-Only Dates</p>
                    <p className="text-sm text-foreground">
                      {dates.start_date ? format(parseISO(dates.start_date), "d MMMM yyyy") : "Not set"} → {dates.due_date ? format(parseISO(dates.due_date), "d MMMM yyyy") : "Not set"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Solo l'Admin può modificare queste date (Priorità Direzionale). Come PM, puoi solo segnare "Completed" per confermare.
                    </p>
                  </div>
                </div>
              ) : isCalculated ? (
                <div className="space-y-3">
                  <div className="rounded-lg bg-muted/50 p-4 border">
                    <p className="text-xs text-muted-foreground uppercase font-medium mb-1">Calculated Date</p>
                    <p className="text-lg font-semibold text-foreground">
                      {calculatedDate
                        ? format(parseISO(calculatedDate), "d MMMM yyyy")
                        : "⚠️ Fill in the dates for the previous manual step first"}
                    </p>
                  </div>
                </div>
              ) : isSingleDate ? (
                <div className="grid grid-cols-1 gap-4">
                  <DatePickerField
                    label="Date"
                    value={dates.start_date}
                    onChange={(v) => setLocalDate("start_date", v)}
                  />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <DatePickerField
                    label="Start Date"
                    value={dates.start_date}
                    onChange={(v) => setLocalDate("start_date", v)}
                  />
                  <DatePickerField
                    label="End Date / Deadline"
                    value={dates.due_date}
                    onChange={(v) => setLocalDate("due_date", v)}
                    disabled={isEndDateDisabledForPM}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

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
                    {nextStep.description || "Next timeline step..."}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="h-full opacity-40 pointer-events-none border border-dashed flex items-center justify-center">
              <div className="text-center p-6">
                <PartyPopper className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Last step!</p>
              </div>
            </Card>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between pt-4 border-t">
        <Button
          variant="ghost"
          onClick={handleBack}
          disabled={currentIndex === 0}
          className="text-sm"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back
        </Button>

        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            onClick={handleSkip}
            className="text-sm text-muted-foreground"
          >
            Skip for now
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
            Save & Continue
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function DatePickerField({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}) {
  const dateValue = value ? parseISO(value) : undefined;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            disabled={disabled}
            className={cn(
              "w-full justify-start text-left font-normal h-11",
              !value && "text-muted-foreground",
              disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {dateValue ? format(dateValue, "d MMMM yyyy") : "Select date..."}
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

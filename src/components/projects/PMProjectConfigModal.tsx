import { useState } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Calendar, Monitor, Award, Lock, User, Save, Wand2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { addDays, format, parseISO } from "date-fns";
import { getTemplateOrFallback, type TimelineStep } from "@/data/certificationTemplates";
import type { PMProject } from "@/hooks/usePMDashboard";
import { TimelineSetupWizard } from "./TimelineSetupWizard";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  project: PMProject;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Helpers ───

/** Resolve a template to the project's cert_type + cert_rating + subtype */
function useProjectTemplate(project: PMProject) {
  const certType = project.certifications?.[0]?.cert_type || project.cert_type;
  const certRating = project.cert_rating;
  const subtype = project.project_subtype;
  return getTemplateOrFallback(certType, certRating, subtype);
}

/** Given milestones and the template, compute calculated deadline dates */
function computeCalculatedDate(
  templateSteps: TimelineStep[],
  milestones: any[],
  currentIndex: number
): string | null {
  const step = templateSteps[currentIndex];
  if (step.type !== "calculated_deadline" || !step.offset_days) return null;

  // Find the last manual_input step before this one that has a due_date
  let baseDate: string | null = null;
  for (let i = currentIndex - 1; i >= 0; i--) {
    const prevStep = templateSteps[i];
    if (prevStep.type === "manual_input") {
      const prevMilestone = milestones.find(
        (m: any) => m.requirement === prevStep.name && m.milestone_type === "timeline"
      );
      if (prevMilestone?.due_date) {
        baseDate = prevMilestone.due_date;
      }
      break;
    }
  }

  if (!baseDate) return null;
  return format(addDays(parseISO(baseDate), step.offset_days), "yyyy-MM-dd");
}

// ─── Tab A: Timeline ───
function TimelineTab({ project, onOpenChange }: { project: PMProject; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user, role, isAdmin } = useAuth();
  const certId = project.certifications?.[0]?.id;
  const { template, isGeneric } = useProjectTemplate(project);
  const [wizardMode, setWizardMode] = useState<boolean | null>(null);

  // On Hold state
  const [onHoldPending, setOnHoldPending] = useState<{ milestoneId: string } | null>(null);
  const [onHoldNote, setOnHoldNote] = useState("");

  // Add milestone state
  const [showAddMilestone, setShowAddMilestone] = useState(false);
  const [newMilestoneName, setNewMilestoneName] = useState("");
  const [newMilestoneStart, setNewMilestoneStart] = useState("");
  const [newMilestoneEnd, setNewMilestoneEnd] = useState("");

  // Delete milestone state
  const [deletePending, setDeletePending] = useState<{ id: string; name: string } | null>(null);

  const { data: milestones = [], refetch } = useQuery({
    queryKey: ["timeline-milestones", certId],
    enabled: !!certId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("certification_milestones")
        .select("*")
        .eq("certification_id", certId!)
        .eq("milestone_type", "timeline")
        .order("order_index");
      if (error) throw error;
      return data || [];
    },
  });

  const [saving, setSaving] = useState(false);

  const hasOnHold = milestones.some((m: any) => m.status === "on_hold");

  const handleInitialize = async () => {
    if (!certId) return toast({ variant: "destructive", title: "Missing base certification in database." });
    setSaving(true);
    try {
      const rows = template.timeline.map((step) => ({
        certification_id: certId,
        category: step.name,
        requirement: step.name,
        milestone_type: "timeline" as const,
        order_index: step.order_index,
        max_score: 0,
        score: 0,
        status: "pending",
        notes: JSON.stringify({
          type: step.type,
          assigned_to_role: step.assigned_to_role,
          offset_days: step.offset_days || null,
        }),
      }));
      await supabase.from("certification_milestones").insert(rows as any);
      refetch();
      qc.invalidateQueries({ queryKey: ["pm-dashboard"] });
      toast({ title: "Timeline initialized successfully" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (milestoneId: string, updates: any) => {
    await supabase.from("certification_milestones").update(updates).eq("id", milestoneId);
    refetch();
    qc.invalidateQueries({ queryKey: ["pm-dashboard"] });
  };

  // Handle status change — intercept "on_hold" to require note
  const handleStatusChange = (milestoneId: string, newStatus: string) => {
    if (newStatus === "on_hold") {
      setOnHoldPending({ milestoneId });
      setOnHoldNote("");
    } else {
      handleUpdate(milestoneId, { status: newStatus });
    }
  };

  // Confirm on_hold with mandatory note
  const confirmOnHold = async () => {
    if (!onHoldPending || !onHoldNote.trim()) return;
    const milestoneId = onHoldPending.milestoneId;
    const milestone = milestones.find((m: any) => m.id === milestoneId);

    // Update milestone status
    await handleUpdate(milestoneId, { status: "on_hold" });

    // Create task_alert
    if (certId && user?.id) {
      await (supabase as any).from("task_alerts").insert({
        certification_id: certId,
        created_by: user.id,
        alert_type: "project_on_hold",
        title: `Project On Hold: ${project.name} — "${milestone?.requirement || "Milestone"}"`,
        description: onHoldNote.trim(),
        escalate_to_admin: true, // Always visible to admin
      });
      qc.invalidateQueries({ queryKey: ["task-alerts"] });
    }

    toast({ title: "Project set to On Hold", description: "Alert sent." });
    setOnHoldPending(null);
    setOnHoldNote("");
  };

  // Add milestone
  const handleAddMilestone = async () => {
    if (!certId || !newMilestoneName.trim()) return;
    setSaving(true);
    try {
      const maxOrder = milestones.reduce((max: number, m: any) => Math.max(max, m.order_index || 0), 0);
      await supabase.from("certification_milestones").insert({
        certification_id: certId,
        category: newMilestoneName.trim(),
        requirement: newMilestoneName.trim(),
        milestone_type: "timeline" as const,
        order_index: maxOrder + 1,
        max_score: 0,
        score: 0,
        status: "pending",
        start_date: newMilestoneStart || null,
        due_date: newMilestoneEnd || null,
        notes: JSON.stringify({ type: "manual_input", assigned_to_role: "PM" }),
      } as any);

      // Create admin alert
      if (user?.id) {
        const pmName = (project as any).pm_name || "PM";
        await (supabase as any).from("task_alerts").insert({
          certification_id: certId,
          created_by: user.id,
          alert_type: "pm_operational",
          title: `Project: ${project.name} — ${pmName} added milestone "${newMilestoneName.trim()}"`,
          escalate_to_admin: true,
        });
        qc.invalidateQueries({ queryKey: ["task-alerts"] });
      }

      refetch();
      qc.invalidateQueries({ queryKey: ["pm-dashboard"] });
      toast({ title: "Milestone added" });
      setShowAddMilestone(false);
      setNewMilestoneName("");
      setNewMilestoneStart("");
      setNewMilestoneEnd("");
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    } finally {
      setSaving(false);
    }
  };

  // Delete milestone
  const confirmDeleteMilestone = async () => {
    if (!deletePending || !certId) return;
    setSaving(true);
    try {
      await supabase.from("certification_milestones").delete().eq("id", deletePending.id);

      // Create admin alert
      if (user?.id) {
        const pmName = (project as any).pm_name || "PM";
        await (supabase as any).from("task_alerts").insert({
          certification_id: certId,
          created_by: user.id,
          alert_type: "pm_operational",
          title: `Project: ${project.name} — ${pmName} removed milestone "${deletePending.name}"`,
          escalate_to_admin: true,
        });
        qc.invalidateQueries({ queryKey: ["task-alerts"] });
      }

      // Reorder remaining milestones
      const { data: remaining } = await supabase
        .from("certification_milestones")
        .select("id")
        .eq("certification_id", certId)
        .eq("milestone_type", "timeline")
        .order("order_index");
      if (remaining) {
        for (let i = 0; i < remaining.length; i++) {
          await supabase.from("certification_milestones").update({ order_index: i } as any).eq("id", remaining[i].id);
        }
      }

      refetch();
      qc.invalidateQueries({ queryKey: ["pm-dashboard"] });
      toast({ title: "Milestone removed" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    } finally {
      setSaving(false);
      setDeletePending(null);
    }
  };

  // Auto-recalculate calculated_deadline dates when manual dates change
  const handleManualDateChange = async (milestoneId: string, field: string, value: string) => {
    const milestone = milestones.find((m: any) => m.id === milestoneId);
    await handleUpdate(milestoneId, { [field]: value || null });

    // Extra-fee alert: if this is a construction end / handover milestone and date is extended
    if (milestone && field === "due_date" && value) {
      const name = (milestone.requirement || "").toLowerCase();
      const isHandover = ["construction end", "handover", "fine lavori"].some(kw => name.includes(kw));
      const cert = project.certifications?.[0];
      const plannedHandover = cert?.planned_handover_date || cert?.handover_date;
      
      if (isHandover && plannedHandover && value > plannedHandover && certId && user?.id) {
        // Check if alert already exists
        const { data: existing } = await (supabase as any)
          .from("task_alerts")
          .select("id")
          .eq("certification_id", certId)
          .eq("alert_type", "other_critical")
          .eq("is_resolved", false)
          .like("title", "%Extension detected%")
          .limit(1);

        if (!existing || existing.length === 0) {
          await (supabase as any).from("task_alerts").insert({
            certification_id: certId,
            created_by: user.id,
            alert_type: "other_critical",
            title: `Extension detected — Verify GC support offer`,
            description: `Project: ${project.name} — Construction end moved from ${plannedHandover} to ${value}`,
            escalate_to_admin: true,
          });
          qc.invalidateQueries({ queryKey: ["task-alerts"] });
          toast({ title: "Extension alert sent to Admin", variant: "default" });
        }
      }
    }

    setTimeout(async () => {
      const { data: freshMilestones } = await supabase
        .from("certification_milestones")
        .select("*")
        .eq("certification_id", certId!)
        .eq("milestone_type", "timeline")
        .order("order_index");

      if (!freshMilestones) return;

      for (let i = 0; i < template.timeline.length; i++) {
        const step = template.timeline[i];
        if (step.type !== "calculated_deadline") continue;

        const calculatedDate = computeCalculatedDate(template.timeline, freshMilestones, i);
        if (calculatedDate) {
          const milestone = freshMilestones.find((m: any) => m.requirement === step.name);
          if (milestone && milestone.due_date !== calculatedDate) {
            await supabase
              .from("certification_milestones")
              .update({ due_date: calculatedDate, start_date: calculatedDate } as any)
              .eq("id", milestone.id);
          }
        }
      }
      refetch();
    }, 300);
  };
  
  const handleSaveTimeline = async () => {
    setSaving(true);
    try {
      if (certId) {
        await supabase
          .from("certifications")
          .update({ status: "in_corso" } as any)
          .eq("id", certId);
      }
      
      await (supabase as any)
        .from("certifications")
        .update({ status: "in_corso" })
        .eq("id", project.id);

      qc.invalidateQueries({ queryKey: ["pm-dashboard"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["timeline-milestones"] });

      toast({ 
        title: "Project Started", 
        description: "Timeline saved successfully. The project is now 'In Progress'." 
      });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Save Error", description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleMarkAsCertified = async () => {
    if (!confirm("Are you sure you want to close this project? It will be moved to Certified and the Timeline will be locked.")) return;
    
    setSaving(true);
    try {
      await (supabase as any)
        .from("certifications")
        .update({ status: "certificato" })
        .eq("id", project.id);

      if (certId) {
        await supabase
          .from("certifications")
          .update({ status: "certificato" } as any)
          .eq("id", certId);
      }

      qc.invalidateQueries({ queryKey: ["pm-dashboard"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      
      toast({ 
        title: "Milestone Achieved! 🏆", 
        description: "The project has been officially certified and closed." 
      });
      
      onOpenChange(false);

    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    } finally {
      setSaving(false);
    }
  };

  if (!certId) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        No certification associated. The admin must configure the project type.
      </p>
    );
  }

  if (milestones.length === 0) {
    return (
      <div className="text-center py-8 space-y-4 border rounded-lg bg-muted/30">
        <p className="text-sm text-muted-foreground">
          The timeline for this project has not been initialized yet.
        </p>
        {isGeneric && (
          <Badge variant="outline" className="text-amber-600 border-amber-300">
            Template generico — nessun rating specifico trovato
          </Badge>
        )}
        <div>
          <Button onClick={handleInitialize} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Initialize Timeline ({template.label})
          </Button>
        </div>
      </div>
    );
  }

  const sortedMilestones = [...milestones].sort((a: any, b: any) => {
    const idxA = template.timeline.findIndex((s) => s.name === a.requirement);
    const idxB = template.timeline.findIndex((s) => s.name === b.requirement);
    return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
  });

  const emptyDates = sortedMilestones.filter((m: any) => !m.start_date && !m.due_date).length;
  const shouldShowWizard = wizardMode === true || (wizardMode === null && emptyDates > sortedMilestones.length / 2);

  if (shouldShowWizard) {
    const alignedSteps = sortedMilestones.map((m: any) => {
      const match = template.timeline.find((s) => s.name === m.requirement);
      return match || {
        name: m.requirement,
        order_index: 0,
        type: "manual_input" as const,
        assigned_to_role: "PM",
        description: "Inserisci le date per questa fase del progetto.",
      };
    });

    return (
      <TimelineSetupWizard
        milestones={sortedMilestones}
        templateSteps={alignedSteps}
        certId={certId!}
        projectName={project.name}
        onComplete={() => {
          onOpenChange(false);
          qc.invalidateQueries({ queryKey: ["pm-dashboard"] });
        }}
        onSwitchToGrid={() => setWizardMode(false)}
      />
    );
  }

  const getStepMeta = (m: any) => {
    try {
      return JSON.parse(m.notes || "{}");
    } catch {
      return {};
    }
  };

  const finalMilestone = milestones[milestones.length - 1];
  const isReadyToCertify = finalMilestone?.status === "achieved";

  return (
    <div className="space-y-3">
      {/* On Hold mandatory note dialog */}
      <AlertDialog open={!!onHoldPending} onOpenChange={(open) => !open && setOnHoldPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Set Milestone On Hold
            </AlertDialogTitle>
            <AlertDialogDescription>
              Please provide a mandatory note explaining why this milestone is being put on hold. This will be logged and sent as an alert.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Describe the reason for putting this on hold..."
            value={onHoldNote}
            onChange={(e) => setOnHoldNote(e.target.value)}
            className="min-h-[100px]"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmOnHold}
              disabled={!onHoldNote.trim()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Confirm On Hold
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete milestone confirm dialog */}
      <AlertDialog open={!!deletePending} onOpenChange={(open) => !open && setDeletePending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Milestone</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove "{deletePending?.name}"? This action cannot be undone. An alert will be sent to the Admin.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteMilestone}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* On Hold banner */}
      {hasOnHold && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm font-medium">
          <AlertTriangle className="h-4 w-4" />
          Project is ON HOLD — one or more milestones are blocked
        </div>
      )}

      {/* Wizard toggle */}
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => setWizardMode(true)} className="text-xs text-muted-foreground">
          <Wand2 className="w-3.5 h-3.5 mr-1.5" />
          Guided Mode
        </Button>
      </div>
      
      {/* Header */}
      <div className="grid grid-cols-[1fr_80px_120px_120px_120px_100px_32px] gap-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
        <span>Step</span>
        <span>Role</span>
        <span>Start Date</span>
        <span>End Date</span>
        <span>Completed</span>
        <span>Status</span>
        <span></span>
      </div>

      <div className={cn(
        "border rounded-lg divide-y max-h-[400px] overflow-y-auto",
        hasOnHold && "border-destructive/50 bg-destructive/5"
      )}>
        {milestones.map((m: any, idx: number) => {
          const meta = getStepMeta(m);
          const isCalculated = meta.type === "calculated_deadline";
          const roleLabel = meta.assigned_to_role || "PM";
          const isOnHold = m.status === "on_hold";

          return (
            <div
              key={m.id}
              className={cn(
                "grid grid-cols-[1fr_80px_120px_120px_120px_100px_32px] gap-2 items-center px-3 py-2",
                isCalculated ? "bg-muted/50" : "bg-background",
                isOnHold && "bg-destructive/10 border-l-4 border-l-destructive"
              )}
            >
              <div className="flex items-center gap-2">
                {isCalculated && <Lock className="h-3 w-3 text-muted-foreground shrink-0" />}
                <span className="text-sm font-medium truncate">{m.requirement}</span>
                {meta.offset_days && (
                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    +{meta.offset_days}gg
                  </Badge>
                )}
              </div>

              <Badge variant="outline" className="text-[10px] justify-center">
                <User className="h-3 w-3 mr-1" />
                {roleLabel}
              </Badge>

              <Input
                type="date"
                className="h-7 text-xs"
                value={m.start_date || ""}
                disabled={isCalculated}
                onChange={(e) => handleManualDateChange(m.id, "start_date", e.target.value)}
              />
              <Input
                type="date"
                className="h-7 text-xs"
                value={m.due_date || ""}
                disabled={isCalculated}
                onChange={(e) => handleManualDateChange(m.id, "due_date", e.target.value)}
              />
              <Input
                type="date"
                className="h-7 text-xs"
                value={m.completed_date || ""}
                onChange={(e) => handleUpdate(m.id, { completed_date: e.target.value || null })}
              />
              <Select
                value={m.status || "pending"}
                onValueChange={(v) => handleStatusChange(m.id, v)}
              >
                <SelectTrigger className={cn("h-7 text-xs", isOnHold && "border-destructive text-destructive")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="achieved">Completed</SelectItem>
                  <SelectItem value="on_hold">
                    <span className="text-destructive font-medium">On Hold</span>
                  </SelectItem>
                </SelectContent>
              </Select>

              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => setDeletePending({ id: m.id, name: m.requirement })}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          );
        })}
      </div>

      {/* Add Milestone */}
      {showAddMilestone ? (
        <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
          <Label className="text-sm font-medium">Add New Milestone</Label>
          <div className="grid grid-cols-[1fr_120px_120px] gap-3">
            <Input
              placeholder="Milestone name"
              value={newMilestoneName}
              onChange={(e) => setNewMilestoneName(e.target.value)}
            />
            <Input
              type="date"
              value={newMilestoneStart}
              onChange={(e) => setNewMilestoneStart(e.target.value)}
              placeholder="Start"
            />
            <Input
              type="date"
              value={newMilestoneEnd}
              onChange={(e) => setNewMilestoneEnd(e.target.value)}
              placeholder="End"
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAddMilestone} disabled={saving || !newMilestoneName.trim()}>
              {saving && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
              <Plus className="h-3 w-3 mr-1" /> Add
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAddMilestone(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setShowAddMilestone(true)} className="w-full">
          <Plus className="h-4 w-4 mr-2" /> Add Milestone
        </Button>
      )}

      {/* Bottom action bar */}
      <div className="flex justify-end gap-3 pt-4 mt-2 border-t">
        <Button 
          onClick={handleSaveTimeline} 
          disabled={saving} 
          variant={isReadyToCertify ? "outline" : "default"}
          className={!isReadyToCertify ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}
        >
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save Changes
        </Button>

        {isReadyToCertify && (
          <Button 
            onClick={handleMarkAsCertified} 
            disabled={saving}
            className="bg-yellow-600 hover:bg-yellow-700 text-white shadow-lg shadow-yellow-600/20"
          >
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Award className="w-4 h-4 mr-2" />}
            Declare Project Certified
          </Button>
        )}
      </div>

    </div>
  );
}

// ─── Tab B: Hardware ───
function HardwareTab({ project }: { project: PMProject }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("*").order("name");
      return data || [];
    },
  });

  const { data: allocations = [], refetch } = useQuery({
    queryKey: ["project-allocations", project.id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("project_allocations")
        .select("*, products(name, sku)")
        .eq("certification_id", project.id);
      return data || [];
    },
  });

  const [newProductId, setNewProductId] = useState("");
  const [newQty, setQty] = useState(1);
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!newProductId) return;
    setSaving(true);
    try {
      await (supabase as any).from("project_allocations").insert({
        certification_id: project.id,
        product_id: newProductId,
        quantity: newQty,
        status: "Requested",
      });
      setNewProductId("");
      setQty(1);
      refetch();
      qc.invalidateQueries({ queryKey: ["pm-dashboard"] });
      toast({ title: "Hardware requested successfully" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await supabase.from("project_allocations").delete().eq("id", id);
    refetch();
    qc.invalidateQueries({ queryKey: ["pm-dashboard"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3 p-4 bg-muted/30 rounded-lg border">
        <div className="flex-1">
          <Label className="text-xs">Select Sensor / Device</Label>
          <Select value={newProductId} onValueChange={setNewProductId}>
            <SelectTrigger className="bg-background">
              <SelectValue placeholder="Choose from catalog..." />
            </SelectTrigger>
            <SelectContent>
              {products.map((p: any) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} ({p.sku})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-24">
          <Label className="text-xs">Quantity</Label>
          <Input
            type="number"
            min={1}
            value={newQty}
            onChange={(e) => setQty(Number(e.target.value) || 1)}
            className="bg-background"
          />
        </div>
        <Button onClick={handleAdd} disabled={saving || !newProductId}>
          <Plus className="h-4 w-4 mr-2" /> Add
        </Button>
      </div>

      {allocations.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          No hardware requested currently.
        </p>
      ) : (
        <div className="border rounded-lg divide-y">
          {allocations.map((a: any) => (
            <div key={a.id} className="flex items-center justify-between px-4 py-3 bg-background">
              <div>
                <span className="text-sm font-bold text-foreground">{a.products?.name || "—"}</span>
                <span className="text-xs text-muted-foreground ml-2">SKU: {a.products?.sku}</span>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="outline">Qty: {a.quantity}</Badge>
                <Badge>{a.status}</Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => handleDelete(a.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tab C: Scorecard ───
function ScorecardTab({ project }: { project: PMProject }) {
  const qc = useQueryClient();
  const certId = project.certifications?.[0]?.id;
  const { template, isGeneric } = useProjectTemplate(project);

  const { data: milestones = [], refetch } = useQuery({
    queryKey: ["scorecard-milestones", certId],
    enabled: !!certId,
    queryFn: async () => {
      const { data } = await supabase
        .from("certification_milestones")
        .select("*")
        .eq("certification_id", certId!)
        .eq("milestone_type", "scorecard")
        .order("order_index");
      return data || [];
    },
  });

  const [saving, setSaving] = useState(false);

  const handleInitialize = async () => {
    if (!certId) return;
    if (template.scorecard.length === 0) return;
    setSaving(true);
    try {
      const rows = template.scorecard.map((s, i) => ({
        certification_id: certId,
        category: s.category,
        requirement: s.requirement,
        max_score: s.max_score,
        score: 0,
        milestone_type: "scorecard" as const,
        order_index: i,
        status: "pending",
      }));
      await supabase.from("certification_milestones").insert(rows as any);
      refetch();
      qc.invalidateQueries({ queryKey: ["pm-dashboard"] });
    } finally {
      setSaving(false);
    }
  };

  const handleScoreUpdate = async (milestoneId: string, score: number, maxScore: number) => {
    const val = Math.min(Math.max(0, score), maxScore);
    await supabase
      .from("certification_milestones")
      .update({ score: val } as any)
      .eq("id", milestoneId);
    refetch();

    // Update total score on certification
    if (certId) {
      const { data: allMs } = await supabase
        .from("certification_milestones")
        .select("score")
        .eq("certification_id", certId);
      const total = (allMs || []).reduce((s, m) => s + Number(m.score), 0);
      await supabase.from("certifications").update({ score: total } as any).eq("id", certId);
      qc.invalidateQueries({ queryKey: ["pm-dashboard"] });
    }
  };

  if (!certId) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        No certification associated.
      </p>
    );
  }

  if (template.scorecard.length === 0) {
    return (
      <div className="text-center py-8 space-y-2 border rounded-lg bg-muted/30">
        <p className="text-sm text-muted-foreground">
          No predefined scorecard for template "{template.label}".
        </p>
        <p className="text-xs text-muted-foreground">
          BREEAM / WELL scorecard will be available soon.
        </p>
      </div>
    );
  }

  if (milestones.length === 0) {
    return (
      <div className="text-center py-8 space-y-4 border rounded-lg bg-muted/30">
        <p className="text-sm text-muted-foreground">
          The Scorecard for this project has not been initialized yet.
        </p>
        <Button onClick={handleInitialize} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Generate Scorecard Grid ({template.label})
        </Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 max-h-[400px] overflow-y-auto pr-2">
      {milestones.map((m: any) => (
        <Card key={m.id} className="bg-muted/30">
          <CardHeader className="py-2 px-4 border-b bg-background">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">
                {m.category} —{" "}
                <span className="text-muted-foreground text-xs">{m.requirement}</span>
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-4 py-3">
            <div className="flex items-center gap-4">
              <div className="flex-1 space-y-1">
                <Label className="text-[10px] text-muted-foreground uppercase">Points Earned</Label>
                <Input
                  type="number"
                  min={0}
                  max={m.max_score}
                  value={m.score || 0}
                  onChange={(e) =>
                    handleScoreUpdate(m.id, Number(e.target.value) || 0, m.max_score)
                  }
                  className="h-8 text-sm font-bold bg-background"
                />
              </div>
              <div className="w-16 space-y-1">
                <Label className="text-[10px] text-muted-foreground uppercase">Max</Label>
                <Input
                  type="number"
                  value={m.max_score}
                  disabled
                  className="h-8 text-sm bg-muted text-center"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}


// ─── Main Modal ───
export function PMProjectConfigModal({ project, open, onOpenChange }: Props) {
  const { template } = useProjectTemplate(project);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="pb-4 border-b">
          <DialogTitle className="text-xl">Configure Project: {project.name}</DialogTitle>
          <DialogDescription>
            Template: <Badge variant="secondary">{template.label}</Badge> — Fill in all data
            in the tabs below.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="timeline" className="flex-1 flex flex-col mt-4">
          <TabsList className="grid grid-cols-3 w-full bg-background border">
            <TabsTrigger value="timeline" className="gap-2">
              <Calendar className="w-4 h-4" /> Timeline
            </TabsTrigger>
            <TabsTrigger value="hardware" className="gap-2">
              <Monitor className="w-4 h-4" /> Hardware
            </TabsTrigger>
            <TabsTrigger value="scorecard" className="gap-2">
              <Award className="w-4 h-4" /> Scorecard
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 mt-4 overflow-auto">
            <TabsContent value="timeline" className="m-0">
              <TimelineTab project={project} onOpenChange={onOpenChange} />
            </TabsContent>
            <TabsContent value="hardware" className="m-0">
              <HardwareTab project={project} />
            </TabsContent>
            <TabsContent value="scorecard" className="m-0">
              <ScorecardTab project={project} />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

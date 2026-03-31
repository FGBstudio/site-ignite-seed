import { useState } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Calendar, Monitor, Award, Lock, User } from "lucide-react";
import { addDays, format, parseISO } from "date-fns";
import { getTemplateOrFallback, type TimelineStep } from "@/data/certificationTemplates";
import type { PMProject } from "@/hooks/usePMDashboard";

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
function TimelineTab({ project }: { project: PMProject }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const certId = project.certifications?.[0]?.id;
  const { template, isGeneric } = useProjectTemplate(project);

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

  const handleInitialize = async () => {
    if (!certId) return toast({ variant: "destructive", title: "Manca la certificazione base nel database." });
    setSaving(true);
    try {
      const rows = template.timeline.map((step) => ({
        certification_id: certId,
        category: step.name,      // FIX: Scrive "Pre-assessment", "Start construction phase", ecc.
        requirement: step.name,   // Manteniamo allineato per doppia sicurezza
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
      toast({ title: "Timeline inizializzata con successo" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Errore", description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (milestoneId: string, updates: any) => {
    await supabase.from("certification_milestones").update(updates).eq("id", milestoneId);
    refetch();
    qc.invalidateQueries({ queryKey: ["pm-dashboard"] });
  };

  // Auto-recalculate calculated_deadline dates when manual dates change
  const handleManualDateChange = async (milestoneId: string, field: string, value: string) => {
    await handleUpdate(milestoneId, { [field]: value || null });

    // Recalculate all calculated_deadline milestones
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

  if (!certId) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        Nessuna certificazione associata. L'admin deve configurare il tipo di progetto.
      </p>
    );
  }

  if (milestones.length === 0) {
    return (
      <div className="text-center py-8 space-y-4 border rounded-lg bg-muted/30">
        <p className="text-sm text-muted-foreground">
          La timeline per questo progetto non è ancora stata inizializzata.
        </p>
        {isGeneric && (
          <Badge variant="outline" className="text-amber-600 border-amber-300">
            Template generico — nessun rating specifico trovato
          </Badge>
        )}
        <div>
          <Button onClick={handleInitialize} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Inizializza Timeline ({template.label})
          </Button>
        </div>
      </div>
    );
  }

  // Parse step metadata from notes
  const getStepMeta = (m: any) => {
    try {
      return JSON.parse(m.notes || "{}");
    } catch {
      return {};
    }
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="grid grid-cols-[1fr_80px_120px_120px_120px_100px] gap-2 px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
        <span>Step</span>
        <span>Ruolo</span>
        <span>Data Inizio</span>
        <span>Data Fine</span>
        <span>Completato</span>
        <span>Stato</span>
      </div>

      <div className="border rounded-lg divide-y max-h-[400px] overflow-y-auto">
        {milestones.map((m: any, idx: number) => {
          const meta = getStepMeta(m);
          const isCalculated = meta.type === "calculated_deadline";
          const roleLabel = meta.assigned_to_role || "PM";

          return (
            <div
              key={m.id}
              className={`grid grid-cols-[1fr_80px_120px_120px_120px_100px] gap-2 items-center px-3 py-2 ${
                isCalculated ? "bg-muted/50" : "bg-background"
              }`}
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
                onValueChange={(v) => handleUpdate(m.id, { status: v })}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">In Attesa</SelectItem>
                  <SelectItem value="in_progress">In Corso</SelectItem>
                  <SelectItem value="achieved">Completato</SelectItem>
                </SelectContent>
              </Select>
            </div>
          );
        })}
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
      const { data } = await supabase
        .from("project_allocations")
        .select("*, products(name, sku)")
        .eq("project_id", project.id);
      return data || [];
    },
  });

  const [newProductId, setNewProductId] = useState("");
  const [newQty, setNewQty] = useState(1);
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!newProductId) return;
    setSaving(true);
    try {
      await supabase.from("project_allocations").insert({
        project_id: project.id,
        product_id: newProductId,
        quantity: newQty,
        status: "Requested",
      } as any);
      setNewProductId("");
      setNewQty(1);
      refetch();
      qc.invalidateQueries({ queryKey: ["pm-dashboard"] });
      toast({ title: "Hardware richiesto con successo" });
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
          <Label className="text-xs">Seleziona Sensore / Dispositivo</Label>
          <Select value={newProductId} onValueChange={setNewProductId}>
            <SelectTrigger className="bg-background">
              <SelectValue placeholder="Scegli dal catalogo..." />
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
          <Label className="text-xs">Quantità</Label>
          <Input
            type="number"
            min={1}
            value={newQty}
            onChange={(e) => setNewQty(Number(e.target.value) || 1)}
            className="bg-background"
          />
        </div>
        <Button onClick={handleAdd} disabled={saving || !newProductId}>
          <Plus className="h-4 w-4 mr-2" /> Aggiungi
        </Button>
      </div>

      {allocations.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          Nessun hardware richiesto attualmente.
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
                <Badge variant="outline">Quantità: {a.quantity}</Badge>
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
        Nessuna certificazione associata.
      </p>
    );
  }

  if (template.scorecard.length === 0) {
    return (
      <div className="text-center py-8 space-y-2 border rounded-lg bg-muted/30">
        <p className="text-sm text-muted-foreground">
          Nessuna scorecard predefinita per il template "{template.label}".
        </p>
        <p className="text-xs text-muted-foreground">
          La scorecard BREEAM / WELL sarà disponibile a breve.
        </p>
      </div>
    );
  }

  if (milestones.length === 0) {
    return (
      <div className="text-center py-8 space-y-4 border rounded-lg bg-muted/30">
        <p className="text-sm text-muted-foreground">
          La Scorecard per questo progetto non è ancora stata inizializzata.
        </p>
        <Button onClick={handleInitialize} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Genera Griglia Scorecard ({template.label})
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
                <Label className="text-[10px] text-muted-foreground uppercase">Punti Ottenuti</Label>
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
          <DialogTitle className="text-xl">Configura Progetto: {project.name}</DialogTitle>
          <DialogDescription>
            Template: <Badge variant="secondary">{template.label}</Badge> — Compila tutti i dati
            nei tab sottostanti.
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
              <TimelineTab project={project} />
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

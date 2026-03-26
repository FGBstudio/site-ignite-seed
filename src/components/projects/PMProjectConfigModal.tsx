import { useState, useEffect, useMemo } from "react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import type { PMProject } from "@/hooks/usePMDashboard";
import {
  CERT_TYPES,
  CERT_RATINGS,
  CERT_LEVELS,
  getTemplateOrFallback,
} from "@/data/certificationTemplates";

interface Props {
  project: PMProject;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Tab 1: Hardware ───
function HardwareTab({ project }: { project: PMProject }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: allocations = [], refetch } = useQuery({
    queryKey: ["project-allocations", project.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("project_allocations")
        .select("*, products(name, sku)")
        .eq("project_id", project.id);
      if (error) throw error;
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
      const { error } = await (supabase as any)
        .from("project_allocations")
        .insert({ project_id: project.id, product_id: newProductId, quantity: newQty, status: "Draft" });
      if (error) throw error;
      setNewProductId("");
      setNewQty(1);
      refetch();
      qc.invalidateQueries({ queryKey: ["pm-dashboard"] });
      toast({ title: "Hardware aggiunto" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Errore", description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await (supabase as any).from("project_allocations").delete().eq("id", id);
    if (error) toast({ variant: "destructive", title: "Errore", description: error.message });
    else { refetch(); qc.invalidateQueries({ queryKey: ["pm-dashboard"] }); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <Label className="text-xs">Prodotto</Label>
          <Select value={newProductId} onValueChange={setNewProductId}>
            <SelectTrigger><SelectValue placeholder="Seleziona prodotto" /></SelectTrigger>
            <SelectContent>
              {products.map((p: any) => (
                <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-24">
          <Label className="text-xs">Quantità</Label>
          <Input type="number" min={1} value={newQty} onChange={(e) => setNewQty(Number(e.target.value) || 1)} />
        </div>
        <Button onClick={handleAdd} disabled={saving || !newProductId} className="gap-1">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Aggiungi
        </Button>
      </div>

      {allocations.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">Nessun hardware assegnato.</p>
      ) : (
        <div className="border rounded-lg divide-y">
          {allocations.map((a: any) => (
            <div key={a.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <span className="text-sm font-medium text-foreground">{a.products?.name || "—"}</span>
                <span className="text-xs text-muted-foreground ml-2">SKU: {a.products?.sku}</span>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="outline">Qty: {a.quantity}</Badge>
                <Badge variant="outline">{a.status}</Badge>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => handleDelete(a.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tab 2: Certification & Level ───
function CertificationTab({ project }: { project: PMProject }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const cert = project.certifications?.[0];

  const [certType, setCertType] = useState(cert?.cert_type || project.cert_type || "");
  const [rating, setRating] = useState(cert?.level ? "" : "");
  const [level, setLevel] = useState(cert?.level || "");
  const [targetScore, setTargetScore] = useState<number>(cert?.target_score || 0);
  const [saving, setSaving] = useState(false);

  // Derive rating from cert_type on project
  useEffect(() => {
    if (cert) {
      setCertType(cert.cert_type || "");
      setLevel(cert.level || "");
      setTargetScore(cert.target_score || 0);
    }
  }, [cert]);

  const ratings = CERT_RATINGS[certType] || [];
  const levels = CERT_LEVELS[certType] || [];

  const handleSave = async () => {
    if (!certType || !level) {
      toast({ variant: "destructive", title: "Compila tipo e livello" });
      return;
    }
    setSaving(true);
    try {
      if (cert) {
        // Update existing
        const { error } = await supabase
          .from("certifications")
          .update({ cert_type: certType, level, target_score: targetScore } as any)
          .eq("id", cert.id);
        if (error) throw error;
      } else if (project.site_id) {
        // Create new
        const { error } = await supabase
          .from("certifications")
          .insert({
            site_id: project.site_id,
            cert_type: certType,
            level,
            target_score: targetScore,
            status: "in_progress",
          } as any);
        if (error) throw error;
      } else {
        throw new Error("Progetto senza sito associato. Associa prima un sito.");
      }
      qc.invalidateQueries({ queryKey: ["pm-dashboard"] });
      toast({ title: "Certificazione salvata" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Errore", description: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-xs">Protocollo</Label>
          <Select value={certType} onValueChange={(v) => { setCertType(v); setRating(""); setLevel(""); }}>
            <SelectTrigger><SelectValue placeholder="Seleziona" /></SelectTrigger>
            <SelectContent>
              {CERT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Rating / Tipologia</Label>
          <Select value={rating} onValueChange={setRating} disabled={!certType}>
            <SelectTrigger><SelectValue placeholder="Seleziona" /></SelectTrigger>
            <SelectContent>
              {ratings.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Livello Target</Label>
          <Select value={level} onValueChange={setLevel} disabled={!certType}>
            <SelectTrigger><SelectValue placeholder="Seleziona" /></SelectTrigger>
            <SelectContent>
              {levels.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Target Score</Label>
          <Input type="number" min={0} value={targetScore} onChange={(e) => setTargetScore(Number(e.target.value) || 0)} />
        </div>
      </div>
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-1">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Salva Certificazione
        </Button>
      </div>
    </div>
  );
}

// ─── Tab 3: Timeline ───
function TimelineTab({ project }: { project: PMProject }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const cert = project.certifications?.[0];
  const certId = cert?.id;

  const { template, isGeneric } = getTemplateOrFallback(cert?.cert_type || project.cert_type, project.cert_rating);

  const { data: milestones = [] as any[], refetch } = useQuery({
    queryKey: ["timeline-milestones", certId],
    enabled: !!certId,
    queryFn: async (): Promise<any[]> => {
      const { data, error } = await (supabase as any)
        .from("certification_milestones")
        .select("*")
        .eq("certification_id", certId!)
        .eq("milestone_type", "timeline")
        .order("order_index");
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const [saving, setSaving] = useState(false);

  // Initialize milestones from template if none exist
  const handleInitialize = async () => {
    if (!certId) {
      toast({ variant: "destructive", title: "Salva prima la certificazione nel Tab 2" });
      return;
    }
    setSaving(true);
    try {
      const rows = template.timeline.map((step) => ({
        certification_id: certId,
        category: "Timeline",
        requirement: step.name,
        milestone_type: "timeline",
        order_index: step.order_index,
        max_score: 0,
        score: 0,
        status: "pending",
      }));
      const { error } = await supabase.from("certification_milestones").insert(rows as any);
      if (error) throw error;
      refetch();
      qc.invalidateQueries({ queryKey: ["pm-dashboard"] });
      toast({ title: "Timeline inizializzata" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Errore", description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (milestoneId: string, updates: any) => {
    const { error } = await supabase.from("certification_milestones").update(updates).eq("id", milestoneId);
    if (error) toast({ variant: "destructive", title: "Errore", description: error.message });
    else { refetch(); qc.invalidateQueries({ queryKey: ["pm-dashboard"] }); }
  };

  if (!certId) {
    return <p className="text-sm text-muted-foreground text-center py-8">Configura prima la certificazione nel Tab 2.</p>;
  }

  if (milestones.length === 0) {
    return (
      <div className="text-center py-8 space-y-3">
        {isGeneric && (
          <div className="flex items-center gap-2 justify-center text-warning">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm">Template generico — inserimento manuale disponibile</span>
          </div>
        )}
        <p className="text-sm text-muted-foreground">Nessuno step timeline trovato.</p>
        <Button onClick={handleInitialize} disabled={saving} className="gap-1">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Inizializza Timeline da Template
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {isGeneric && (
        <div className="flex items-center gap-2 text-warning mb-3">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-sm">Template in fase di definizione — modifiche manuali consentite</span>
        </div>
      )}
      <div className="border rounded-lg divide-y max-h-[400px] overflow-y-auto">
        {milestones.map((m: any) => (
          <div key={m.id} className="grid grid-cols-[1fr_120px_120px_120px_110px] gap-2 items-center px-3 py-2">
            <span className="text-sm text-foreground truncate">{m.requirement}</span>
            <Input
              type="date"
              className="h-7 text-xs"
              value={m.start_date || ""}
              onChange={(e) => handleUpdate(m.id, { start_date: e.target.value || null })}
            />
            <Input
              type="date"
              className="h-7 text-xs"
              value={m.due_date || ""}
              onChange={(e) => handleUpdate(m.id, { due_date: e.target.value || null })}
            />
            <Input
              type="date"
              className="h-7 text-xs"
              value={m.completed_date || ""}
              onChange={(e) => handleUpdate(m.id, { completed_date: e.target.value || null })}
            />
            <Select value={m.status || "pending"} onValueChange={(v) => handleUpdate(m.id, { status: v })}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
      <div className="text-xs text-muted-foreground px-3">
        Colonne: Nome Step · Data Inizio · Data Scadenza · Data Completamento · Stato
      </div>
    </div>
  );
}

// ─── Tab 4: Scorecard ───
function ScorecardTab({ project }: { project: PMProject }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const cert = project.certifications?.[0];
  const certId = cert?.id;

  const { template, isGeneric } = getTemplateOrFallback(cert?.cert_type || project.cert_type, project.cert_rating);

  const { data: milestones = [] as any[], refetch } = useQuery({
    queryKey: ["scorecard-milestones", certId],
    enabled: !!certId,
    queryFn: async (): Promise<any[]> => {
      const { data, error } = await (supabase as any)
        .from("certification_milestones")
        .select("*")
        .eq("certification_id", certId!)
        .eq("milestone_type", "scorecard")
        .order("category")
        .order("requirement");
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const [saving, setSaving] = useState(false);

  const handleInitialize = async () => {
    if (!certId) {
      toast({ variant: "destructive", title: "Salva prima la certificazione nel Tab 2" });
      return;
    }
    if (template.scorecard.length === 0) {
      toast({ variant: "destructive", title: "Nessun template scorecard disponibile per questa certificazione" });
      return;
    }
    setSaving(true);
    try {
      const rows = template.scorecard.map((s, i) => ({
        certification_id: certId,
        category: s.category,
        requirement: s.requirement,
        max_score: s.max_score,
        score: 0,
        milestone_type: "scorecard",
        order_index: i,
        status: "pending",
      }));
      const { error } = await supabase.from("certification_milestones").insert(rows as any);
      if (error) throw error;
      refetch();
      toast({ title: "Scorecard inizializzata" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Errore", description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleScoreUpdate = async (milestoneId: string, score: number, maxScore: number) => {
    const val = Math.min(Math.max(0, score), maxScore);
    const { error } = await supabase
      .from("certification_milestones")
      .update({ score: val } as any)
      .eq("id", milestoneId);
    if (error) toast({ variant: "destructive", title: "Errore", description: error.message });
    else refetch();

    // Recalculate total
    if (certId) {
      const { data: allMs } = await supabase
        .from("certification_milestones")
        .select("score")
        .eq("certification_id", certId);
      const total = (allMs || []).reduce((s, m) => s + Number(m.score), 0);
      await supabase.from("certifications").update({ score: total } as any).eq("id", certId);
    }
  };

  if (!certId) {
    return <p className="text-sm text-muted-foreground text-center py-8">Configura prima la certificazione nel Tab 2.</p>;
  }

  if (milestones.length === 0) {
    return (
      <div className="text-center py-8 space-y-3">
        {isGeneric && template.scorecard.length === 0 && (
          <div className="flex items-center gap-2 justify-center text-warning">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm">Nessun template scorecard disponibile per questa certificazione</span>
          </div>
        )}
        <p className="text-sm text-muted-foreground">Nessuna milestone scorecard trovata.</p>
        {template.scorecard.length > 0 && (
          <Button onClick={handleInitialize} disabled={saving} className="gap-1">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Inizializza Scorecard da Template
          </Button>
        )}
      </div>
    );
  }

  // Group by category
  const grouped = milestones.reduce((acc: Record<string, any[]>, m: any) => {
    if (!acc[m.category]) acc[m.category] = [];
    acc[m.category].push(m);
    return acc;
  }, {});

  return (
    <div className="space-y-4 max-h-[400px] overflow-y-auto">
      {Object.entries(grouped).map(([category, items]: [string, any[]]) => {
        const catScore = items.reduce((s: number, m: any) => s + Number(m.score || 0), 0);
        const catMax = items.reduce((s: number, m: any) => s + Number(m.max_score || 0), 0);
        return (
          <Card key={category}>
            <CardHeader className="py-3 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">{category}</CardTitle>
                <span className="text-xs font-medium text-muted-foreground">{catScore}/{catMax} pts</span>
              </div>
            </CardHeader>
            <CardContent className="px-0 pt-0">
              <div className="divide-y">
                {items.map((m: any) => (
                  <div key={m.id} className="flex items-center justify-between px-4 py-2">
                    <span className="text-sm text-foreground flex-1 truncate">{m.requirement}</span>
                    <div className="flex items-center gap-2">
                      {m.max_score > 0 ? (
                        <Input
                          type="number"
                          min={0}
                          max={m.max_score}
                          value={m.score || 0}
                          onChange={(e) => handleScoreUpdate(m.id, Number(e.target.value) || 0, m.max_score)}
                          className="w-16 h-7 text-xs text-center"
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">Prereq</span>
                      )}
                      <span className="text-xs text-muted-foreground w-8 text-right">/{m.max_score}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ─── Main Modal ───
export function PMProjectConfigModal({ project, open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configura Progetto — {project.name}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="hardware" className="space-y-4">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="hardware">Hardware</TabsTrigger>
            <TabsTrigger value="certification">Certificazione</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="scorecard">Scorecard</TabsTrigger>
          </TabsList>

          <TabsContent value="hardware">
            <HardwareTab project={project} />
          </TabsContent>
          <TabsContent value="certification">
            <CertificationTab project={project} />
          </TabsContent>
          <TabsContent value="timeline">
            <TimelineTab project={project} />
          </TabsContent>
          <TabsContent value="scorecard">
            <ScorecardTab project={project} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

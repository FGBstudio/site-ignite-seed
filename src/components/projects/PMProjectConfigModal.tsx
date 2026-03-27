import { useState, useEffect } from "react";
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
import { Loader2, Plus, Trash2, AlertTriangle, Calendar, Monitor, Award } from "lucide-react";
import type { PMProject } from "@/hooks/usePMDashboard";

// ─── MOTORE ELASTICO TEMPLATE (Integrato e blindato) ───
function getElasticTemplate(certType: string | null) {
  const type = (certType || "").toUpperCase();
  
  if (type.includes("LEED")) {
    return {
      isGeneric: false,
      scorecard: [
        { category: 'EA', requirement: 'Energia e Atmosfera', max_score: 33 },
        { category: 'WE', requirement: 'Efficienza Idrica', max_score: 12 },
        { category: 'MR', requirement: 'Materiali e Risorse', max_score: 13 },
        { category: 'EQ', requirement: 'Qualità Ambientale Interna', max_score: 16 },
        { category: 'SS', requirement: 'Siti Sostenibili', max_score: 26 },
        { category: 'IN', requirement: 'Innovazione', max_score: 6 },
        { category: 'RP', requirement: 'Priorità Regionale', max_score: 4 },
      ],
      timeline: [
        { name: "Fase di Design", order_index: 1 },
        { name: "Fase di Costruzione", order_index: 2 },
        { name: "Audit Pre-Certificazione", order_index: 3 },
        { name: "Sottomissione USGBC", order_index: 4 },
      ]
    };
  }
  
  if (type.includes("WELL")) {
    return {
      isGeneric: false,
      scorecard: [
        { category: 'AIR', requirement: 'Aria', max_score: 12 },
        { category: 'WATER', requirement: 'Acqua', max_score: 11 },
        { category: 'NOURISHMENT', requirement: 'Alimentazione', max_score: 14 },
        { category: 'LIGHT', requirement: 'Luce', max_score: 11 },
        { category: 'MOVEMENT', requirement: 'Movimento', max_score: 10 },
        { category: 'THERMAL', requirement: 'Comfort Termico', max_score: 7 },
        { category: 'SOUND', requirement: 'Acustica', max_score: 8 },
        { category: 'MATERIALS', requirement: 'Materiali', max_score: 10 },
        { category: 'MIND', requirement: 'Mente', max_score: 9 },
        { category: 'COMMUNITY', requirement: 'Comunità', max_score: 11 },
      ],
      timeline: [
        { name: "Registrazione", order_index: 1 },
        { name: "Documentazione", order_index: 2 },
        { name: "Performance Verification", order_index: 3 },
        { name: "Certificazione", order_index: 4 },
      ]
    };
  }

  // Fallback per certificazioni custom o non ancora modellate
  return {
    isGeneric: true,
    scorecard: [
      { category: 'GEN', requirement: 'Valutazione Generale', max_score: 100 }
    ],
    timeline: [
      { name: "Inizio Lavori", order_index: 1 },
      { name: "Completamento", order_index: 2 }
    ]
  };
}

interface Props {
  project: PMProject;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Tab A: Timeline ───
function TimelineTab({ project }: { project: PMProject }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const certId = project.certifications?.[0]?.id;
  const template = getElasticTemplate(project.certifications?.[0]?.cert_type || (project as any).project_type);

  const { data: milestones = [], refetch } = useQuery({
    queryKey: ["timeline-milestones", certId],
    enabled: !!certId,
    queryFn: async () => {
      const { data, error } = await supabase.from("certification_milestones").select("*").eq("certification_id", certId!).eq("milestone_type", "timeline").order("order_index");
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
        certification_id: certId, category: "Timeline", requirement: step.name, milestone_type: "timeline", order_index: step.order_index, max_score: 0, score: 0, status: "pending"
      }));
      await supabase.from("certification_milestones").insert(rows as any);
      refetch();
      qc.invalidateQueries({ queryKey: ["pm-dashboard"] });
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

  if (!certId) return <p className="text-sm text-muted-foreground text-center py-8">Nessuna certificazione associata. L'admin deve configurare il tipo di progetto.</p>;

  if (milestones.length === 0) {
    return (
      <div className="text-center py-8 space-y-4 border rounded-lg bg-slate-50">
        <p className="text-sm text-muted-foreground">La timeline per questo progetto non è ancora stata inizializzata.</p>
        <Button onClick={handleInitialize} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Inizializza Timeline Operativa
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="border rounded-lg divide-y max-h-[400px] overflow-y-auto">
        {milestones.map((m: any) => (
          <div key={m.id} className="grid grid-cols-[1fr_120px_120px_120px_110px] gap-2 items-center px-3 py-2 bg-white">
            <span className="text-sm font-medium">{m.requirement}</span>
            <Input type="date" className="h-7 text-xs" value={m.start_date || ""} onChange={(e) => handleUpdate(m.id, { start_date: e.target.value || null })} />
            <Input type="date" className="h-7 text-xs" value={m.due_date || ""} onChange={(e) => handleUpdate(m.id, { due_date: e.target.value || null })} />
            <Input type="date" className="h-7 text-xs" value={m.completed_date || ""} onChange={(e) => handleUpdate(m.id, { completed_date: e.target.value || null })} />
            <Select value={m.status || "pending"} onValueChange={(v) => handleUpdate(m.id, { status: v })}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">In Attesa</SelectItem>
                <SelectItem value="in_progress">In Corso</SelectItem>
                <SelectItem value="achieved">Completato</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ))}
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
      const { data } = await supabase.from("project_allocations").select("*, products(name, sku)").eq("project_id", project.id);
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
      await supabase.from("project_allocations").insert({ project_id: project.id, product_id: newProductId, quantity: newQty, status: "Requested" } as any);
      setNewProductId(""); setNewQty(1); refetch(); qc.invalidateQueries({ queryKey: ["pm-dashboard"] });
      toast({ title: "Hardware richiesto con successo" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await supabase.from("project_allocations").delete().eq("id", id);
    refetch(); qc.invalidateQueries({ queryKey: ["pm-dashboard"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3 p-4 bg-slate-50 rounded-lg border">
        <div className="flex-1">
          <Label className="text-xs">Seleziona Sensore / Dispositivo</Label>
          <Select value={newProductId} onValueChange={setNewProductId}>
            <SelectTrigger className="bg-white"><SelectValue placeholder="Scegli dal catalogo..." /></SelectTrigger>
            <SelectContent>
              {products.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="w-24">
          <Label className="text-xs">Quantità</Label>
          <Input type="number" min={1} value={newQty} onChange={(e) => setNewQty(Number(e.target.value) || 1)} className="bg-white" />
        </div>
        <Button onClick={handleAdd} disabled={saving || !newProductId}><Plus className="h-4 w-4 mr-2" /> Aggiungi</Button>
      </div>

      {allocations.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">Nessun hardware richiesto attualmente.</p>
      ) : (
        <div className="border rounded-lg divide-y">
          {allocations.map((a: any) => (
            <div key={a.id} className="flex items-center justify-between px-4 py-3 bg-white">
              <div>
                <span className="text-sm font-bold text-foreground">{a.products?.name || "—"}</span>
                <span className="text-xs text-muted-foreground ml-2">SKU: {a.products?.sku}</span>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="outline">Quantità: {a.quantity}</Badge>
                <Badge>{a.status}</Badge>
                <Button size="sm" variant="ghost" className="text-destructive hover:bg-red-50" onClick={() => handleDelete(a.id)}><Trash2 className="h-4 w-4" /></Button>
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
  const template = getElasticTemplate(project.certifications?.[0]?.cert_type || (project as any).project_type);

  const { data: milestones = [], refetch } = useQuery({
    queryKey: ["scorecard-milestones", certId],
    enabled: !!certId,
    queryFn: async () => {
      const { data } = await supabase.from("certification_milestones").select("*").eq("certification_id", certId!).eq("milestone_type", "scorecard").order("order_index");
      return data || [];
    },
  });

  const [saving, setSaving] = useState(false);

  const handleInitialize = async () => {
    if (!certId) return;
    setSaving(true);
    try {
      const rows = template.scorecard.map((s, i) => ({
        certification_id: certId, category: s.category, requirement: s.requirement, max_score: s.max_score, score: 0, milestone_type: "scorecard", order_index: i, status: "pending"
      }));
      await supabase.from("certification_milestones").insert(rows as any);
      refetch(); qc.invalidateQueries({ queryKey: ["pm-dashboard"] });
    } finally {
      setSaving(false);
    }
  };

  const handleScoreUpdate = async (milestoneId: string, score: number, maxScore: number) => {
    const val = Math.min(Math.max(0, score), maxScore);
    await supabase.from("certification_milestones").update({ score: val } as any).eq("id", milestoneId);
    refetch();
    
    // Aggiorna punteggio totale sulla certificazione (silenziosamente)
    if (certId) {
      const { data: allMs } = await supabase.from("certification_milestones").select("score").eq("certification_id", certId);
      const total = (allMs || []).reduce((s, m) => s + Number(m.score), 0);
      await supabase.from("certifications").update({ score: total } as any).eq("id", certId);
      qc.invalidateQueries({ queryKey: ["pm-dashboard"] });
    }
  };

  if (!certId) return <p className="text-sm text-muted-foreground text-center py-8">Nessuna certificazione associata.</p>;

  if (milestones.length === 0) {
    return (
      <div className="text-center py-8 space-y-4 border rounded-lg bg-slate-50">
        <p className="text-sm text-muted-foreground">La Scorecard per questo progetto non è ancora stata inizializzata.</p>
        <Button onClick={handleInitialize} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Genera Griglia Scorecard
        </Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 max-h-[400px] overflow-y-auto pr-2">
      {milestones.map((m: any) => (
        <Card key={m.id} className="bg-slate-50">
          <CardHeader className="py-2 px-4 border-b bg-white">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">{m.category} - <span className="text-muted-foreground text-xs">{m.requirement}</span></CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-4 py-3">
            <div className="flex items-center gap-4">
              <div className="flex-1 space-y-1">
                <Label className="text-[10px] text-muted-foreground uppercase">Punti Ottenuti</Label>
                <Input type="number" min={0} max={m.max_score} value={m.score || 0} onChange={(e) => handleScoreUpdate(m.id, Number(e.target.value) || 0, m.max_score)} className="h-8 text-sm font-bold bg-white" />
              </div>
              <div className="w-16 space-y-1">
                <Label className="text-[10px] text-muted-foreground uppercase">Max</Label>
                <Input type="number" value={m.max_score} disabled className="h-8 text-sm bg-slate-100 text-center" />
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col bg-slate-50/50">
        <DialogHeader className="pb-4 border-b">
          <DialogTitle className="text-xl">Configura Progetto: {project.name}</DialogTitle>
          <DialogDescription>Compila tutti i dati nei tab sottostanti per avviare il progetto.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="timeline" className="flex-1 flex flex-col mt-4">
          <TabsList className="grid grid-cols-3 w-full bg-white border">
            <TabsTrigger value="timeline" className="gap-2"><Calendar className="w-4 h-4"/> Timeline</TabsTrigger>
            <TabsTrigger value="hardware" className="gap-2"><Monitor className="w-4 h-4"/> Hardware</TabsTrigger>
            <TabsTrigger value="scorecard" className="gap-2"><Award className="w-4 h-4"/> Scorecard</TabsTrigger>
          </TabsList>

          <div className="flex-1 mt-4">
            <TabsContent value="timeline" className="m-0"><TimelineTab project={project} /></TabsContent>
            <TabsContent value="hardware" className="m-0"><HardwareTab project={project} /></TabsContent>
            <TabsContent value="scorecard" className="m-0"><ScorecardTab project={project} /></TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

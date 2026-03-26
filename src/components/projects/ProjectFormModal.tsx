import { useState, useEffect } from 'react';
import { Award, Loader2, Calendar, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

interface LEEDCertificationsDialogProps {
  siteId: string;
  siteName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface LEEDFormData {
  certType: string;
  level: string;
  status: string;
  targetScore: number;
  issuedDate: string;
  expiryDate: string;
  milestones: {
    category: string;
    score: number;
    maxScore: number;
  }[];
}

interface TimelineMilestone {
  id: string;
  category: string;
  status: string;
  start_date: string | null;
  due_date: string | null;
  completed_date: string | null;
  order_index: number;
}

const DEFAULT_LEED_MILESTONES = [
  { category: 'EA', score: 0, maxScore: 33 },
  { category: 'WE', score: 0, maxScore: 12 },
  { category: 'MR', score: 0, maxScore: 13 },
  { category: 'EQ', score: 0, maxScore: 16 },
  { category: 'SS', score: 0, maxScore: 26 },
  { category: 'IN', score: 0, maxScore: 6 },
  { category: 'RP', score: 0, maxScore: 4 },
];

const CATEGORY_LABELS: Record<string, string> = {
  EA: 'Energia e Atmosfera',
  WE: 'Efficienza Idrica',
  MR: 'Materiali e Risorse',
  EQ: 'Qualità Ambientale Interna',
  SS: 'Siti Sostenibili',
  IN: 'Innovazione',
  RP: 'Priorità Regionale',
};

export const LEEDCertificationsDialog = ({ siteId, siteName, open, onOpenChange }: LEEDCertificationsDialogProps) => {
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingTimeline, setIsGeneratingTimeline] = useState(false);
  
  const [certId, setCertId] = useState<string | null>(null);
  const [hasTimeline, setHasTimeline] = useState(false);
  const [timelineMilestones, setTimelineMilestones] = useState<TimelineMilestone[]>([]);

  const [formData, setFormData] = useState<LEEDFormData>({
    certType: 'LEED v4',
    level: 'Gold',
    status: 'in_progress',
    targetScore: 110,
    issuedDate: '',
    expiryDate: '',
    milestones: JSON.parse(JSON.stringify(DEFAULT_LEED_MILESTONES)),
  });

  useEffect(() => {
    if (!open || !supabase) return;

    const loadData = async () => {
      setIsLoading(true);
      try {
        const { data: certs } = await supabase
          .from('certifications')
          .select('*')
          .eq('site_id', siteId)
          .ilike('cert_type', '%LEED%')
          .limit(1);

        if (certs && certs.length > 0) {
          const cert = certs[0];
          setCertId(cert.id);

          // 1. Carica i crediti della Scorecard
          const { data: scorecard } = await supabase
            .from('certification_milestones')
            .select('*')
            .eq('certification_id', cert.id)
            .eq('milestone_type', 'scorecard');

          const mappedMilestones = DEFAULT_LEED_MILESTONES.map(dm => {
            const existing = scorecard?.find(m => m.category === dm.category);
            return existing
              ? { category: existing.category, score: existing.score || 0, maxScore: existing.max_score || dm.maxScore }
              : { ...dm };
          });

          // 2. Carica la Timeline Operativa
          const { data: timelineData } = await supabase
            .from('certification_milestones')
            .select('*')
            .eq('certification_id', cert.id)
            .eq('milestone_type', 'timeline')
            .order('order_index', { ascending: true });
            
          if (timelineData && timelineData.length > 0) {
            setHasTimeline(true);
            setTimelineMilestones(timelineData);
          } else {
            setHasTimeline(false);
            setTimelineMilestones([]);
          }

          setFormData({
            certType: cert.cert_type || 'LEED v4',
            level: cert.level || 'Gold',
            status: cert.status || 'in_progress',
            targetScore: cert.target_score || 110,
            issuedDate: cert.issued_date || '',
            expiryDate: cert.expiry_date || '',
            milestones: mappedMilestones,
          });
        } else {
          setCertId(null);
          setHasTimeline(false);
          setTimelineMilestones([]);
          setFormData({
            certType: 'LEED v4',
            level: 'Gold',
            status: 'in_progress',
            targetScore: 110,
            issuedDate: '',
            expiryDate: '',
            milestones: JSON.parse(JSON.stringify(DEFAULT_LEED_MILESTONES)),
          });
        }
      } catch (err) {
        console.error('Error loading LEED certification data:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [open, siteId]);

  const handleSave = async () => {
    if (!supabase) return;
    setIsSaving(true);
    try {
      let currentCertId = certId;
      const totalScore = formData.milestones.reduce((sum, m) => sum + m.score, 0);

      // 1. Salva i dati base della certificazione
      const certPayload = {
        cert_type: formData.certType,
        level: formData.level,
        score: totalScore,
        target_score: formData.targetScore,
        status: formData.status,
        issued_date: formData.issuedDate || null,
        expiry_date: formData.expiryDate || null,
      };

      if (currentCertId) {
        await supabase.from('certifications').update(certPayload).eq('id', currentCertId);
      } else {
        const { data: newCert } = await supabase.from('certifications').insert({ site_id: siteId, ...certPayload }).select('id').single();
        if (!newCert) throw new Error('Failed to create LEED certification');
        currentCertId = newCert.id;
        setCertId(currentCertId);
      }

      // 2. Aggiorna i crediti della Scorecard (cancella e reinserisce)
      await supabase.from('certification_milestones').delete().eq('certification_id', currentCertId).eq('milestone_type', 'scorecard');

      const scorecardToInsert = formData.milestones.map(m => ({
        certification_id: currentCertId,
        category: m.category,
        requirement: CATEGORY_LABELS[m.category] || m.category,
        score: m.score,
        max_score: m.maxScore,
        milestone_type: 'scorecard',
        status: m.score >= m.maxScore && m.maxScore > 0 ? 'achieved' : m.score > 0 ? 'in_progress' : 'pending',
      }));
      await supabase.from('certification_milestones').insert(scorecardToInsert);

      // 3. Aggiorna (UPSERT) la Timeline modificata dal PM
      if (timelineMilestones.length > 0) {
        const timelineUpdates = timelineMilestones.map(tm => {
          let compDate = tm.completed_date;
          if (tm.status === 'achieved' && !compDate) compDate = new Date().toISOString().split('T')[0];
          if (tm.status !== 'achieved') compDate = null;

          return {
            id: tm.id,
            certification_id: currentCertId,
            category: tm.category,
            requirement: tm.category,
            status: tm.status,
            start_date: tm.start_date || null,
            due_date: tm.due_date || null,
            completed_date: compDate,
            milestone_type: 'timeline',
            order_index: tm.order_index
          };
        });
        await supabase.from('certification_milestones').upsert(timelineUpdates);
      }

      queryClient.invalidateQueries({ queryKey: ['certifications'] });
      queryClient.invalidateQueries({ queryKey: ['leed_scorecard'] });
      queryClient.invalidateQueries({ queryKey: ['leed_timeline'] });
      
      onOpenChange(false);
    } catch (err) {
      console.error('Error saving LEED certification:', err);
      alert('Errore durante il salvataggio della certificazione LEED');
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerateTimeline = async () => {
    if (!certId || !supabase) return;
    setIsGeneratingTimeline(true);
    try {
      const { error } = await supabase.rpc('generate_standard_leed_timeline', { p_certification_id: certId });
      if (error) throw error;
      
      const { data: newTimeline } = await supabase
        .from('certification_milestones')
        .select('*')
        .eq('certification_id', certId)
        .eq('milestone_type', 'timeline')
        .order('order_index', { ascending: true });

      if (newTimeline) {
        setTimelineMilestones(newTimeline);
        setHasTimeline(true);
      }
      queryClient.invalidateQueries({ queryKey: ['leed_timeline'] });
    } catch (err) {
      console.error('Error generating timeline:', err);
      alert('Errore durante la generazione della timeline');
    } finally {
      setIsGeneratingTimeline(false);
    }
  };

  const updateScorecard = (index: number, field: 'score' | 'maxScore', value: number) => {
    setFormData(prev => {
      const milestones = [...prev.milestones];
      milestones[index] = { ...milestones[index], [field]: value };
      return { ...prev, milestones };
    });
  };

  const updateTimelineField = (index: number, field: keyof TimelineMilestone, value: string) => {
    setTimelineMilestones(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value as any };
      return updated;
    });
  };

  const addCustomMilestone = () => {
    setTimelineMilestones(prev => [
      ...prev,
      {
        id: crypto.randomUUID(), 
        category: 'Nuova Fase Custom',
        status: 'not_started',
        start_date: null,
        due_date: null,
        completed_date: null,
        order_index: prev.length + 1
      }
    ]);
  };

  const totalFromMilestones = formData.milestones.reduce((sum, m) => sum + m.score, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Award className="w-5 h-5 text-emerald-500" />
            Gestione Progetto LEED - {siteName}
          </DialogTitle>
          <DialogDescription>
            Gestisci i dati, i punteggi e la timeline di avanzamento del progetto.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto pr-2 space-y-8 my-4 custom-scrollbar">
            
            {/* General Info */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-slate-700 border-b pb-2">Informazioni Generali</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Versione</Label>
                  <Select value={formData.certType} onValueChange={v => setFormData(p => ({ ...p, certType: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LEED v4">LEED v4</SelectItem>
                      <SelectItem value="LEED v4.1">LEED v4.1</SelectItem>
                      <SelectItem value="LEED v4.1 O+M">LEED v4.1 O+M</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Livello Target</Label>
                  <Select value={formData.level} onValueChange={v => setFormData(p => ({ ...p, level: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Certified">Certified</SelectItem>
                      <SelectItem value="Silver">Silver</SelectItem>
                      <SelectItem value="Gold">Gold</SelectItem>
                      <SelectItem value="Platinum">Platinum</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Stato Globale</Label>
                  <Select value={formData.status} onValueChange={v => setFormData(p => ({ ...p, status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in_progress">In corso</SelectItem>
                      <SelectItem value="active">Attiva / Certificata</SelectItem>
                      <SelectItem value="expired">Scaduta</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Data di Certificazione (Se completata)</Label>
                  <Input type="date" value={formData.issuedDate} onChange={e => setFormData(p => ({ ...p, issuedDate: e.target.value }))} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Data Scadenza / Prossimo Audit</Label>
                <Input type="date" value={formData.expiryDate} onChange={e => setFormData(p => ({ ...p, expiryDate: e.target.value }))} />
              </div>
            </div>

            {/* SEZIONE TIMELINE DEL PROGETTO (PM EDITOR) */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <h4 className="text-sm font-semibold text-slate-700">Project Management (Timeline Fasi)</h4>
                {hasTimeline && (
                  <Button onClick={addCustomMilestone} variant="outline" size="sm" className="h-7 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                    <Plus className="w-3 h-3 mr-1" /> Aggiungi Fase
                  </Button>
                )}
              </div>
              
              {!certId ? (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-xs text-amber-700">
                    Devi <strong>salvare</strong> la certificazione per la prima volta prima di poter gestire la Timeline Operativa.
                  </p>
                </div>
              ) : !hasTimeline ? (
                <div className="p-4 bg-slate-50 rounded-lg flex flex-col gap-3 border border-slate-200">
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Nessuna timeline trovata. Genera automaticamente i 17 step standard previsti dal framework FGB per il monitoraggio LEED.
                  </p>
                  <Button onClick={handleGenerateTimeline} disabled={isGeneratingTimeline} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
                    {isGeneratingTimeline ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Calendar className="w-4 h-4 mr-2" />}
                    Genera Template Timeline Standard
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {timelineMilestones.map((tm, idx) => (
                    <div key={tm.id} className="p-4 bg-slate-900 border border-slate-700 rounded-lg shadow-sm transition-shadow flex flex-col gap-3">
                      <div className="flex flex-col">
                        <Label className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Nome Fase (Visibile al Cliente)</Label>
                        <Input 
                          className="text-sm font-semibold text-white bg-transparent border-none px-0 h-auto focus-visible:ring-0 focus-visible:border-b focus-visible:border-slate-500" 
                          value={tm.category} 
                          onChange={(e) => updateTimelineField(idx, 'category', e.target.value)} 
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label className="text-[10px] text-slate-400">Stato</Label>
                          <Select value={tm.status} onValueChange={(v) => updateTimelineField(idx, 'status', v)}>
                            <SelectTrigger className="h-8 text-xs bg-slate-800 border-slate-700 text-white">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="not_started">Non Iniziato</SelectItem>
                              <SelectItem value="pending">In Attesa / Pending</SelectItem>
                              <SelectItem value="in_progress">In Lavorazione</SelectItem>
                              <SelectItem value="achieved">Completato (Achieved)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-slate-400">Data di Inizio</Label>
                          <Input 
                            type="date" 
                            className="h-8 text-xs bg-slate-800 border-slate-700 text-white placeholder-slate-400 [color-scheme:dark]" 
                            value={tm.start_date || ''} 
                            onChange={(e) => updateTimelineField(idx, 'start_date', e.target.value)} 
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-slate-400">Data Scadenza (Target)</Label>
                          <Input 
                            type="date" 
                            className="h-8 text-xs bg-slate-800 border-slate-700 text-white placeholder-slate-400 [color-scheme:dark]" 
                            value={tm.due_date || ''} 
                            onChange={(e) => updateTimelineField(idx, 'due_date', e.target.value)} 
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* SEZIONE SCORECARD (Crediti Punteggio) */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b pb-2 mt-8">
                <h4 className="text-sm font-semibold text-slate-700">Scorecard Crediti (Valutazione LEED)</h4>
                <span className="text-sm font-bold text-emerald-600">{totalFromMilestones} / 110 pt</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {formData.milestones.map((m, i) => (
                  <div key={m.category} className="p-3 bg-slate-50 rounded-lg space-y-2 border border-slate-200">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700">
                        {m.category} — {CATEGORY_LABELS[m.category] || m.category}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[10px] uppercase text-slate-500">Punti Ottenuti</Label>
                        <Input
                          type="number"
                          min={0}
                          max={m.maxScore}
                          className="h-8 text-sm"
                          value={m.score}
                          onChange={e => updateScorecard(i, 'score', Math.min(parseInt(e.target.value) || 0, m.maxScore))}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] uppercase text-slate-500">Max Punti</Label>
                        <Input
                          type="number"
                          className="h-8 text-sm"
                          value={m.maxScore}
                          onChange={e => updateScorecard(i, 'maxScore', parseInt(e.target.value) || 0)}
                        />
                      </div>
                    </div>
                    <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden mt-1">
                      <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${m.maxScore > 0 ? (m.score / m.maxScore) * 100 : 0}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Annulla
          </Button>
          <Button onClick={handleSave} className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={isSaving || isLoading}>
            {isSaving ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvataggio...</>
            ) : 'Salva Modifiche (Timeline e Scorecard)'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

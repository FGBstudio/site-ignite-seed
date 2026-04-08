import { useEffect, useState } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useHoldings, useBrands, useSites } from "@/hooks/useProjectDetails";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
// IMPORT FIXATO: I componenti Form mancavano!
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { CalendarIcon, Plus, Trash2, Loader2, Edit3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

import { RATING_SYSTEMS, RATING_SUBTYPES, type RatingSystem } from "@/data/ratingSubtypes";
import { getCertificationTemplate } from "@/data/certificationTemplates";
import type { Product, Project, ProjectAllocation } from "@/types/custom-tables";

const REGIONS = ["Europe", "America", "APAC", "ME"] as const;
const PROJECT_STATUSES = ["Design", "Construction", "Completed", "Cancelled"] as const;
const ALLOCATION_STATUSES = ["Draft", "Allocated", "Requested", "Shipped", "Installed_Online"] as const;
const AVAILABLE_CERTS = ["LEED", "WELL", "BREEAM", "ESG", "GRESB"] as const;

const CERT_LEVELS: Record<string, string[]> = {
  LEED: ["Certified", "Silver", "Gold", "Platinum"],
  WELL: ["Bronze", "Silver", "Gold", "Platinum"],
  BREEAM: ["Pass", "Good", "Very Good", "Excellent", "Outstanding"],
  ESG: [],
  GRESB: [],
};

const formSchema = z.object({
  name: z.string().min(2, "Name required"),
  client: z.string().min(2, "Client required"),
  region: z.enum(["Europe", "America", "APAC", "ME"]),
  handover_date: z.date(),
  status: z.string(),
  pm_id: z.string().min(1, "PM required"),
  site_id: z.string().min(1, "Site required"),
  allocations: z.array(z.object({
    id: z.string().optional(),
    product_id: z.string(),
    quantity: z.number().min(1),
    status: z.string(),
  })).default([]),
  certifications: z.array(z.object({
    id: z.string().optional(), 
    cert_type: z.enum(["LEED", "WELL", "BREEAM", "ESG", "GRESB"]),
    cert_rating: z.string().optional(),
    cert_level: z.string().optional(),
    project_subtype: z.string().optional(),
  })).default([]),
});

type ProjectFormData = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: Project | null;
  existingAllocations?: ProjectAllocation[];
  onSaved: () => void;
}

export function ProjectFormModal({ open, onOpenChange, project, existingAllocations = [], onSaved }: Props) {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [pmList, setPmList] = useState<{ id: string; full_name: string }[]>([]);
  const [loadingPMs, setLoadingPMs] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);

  const [selectedHoldingId, setSelectedHoldingId] = useState<string>("");
  const [selectedBrandId, setSelectedBrandId] = useState<string>("");
  const [showNewSite, setShowNewSite] = useState(false);
  const [newSiteName, setNewSiteName] = useState("");

  const { data: holdings = [], isLoading: loadingHoldings } = useHoldings();
  const { data: brands = [], isLoading: loadingBrands } = useBrands(selectedHoldingId || undefined);
  const { data: sites = [], isLoading: loadingSites } = useSites(selectedBrandId || undefined);

  const form = useForm<ProjectFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { 
      name: "", client: "", region: "Europe", handover_date: new Date(), 
      status: "Design", pm_id: "", site_id: "", allocations: [], certifications: [] 
    },
  });

  const { fields: allocFields, append: appendAlloc, remove: removeAlloc } = useFieldArray({ control: form.control, name: "allocations" });
  const { append: appendCert, remove: removeCert } = useFieldArray({ control: form.control, name: "certifications" });

  const selectedCerts = form.watch("certifications") || [];

  useEffect(() => {
    if (!open) return;
    supabase.from("products" as any).select("*").then(({ data }) => setProducts((data || []) as any));
    
    const fetchPMs = async () => {
      if (!isAdmin) return;
      setLoadingPMs(true);
      try {
        const { data: rolesData, error: rolesError } = await supabase.from("user_roles").select("user_id").eq("role", "PM");
        if (rolesError) throw rolesError;
        if (!rolesData || rolesData.length === 0) return setPmList([]);
        const pmIds = rolesData.map(r => r.user_id);
        const { data: profilesData, error: profilesError } = await supabase.from("profiles").select("id, full_name, display_name, first_name, last_name, email").in("id", pmIds);
        if (profilesError) throw profilesError;
        setPmList((profilesData || []).map((p: any) => ({
          id: p.id, full_name: p.full_name || p.display_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email || "PM",
        })));
      } catch (err) {
        console.error("Error fetching PMs:", err);
      } finally {
        setLoadingPMs(false);
      }
    };
    fetchPMs();
  }, [open, isAdmin]);

  useEffect(() => {
    if (!open) return;
    
    const loadProjectData = async () => {
      if (project) {
        const { data: existingCerts, error: certErr } = await supabase
          .from("certifications")
          .select("*")
          .eq("site_id", project.site_id);
          
        if (certErr) console.error("Error loading certifications:", certErr);

        const mappedCerts = (existingCerts || []).map((c: any) => ({
          id: c.id, cert_type: c.cert_type, cert_rating: c.level, 
        }));

        form.reset({
          name: project.name, client: project.client, region: project.region as any,
          handover_date: new Date(project.handover_date), status: project.status,
          pm_id: project.pm_id || "", site_id: project.site_id || "",
          allocations: existingAllocations.map((a) => ({ id: a.id, product_id: a.product_id, quantity: a.quantity, status: a.status })),
          certifications: mappedCerts as any,
        });
        
        setSelectedHoldingId(""); setSelectedBrandId(""); 
      } else {
        form.reset({ 
          name: "", client: "", region: "Europe", handover_date: new Date(), 
          status: "Design", pm_id: isAdmin ? "" : user?.id || "", site_id: "", 
          allocations: [], certifications: [] 
        });
        setSelectedHoldingId(""); setSelectedBrandId(""); setShowNewSite(false); setNewSiteName("");
      }
      setDataLoaded(true);
    };

    loadProjectData();
  }, [open, project, existingAllocations, form, isAdmin, user]);

  const handleHoldingChange = (val: string) => { setSelectedHoldingId(val); setSelectedBrandId(""); form.setValue("site_id", ""); setShowNewSite(false); setNewSiteName(""); };
  const handleBrandChange = (val: string) => { setSelectedBrandId(val); form.setValue("site_id", ""); setShowNewSite(false); setNewSiteName(""); };

  const onSubmit = async (data: ProjectFormData) => {
    setSaving(true);
    try {
      const pmId = isAdmin ? data.pm_id : user?.id;
      const handoverStr = format(data.handover_date, "yyyy-MM-dd");

      let siteId = data.site_id || null;
      if (showNewSite && newSiteName.trim()) {
        if (!selectedBrandId) throw new Error("Select a Brand before creating a new Site.");
        const { data: newSite, error: siteErr } = await supabase.from("sites").insert({ name: newSiteName.trim(), brand_id: selectedBrandId } as any).select("id").single();
        if (siteErr) throw siteErr;
        siteId = newSite.id;
      }

      let projectId = project?.id;
      const legacyCertTypes = data.certifications.map(c => c.cert_type).join(", ") || null;

      const projectPayload = {
        name: data.name, client: data.client, region: data.region, handover_date: handoverStr,
        status: data.status, pm_id: pmId || null, site_id: siteId, cert_type: legacyCertTypes, 
      };

      if (project) {
        const { error } = await supabase.from("projects").update(projectPayload as any).eq("id", project.id);
        if (error) throw error;
      } else {
        const { data: newProject, error } = await supabase.from("projects").insert(projectPayload as any).select("id").single();
        if (error) throw error;
        projectId = newProject.id;
      }

      if (!projectId) throw new Error("Critical Error: Missing Project ID.");

      const originalCertIds = project ? (form.formState.defaultValues?.certifications?.map(c => c.id).filter(Boolean) as string[]) : [];
      const currentCertIds = data.certifications.map(c => c.id).filter(Boolean) as string[];
      const certsToDelete = originalCertIds?.filter(id => !currentCertIds.includes(id)) || [];

      if (certsToDelete.length > 0) {
         await supabase.from("certifications").delete().in("id", certsToDelete);
      }

      for (const certConf of data.certifications) {
        const certPayload = {
          site_id: siteId, cert_type: certConf.cert_type, level: certConf.cert_rating || null,
        };

        if (certConf.id) {
          const { error: updErr } = await supabase.from("certifications").update(certPayload as any).eq("id", certConf.id);
          if (updErr) throw updErr;
        } else {
          const { data: newCert, error: insErr } = await supabase.from("certifications").insert({ ...certPayload, status: "in_progress", score: 0 } as any).select("id").single();
          if (insErr) throw insErr;

          const templateInfo = getCertificationTemplate(certConf.cert_type, certConf.cert_rating, certConf.project_subtype);
          if (templateInfo) {
            const milestoneRows: any[] = [];
            templateInfo.timeline.forEach((t) => milestoneRows.push({ certification_id: newCert.id, category: "Timeline", requirement: t.name, milestone_type: "timeline", status: "pending" }));
            templateInfo.scorecard.forEach((s) => milestoneRows.push({ certification_id: newCert.id, category: s.category, requirement: s.requirement, milestone_type: "scorecard", max_score: s.max_score, score: 0, status: "pending" }));

            if (milestoneRows.length > 0) {
              for (let i = 0; i < milestoneRows.length; i += 50) {
                const batch = milestoneRows.slice(i, i + 50);
                await supabase.from("certification_milestones").insert(batch as any);
              }
            }
          }
        }
      }

      const existingAllocIds = existingAllocations.map((a) => a.id);
      const currentAllocIds = data.allocations.filter((a) => a.id).map((a) => a.id!);
      const allocsToDelete = existingAllocIds.filter((id) => !currentAllocIds.includes(id));
      if (allocsToDelete.length > 0) await supabase.from("project_allocations" as any).delete().in("id", allocsToDelete);

      for (const alloc of data.allocations) {
        const targetDate = format(new Date(data.handover_date.getTime() - 15 * 24 * 60 * 60 * 1000), "yyyy-MM-dd");
        if (alloc.id) {
          await supabase.from("project_allocations" as any).update({ product_id: alloc.product_id, quantity: alloc.quantity, status: alloc.status } as any).eq("id", alloc.id);
        } else {
          await supabase.from("project_allocations" as any).insert({ project_id: projectId, product_id: alloc.product_id, quantity: alloc.quantity, status: (alloc.status || "Draft") as any, target_date: targetDate });
        }
      }

      toast({ title: project ? "Project updated" : "Project created", description: "Sync completed." });
      onOpenChange(false);
      onSaved();
    } catch (err: any) {
      toast({ title: "Save Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!dataLoaded) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-slate-50/50">
        <DialogHeader>
          <DialogTitle className="text-2xl">{project ? `Review & Config: ${project.name}` : "New Project on Site"}</DialogTitle>
          <DialogDescription>
            {project ? "Select the sections below to edit details or add new certification schemas." : "Assign a new project to an existing site and define schemas."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 mt-4">
            
            <Card className="border-primary/10 shadow-sm">
              <CardHeader className="bg-white pb-4 border-b">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Edit3 className="w-5 h-5 text-primary" /> Base Project Data
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 pt-6 bg-white">
                {!project && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 p-4 bg-slate-50 rounded-lg border border-slate-100">
                    <div className="space-y-2">
                      <Label>Holding *</Label>
                      <Select value={selectedHoldingId} onValueChange={handleHoldingChange}><SelectTrigger>{loadingHoldings ? <Loader2 className="h-3 w-3 animate-spin" /> : <SelectValue placeholder="Select holding" />}</SelectTrigger><SelectContent>{holdings.map((h: any) => (<SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>))}</SelectContent></Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Brand *</Label>
                      <Select value={selectedBrandId} onValueChange={handleBrandChange} disabled={!selectedHoldingId}><SelectTrigger>{loadingBrands && selectedHoldingId ? <Loader2 className="h-3 w-3 animate-spin" /> : <SelectValue placeholder="Select brand" />}</SelectTrigger><SelectContent>{brands.map((b: any) => (<SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>))}</SelectContent></Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Site *</Label>
                      {showNewSite ? (
                        <div className="flex gap-2"><Input placeholder="New site..." value={newSiteName} onChange={(e) => setNewSiteName(e.target.value)} className="flex-1" /><Button type="button" variant="outline" size="sm" onClick={() => setShowNewSite(false)}>X</Button></div>
                      ) : (
                        <div className="flex gap-2">
                          <Controller control={form.control} name="site_id" render={({ field }) => (
                            <Select value={field.value} onValueChange={field.onChange} disabled={!selectedBrandId}><SelectTrigger className="flex-1"><SelectValue placeholder="Select site" /></SelectTrigger><SelectContent>{sites.map((s: any) => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}</SelectContent></Select>
                          )} />
                          <Button type="button" variant="outline" size="sm" onClick={() => setShowNewSite(true)} disabled={!selectedBrandId}><Plus className="h-3 w-3" /></Button>
                        </div>
                      )}
                      {form.formState.errors.site_id && <p className="text-xs text-destructive">Site required</p>}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <FormField control={form.control} name="name" render={({ field }) => (<FormItem><FormLabel>Project Name *</FormLabel><FormControl><Input placeholder="e.g. Prada Milan" {...field} /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="client" render={({ field }) => (<FormItem><FormLabel>Client *</FormLabel><FormControl><Input placeholder="e.g. Prada" {...field} /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="region" render={({ field }) => (<FormItem><FormLabel>Region</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent>{REGIONS.map((r) => (<SelectItem key={r} value={r}>{r}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>)} />
                  <FormField control={form.control} name="handover_date" render={({ field }) => (
                    <FormItem className="flex flex-col"><FormLabel>Handover Date *</FormLabel>
                      <Popover><PopoverTrigger asChild><Button variant="outline" className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{field.value ? format(field.value, "dd MMM yyyy") : "Select date"}</Button></PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus className="p-3" /></PopoverContent></Popover>
                    <FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="status" render={({ field }) => (<FormItem><FormLabel>Status</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl><SelectContent>{PROJECT_STATUSES.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>)} />
                  {isAdmin && (
                    <FormField control={form.control} name="pm_id" render={({ field }) => (
                      <FormItem><FormLabel>Assigned PM</FormLabel><Select value={field.value} onValueChange={field.onChange} disabled={loadingPMs}><FormControl><SelectTrigger>{loadingPMs ? "Loading..." : <SelectValue placeholder="Select PM" />}</SelectTrigger></FormControl><SelectContent>{pmList.map((pm) => (<SelectItem key={pm.id} value={pm.id}>{pm.full_name}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>
                    )} />
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-primary/20 shadow-md">
              <CardHeader className="bg-primary/5 pb-4 border-b border-primary/10">
                <CardTitle className="text-lg text-primary flex items-center justify-between">
                  <span>🏆 Certification Schemas (Scope of Work)</span>
                </CardTitle>
                <DialogDescription>Select or edit schemas for this project. Each will generate its own Gantt.</DialogDescription>
              </CardHeader>
              <CardContent className="space-y-6 pt-6 bg-white">
                <div className="p-4 bg-slate-50 border rounded-lg">
                  <h4 className="text-sm font-semibold mb-3 text-slate-700">Toggle Schemas:</h4>
                  <div className="flex flex-wrap gap-3">
                    {AVAILABLE_CERTS.map((type) => {
                      const isSelected = selectedCerts.some(c => c.cert_type === type);
                      return (
                        <div key={type} className={cn("flex items-center space-x-2 border rounded-full px-4 py-2 transition-colors", isSelected ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground hover:bg-muted")}>
                          <Checkbox id={`cert-${type}`} checked={isSelected} className={cn(isSelected && "border-white data-[state=checked]:bg-white data-[state=checked]:text-primary")}
                            onCheckedChange={(checked) => {
                              if (checked) appendCert({ cert_type: type });
                              else {
                                const index = selectedCerts.findIndex(c => c.cert_type === type);
                                if(index !== -1) removeCert(index);
                              }
                            }}
                          />
                          <Label htmlFor={`cert-${type}`} className="cursor-pointer font-medium">{type}</Label>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {selectedCerts.length > 0 && (
                  <div className="space-y-5">
                    {selectedCerts.map((cert, index) => {
                      const certType = cert.cert_type;
                      const watchedRating = form.watch(`certifications.${index}.cert_rating`);
                      
                      const availableLevels = CERT_LEVELS[certType] || [];
                      const availableSubtypes = watchedRating && RATING_SUBTYPES[watchedRating as RatingSystem] ? RATING_SUBTYPES[watchedRating as RatingSystem] : [];

                      return (
                        <div key={index} className="p-5 border-2 border-slate-100 rounded-xl bg-white shadow-sm relative group hover:border-primary/30 transition-colors">
                          {cert.id && (
                            <div className="absolute top-0 right-0 bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-1 rounded-bl-lg rounded-tr-xl">
                              ACTIVE IN DATABASE
                            </div>
                          )}
                          <h5 className="font-bold text-lg text-slate-800 mb-4 border-b pb-2">{certType} Configuration</h5>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <FormField control={form.control} name={`certifications.${index}.cert_rating`} render={({ field: f }) => (
                              <FormItem><FormLabel>Rating System</FormLabel><Select onValueChange={(v) => { f.onChange(v); form.setValue(`certifications.${index}.project_subtype`, undefined); }} value={f.value || ""}><FormControl><SelectTrigger><SelectValue placeholder="Select Rating" /></SelectTrigger></FormControl><SelectContent>{RATING_SYSTEMS.map((v) => (<SelectItem key={v} value={v}>{v}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>
                            )} />
                            <FormField control={form.control} name={`certifications.${index}.cert_level`} render={({ field: f }) => (
                              <FormItem><FormLabel>Target Level (Medal)</FormLabel><Select onValueChange={f.onChange} value={f.value || ""} disabled={availableLevels.length === 0}><FormControl><SelectTrigger><SelectValue placeholder={availableLevels.length === 0 ? "N/A" : "Select level"} /></SelectTrigger></FormControl><SelectContent>{availableLevels.map((v) => (<SelectItem key={v} value={v}>{v}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>
                            )} />
                            <FormField control={form.control} name={`certifications.${index}.project_subtype`} render={({ field: f }) => (
                              <FormItem><FormLabel>Subtype</FormLabel><Select onValueChange={f.onChange} value={f.value || ""} disabled={availableSubtypes.length === 0}><FormControl><SelectTrigger><SelectValue placeholder={availableSubtypes.length === 0 ? "N/A" : "Select subtype"} /></SelectTrigger></FormControl><SelectContent>{availableSubtypes.map((v) => (<SelectItem key={v} value={v}>{v}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>
                            )} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="bg-white pb-3 border-b">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg text-slate-800">📦 Hardware Allocations</CardTitle>
                  <Button type="button" variant="outline" size="sm" onClick={() => appendAlloc({ product_id: "", quantity: 1, status: "Draft" })} className="gap-1"><Plus className="h-4 w-4" /> Add Item</Button>
                </div>
              </CardHeader>
              <CardContent className="pt-4 bg-slate-50">
                {allocFields.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6 italic">No hardware assigned.</p> : (
                  <div className="space-y-3">
                    {allocFields.map((field, index) => (
                      <div key={field.id} className="flex items-end gap-3 rounded-lg border bg-white p-4 shadow-sm">
                        <div className="flex-1 space-y-1">
                          <Label className="text-xs text-muted-foreground">Product</Label>
                          <Controller control={form.control} name={`allocations.${index}.product_id`} render={({ field: f }) => (
                            <Select value={f.value} onValueChange={f.onChange}><SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger><SelectContent>{Object.entries(products.reduce((acc, p) => { const cert = p.certification; if (!acc[cert]) acc[cert] = []; acc[cert].push(p); return acc; }, {} as Record<string, Product[]>)).map(([cert, prods]) => (<div key={cert}><div className="px-2 py-1.5 text-xs font-semibold text-slate-400 bg-slate-50">{cert}</div>{prods.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name} — Stock: {p.quantity_in_stock}</SelectItem>))}</div>))}</SelectContent></Select>
                          )} />
                        </div>
                        <div className="w-24 space-y-1"><Label className="text-xs text-muted-foreground">Qty</Label><Input type="number" min="1" {...form.register(`allocations.${index}.quantity`, { valueAsNumber: true })} /></div>
                        {isAdmin && (
                          <div className="w-40 space-y-1">
                            <Label className="text-xs text-muted-foreground">Status</Label>
                            <Controller control={form.control} name={`allocations.${index}.status`} render={({ field: f }) => (
                              <Select value={f.value} onValueChange={f.onChange}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ALLOCATION_STATUSES.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}</SelectContent></Select>
                            )} />
                          </div>
                        )}
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeAlloc(index)} className="text-destructive hover:bg-destructive/10"><Trash2 className="h-5 w-5" /></Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <DialogFooter className="sticky bottom-0 bg-white/90 backdrop-blur-sm p-4 border-t mt-8 z-10 rounded-b-lg">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={saving} className="px-8 font-semibold">
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {project ? "Save All Changes" : "Create Project"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

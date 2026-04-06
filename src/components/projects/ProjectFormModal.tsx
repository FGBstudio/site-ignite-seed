import { useEffect, useState } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useHoldings, useBrands, useSites } from "@/hooks/useProjectDetails";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Plus, Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import type { Product, Project, ProjectAllocation } from "@/types/custom-tables";

// IMPORT CRITICO: Il motore che legge i template esatti (Gantt + Scorecard)
import { getCertificationTemplate } from "@/data/certificationTemplates";

const REGIONS = ["Europe", "America", "APAC", "ME"] as const;
const PROJECT_STATUSES = ["Design", "Construction", "Completed", "Cancelled"] as const;
const ALLOCATION_STATUSES = ["Draft", "Allocated", "Requested", "Shipped", "Installed_Online"] as const;

const PROJECT_TYPES = ["LEED", "WELL", "BREEAM", "Monitoring", "Consulting"] as const; // Aggiunto BREEAM

interface AllocationLine {
  id?: string;
  product_id: string;
  quantity: number;
  status: string;
}

interface ProjectFormData {
  name: string;
  client: string;
  region: string;
  handover_date: Date;
  status: string;
  pm_id: string;
  site_id: string;
  project_type: string;
  allocations: AllocationLine[];
}

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

  // Cascading state
  const [selectedHoldingId, setSelectedHoldingId] = useState<string>("");
  const [selectedBrandId, setSelectedBrandId] = useState<string>("");
  const [showNewSite, setShowNewSite] = useState(false);
  const [newSiteName, setNewSiteName] = useState("");

  // Cascading queries
  const { data: holdings = [], isLoading: loadingHoldings } = useHoldings();
  const { data: brands = [], isLoading: loadingBrands } = useBrands(selectedHoldingId || undefined);
  const { data: sites = [], isLoading: loadingSites } = useSites(selectedBrandId || undefined);

  const { register, control, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<ProjectFormData>({
    defaultValues: {
      name: "", client: "", region: "Europe", handover_date: new Date(),
      status: "Design", pm_id: "", site_id: "", project_type: "", allocations: [],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "allocations" });

  useEffect(() => {
    if (!open) return;
    
    // Fetch products
    supabase.from("products" as any).select("*").then(({ data }) => setProducts((data || []) as any));
    
    // Client-Side Join per recuperare i PM senza far fallire le API
    const fetchPMs = async () => {
      if (!isAdmin) return;
      setLoadingPMs(true);
      try {
        // Step 1: Prendi solo gli ID dalla tabella user_roles
        const { data: rolesData, error: rolesError } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "PM");

        if (rolesError) throw rolesError;
        
        if (!rolesData || rolesData.length === 0) {
          setPmList([]);
          return;
        }

        const pmIds = rolesData.map(r => r.user_id);

        // Step 2: Usa gli ID per estrarre i nomi dalla tabella profiles
        const { data: profilesData, error: profilesError } = await supabase
          .from("profiles")
          .select("id, full_name, display_name, first_name, last_name, email")
          .in("id", pmIds);

        if (profilesError) throw profilesError;

        setPmList((profilesData || []).map((p: any) => ({
          id: p.id,
          full_name: p.full_name || p.display_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email || "PM",
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
    if (project) {
      reset({
        name: project.name, client: project.client, region: project.region,
        handover_date: new Date(project.handover_date), status: project.status,
        pm_id: project.pm_id || "", site_id: project.site_id || "",
        project_type: (project as any).project_type || (project as any).cert_type || "", // Aggiunto fallback per cert_type
        allocations: existingAllocations.map((a) => ({
          id: a.id, product_id: a.product_id, quantity: a.quantity, status: a.status,
        })),
      });
      // TODO: could reverse-lookup holding/brand from site for edit mode
    } else {
      reset({
        name: "", client: "", region: "Europe", handover_date: new Date(),
        status: "Design", pm_id: isAdmin ? "" : user?.id || "",
        site_id: "", project_type: "", allocations: [],
      });
      setSelectedHoldingId("");
      setSelectedBrandId("");
      setShowNewSite(false);
      setNewSiteName("");
    }
  }, [open, project, existingAllocations, reset, isAdmin, user]);

  // Reset brand when holding changes
  const handleHoldingChange = (val: string) => {
    setSelectedHoldingId(val);
    setSelectedBrandId("");
    setValue("site_id", "");
    setShowNewSite(false);
    setNewSiteName("");
  };

  // Reset site when brand changes
  const handleBrandChange = (val: string) => {
    setSelectedBrandId(val);
    setValue("site_id", "");
    setShowNewSite(false);
    setNewSiteName("");
  };

  const onSubmit = async (data: ProjectFormData) => {
    setSaving(true);
    try {
      const pmId = isAdmin ? data.pm_id : user?.id;
      const handoverStr = format(data.handover_date, "yyyy-MM-dd");

      // Create site if needed
      let siteId = data.site_id || null;
      if (showNewSite && newSiteName.trim()) {
        if (!selectedBrandId) {
          throw new Error("Seleziona un Brand prima di creare un nuovo Sito.");
        }
        const { data: newSite, error: siteErr } = await supabase
          .from("sites")
          .insert({ name: newSiteName.trim(), brand_id: selectedBrandId } as any)
          .select("id")
          .single();
        if (siteErr) throw siteErr;
        siteId = newSite.id;
      }

      let projectId = project?.id;

      // Nota: Nel modal classico non chiediamo rating e subtype, quindi li settiamo a null di default.
      // Se si tratta di un progetto LEED/WELL, utilizzerà il template "generico" o base.
      const projectPayload = {
        name: data.name, client: data.client,
        region: data.region as any, handover_date: handoverStr,
        status: data.status as any, pm_id: pmId || null,
        site_id: siteId,
        cert_type: data.project_type || null, // Uniformato a cert_type
      };

      if (project) {
        const { error } = await supabase.from("projects").update(projectPayload as any).eq("id", project.id);
        if (error) throw error;
      } else {
        const { data: newProject, error } = await supabase
          .from("projects").insert(projectPayload as any).select("id").single();
        if (error) throw error;
        projectId = newProject.id;

        // CREAZIONE CERTIFICAZIONE E MILESTONE ESPLICITA (Nuovo Motore Frontend)
        if (data.project_type === "LEED" || data.project_type === "WELL" || data.project_type === "BREEAM") {
          
          // 1. Crea la Certificazione
          const { data: cert, error: certErr } = await supabase
            .from("certifications")
            .insert({
              site_id: siteId,
              project_id: projectId,
              cert_type: data.project_type as any,
              score: 0,
              target_score: data.project_type === "LEED" ? 110 : 100,
              status: "in_progress",
            })
            .select("id")
            .single();
            
          if (certErr) throw certErr;

          // 2. Estrai il template (qui non abbiamo rating, quindi usa il fallback del template)
          const templateInfo = getCertificationTemplate(data.project_type, null, null);

          if (templateInfo) {
            const milestoneRows: any[] = [];

            // Timeline
            templateInfo.timeline.forEach((t) => {
              milestoneRows.push({
                certification_id: cert.id,
                category: "Timeline",
                requirement: t.name,
                milestone_type: "timeline",
                status: "pending",
              });
            });

            // Scorecard
            templateInfo.scorecard.forEach((s) => {
              milestoneRows.push({
                certification_id: cert.id,
                category: s.category,
                requirement: s.requirement,
                milestone_type: "scorecard",
                max_score: s.max_score,
                score: 0,
                status: "pending",
              });
            });

            if (milestoneRows.length > 0) {
              for (let i = 0; i < milestoneRows.length; i += 50) {
                const batch = milestoneRows.slice(i, i + 50);
                const { error: mErr } = await supabase.from("certification_milestones").insert(batch as any);
                if (mErr) console.error("Errore inserimento milestone:", mErr);
              }
            }
          }
        }
      }

      if (!projectId) throw new Error("Missing project ID");

      // Handle allocations
      const existingIds = existingAllocations.map((a) => a.id);
      const currentIds = data.allocations.filter((a) => a.id).map((a) => a.id!);
      const toDelete = existingIds.filter((id) => !currentIds.includes(id));

      if (toDelete.length > 0) {
        await supabase.from("project_allocations" as any).delete().in("id", toDelete);
      }

      for (const alloc of data.allocations) {
        const targetDate = format(
          new Date(data.handover_date.getTime() - 15 * 24 * 60 * 60 * 1000),
          "yyyy-MM-dd"
        );
        if (alloc.id) {
          await supabase.from("project_allocations" as any)
            .update({ product_id: alloc.product_id, quantity: alloc.quantity, status: alloc.status } as any)
            .eq("id", alloc.id);
        } else {
          await supabase.from("project_allocations" as any).insert({
            project_id: projectId, product_id: alloc.product_id,
            quantity: alloc.quantity, status: (alloc.status || "Draft") as any, target_date: targetDate,
          });
        }
      }

      toast({ title: project ? "Project updated" : "Project created" });
      onOpenChange(false);
      onSaved();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{project ? "Edit Project" : "New Project"}</DialogTitle>
          <DialogDescription className="hidden">Project creation and edit form</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Section A: Localizzazione (Gerarchia) */}
          <div className="space-y-4">
            <h3 className="font-semibold text-foreground border-b pb-2">Location</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Holding */}
              <div className="space-y-2">
                <Label>Holding *</Label>
                <Select value={selectedHoldingId} onValueChange={handleHoldingChange}>
                  <SelectTrigger>
                    {loadingHoldings ? (
                      <span className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Caricamento...</span>
                    ) : (
                      <SelectValue placeholder="Seleziona holding" />
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    {holdings.map((h: any) => (
                      <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Brand */}
              <div className="space-y-2">
                <Label>Brand *</Label>
                <Select
                  value={selectedBrandId}
                  onValueChange={handleBrandChange}
                  disabled={!selectedHoldingId}
                >
                  <SelectTrigger>
                    {loadingBrands && selectedHoldingId ? (
                      <span className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Caricamento...</span>
                    ) : (
                      <SelectValue placeholder={selectedHoldingId ? "Seleziona brand" : "Prima seleziona holding"} />
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    {brands.map((b: any) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Site */}
              <div className="space-y-2">
                <Label>Sito *</Label>
                {showNewSite ? (
                  <div className="flex gap-2">
                    <Input
                      placeholder="Nome nuovo sito..."
                      value={newSiteName}
                      onChange={(e) => setNewSiteName(e.target.value)}
                      className="flex-1"
                    />
                    <Button type="button" variant="outline" size="sm" onClick={() => setShowNewSite(false)}>
                      Annulla
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Select
                      value={watch("site_id")}
                      onValueChange={(val) => setValue("site_id", val)}
                      disabled={!selectedBrandId}
                    >
                      <SelectTrigger className="flex-1">
                        {loadingSites && selectedBrandId ? (
                          <span className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Caricamento...</span>
                        ) : (
                          <SelectValue placeholder={selectedBrandId ? "Seleziona sito" : "Prima seleziona brand"} />
                        )}
                      </SelectTrigger>
                      <SelectContent>
                        {sites.map((s: any) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}{s.city ? ` — ${s.city}` : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowNewSite(true)}
                      disabled={!selectedBrandId}
                      className="gap-1 shrink-0"
                    >
                      <Plus className="h-3 w-3" /> Nuovo
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section B: Dettagli Progetto */}
          <div className="space-y-4">
            <h3 className="font-semibold text-foreground border-b pb-2">Project Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Project Name *</Label>
                <Input {...register("name", { required: true })} placeholder="e.g. Prada Milan" />
                {errors.name && <p className="text-xs text-destructive">Required field</p>}
              </div>
              <div className="space-y-2">
                <Label>Client *</Label>
                <Input {...register("client", { required: true })} placeholder="e.g. Prada" />
                {errors.client && <p className="text-xs text-destructive">Required field</p>}
              </div>

              {/* Project Type */}
              <div className="space-y-2">
                <Label>Project Type</Label>
                <Controller
                  control={control}
                  name="project_type"
                  render={({ field }) => (
                    <Select value={field.value || ""} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                      <SelectContent>
                        {PROJECT_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="space-y-2">
                <Label>Region</Label>
                <Controller control={control} name="region" render={({ field }) => (
                  <Select value={field.value || ""} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {REGIONS.map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-2">
                <Label>Handover Date *</Label>
                <Controller control={control} name="handover_date" rules={{ required: true }} render={({ field }) => (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {field.value ? format(field.value, "dd MMM yyyy") : "Select date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                )} />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Controller control={control} name="status" render={({ field }) => (
                  <Select value={field.value || ""} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PROJECT_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )} />
              </div>
              {isAdmin && (
                <div className="space-y-2">
                  <Label>Assign PM</Label>
                  <Controller control={control} name="pm_id" render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange} disabled={loadingPMs}>
                      <SelectTrigger>
                        {loadingPMs ? (
                          <span className="flex items-center gap-2 text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" /> Loading...
                          </span>
                        ) : (
                          <SelectValue placeholder="Select PM" />
                        )}
                      </SelectTrigger>
                      <SelectContent>
                        {pmList.length === 0 && !loadingPMs ? (
                           <SelectItem value="empty" disabled>No PM found</SelectItem>
                        ) : (
                          pmList.map((pm) => (
                            <SelectItem key={pm.id} value={pm.id}>{pm.full_name}</SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  )} />
                </div>
              )}
            </div>
          </div>

          {/* Section 3: Allocations */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-semibold text-foreground">Items (Hardware Allocations)</h3>
              <Button type="button" variant="outline" size="sm" onClick={() => append({ product_id: "", quantity: 1, status: "Draft" })} className="gap-1">
                <Plus className="h-4 w-4" /> Add Item
              </Button>
            </div>

            {fields.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No items added.</p>
            ) : (
              <div className="space-y-3">
                {fields.map((field, index) => (
                  <div key={field.id} className="flex items-end gap-3 rounded-lg border p-3">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs text-muted-foreground">Product</Label>
                      <Controller control={control} name={`allocations.${index}.product_id`} rules={{ required: true }} render={({ field: f }) => (
                        <Select value={f.value} onValueChange={f.onChange}>
                          <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(
                              products.reduce((acc, p) => {
                                const cert = p.certification;
                                if (!acc[cert]) acc[cert] = [];
                                acc[cert].push(p);
                                return acc;
                              }, {} as Record<string, Product[]>)
                            ).map(([cert, prods]) => (
                              <div key={cert}>
                                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{cert}</div>
                                {prods.map((p) => (
                                  <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku}) — Stock: {p.quantity_in_stock}</SelectItem>
                                ))}
                              </div>
                            ))}
                          </SelectContent>
                        </Select>
                      )} />
                    </div>
                    <div className="w-24 space-y-1">
                      <Label className="text-xs text-muted-foreground">Qtà</Label>
                      <Input type="number" min="1" {...register(`allocations.${index}.quantity`, { required: true, valueAsNumber: true, min: 1 })} />
                    </div>
                    {isAdmin && (
                      <div className="w-36 space-y-1">
                        <Label className="text-xs text-muted-foreground">Stato</Label>
                        <Controller control={control} name={`allocations.${index}.status`} render={({ field: f }) => (
                          <Select value={f.value} onValueChange={f.onChange}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {ALLOCATION_STATUSES.map((s) => (
                                <SelectItem key={s} value={s}>{s}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )} />
                      </div>
                    )}
                    <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} className="text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {project ? "Save Changes" : "Create Project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

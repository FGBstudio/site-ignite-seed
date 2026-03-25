import { useEffect, useState } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useHoldings, useBrands, useSites } from "@/hooks/useProjectDetails";
import { LEED_TEMPLATE } from "@/data/leedTemplate";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
import type { Tables } from "@/integrations/supabase/types";
import { Constants } from "@/integrations/supabase/types";

type Project = Tables<"projects">;
type Product = Tables<"products">;
type Allocation = Tables<"project_allocations">;

const PROJECT_TYPES = ["LEED", "WELL", "Monitoring", "Consulting"] as const;

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
  existingAllocations?: Allocation[];
  onSaved: () => void;
}

export function ProjectFormModal({ open, onOpenChange, project, existingAllocations = [], onSaved }: Props) {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [pmList, setPmList] = useState<{ id: string; full_name: string }[]>([]);
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
    supabase.from("products").select("*").then(({ data }) => setProducts(data || []));
    if (isAdmin) {
      supabase.from("profiles").select("id, full_name").then(({ data }) => setPmList(data || []));
    }
  }, [open, isAdmin]);

  useEffect(() => {
    if (!open) return;
    if (project) {
      reset({
        name: project.name, client: project.client, region: project.region,
        handover_date: new Date(project.handover_date), status: project.status,
        pm_id: project.pm_id || "", site_id: project.site_id || "",
        project_type: project.project_type || "",
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

      const projectPayload = {
        name: data.name, client: data.client,
        region: data.region as any, handover_date: handoverStr,
        status: data.status as any, pm_id: pmId || null,
        site_id: siteId,
        project_type: data.project_type || null,
      };

      if (project) {
        const { error } = await supabase.from("projects").update(projectPayload as any).eq("id", project.id);
        if (error) throw error;
      } else {
        const { data: newProject, error } = await supabase
          .from("projects").insert(projectPayload as any).select("id").single();
        if (error) throw error;
        projectId = newProject.id;

        // TRIGGER: Auto-generate certification + milestones for LEED/WELL
        if (data.project_type === "LEED" || data.project_type === "WELL") {
          const { data: cert, error: certErr } = await supabase
            .from("certifications")
            .insert({
              site_id: siteId,
              project_id: projectId,
              cert_type: data.project_type as any,
              score: 0,
              target_score: data.project_type === "LEED" ? 110 : 100,
            })
            .select("id")
            .single();
          if (certErr) throw certErr;

          const template = data.project_type === "LEED" ? LEED_TEMPLATE : LEED_TEMPLATE; // TODO: WELL template
          const milestoneRows = template.map((t) => ({
            certification_id: cert.id,
            category: t.category,
            requirement: t.requirement,
            score: 0,
            max_score: t.max_score,
            status: "pending" as const,
          }));

          for (let i = 0; i < milestoneRows.length; i += 50) {
            const batch = milestoneRows.slice(i, i + 50);
            const { error: mErr } = await supabase.from("certification_milestones").insert(batch as any);
            if (mErr) throw mErr;
          }
        }
      }

      if (!projectId) throw new Error("Missing project ID");

      // Handle allocations
      const existingIds = existingAllocations.map((a) => a.id);
      const currentIds = data.allocations.filter((a) => a.id).map((a) => a.id!);
      const toDelete = existingIds.filter((id) => !currentIds.includes(id));

      if (toDelete.length > 0) {
        await supabase.from("project_allocations").delete().in("id", toDelete);
      }

      for (const alloc of data.allocations) {
        const targetDate = format(
          new Date(data.handover_date.getTime() - 15 * 24 * 60 * 60 * 1000),
          "yyyy-MM-dd"
        );
        if (alloc.id) {
          await supabase.from("project_allocations")
            .update({ product_id: alloc.product_id, quantity: alloc.quantity, status: alloc.status as any })
            .eq("id", alloc.id);
        } else {
          await supabase.from("project_allocations").insert({
            project_id: projectId, product_id: alloc.product_id,
            quantity: alloc.quantity, status: (alloc.status || "Draft") as any, target_date: targetDate,
          });
        }
      }

      toast({ title: project ? "Progetto aggiornato" : "Progetto creato" });
      onOpenChange(false);
      onSaved();
    } catch (err: any) {
      toast({ title: "Errore", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{project ? "Modifica Progetto" : "Nuovo Progetto"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Section A: Localizzazione (Gerarchia) */}
          <div className="space-y-4">
            <h3 className="font-semibold text-foreground border-b pb-2">Localizzazione</h3>
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
            <h3 className="font-semibold text-foreground border-b pb-2">Dettagli Progetto</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome Progetto *</Label>
                <Input {...register("name", { required: true })} placeholder="es. Prada Milano" />
                {errors.name && <p className="text-xs text-destructive">Campo obbligatorio</p>}
              </div>
              <div className="space-y-2">
                <Label>Cliente *</Label>
                <Input {...register("client", { required: true })} placeholder="es. Prada" />
                {errors.client && <p className="text-xs text-destructive">Campo obbligatorio</p>}
              </div>

              {/* Project Type */}
              <div className="space-y-2">
                <Label>Tipo Progetto</Label>
                <Controller
                  control={control}
                  name="project_type"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue placeholder="Seleziona tipo" /></SelectTrigger>
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
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Constants.public.Enums.region.map((r) => (
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
                        {field.value ? format(field.value, "dd MMM yyyy", { locale: it }) : "Seleziona data"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                )} />
              </div>
              <div className="space-y-2">
                <Label>Stato</Label>
                <Controller control={control} name="status" render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Constants.public.Enums.project_status.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )} />
              </div>
              {isAdmin && (
                <div className="space-y-2">
                  <Label>Assegna PM</Label>
                  <Controller control={control} name="pm_id" render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue placeholder="Seleziona PM" /></SelectTrigger>
                      <SelectContent>
                        {pmList.map((pm) => (
                          <SelectItem key={pm.id} value={pm.id}>{pm.full_name}</SelectItem>
                        ))}
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
              <h3 className="font-semibold text-foreground">Articoli (Allocazioni Hardware)</h3>
              <Button type="button" variant="outline" size="sm" onClick={() => append({ product_id: "", quantity: 1, status: "Draft" })} className="gap-1">
                <Plus className="h-4 w-4" /> Aggiungi Articolo
              </Button>
            </div>

            {fields.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nessun articolo aggiunto.</p>
            ) : (
              <div className="space-y-3">
                {fields.map((field, index) => (
                  <div key={field.id} className="flex items-end gap-3 rounded-lg border p-3">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs text-muted-foreground">Prodotto</Label>
                      <Controller control={control} name={`allocations.${index}.product_id`} rules={{ required: true }} render={({ field: f }) => (
                        <Select value={f.value} onValueChange={f.onChange}>
                          <SelectTrigger><SelectValue placeholder="Seleziona prodotto" /></SelectTrigger>
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
                              {Constants.public.Enums.allocation_status.map((s) => (
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
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {project ? "Salva Modifiche" : "Crea Progetto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrands } from "@/hooks/useBrands";
import { useProjectManagers } from "@/hooks/useProjectManagers";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { LEED_TEMPLATE } from "@/data/leedTemplate";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, Plus, Trash2, CalendarIcon } from "lucide-react";
import { RATING_SYSTEMS, RATING_SUBTYPES, type RatingSystem } from "@/data/ratingSubtypes";
import { cn } from "@/lib/utils";
import { format, subDays } from "date-fns";
import { it } from "date-fns/locale";

const formSchema = z
  .object({
    brand_id: z.string().uuid("Seleziona un brand"),
    site_name: z.string().min(2, "Il nome è obbligatorio"),
    address: z.string().optional(),
    city: z.string().min(2, "La città è obbligatoria"),
    country: z.string().min(2, "Il paese è obbligatorio"),
    region: z.enum(["Europe", "America", "APAC", "ME"]),
    lat: z.coerce.number().optional(),
    lng: z.coerce.number().optional(),
    area_m2: z.coerce.number().optional(),
    timezone: z.string().default("UTC"),
    module_energy_enabled: z.boolean().default(false),
    module_air_enabled: z.boolean().default(false),
    module_water_enabled: z.boolean().default(false),
    
    // Project fields
    create_project: z.boolean().default(false),
    project_name: z.string().optional(),
    client: z.string().optional(),
    handover_date: z.date().optional(),
    status: z.enum(["Design", "Construction", "Completed", "Cancelled"]).default("Design"),
    pm_id: z.string().optional(),
    cert_type: z.enum(["LEED", "WELL", "BREEAM", "CO2"]).optional(),
    cert_rating: z.string().optional(),
    project_subtype: z.string().optional(),
    is_commissioning: z.boolean().default(false),

    // Allocations
    allocations: z.array(z.object({
      id: z.string().optional(),
      product_id: z.string().min(1, "Seleziona un prodotto"),
      quantity: z.coerce.number().min(1),
      status: z.string().default("Draft")
    })).default([]),
  })
  .superRefine((data, ctx) => {
    if (data.create_project) {
      if (!data.project_name || data.project_name.trim() === "") {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Nome progetto richiesto", path: ["project_name"] });
      }
      if (!data.client || data.client.trim() === "") {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Cliente richiesto", path: ["client"] });
      }
      if (!data.handover_date) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Data di handover richiesta", path: ["handover_date"] });
      }
      if (!data.pm_id) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "PM richiesto", path: ["pm_id"] });
      }
    }
  });

type FormValues = z.infer<typeof formSchema>;

const ALLOCATION_STATUSES = ["Draft", "Allocated", "Requested", "Shipped", "Installed_Online"] as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: any | null;
  existingSite?: any | null;
  existingAllocations?: any[];
  onSaved?: () => void;
}

export function SiteProjectOnboardingForm({ 
  open, 
  onOpenChange, 
  project, 
  existingSite, 
  existingAllocations = [], 
  onSaved 
}: Props) {
  const queryClient = useQueryClient();
  const { isAdmin, user } = useAuth();
  const { data: brands = [], isLoading: brandsLoading } = useBrands();
  const { data: pms = [], isLoading: pmsLoading } = useProjectManagers();
  const [products, setProducts] = useState<any[]>([]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      region: "Europe",
      timezone: "UTC",
      module_energy_enabled: false,
      module_air_enabled: false,
      module_water_enabled: false,
      create_project: false,
      status: "Design",
      is_commissioning: false,
      allocations: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "allocations",
  });

  const createProject = form.watch("create_project");
  const watchedCertRating = form.watch("cert_rating");
  const isSubmitting = form.formState.isSubmitting;

  useEffect(() => {
    if (open) {
      supabase.from("products").select("*").then(({ data }) => setProducts(data || []));
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    if (project || existingSite) {
      form.reset({
        brand_id: existingSite?.brand_id || "",
        site_name: existingSite?.name || "",
        address: existingSite?.address || "",
        city: existingSite?.city || "",
        country: existingSite?.country || "",
        region: existingSite?.region || "Europe",
        lat: existingSite?.lat || undefined,
        lng: existingSite?.lng || undefined,
        area_m2: existingSite?.area_m2 || undefined,
        timezone: existingSite?.timezone || "UTC",
        module_energy_enabled: existingSite?.module_energy_enabled || false,
        module_air_enabled: existingSite?.module_air_enabled || false,
        module_water_enabled: existingSite?.module_water_enabled || false,
        
        create_project: !!project,
        project_name: project?.name || "",
        client: project?.client || "",
        handover_date: project?.handover_date ? new Date(project.handover_date) : undefined,
        status: project?.status || "Design",
        pm_id: project?.pm_id || (isAdmin ? "" : user?.id || ""),
        cert_type: project?.cert_type || undefined,
        cert_rating: project?.cert_rating || undefined,
        project_subtype: project?.project_subtype || undefined,
        is_commissioning: project?.is_commissioning || false,
        
        allocations: existingAllocations.map(a => ({
          id: a.id,
          product_id: a.product_id,
          quantity: a.quantity,
          status: a.status
        }))
      });
    } else {
      form.reset({
        region: "Europe", timezone: "UTC", status: "Design", create_project: false, allocations: [],
        pm_id: isAdmin ? "" : user?.id || ""
      });
    }
  }, [open, project, existingSite, existingAllocations, form, isAdmin, user]);

  const availableSubtypes = watchedCertRating && RATING_SUBTYPES[watchedCertRating as RatingSystem]
    ? RATING_SUBTYPES[watchedCertRating as RatingSystem] : [];

  const handleRatingChange = (value: string, fieldOnChange: (v: string) => void) => {
    fieldOnChange(value);
    form.setValue("project_subtype", undefined);
  };

  const onSubmit = async (values: FormValues) => {
    try {
      // 1. GESTIONE SITO
      let siteId = existingSite?.id;
      const sitePayload = {
        brand_id: values.brand_id,
        name: values.site_name,
        address: values.address || null,
        city: values.city,
        country: values.country,
        region: values.region,
        lat: values.lat || null,
        lng: values.lng || null,
        area_m2: values.area_m2 || null,
        timezone: values.timezone,
        module_energy_enabled: values.module_energy_enabled,
        module_air_enabled: values.module_air_enabled,
        module_water_enabled: values.module_water_enabled,
      };

      if (siteId) {
        const { error } = await supabase.from("sites").update(sitePayload as any).eq("id", siteId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("sites").insert(sitePayload as any).select("id").single();
        if (error) throw error;
        siteId = data.id;
      }

      // 2. GESTIONE PROGETTO
      if (values.create_project && siteId) {
        let projectId = project?.id;
        const projectPayload = {
          name: values.project_name!,
          site_id: siteId,
          pm_id: values.pm_id!,
          client: values.client || "",
          region: values.region,
          status: values.status,
          handover_date: format(values.handover_date!, "yyyy-MM-dd"),
          cert_type: values.cert_type || null,
          cert_rating: values.cert_rating || null,
          project_subtype: values.project_subtype || null,
          is_commissioning: values.is_commissioning,
        };

        if (projectId) {
          const { error } = await supabase.from("projects").update(projectPayload as any).eq("id", projectId);
          if (error) throw error;
        } else {
          const { data: newProject, error } = await supabase.from("projects").insert(projectPayload as any).select("id").single();
          if (error) throw error;
          projectId = newProject.id;

          // Milestone Trigger (Solo creazione)
          if (values.cert_type === "LEED" || values.cert_type === "WELL") {
            const { data: cert, error: certErr } = await supabase.from("certifications").insert({
                site_id: siteId, project_id: projectId, cert_type: values.cert_type as any,
                score: 0, target_score: values.cert_type === "LEED" ? 110 : 100,
              }).select("id").single();
            if (certErr) throw certErr;

            const template = values.cert_type === "LEED" ? LEED_TEMPLATE : LEED_TEMPLATE; 
            const milestoneRows = template.map((t) => ({
              certification_id: cert.id, category: t.category, requirement: t.requirement,
              score: 0, max_score: t.max_score, status: "pending" as const,
            }));

            for (let i = 0; i < milestoneRows.length; i += 50) {
              const { error: mErr } = await supabase.from("certification_milestones").insert(milestoneRows.slice(i, i + 50) as any);
              if (mErr) throw mErr;
            }
          }
        }

        // 3. GESTIONE HARDWARE (ALLOCATIONS)
        const existingIds = existingAllocations.map((a) => a.id);
        const currentIds = values.allocations.filter((a) => a.id).map((a) => a.id!);
        const toDelete = existingIds.filter((id) => !currentIds.includes(id));

        if (toDelete.length > 0) {
          await supabase.from("project_allocations" as any).delete().in("id", toDelete);
        }

        for (const alloc of values.allocations) {
          const targetDate = format(subDays(values.handover_date!, 15), "yyyy-MM-dd");
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
      }

      toast({ title: "Operazione completata", description: "Sito e Progetto salvati con successo." });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["sites"] });
      if (onSaved) onSaved();
      onOpenChange(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Errore di salvataggio", description: error.message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{project ? "Modifica Sito & Progetto" : "Creazione Sito & Progetto"}</DialogTitle>
          <DialogDescription className="sr-only">Form unificato per la gestione di siti, progetti e hardware</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            
            {/* SITO */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Dati Sito Fisico</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <FormField control={form.control} name="brand_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Brand *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder={brandsLoading ? "Caricamento..." : "Seleziona brand"} /></SelectTrigger></FormControl>
                      <SelectContent>
                        {brands.map((b) => (<SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="site_name" render={({ field }) => (
                    <FormItem><FormLabel>Nome Sito *</FormLabel><FormControl><Input placeholder="Es. Sede Milano" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="city" render={({ field }) => (
                    <FormItem><FormLabel>Città *</FormLabel><FormControl><Input placeholder="Milano" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>

                <FormField control={form.control} name="address" render={({ field }) => (
                  <FormItem><FormLabel>Indirizzo</FormLabel><FormControl><Input placeholder="Via Roma 1" {...field} /></FormControl><FormMessage /></FormItem>
                )} />

                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="country" render={({ field }) => (
                    <FormItem><FormLabel>Paese *</FormLabel><FormControl><Input placeholder="Italia" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="region" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Regione *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="Europe">Europe</SelectItem>
                          <SelectItem value="America">America</SelectItem>
                          <SelectItem value="APAC">APAC</SelectItem>
                          <SelectItem value="ME">ME</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="lat" render={({ field }) => (
                    <FormItem><FormLabel>Latitudine</FormLabel><FormControl><Input type="number" step="any" placeholder="45.464" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="lng" render={({ field }) => (
                    <FormItem><FormLabel>Longitudine</FormLabel><FormControl><Input type="number" step="any" placeholder="9.190" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="area_m2" render={({ field }) => (
                    <FormItem><FormLabel>Area (m²)</FormLabel><FormControl><Input type="number" placeholder="1500" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="timezone" render={({ field }) => (
                    <FormItem><FormLabel>Timezone</FormLabel><FormControl><Input placeholder="Europe/Rome" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>

                <Separator />
                <p className="text-sm font-medium text-muted-foreground">Moduli Attivi</p>
                <div className="flex flex-wrap gap-6">
                  {(["module_energy_enabled", "module_air_enabled", "module_water_enabled"] as const).map((mod) => (
                    <FormField key={mod} control={form.control} name={mod} render={({ field }) => (
                      <FormItem className="flex items-center gap-2">
                        <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                        <FormLabel className="!mt-0 capitalize">{mod.replace("module_", "").replace("_enabled", "")}</FormLabel>
                      </FormItem>
                    )} />
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* TOGGLE PROGETTO */}
            <div className="flex items-center gap-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
              <FormField control={form.control} name="create_project" render={({ field }) => (
                <FormItem className="flex items-center gap-3">
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} className="scale-125" disabled={!!project} /></FormControl>
                  <FormLabel className="!mt-0 text-base font-semibold">
                    {project ? "Progetto di Certificazione Attivo" : "Avvia Progetto di Certificazione su questo Sito"}
                  </FormLabel>
                </FormItem>
              )} />
            </div>

            {/* PROGETTO */}
            {createProject && (
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base">Dettagli Progetto</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="project_name" render={({ field }) => (
                      <FormItem><FormLabel>Nome Progetto *</FormLabel><FormControl><Input placeholder="LEED Gold – Sede Milano" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="client" render={({ field }) => (
                      <FormItem><FormLabel>Cliente *</FormLabel><FormControl><Input placeholder="Es. Prada" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="handover_date" render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Data Handover *</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button variant="outline" className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                                {field.value ? format(field.value, "dd MMM yyyy", { locale: it }) : <span>Seleziona data</span>}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="status" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Stato Progetto</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            {["Design", "Construction", "Completed", "Cancelled"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  <FormField control={form.control} name="pm_id" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Project Manager *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={!isAdmin}>
                        <FormControl><SelectTrigger><SelectValue placeholder={pmsLoading ? "Caricamento..." : "Seleziona PM"} /></SelectTrigger></FormControl>
                        <SelectContent>
                          {pms.map((pm: any) => (<SelectItem key={pm.id} value={pm.id}>{pm.full_name}</SelectItem>))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <Separator />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="cert_type" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo Certificazione</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Nessuna" /></SelectTrigger></FormControl>
                          <SelectContent>
                            {["LEED", "WELL", "BREEAM", "CO2"].map((v) => (<SelectItem key={v} value={v}>{v}</SelectItem>))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="cert_rating" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Rating System</FormLabel>
                        <Select onValueChange={(v) => handleRatingChange(v, field.onChange)} value={field.value || ""}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Nessuno" /></SelectTrigger></FormControl>
                          <SelectContent>
                            {RATING_SYSTEMS.map((v) => (<SelectItem key={v} value={v}>{v}</SelectItem>))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="project_subtype" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sottotipologia</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""} disabled={availableSubtypes.length === 0}>
                          <FormControl><SelectTrigger><SelectValue placeholder={availableSubtypes.length === 0 ? "-" : "Seleziona"} /></SelectTrigger></FormControl>
                          <SelectContent>
                            {availableSubtypes.map((v) => (<SelectItem key={v} value={v}>{v}</SelectItem>))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="is_commissioning" render={({ field }) => (
                      <FormItem className="flex items-center gap-2 mt-8">
                        <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                        <FormLabel className="!mt-0">Commissioning</FormLabel>
                      </FormItem>
                    )} />
                  </div>

                  <Separator />

                  {/* ALLOCAZIONI HARDWARE */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-foreground">Fabbisogno Hardware</h3>
                      <Button type="button" variant="outline" size="sm" onClick={() => append({ product_id: "", quantity: 1, status: "Draft" })} className="gap-1 h-8">
                        <Plus className="h-4 w-4" /> Aggiungi
                      </Button>
                    </div>

                    {fields.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-2 bg-muted/30 rounded-lg">Nessun hardware richiesto.</p>
                    ) : (
                      <div className="space-y-3">
                        {fields.map((field, index) => (
                          <div key={field.id} className="flex items-start gap-3 rounded-lg border p-3 bg-muted/10">
                            <FormField control={form.control} name={`allocations.${index}.product_id`} render={({ field: f }) => (
                              <FormItem className="flex-1 space-y-1">
                                <FormLabel className="text-xs">Prodotto</FormLabel>
                                <Select onValueChange={f.onChange} value={f.value}>
                                  <FormControl><SelectTrigger><SelectValue placeholder="Seleziona..." /></SelectTrigger></FormControl>
                                  <SelectContent>
                                    {products.map((p) => (
                                      <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )} />
                            
                            <FormField control={form.control} name={`allocations.${index}.quantity`} render={({ field: f }) => (
                              <FormItem className="w-20 space-y-1">
                                <FormLabel className="text-xs">Qtà</FormLabel>
                                <FormControl><Input type="number" min="1" {...f} /></FormControl>
                                <FormMessage />
                              </FormItem>
                            )} />

                            {isAdmin && (
                              <FormField control={form.control} name={`allocations.${index}.status`} render={({ field: f }) => (
                                <FormItem className="w-32 space-y-1">
                                  <FormLabel className="text-xs">Stato</FormLabel>
                                  <Select onValueChange={f.onChange} value={f.value}>
                                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                    <SelectContent>
                                      {ALLOCATION_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )} />
                            )}
                            
                            <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} className="text-destructive mt-6 h-9 w-9">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {project ? "Salva Modifiche" : "Crea Sito & Progetto"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

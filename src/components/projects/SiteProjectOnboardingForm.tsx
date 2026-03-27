import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrands } from "@/hooks/useBrands";
import { useProjectManagers } from "@/hooks/useProjectManagers";
import { toast } from "@/hooks/use-toast";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Loader2, Plus } from "lucide-react";
import { RATING_SYSTEMS, RATING_SUBTYPES, type RatingSystem } from "@/data/ratingSubtypes";

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
    create_project: z.boolean().default(false),
    project_name: z.string().optional(),
    pm_id: z.string().optional(),
    cert_type: z.enum(["LEED", "WELL", "BREEAM", "CO2"]).optional(),
    cert_rating: z.string().optional(),
    project_subtype: z.string().optional(),
    is_commissioning: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    if (data.create_project) {
      if (!data.project_name || data.project_name.trim() === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Nome progetto richiesto",
          path: ["project_name"],
        });
      }
      if (!data.pm_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "PM richiesto",
          path: ["pm_id"],
        });
      }
    }
  });

type FormValues = z.infer<typeof formSchema>;

export function SiteProjectOnboardingForm() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { data: brands = [], isLoading: brandsLoading } = useBrands();
  const { data: pms = [], isLoading: pmsLoading } = useProjectManagers();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      site_name: "",
      address: "",
      city: "",
      country: "",
      region: "Europe",
      timezone: "UTC",
      module_energy_enabled: false,
      module_air_enabled: false,
      module_water_enabled: false,
      create_project: false,
      project_name: "",
      is_commissioning: false,
    },
  });

  const createProject = form.watch("create_project");
  const watchedCertType = form.watch("cert_type");
  const watchedCertRating = form.watch("cert_rating");
  const isSubmitting = form.formState.isSubmitting;

  // Available subtypes based on selected rating
  const availableSubtypes = watchedCertRating && RATING_SUBTYPES[watchedCertRating as RatingSystem]
    ? RATING_SUBTYPES[watchedCertRating as RatingSystem]
    : [];

  // Reset subtype when rating changes
  const handleRatingChange = (value: string, fieldOnChange: (v: string) => void) => {
    fieldOnChange(value);
    form.setValue("project_subtype", undefined);
  };

  const onSubmit = async (values: FormValues) => {
    try {
      const { data: siteData, error: siteError } = await supabase
        .from("sites")
        .insert({
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
        })
        .select("id")
        .single();

      if (siteError) throw siteError;

      if (values.create_project && siteData?.id) {
        const { error: projectError } = await supabase
          .from("projects")
          .insert({
            name: values.project_name!,
            site_id: siteData.id,
            pm_id: values.pm_id!,
            client: "",
            region: values.region,
            status: "Design",
            cert_type: values.cert_type || null,
            cert_rating: values.cert_rating || null,
            is_commissioning: values.is_commissioning,
          } as any);

        if (projectError) throw projectError;
      }

      toast({
        title: "Operazione completata",
        description: "Sito e Progetto configurati con successo.",
      });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["sites"] });
      form.reset();
      setOpen(false);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Errore di salvataggio",
        description: error.message,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Nuovo Sito & Progetto
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Creazione Sito & Progetto</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* SECTION 1: Site */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Dati Sito Fisico</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Brand */}
                <FormField
                  control={form.control}
                  name="brand_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Brand</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={brandsLoading ? "Caricamento..." : "Seleziona brand"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {brands.map((b) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Name + City */}
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="site_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome Sito</FormLabel>
                        <FormControl>
                          <Input placeholder="Es. Sede Milano" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Città</FormLabel>
                        <FormControl>
                          <Input placeholder="Milano" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Address */}
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Indirizzo</FormLabel>
                      <FormControl>
                        <Input placeholder="Via Roma 1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Country + Region */}
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="country"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Paese</FormLabel>
                        <FormControl>
                          <Input placeholder="Italia" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="region"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Regione</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Europe">Europe</SelectItem>
                            <SelectItem value="America">America</SelectItem>
                            <SelectItem value="APAC">APAC</SelectItem>
                            <SelectItem value="ME">ME</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Lat + Lng */}
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="lat"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Latitudine</FormLabel>
                        <FormControl>
                          <Input type="number" step="any" placeholder="45.464" {...field} value={field.value ?? ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="lng"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Longitudine</FormLabel>
                        <FormControl>
                          <Input type="number" step="any" placeholder="9.190" {...field} value={field.value ?? ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Area + Timezone */}
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="area_m2"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Area (m²)</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="1500" {...field} value={field.value ?? ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="timezone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Timezone</FormLabel>
                        <FormControl>
                          <Input placeholder="Europe/Rome" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Modules */}
                <Separator />
                <p className="text-sm font-medium text-muted-foreground">Moduli Attivi</p>
                <div className="flex flex-wrap gap-6">
                  {(["module_energy_enabled", "module_air_enabled", "module_water_enabled"] as const).map((mod) => (
                    <FormField
                      key={mod}
                      control={form.control}
                      name={mod}
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-2">
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                          <FormLabel className="!mt-0 capitalize">
                            {mod.replace("module_", "").replace("_enabled", "")}
                          </FormLabel>
                        </FormItem>
                      )}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* TOGGLE */}
            <div className="flex items-center gap-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
              <FormField
                control={form.control}
                name="create_project"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-3">
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} className="scale-125" />
                    </FormControl>
                    <FormLabel className="!mt-0 text-base font-semibold">
                      Avvia Progetto di Certificazione su questo Sito
                    </FormLabel>
                  </FormItem>
                )}
              />
            </div>

            {/* SECTION 2: Project (conditional) */}
            {createProject && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Impostazioni Progetto</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="project_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome Progetto</FormLabel>
                        <FormControl>
                          <Input placeholder="LEED Gold – Sede Milano" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="pm_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Project Manager</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={pmsLoading ? "Caricamento..." : "Seleziona PM"} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {pms.map((pm: any) => (
                              <SelectItem key={pm.id} value={pm.id}>
                                {pm.full_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="cert_type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tipo Certificazione</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Seleziona" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {["LEED", "WELL", "BREEAM", "CO2"].map((v) => (
                                <SelectItem key={v} value={v}>{v}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="cert_rating"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Rating</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Seleziona" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {["ID+C v.4", "ID+C v.4.1", "BD+C", "O+M"].map((v) => (
                                <SelectItem key={v} value={v}>{v}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="is_commissioning"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2">
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                        <FormLabel className="!mt-0">Commissioning</FormLabel>
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            )}

            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salva
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrands } from "@/hooks/useBrands";
import { useProjectManagers } from "@/hooks/useProjectManagers";
import { toast } from "@/hooks/use-toast";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { RATING_SYSTEMS, RATING_SUBTYPES, type RatingSystem } from "@/data/ratingSubtypes";
import { getCertificationTemplate } from "@/data/certificationTemplates";

const AVAILABLE_CERTS = ["LEED", "WELL", "BREEAM", "ESG", "GRESB"] as const;

const CERT_LEVELS: Record<string, string[]> = {
  LEED: ["Certified", "Silver", "Gold", "Platinum"],
  WELL: ["Bronze", "Silver", "Gold", "Platinum"],
  BREEAM: ["Pass", "Good", "Very Good", "Excellent", "Outstanding"],
  ESG: [],
  GRESB: [],
};

const formSchema = z.object({
  brand_id: z.string().uuid("Select a brand"),
  site_name: z.string().min(2, "Name is required"),
  address: z.string().optional(),
  city: z.string().min(2, "City is required"),
  country: z.string().min(2, "Country is required"),
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
  is_commissioning: z.boolean().default(false),
  // NEW: Dynamic array of certifications
  certifications: z.array(z.object({
    cert_type: z.enum(["LEED", "WELL", "BREEAM", "ESG", "GRESB"]),
    cert_rating: z.string().optional(),
    cert_level: z.string().optional(),
    project_subtype: z.string().optional(),
  })).default([]),
}).superRefine((data, ctx) => {
  if (data.create_project) {
    if (!data.project_name || data.project_name.trim() === "") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Project name required", path: ["project_name"] });
    }
    if (!data.pm_id) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "PM required", path: ["pm_id"] });
    }
    // Validate levels for each selected certification
    data.certifications.forEach((cert, index) => {
      if (CERT_LEVELS[cert.cert_type] && CERT_LEVELS[cert.cert_type].length > 0) {
        if (cert.cert_level && !CERT_LEVELS[cert.cert_type].includes(cert.cert_level)) {
           ctx.addIssue({ 
             code: z.ZodIssueCode.custom, 
             message: `Invalid level for ${cert.cert_type}`, 
             path: ["certifications", index, "cert_level"] 
           });
        }
      }
    });
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
      site_name: "", address: "", city: "", country: "", region: "Europe", timezone: "UTC",
      module_energy_enabled: false, module_air_enabled: false, module_water_enabled: false,
      create_project: false, project_name: "", is_commissioning: false,
      certifications: [], // Start with zero schemas
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "certifications"
  });

  const createProject = form.watch("create_project");
  const isSubmitting = form.formState.isSubmitting;

  const onSubmit = async (values: FormValues) => {
    try {
      // 1. Create Site
      const { data: siteData, error: siteError } = await supabase
        .from("sites")
        .insert({
          brand_id: values.brand_id, name: values.site_name, address: values.address || null,
          city: values.city, country: values.country, region: values.region,
          lat: values.lat || null, lng: values.lng || null, area_m2: values.area_m2 || null,
          timezone: values.timezone, module_energy_enabled: values.module_energy_enabled,
          module_air_enabled: values.module_air_enabled, module_water_enabled: values.module_water_enabled,
        })
        .select("id")
        .single();
      if (siteError) throw siteError;

      // 2. Create Project + Multi-Certifications
      if (values.create_project && siteData?.id) {
        
        // Save old fields by concatenating for visual fallback (e.g., "LEED, WELL")
        const legacyCertTypes = values.certifications.map(c => c.cert_type).join(", ") || null;

        const { data: projectData, error: projectError } = await supabase
          .from("projects")
          .insert({
            name: values.project_name!, site_id: siteData.id, pm_id: values.pm_id!,
            client: "", region: values.region, status: "Design",
            cert_type: legacyCertTypes, // Descriptive string
            is_commissioning: values.is_commissioning,
          } as any)
          .select("id")
          .single();
        if (projectError) throw projectError;

        // 3. LOOP THROUGH CERTIFICATIONS
        for (const certConf of values.certifications) {
          // const finalCertLevel = CERT_LEVELS[certConf.cert_type]?.length ? certConf.cert_level || null : null; // Not needed to save to certifications table, but kept for logic if needed

          // Insert the row for the specific schema
          const { data: certData, error: certError } = await supabase
            .from("certifications")
            .insert({
              site_id: siteData.id,
              cert_type: certConf.cert_type,
              level: certConf.cert_rating || null, // rating system (e.g., LEED v4)
              status: "in_progress",
              score: 0,
            })
            .select("id")
            .single();
          if (certError) throw certError;

          // Generate the template for this specific schema
          const templateInfo = getCertificationTemplate(certConf.cert_type, certConf.cert_rating, certConf.project_subtype);

          if (templateInfo) {
            const milestoneRows: any[] = [];
            templateInfo.timeline.forEach((t) => {
              milestoneRows.push({
                certification_id: certData.id, category: "Timeline", requirement: t.name,
                milestone_type: "timeline", status: "pending",
              });
            });
            templateInfo.scorecard.forEach((s) => {
              milestoneRows.push({
                certification_id: certData.id, category: s.category, requirement: s.requirement,
                milestone_type: "scorecard", max_score: s.max_score, score: 0, status: "pending",
              });
            });

            if (milestoneRows.length > 0) {
              for (let i = 0; i < milestoneRows.length; i += 50) {
                const batch = milestoneRows.slice(i, i + 50);
                const { error: mErr } = await supabase.from("certification_milestones").insert(batch as any);
                if (mErr) console.error(`Error inserting milestones for ${certConf.cert_type}:`, mErr);
              }
            }
          }
        }
      }

      toast({ title: "Operation completed", description

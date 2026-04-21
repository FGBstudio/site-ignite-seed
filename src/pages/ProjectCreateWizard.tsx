import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { useHoldings, useBrands, useSites } from "@/hooks/useProjectDetails";
import { useProjectManagers } from "@/hooks/useProjectManagers";
import { useWizardDraft, EMPTY_CERT, type WizardDraft, type CertEntry } from "@/hooks/useWizardDraft";
import { getCertificationTemplate, CERT_TYPES, CERT_RATINGS, CERT_LEVELS, CERT_SUBTYPES } from "@/data/certificationTemplates";
import { RATING_SYSTEMS, RATING_SUBTYPES, type RatingSystem } from "@/data/ratingSubtypes";
import { toast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ArrowLeft, ArrowRight, CalendarIcon, Check, Building2, FolderKanban, Award, ClipboardCheck,
  Loader2, X, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { NewBrandButton, NewHoldingButton } from "@/components/projects/BrandHoldingCreator";

const STEPS = [
  { id: 1, title: "Site", icon: Building2, description: "Location & physical site" },
  { id: 2, title: "Project", icon: FolderKanban, description: "Project details" },
  { id: 3, title: "Certifications", icon: Award, description: "Standards & targets" },
  { id: 4, title: "Review", icon: ClipboardCheck, description: "Confirm & submit" },
];

export default function ProjectCreateWizard() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const { draft, updateDraft, clearDraft, hasSavedDraft } = useWizardDraft();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [showDraftBanner, setShowDraftBanner] = useState(hasSavedDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Data queries
  const { data: holdings = [], isLoading: loadingHoldings } = useHoldings();
  const { data: brands = [], isLoading: loadingBrands } = useBrands(draft.holding_id || undefined);
  const { data: sites = [], isLoading: loadingSites } = useSites(draft.brand_id || undefined);
  const { data: pms = [], isLoading: loadingPMs } = useProjectManagers();

  const handleDiscardDraft = () => {
    clearDraft();
    setShowDraftBanner(false);
    setStep(1);
  };

  const handleResumeDraft = () => {
    setShowDraftBanner(false);
  };

  // Validation per step
  const validateStep = (s: number): boolean => {
    const errs: Record<string, string> = {};

    if (s === 1) {
      if (!draft.holding_id) errs.holding_id = "Required";
      if (!draft.brand_id) errs.brand_id = "Required";
      if (draft.create_new_site) {
        if (!draft.site_name.trim()) errs.site_name = "Required";
        if (!draft.city.trim()) errs.city = "Required";
        if (!draft.country.trim()) errs.country = "Required";
      } else {
        if (!draft.site_id) errs.site_id = "Required";
      }
    }

    if (s === 2) {
      if (!draft.project_name.trim()) errs.project_name = "Required";
      if (!draft.client.trim()) errs.client = "Required";
      if (!draft.handover_date) errs.handover_date = "Required";
    }

    if (s === 3) {
      // Validate each certification has required fields
      draft.certifications.forEach((cert, i) => {
        if (!cert.cert_type) errs[`cert_${i}_type`] = "Required";
        if (isAdmin && !cert.pm_id) errs[`cert_${i}_pm`] = "PM required";
      });
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const goNext = () => {
    if (validateStep(step)) {
      setStep((s) => Math.min(s + 1, 4));
    }
  };

  const goBack = () => setStep((s) => Math.max(s - 1, 1));

  const handleSubmit = async () => {
    if (!validateStep(1) || !validateStep(2)) {
      toast({ variant: "destructive", title: "Missing fields", description: "Please complete all required fields." });
      return;
    }

    setSubmitting(true);
    try {
      // 1. Create or use existing site
      let siteId = draft.site_id;
      if (draft.create_new_site) {
        const { data: newSite, error: siteErr } = await supabase
          .from("sites")
          .insert({
            brand_id: draft.brand_id,
            name: draft.site_name.trim(),
            address: draft.address || null,
            city: draft.city,
            country: draft.country,
            region: draft.region,
            lat: draft.lat || null,
            lng: draft.lng || null,
            area_m2: draft.area_m2 || null,
            timezone: draft.timezone,
            module_energy_enabled: draft.module_energy_enabled,
            module_air_enabled: draft.module_air_enabled,
            module_water_enabled: draft.module_water_enabled,
          } as any)
          .select("id")
          .single();
        if (siteErr) throw siteErr;
        siteId = newSite.id;
      }

      const certs = draft.certifications;

      if (certs.length === 0) {
        // No certifications — create a single project without cert
        const pmId = isAdmin ? (user?.id || null) : user?.id;
        const { error: certErr } = await supabase
          .from("certifications")
          .insert({
            name: draft.project_name.trim(),
            client: draft.client.trim(),
            region: draft.region,
            handover_date: draft.handover_date,
            status: "in_progress",
            pm_id: pmId,
            site_id: siteId!,
            cert_type: "none",
          } as any);
        if (certErr) throw certErr;
      } else {
        // Create one project per certification
        await Promise.all(certs.map(async (cert) => {
          const pmId = isAdmin ? cert.pm_id : user?.id;
          const projectName = certs.length === 1
            ? draft.project_name.trim()
            : `${draft.project_name.trim()} – ${cert.cert_type}`;

          const { data: certData, error: certErr } = await supabase
            .from("certifications")
            .insert({
              name: projectName,
              client: draft.client.trim(),
              region: draft.region,
              handover_date: draft.handover_date,
              status: "in_progress",
              pm_id: pmId || null,
              site_id: siteId!,
              cert_type: cert.cert_type,
              cert_rating: cert.cert_rating || null,
              cert_level: cert.cert_level || null,
              project_subtype: cert.project_subtype || null,
              is_commissioning: cert.is_commissioning,
              score: 0,
            } as any)
            .select("id")
            .single();
          if (certErr) throw certErr;

          // Create milestones
          if (cert.cert_type && siteId) {

            const templateInfo = getCertificationTemplate(
              cert.cert_type, cert.cert_rating || null, cert.project_subtype || null
            );

            if (templateInfo) {
              const rows: any[] = [];
              templateInfo.timeline.forEach((t) => {
                rows.push({
                  certification_id: certData.id, category: "Timeline", requirement: t.name,
                  milestone_type: "timeline", status: "pending",
                });
              });
              templateInfo.scorecard.forEach((s) => {
                rows.push({
                  certification_id: certData.id, category: s.category, requirement: s.requirement,
                  milestone_type: "scorecard", max_score: s.max_score, score: 0, status: "pending",
                });
              });

              for (let i = 0; i < rows.length; i += 50) {
                const batch = rows.slice(i, i + 50);
                await supabase.from("certification_milestones").insert(batch as any);
              }
            }
          }
        }));
      }

      clearDraft();
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["admin-planner"] });
      const certCount = certs.length;
      toast({
        title: "Project created",
        description: certCount > 1
          ? `${certCount} certification projects created for ${draft.project_name}.`
          : `${draft.project_name} has been set up successfully.`,
      });
      navigate("/projects");
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const progressPercent = (step / STEPS.length) * 100;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <header className="border-b bg-card px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/projects")} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to Projects
          </Button>
          <div className="h-6 w-px bg-border" />
          <h1 className="text-lg font-semibold text-foreground">New Project</h1>
        </div>
        <Button variant="ghost" size="icon" onClick={() => navigate("/projects")}>
          <X className="h-4 w-4" />
        </Button>
      </header>

      {/* Draft banner */}
      {showDraftBanner && (
        <div className="bg-primary/10 border-b border-primary/20 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-primary">
            <AlertTriangle className="h-4 w-4" />
            <span>A previous draft was found. Would you like to resume or start fresh?</span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleDiscardDraft}>Discard</Button>
            <Button size="sm" onClick={handleResumeDraft}>Resume Draft</Button>
          </div>
        </div>
      )}

      {/* Stepper */}
      <div className="border-b bg-card/50 px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            {STEPS.map((s) => (
              <button
                key={s.id}
                onClick={() => { if (s.id < step) setStep(s.id); }}
                className={cn(
                  "flex items-center gap-2 text-sm transition-colors",
                  s.id === step ? "text-primary font-semibold" :
                  s.id < step ? "text-primary/70 cursor-pointer hover:text-primary" :
                  "text-muted-foreground"
                )}
              >
                <div className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all",
                  s.id === step ? "border-primary bg-primary text-primary-foreground" :
                  s.id < step ? "border-primary bg-primary/10 text-primary" :
                  "border-muted-foreground/30 text-muted-foreground"
                )}>
                  {s.id < step ? <Check className="h-4 w-4" /> : s.id}
                </div>
                <span className="hidden sm:inline">{s.title}</span>
              </button>
            ))}
          </div>
          <Progress value={progressPercent} className="h-1.5" />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-3xl mx-auto">
          {step === 1 && <StepSite draft={draft} updateDraft={updateDraft} errors={errors}
            holdings={holdings} brands={brands} sites={sites}
            loadingHoldings={loadingHoldings} loadingBrands={loadingBrands} loadingSites={loadingSites}
            isAdmin={isAdmin} />}
          {step === 2 && <StepProject draft={draft} updateDraft={updateDraft} errors={errors} />}
          {step === 3 && <StepCertifications draft={draft} updateDraft={updateDraft} errors={errors}
            pms={pms} loadingPMs={loadingPMs} isAdmin={isAdmin} />}
          {step === 4 && <StepReview draft={draft} pms={pms} brands={brands} sites={sites} holdings={holdings} />}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t bg-card px-6 py-4 shrink-0">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Button variant="outline" onClick={goBack} disabled={step === 1} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <span className="text-sm text-muted-foreground">Step {step} of {STEPS.length}</span>
          {step < 4 ? (
            <Button onClick={goNext} className="gap-2">
              Next <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Project{draft.certifications.length > 1 ? "s" : ""}
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}

/* ─── Step 1: Site ──────────────────────────────────────────── */

function StepSite({ draft, updateDraft, errors, holdings, brands, sites, loadingHoldings, loadingBrands, loadingSites, isAdmin }: {
  draft: WizardDraft; updateDraft: (p: Partial<WizardDraft>) => void;
  errors: Record<string, string>;
  holdings: any[]; brands: any[]; sites: any[];
  loadingHoldings: boolean; loadingBrands: boolean; loadingSites: boolean;
  isAdmin: boolean;
}) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-1">Site Information</h2>
        <p className="text-muted-foreground">Select an existing site or create a new one for this project.</p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FieldWrapper label="Holding" error={errors.holding_id}>
              <div className="flex gap-2">
                <Select value={draft.holding_id} onValueChange={(v) => updateDraft({ holding_id: v, brand_id: "", site_id: "" })}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder={loadingHoldings ? "Loading..." : "Select holding"} /></SelectTrigger>
                  <SelectContent>{holdings.map((h: any) => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}</SelectContent>
                </Select>
                {isAdmin && (
                  <NewHoldingButton onCreated={(id) => updateDraft({ holding_id: id, brand_id: "", site_id: "" })} />
                )}
              </div>
            </FieldWrapper>

            <FieldWrapper label="Brand" error={errors.brand_id}>
              <div className="flex gap-2">
                <Select value={draft.brand_id} onValueChange={(v) => updateDraft({ brand_id: v, site_id: "" })} disabled={!draft.holding_id}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder={!draft.holding_id ? "Select holding first" : loadingBrands ? "Loading..." : "Select brand"} /></SelectTrigger>
                  <SelectContent>{brands.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                </Select>
                {isAdmin && (
                  <NewBrandButton holdingId={draft.holding_id} onCreated={(id) => updateDraft({ brand_id: id, site_id: "" })} disabled={!draft.holding_id} />
                )}
              </div>
            </FieldWrapper>

            <FieldWrapper label="Site" error={errors.site_id}>
              {draft.create_new_site ? (
                <div className="flex gap-2">
                  <Input placeholder="New site name..." value={draft.site_name}
                    onChange={(e) => updateDraft({ site_name: e.target.value })} className="flex-1" />
                  <Button type="button" variant="outline" size="sm" onClick={() => updateDraft({ create_new_site: false, site_name: "" })}>Cancel</Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Select value={draft.site_id} onValueChange={(v) => updateDraft({ site_id: v })} disabled={!draft.brand_id}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder={!draft.brand_id ? "Select brand first" : loadingSites ? "Loading..." : "Select site"} /></SelectTrigger>
                    <SelectContent>{sites.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}{s.city ? ` — ${s.city}` : ""}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button type="button" variant="outline" size="sm" onClick={() => updateDraft({ create_new_site: true, site_id: "" })} disabled={!draft.brand_id}>+ New</Button>
                </div>
              )}
            </FieldWrapper>
          </div>
        </CardContent>
      </Card>

      {/* New site details */}
      {draft.create_new_site && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <h3 className="font-semibold text-foreground text-sm">New Site Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FieldWrapper label="City" error={errors.city}>
                <Input value={draft.city} onChange={(e) => updateDraft({ city: e.target.value })} placeholder="e.g. Milan" />
              </FieldWrapper>
              <FieldWrapper label="Country" error={errors.country}>
                <Input value={draft.country} onChange={(e) => updateDraft({ country: e.target.value })} placeholder="e.g. Italy" />
              </FieldWrapper>
              <FieldWrapper label="Address">
                <Input value={draft.address} onChange={(e) => updateDraft({ address: e.target.value })} placeholder="Via Roma 1" />
              </FieldWrapper>
              <FieldWrapper label="Region">
                <Select value={draft.region} onValueChange={(v) => updateDraft({ region: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Europe", "America", "APAC", "ME"].map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FieldWrapper>
              <FieldWrapper label="Latitude">
                <Input type="number" step="any" value={draft.lat ?? ""} onChange={(e) => updateDraft({ lat: e.target.value ? Number(e.target.value) : null })} placeholder="45.464" />
              </FieldWrapper>
              <FieldWrapper label="Longitude">
                <Input type="number" step="any" value={draft.lng ?? ""} onChange={(e) => updateDraft({ lng: e.target.value ? Number(e.target.value) : null })} placeholder="9.190" />
              </FieldWrapper>
              <FieldWrapper label="Area (m²)">
                <Input type="number" value={draft.area_m2 ?? ""} onChange={(e) => updateDraft({ area_m2: e.target.value ? Number(e.target.value) : null })} placeholder="1500" />
              </FieldWrapper>
              <FieldWrapper label="Timezone">
                <Input value={draft.timezone} onChange={(e) => updateDraft({ timezone: e.target.value })} placeholder="Europe/Rome" />
              </FieldWrapper>
            </div>

            <div className="pt-2">
              <p className="text-sm font-medium text-muted-foreground mb-3">Active Modules</p>
              <div className="flex flex-wrap gap-6">
                {([
                  ["module_energy_enabled", "Energy"],
                  ["module_air_enabled", "Air Quality"],
                  ["module_water_enabled", "Water"],
                ] as const).map(([key, label]) => (
                  <div key={key} className="flex items-center gap-2">
                    <Switch checked={draft[key]} onCheckedChange={(v) => updateDraft({ [key]: v })} />
                    <Label>{label}</Label>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ─── Step 2: Project ──────────────────────────────────────── */

function StepProject({ draft, updateDraft, errors }: {
  draft: WizardDraft; updateDraft: (p: Partial<WizardDraft>) => void;
  errors: Record<string, string>;
}) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-1">Project Details</h2>
        <p className="text-muted-foreground">Define the project base name, client, and key dates. The PM will be assigned per certification in the next step.</p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldWrapper label="Project Name" error={errors.project_name} required>
              <Input value={draft.project_name} onChange={(e) => updateDraft({ project_name: e.target.value })}
                placeholder="e.g. Milan HQ" />
            </FieldWrapper>
            <FieldWrapper label="Client" error={errors.client} required>
              <Input value={draft.client} onChange={(e) => updateDraft({ client: e.target.value })}
                placeholder="e.g. Prada" />
            </FieldWrapper>

            <FieldWrapper label="Region">
              <Select value={draft.region} onValueChange={(v) => updateDraft({ region: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Europe", "America", "APAC", "ME"].map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </FieldWrapper>

            <FieldWrapper label="Handover Date" error={errors.handover_date} required>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !draft.handover_date && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {draft.handover_date ? format(new Date(draft.handover_date), "dd MMM yyyy") : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single"
                    selected={draft.handover_date ? new Date(draft.handover_date) : undefined}
                    onSelect={(d) => updateDraft({ handover_date: d ? format(d, "yyyy-MM-dd") : "" })}
                    initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </FieldWrapper>

            <FieldWrapper label="Status">
              <Select value={draft.status} onValueChange={(v) => updateDraft({ status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Design", "Construction", "Completed", "Cancelled"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </FieldWrapper>

            <FieldWrapper label="Project Type">
              <Select value={draft.project_type} onValueChange={(v) => updateDraft({ project_type: v })}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {["LEED", "WELL", "BREEAM", "Monitoring", "Consulting"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </FieldWrapper>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Step 3: Multi-Certification ──────────────────────────── */

const ALL_CERT_TYPES = ["LEED", "WELL", "BREEAM", "CO2"] as const;

function StepCertifications({ draft, updateDraft, errors, pms, loadingPMs, isAdmin }: {
  draft: WizardDraft; updateDraft: (p: Partial<WizardDraft>) => void;
  errors: Record<string, string>;
  pms: any[]; loadingPMs: boolean; isAdmin: boolean;
}) {
  const selectedTypes = draft.certifications.map(c => c.cert_type);

  const toggleCertType = (certType: string) => {
    const existing = draft.certifications.find(c => c.cert_type === certType);
    if (existing) {
      // Remove
      updateDraft({ certifications: draft.certifications.filter(c => c.cert_type !== certType) });
    } else {
      // Add
      updateDraft({ certifications: [...draft.certifications, { ...EMPTY_CERT, cert_type: certType }] });
    }
  };

  const updateCert = (index: number, partial: Partial<CertEntry>) => {
    const next = [...draft.certifications];
    next[index] = { ...next[index], ...partial };
    updateDraft({ certifications: next });
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-1">Certification Setup</h2>
        <p className="text-muted-foreground">
          Select one or more certifications. Each will create a separate project workflow with its own PM, timeline, and scorecard.
        </p>
      </div>

      {/* Cert type checkboxes */}
      <Card>
        <CardContent className="pt-6">
          <Label className="text-sm font-semibold mb-3 block">Select Certifications</Label>
          <div className="flex flex-wrap gap-4">
            {ALL_CERT_TYPES.map((ct) => (
              <label key={ct} className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 cursor-pointer transition-all",
                selectedTypes.includes(ct)
                  ? "border-primary bg-primary/5"
                  : "border-muted hover:border-muted-foreground/30"
              )}>
                <Checkbox
                  checked={selectedTypes.includes(ct)}
                  onCheckedChange={() => toggleCertType(ct)}
                />
                <span className="font-medium text-sm">{ct}</span>
              </label>
            ))}
          </div>
          {draft.certifications.length === 0 && (
            <p className="text-sm text-muted-foreground mt-3">
              No certifications selected. Click Next to skip, or select certifications above.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Config card per selected certification */}
      {draft.certifications.map((cert, index) => (
        <CertConfigCard
          key={cert.cert_type}
          cert={cert}
          index={index}
          errors={errors}
          pms={pms}
          loadingPMs={loadingPMs}
          isAdmin={isAdmin}
          onUpdate={(partial) => updateCert(index, partial)}
          onRemove={() => toggleCertType(cert.cert_type)}
        />
      ))}
    </div>
  );
}

function CertConfigCard({ cert, index, errors, pms, loadingPMs, isAdmin, onUpdate, onRemove }: {
  cert: CertEntry; index: number; errors: Record<string, string>;
  pms: any[]; loadingPMs: boolean; isAdmin: boolean;
  onUpdate: (p: Partial<CertEntry>) => void;
  onRemove: () => void;
}) {
  const ratings = CERT_RATINGS[cert.cert_type] || [];
  const levels = CERT_LEVELS[cert.cert_type] || [];

  // For LEED, subtypes come from RATING_SUBTYPES; for others from CERT_SUBTYPES
  let subtypes: string[] = [];
  if (cert.cert_type === "LEED" && cert.cert_rating) {
    subtypes = RATING_SUBTYPES[cert.cert_rating as RatingSystem] || [];
  } else if (cert.cert_rating) {
    subtypes = CERT_SUBTYPES[`${cert.cert_type}|${cert.cert_rating}`] || [];
  }

  return (
    <Card className="border-primary/20">
      <CardContent className="pt-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Badge className="text-xs">{cert.cert_type}</Badge>
            Configuration
          </h3>
          <Button variant="ghost" size="sm" onClick={onRemove} className="text-muted-foreground hover:text-destructive">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Rating */}
          <FieldWrapper label="Rating System">
            <Select value={cert.cert_rating} onValueChange={(v) => onUpdate({ cert_rating: v, project_subtype: "" })}>
              <SelectTrigger><SelectValue placeholder="Select rating" /></SelectTrigger>
              <SelectContent>{ratings.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
          </FieldWrapper>

          {/* Level */}
          <FieldWrapper label="Target Level">
            <Select value={cert.cert_level} onValueChange={(v) => onUpdate({ cert_level: v })} disabled={levels.length === 0}>
              <SelectTrigger><SelectValue placeholder={levels.length === 0 ? "N/A" : "Select level"} /></SelectTrigger>
              <SelectContent>{levels.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </FieldWrapper>

          {/* Subtype */}
          {subtypes.length > 0 && (
            <FieldWrapper label="Subtype">
              <Select value={cert.project_subtype} onValueChange={(v) => onUpdate({ project_subtype: v })}>
                <SelectTrigger><SelectValue placeholder="Select subtype" /></SelectTrigger>
                <SelectContent>{subtypes.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </FieldWrapper>
          )}

          {/* PM (per-certification) */}
          {isAdmin && (
            <FieldWrapper label="Project Manager" error={errors[`cert_${index}_pm`]} required>
              <Select value={cert.pm_id} onValueChange={(v) => onUpdate({ pm_id: v })} disabled={loadingPMs}>
                <SelectTrigger><SelectValue placeholder={loadingPMs ? "Loading..." : "Select PM"} /></SelectTrigger>
                <SelectContent>
                  {pms.map((pm: any) => <SelectItem key={pm.id} value={pm.id}>{pm.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </FieldWrapper>
          )}
        </div>

        <div className="flex items-center gap-3 pt-1">
          <Switch checked={cert.is_commissioning} onCheckedChange={(v) => onUpdate({ is_commissioning: v })} />
          <Label>Commissioning required</Label>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Step 4: Review ───────────────────────────────────────── */

function StepReview({ draft, pms, brands, sites, holdings }: {
  draft: WizardDraft; pms: any[]; brands: any[]; sites: any[]; holdings: any[];
}) {
  const holdingName = holdings.find((h: any) => h.id === draft.holding_id)?.name || "—";
  const brandName = brands.find((b: any) => b.id === draft.brand_id)?.name || "—";
  const siteName = draft.create_new_site ? draft.site_name : sites.find((s: any) => s.id === draft.site_id)?.name || "—";

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-1">Review & Submit</h2>
        <p className="text-muted-foreground">
          {draft.certifications.length > 1
            ? `This will create ${draft.certifications.length} separate projects, one per certification, all linked to the same site.`
            : "Please review the information below before creating the project."}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ReviewCard title="Site" items={[
          ["Holding", holdingName],
          ["Brand", brandName],
          ["Site", siteName],
          ...(draft.create_new_site ? [
            ["City", draft.city],
            ["Country", draft.country],
            ["Region", draft.region],
          ] as [string, string][] : []),
        ]} />

        <ReviewCard title="Project" items={[
          ["Base Name", draft.project_name],
          ["Client", draft.client],
          ["Handover", draft.handover_date ? format(new Date(draft.handover_date), "dd MMM yyyy") : "—"],
          ["Status", draft.status],
          ["Type", draft.project_type || "—"],
        ]} />

        {draft.certifications.length === 0 && (
          <ReviewCard title="Certification" items={[["Type", "None"]]} />
        )}

        {draft.certifications.map((cert, i) => {
          const pmName = pms.find((p: any) => p.id === cert.pm_id)?.full_name || "—";
          return (
            <ReviewCard key={cert.cert_type} title={`${cert.cert_type} Certification`} items={[
              ["Rating", cert.cert_rating || "—"],
              ["Level", cert.cert_level || "—"],
              ["Subtype", cert.project_subtype || "—"],
              ["PM", pmName],
              ["Commissioning", cert.is_commissioning ? "Yes" : "No"],
            ]} />
          );
        })}
      </div>
    </div>
  );
}

/* ─── Shared UI helpers ────────────────────────────────────── */

function FieldWrapper({ label, error, required, children }: {
  label: string; error?: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className={cn(error && "text-destructive")}>
        {label}{required && " *"}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function ReviewCard({ title, items }: { title: string; items: [string, string][] }) {
  return (
    <Card>
      <CardContent className="pt-5 space-y-3">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Badge variant="outline" className="text-xs">{title}</Badge>
        </h3>
        <div className="space-y-2">
          {items.map(([k, v]) => (
            <div key={k} className="flex justify-between text-sm">
              <span className="text-muted-foreground">{k}</span>
              <span className="font-medium text-foreground">{v}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

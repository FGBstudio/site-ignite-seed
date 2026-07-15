import { useEffect, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useHoldings, useBrands, useSites } from "@/hooks/useProjectDetails";
import { useAuth } from "@/contexts/AuthContext";
import { NewHoldingButton, NewBrandButton } from "@/components/projects/BrandHoldingCreator";
import { getRatings, getSubtypes } from "@/data/ratingSubtypes";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { PAYMENT_SCHEMES, TRIGGER_LABELS, generateTranches, validateCustomTranches, type PaymentSchemeId, type TriggerEvent } from "@/lib/paymentSchemes";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MonthYearCalendar } from "@/components/ui/MonthYearCalendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  CalendarIcon, Plus, Loader2, CheckCircle2, Building2, Award,
  ChevronRight, ChevronLeft, X, Calculator,
} from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { QuotationBudgetBuilder } from "@/components/projects/QuotationBudgetBuilder";
import {
  type BudgetBuilderState,
  emptyBuilder,
  computeBudget,
  HOURS_PER_DAY,
} from "@/lib/quotationBudget";

// ─── Constants ──────────────────────────────────────────────────────────────

const REGIONS = ["Europe", "America", "APAC", "ME"] as const;
const AVAILABLE_CERTS = ["LEED", "WELL", "BREEAM", "ESG", "GRESB", "Energy_Audit"] as const;
type CertType = (typeof AVAILABLE_CERTS)[number];

const CERT_DISPLAY_LABELS: Record<string, string> = {
  LEED: "LEED",
  WELL: "WELL",
  BREEAM: "BREEAM",
  ESG: "Taxonomy ESG",
  GRESB: "GRESB",
  Energy_Audit: "Energy Audit",
};

const CERT_LEVELS: Record<CertType, string[]> = {
  LEED: ["Certified", "Silver", "Gold", "Platinum"],
  WELL: ["Bronze", "Silver", "Gold", "Platinum"],
  BREEAM: ["Pass", "Good", "Very Good", "Excellent", "Outstanding"],
  ESG: [],
  GRESB: [],
  Energy_Audit: [],
};

type QuotationStrategy = "single" | "split" | null;
type StepNum = 1 | 2 | 3 | 4;

const STEPS = [
  { n: 1 as const, label: "Site & Project", icon: Building2 },
  { n: 2 as const, label: "Services & Quote", icon: Award },
  { n: 3 as const, label: "Strategy", icon: Calculator },
  { n: 4 as const, label: "Review", icon: CheckCircle2 },
];

// ─── State Shapes ───────────────────────────────────────────────────────────

interface SiteState {
  holdingId: string;
  brandId: string;
  siteId: string;
  isNew: boolean;
  newName: string;
  newAddress: string;
  newCity: string;
  newCountry: string;
}

interface MonitoringFlags {
  iaq: boolean;
  energy: boolean;
  water: boolean;
  hardwareRedirect: boolean;
}

interface CertConfig {
  cert_type: CertType;
  cert_rating: string;
  cert_level: string;
  project_subtype: string;
  flags: MonitoringFlags;
  // Quotation fields per certification
  services_fees: string;
  gbci_fees: string;
  total_fees: string;
  quote_mode: "direct" | "builder";
  builder: BudgetBuilderState;
  builder_applied: boolean;
}

function emptyFlags(): MonitoringFlags {
  return { iaq: false, energy: false, water: false, hardwareRedirect: false };
}

function emptyCertConfig(type: CertType): CertConfig {
  return {
    cert_type: type,
    cert_rating: "",
    cert_level: "",
    project_subtype: "",
    flags: emptyFlags(),
    services_fees: "",
    gbci_fees: "",
    total_fees: "",
    quote_mode: "direct",
    builder: emptyBuilder(),
    builder_applied: false,
  };
}

function showsIaqEnergyWater(t: CertType) {
  return t === "LEED" || t === "WELL" || t === "BREEAM";
}
function showsEnergyRedirect(t: CertType) {
  return t === "Energy_Audit";
}

interface ServicesState {
  projectName: string;
  client: string;
  region: string;
  handoverDate: Date | undefined;
  certifications: CertConfig[];
  sqm: string;
  quotationSentDate: Date | undefined;
  notes: string;
  paymentScheme: import("@/lib/paymentSchemes").PaymentSchemeId;
  customSal: { pct: string; trigger: import("@/lib/paymentSchemes").TriggerEvent; name: string }[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function emptySite(): SiteState {
  return { holdingId: "", brandId: "", siteId: "", isNew: false, newName: "", newAddress: "", newCity: "", newCountry: "" };
}

function emptyServices(): ServicesState {
  return {
    projectName: "", client: "", region: "Europe", handoverDate: undefined,
    certifications: [], sqm: "",
    quotationSentDate: undefined, notes: "",
    paymentScheme: "quotation_construction_50_50",
    customSal: [{ pct: "100", trigger: "manual_sal", name: "SAL 1" }],
  };
}

// ─── Component ──────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  /** If provided, wizard opens in "resume potential" mode: prefills Site & Project
   *  from the existing certification row, forces isPotential=false, and on save
   *  deletes the old potential row and re-creates one row per selected cert. */
  resumeCertId?: string;
}

export function NewQuotationWizard({ open, onOpenChange, onSaved, resumeCertId }: Props) {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [step, setStep] = useState<StepNum>(1);
  const [quotationStrategy, setQuotationStrategy] = useState<QuotationStrategy>(null);
  const [site, setSite] = useState<SiteState>(emptySite());
  const [services, setServices] = useState<ServicesState>(emptyServices());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [isPotential, setIsPotential] = useState(false);
  const [projectNameTouched, setProjectNameTouched] = useState(false);
  const [clientTouched, setClientTouched] = useState(false);

  // Per-cert quotation patch helper
  const patchCert = (type: CertType, patch: Partial<CertConfig>) => {
    setServices((s) => ({
      ...s,
      certifications: s.certifications.map((c) => (c.cert_type === type ? { ...c, ...patch } : c)),
    }));
  };


  const { data: holdings = [], isLoading: loadingHoldings } = useHoldings();
  const { data: brands = [], isLoading: loadingBrands } = useBrands(site.holdingId || undefined);
  const { data: sites = [], isLoading: loadingSites } = useSites(site.brandId || undefined);

  // ── Lookup helpers ────────────────────────────────────────────────────────

  const holdingName = holdings.find((h: any) => h.id === site.holdingId)?.name ?? "";
  const brandName = brands.find((b: any) => b.id === site.brandId)?.name ?? "";
  const siteName = site.isNew ? site.newName : (sites.find((s: any) => s.id === site.siteId)?.name ?? "");

  // Auto-fill Project Name from Site Name until the user manually edits it.
  useEffect(() => {
    if (projectNameTouched) return;
    if (!siteName) return;
    setServices((s) => (s.projectName === siteName ? s : { ...s, projectName: siteName }));
  }, [siteName, projectNameTouched]);

  // Auto-fill Client from Brand Name until the user manually edits it.
  useEffect(() => {
    if (clientTouched) return;
    if (!brandName) return;
    setServices((s) => (s.client === brandName ? s : { ...s, client: brandName }));
  }, [brandName, clientTouched]);

  // ── Site handlers ─────────────────────────────────────────────────────────

  const onHoldingChange = (val: string) =>
    setSite({ ...emptySite(), holdingId: val });

  const onBrandChange = (val: string) =>
    setSite((s) => ({ ...s, brandId: val, siteId: "", isNew: false, newName: "", newAddress: "", newCity: "", newCountry: "" }));

  // ── Cert handlers ─────────────────────────────────────────────────────────

  const toggleCert = (type: CertType, checked: boolean) => {
    if (checked) {
      setServices((s) => ({
        ...s,
        certifications: [...s.certifications, emptyCertConfig(type)],
      }));
    } else {
      setServices((s) => ({
        ...s,
        certifications: s.certifications.filter((c) => c.cert_type !== type),
      }));
    }
  };

  const updateCert = (type: CertType, field: keyof Omit<CertConfig, "cert_type" | "flags">, value: string) => {
    setServices((s) => ({
      ...s,
      certifications: s.certifications.map((c) =>
        c.cert_type === type
          ? { ...c, [field]: value, ...(field === "cert_rating" ? { project_subtype: "" } : {}) }
          : c
      ),
    }));
  };

  const updateCertFlag = (type: CertType, flag: keyof MonitoringFlags, value: boolean) => {
    setServices((s) => ({
      ...s,
      certifications: s.certifications.map((c) =>
        c.cert_type === type ? { ...c, flags: { ...c.flags, [flag]: value } } : c
      ),
    }));
  };

  // ── Validation ────────────────────────────────────────────────────────────

  const validateStep1 = (): boolean => {
    const errs: Record<string, string> = {};
    if (!site.holdingId) errs.holdingId = "Select a Holding";
    if (!site.brandId) errs.brandId = "Select a Brand";
    if (!site.isNew && !site.siteId) errs.siteId = "Select a Site or create a new one";
    if (site.isNew && !site.newName.trim()) errs.newName = "Enter a site name";
    if (!services.projectName.trim()) errs.projectName = "Project name is required";
    if (!services.client.trim()) errs.client = "Client is required";
    if (!services.handoverDate) errs.handoverDate = "Handover date is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const validateStep2 = (): boolean => {
    // In Potential mode every field in Step 2 is optional.
    if (isPotential) { setErrors({}); return true; }
    const errs: Record<string, string> = {};
    if (services.certifications.length === 0) errs.certs = "Select at least one certification service";
    services.certifications.forEach((c) => {
      const total = Number(c.total_fees);
      const ok = c.quote_mode === "builder" ? c.builder_applied && total > 0 : total > 0;
      if (!ok) errs[`total_${c.cert_type}`] = `Set a Total Quotation for ${c.cert_type}`;
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Navigation ────────────────────────────────────────────────────────────

  const needsStrategy = () => !isPotential && services.certifications.length > 1;

  const goNext = () => {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    if (step === 3) {
      if (needsStrategy() && !quotationStrategy) {
        setErrors({ strategy: "Choose Unified or Split before continuing" });
        return;
      }
    }
    setStep((s) => {
      let next = (s + 1) as StepNum;
      // Skip Strategy step (3) when only one cert is selected
      if (next === 3 && !needsStrategy()) next = 4;
      return next > 4 ? s : next;
    });
  };

  const goBack = () =>
    setStep((s) => {
      let prev = (s - 1) as StepNum;
      if (prev === 3 && !needsStrategy()) prev = 2;
      return prev < 1 ? s : prev;
    });

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setStep(1);
      setSite(emptySite());
      setServices(emptyServices());
      setErrors({});
      setIsPotential(false);
      setQuotationStrategy(null);
      setProjectNameTouched(false);
      setClientTouched(false);
    }, 300);
  };

  // ── Resume prefill from an existing "potential" certification row ────────
  useEffect(() => {
    if (!open || !resumeCertId) return;
    let cancelled = false;
    (async () => {
      const { data: cert, error } = await supabase
        .from("certifications")
        .select("id, name, client, region, handover_date, site_id, sites(id, brand_id, brands(id, holding_id))")
        .eq("id", resumeCertId)
        .maybeSingle();
      if (error || !cert || cancelled) return;
      const s: any = (cert as any).sites || {};
      const brandId = s.brand_id || "";
      const holdingId = s.brands?.holding_id || "";
      setIsPotential(false);
      setStep(2);
      setSite({
        holdingId,
        brandId,
        siteId: (cert as any).site_id || "",
        isNew: false, newName: "", newAddress: "", newCity: "", newCountry: "",
      });
      setServices((prev) => ({
        ...prev,
        projectName: (cert as any).name || "",
        client: (cert as any).client || "",
        region: (cert as any).region || "Europe",
        handoverDate: (cert as any).handover_date ? new Date((cert as any).handover_date) : undefined,
      }));
      setProjectNameTouched(true);
      setClientTouched(true);
    })();
    return () => { cancelled = true; };
  }, [open, resumeCertId]);

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    try {
      // 1. Create new site if needed
      let resolvedSiteId = site.siteId;
      if (site.isNew) {
        const { data: newSite, error: siteErr } = await supabase
          .from("sites")
          .insert({
            name: site.newName.trim(),
            brand_id: site.brandId,
            address: site.newAddress.trim() || null,
            city: site.newCity.trim() || null,
            country: site.newCountry.trim() || null,
          } as any)
          .select("id")
          .single();
        if (siteErr) throw siteErr;
        resolvedSiteId = newSite.id;
      }

      // If Resume mode, delete the old potential row so we can insert fresh cert rows.
      if (resumeCertId) {
        await supabase.from("certifications").delete().eq("id", resumeCertId);
      }

      const targetStatus = isPotential ? "potential" : "quotation";

      // If Potential mode AND no certifications selected: insert a single skeletal row and exit.
      if (isPotential && services.certifications.length === 0) {
        const { error: pErr } = await supabase.from("certifications").insert({
          name: services.projectName,
          client: services.client,
          region: services.region,
          handover_date: services.handoverDate ? format(services.handoverDate, "yyyy-MM-dd") : null,
          status: "potential",
          pm_id: null,
          site_id: resolvedSiteId,
          cert_type: null,
          score: 0,
          sqm: services.sqm ? Number(services.sqm) : null,
          quotation_notes: services.notes || null,
        } as any);
        if (pErr) throw pErr;
        toast({ title: "Potential saved", description: `${services.projectName} added to Potential Quotations.` });
        handleClose();
        onSaved();
        return;
      }


      const handoverStr = services.handoverDate ? format(services.handoverDate, "yyyy-MM-dd") : null;

      // 1b. Duplicate check within the last 30 seconds (skip for potentials — they may legitimately repeat)
      if (!isPotential) {
        const thirtySecondsAgo = new Date(Date.now() - 30000).toISOString();
        for (const cert of services.certifications) {
          const name = services.certifications.length > 1
            ? `${services.projectName} – ${cert.cert_type}`
            : services.projectName;

          const { data: existing } = await supabase
            .from("certifications")
            .select("id")
            .eq("name", name)
            .eq("client", services.client)
            .eq("status", "quotation")
            .gt("created_at", thirtySecondsAgo)
            .limit(1);

          if (existing && existing.length > 0) {
            toast({
              title: "Duplicate submission blocked",
              description: `A quotation with the name "${name}" for client "${services.client}" was already submitted recently.`,
              variant: "destructive",
            });
            setSaving(false);
            return;
          }
        }
      }

      // 2. Insert one certification row per selected service
      for (const cert of services.certifications) {
        const name = services.certifications.length > 1
          ? `${services.projectName} – ${cert.cert_type}`
          : services.projectName;

        const useBuilder = cert.quote_mode === "builder" && cert.builder_applied;
        const builderComputation = useBuilder ? computeBudget(cert.builder) : null;
        const allocatedHours = builderComputation
          ? Math.round(builderComputation.effort_days * HOURS_PER_DAY * 100) / 100
          : null;

        const { data: insertedCert, error: certErr } = await supabase
          .from("certifications")
          .insert({
            name,
            client: services.client,
            region: services.region,
            handover_date: handoverStr,
            status: targetStatus,
            pm_id: null,
            site_id: resolvedSiteId,
            cert_type: cert.cert_type,
            cert_rating: cert.cert_rating || null,
            cert_level: cert.cert_level || null,
            project_subtype: cert.project_subtype || null,
            level: cert.cert_rating || null,
            score: 0,
            sqm: services.sqm ? Number(services.sqm) : null,
            fgb_monitor: cert.flags.energy, // legacy mirror
            has_iaq_monitoring: cert.flags.iaq,
            has_energy_monitoring: cert.flags.energy,
            has_water_monitoring: cert.flags.water,
            has_hardware_redirection: cert.flags.hardwareRedirect,
            services_fees: cert.services_fees ? Number(cert.services_fees) : null,
            gbci_fees: cert.gbci_fees ? Number(cert.gbci_fees) : null,
            total_fees: cert.total_fees ? Number(cert.total_fees) : null,
            allocated_hours: allocatedHours,
            quotation_sent_date: services.quotationSentDate
              ? format(services.quotationSentDate, "yyyy-MM-dd")
              : null,
            quotation_notes: services.notes || null,
          } as any)
          .select("id")
          .single();
        if (certErr) throw certErr;

        if (useBuilder && builderComputation && insertedCert) {
          await supabase.from("quotation_budget_history" as never).insert({
            certification_id: insertedCert.id,
            total_suggested: builderComputation.suggested_total,
            total_cost: builderComputation.total_cost,
            total_effort_days: builderComputation.effort_days,
            markup_pct: cert.builder.markup_pct,
            breakdown: { state: cert.builder, computation: builderComputation } as never,
          } as never);
        }
      }

      toast({
        title: isPotential ? "Potential saved" : "Quotation saved",
        description: `${services.projectName} added to the ${isPotential ? "Potential" : "Quotation"} pipeline.`,
      });
      handleClose();
      onSaved();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ── Step Indicator ────────────────────────────────────────────────────────

  const StepIndicator = () => (
    <div className="flex items-center gap-0 mb-6">
      {STEPS.map((s, i) => {
        const done = step > s.n;
        const active = step === s.n;
        const Icon = s.icon;
        return (
          <div key={s.n} className="flex items-center flex-1">
            <div className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors",
              done ? "bg-emerald-100 text-emerald-700" : active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            )}>
              {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
              <span>{s.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn("flex-1 h-px mx-1", done ? "bg-emerald-300" : "bg-border")} />
            )}
          </div>
        );
      })}
    </div>
  );

  // ── Step 1: Site & Project ────────────────────────────────────────────────

  const renderStep1 = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-foreground">Where is this project?</h3>
        <p className="text-sm text-muted-foreground mt-0.5">Select the client structure and the site to certify.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-slate-50 rounded-xl border">
        {/* Holding */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Holding *</Label>
          <div className="flex gap-1.5">
            <Select value={site.holdingId} onValueChange={onHoldingChange}>
              <SelectTrigger className={cn("flex-1", errors.holdingId && "border-destructive")}>
                {loadingHoldings ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SelectValue placeholder="Select holding" />}
              </SelectTrigger>
              <SelectContent>{holdings.map((h: any) => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}</SelectContent>
            </Select>
            {isAdmin && (
              <NewHoldingButton onCreated={(id) => setSite({ ...emptySite(), holdingId: id })} />
            )}
          </div>
          {errors.holdingId && <p className="text-xs text-destructive">{errors.holdingId}</p>}
        </div>

        {/* Brand */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Brand *</Label>
          <div className="flex gap-1.5">
            <Select value={site.brandId} onValueChange={onBrandChange} disabled={!site.holdingId}>
              <SelectTrigger className={cn("flex-1", errors.brandId && "border-destructive")}>
                {loadingBrands && site.holdingId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SelectValue placeholder="Select brand" />}
              </SelectTrigger>
              <SelectContent>{brands.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
            {isAdmin && (
              <NewBrandButton
                holdingId={site.holdingId}
                onCreated={(id) => setSite((s) => ({ ...s, brandId: id, siteId: "", isNew: false, newName: "", newAddress: "", newCity: "", newCountry: "" }))}
              />
            )}
          </div>
          {errors.brandId && <p className="text-xs text-destructive">{errors.brandId}</p>}
        </div>

        {/* Site */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Site *</Label>
          {site.isNew ? (
            <div className="space-y-2">
              <div className="flex gap-1.5">
                <Input
                  placeholder="Site name *"
                  value={site.newName}
                  onChange={(e) => setSite((s) => ({ ...s, newName: e.target.value }))}
                  className={cn("flex-1 text-sm", errors.newName && "border-destructive")}
                />
                <Button type="button" variant="outline" size="icon" onClick={() => setSite((s) => ({ ...s, isNew: false, newName: "", newAddress: "", newCity: "", newCountry: "" }))}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Input
                placeholder="Address (street, number)"
                value={site.newAddress}
                onChange={(e) => setSite((s) => ({ ...s, newAddress: e.target.value }))}
                className="text-sm"
              />
              <div className="grid grid-cols-2 gap-1.5">
                <Input placeholder="City" value={site.newCity} onChange={(e) => setSite((s) => ({ ...s, newCity: e.target.value }))} className="text-sm" />
                <Input placeholder="Country" value={site.newCountry} onChange={(e) => setSite((s) => ({ ...s, newCountry: e.target.value }))} className="text-sm" />
              </div>
              {errors.newName && <p className="text-xs text-destructive">{errors.newName}</p>}
            </div>
          ) : (
            <div className="flex gap-1.5">
              <Select
                value={site.siteId}
                onValueChange={(val) => setSite((s) => ({ ...s, siteId: val }))}
                disabled={!site.brandId}
              >
                <SelectTrigger className={cn("flex-1", errors.siteId && "border-destructive")}>
                  {loadingSites && site.brandId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SelectValue placeholder="Select site" />}
                </SelectTrigger>
                <SelectContent>{sites.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
              <Button
                type="button" variant="outline" size="icon"
                onClick={() => setSite((s) => ({ ...s, isNew: true, siteId: "" }))}
                disabled={!site.brandId}
                title="Create new site"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
          {errors.siteId && !site.isNew && <p className="text-xs text-destructive">{errors.siteId}</p>}
        </div>
      </div>

      <Separator />

      <div>
        <h3 className="text-base font-semibold text-foreground">Project details</h3>
        <p className="text-sm text-muted-foreground mt-0.5">Basic information about the project to quote.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Project name *</Label>
          <Input
            placeholder="Auto-filled from Site name — edit if needed"
            value={services.projectName}
            onChange={(e) => {
              setProjectNameTouched(true);
              setServices((s) => ({ ...s, projectName: e.target.value }));
            }}
            className={cn(errors.projectName && "border-destructive")}
          />
          {errors.projectName && <p className="text-xs text-destructive">{errors.projectName}</p>}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Client *</Label>
          <Input
            placeholder="Auto-filled from Brand — edit if needed"
            value={services.client}
            onChange={(e) => {
              setClientTouched(true);
              setServices((s) => ({ ...s, client: e.target.value }));
            }}
            className={cn(errors.client && "border-destructive")}
          />
          {errors.client && <p className="text-xs text-destructive">{errors.client}</p>}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Region</Label>
          <Select value={services.region} onValueChange={(v) => setServices((s) => ({ ...s, region: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{REGIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Estimated handover *</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn("w-full justify-start text-left font-normal", !services.handoverDate && "text-muted-foreground", errors.handoverDate && "border-destructive")}
              >
                <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                {services.handoverDate ? format(services.handoverDate, "dd MMM yyyy") : "Select date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <MonthYearCalendar mode="single" selected={services.handoverDate} onSelect={(d) => setServices((s) => ({ ...s, handoverDate: d }))} initialFocus className="p-3" />
            </PopoverContent>
          </Popover>
          {errors.handoverDate && <p className="text-xs text-destructive">{errors.handoverDate}</p>}
        </div>
      </div>
    </div>
  );

  // ── Step 2: Services & Quotation ──────────────────────────────────────────

  const renderStep2 = () => (
    <div className="space-y-6">
      {/* Cert type selection */}
      <div>
        <h3 className="text-base font-semibold text-foreground">Which certifications to quote?</h3>
        <p className="text-sm text-muted-foreground mt-0.5">Select one or more services. Each will have its own certification path.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {AVAILABLE_CERTS.map((type) => {
          const selected = services.certifications.some((c) => c.cert_type === type);
          return (
            <button
              key={type}
              type="button"
              onClick={() => toggleCert(type, !selected)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium transition-all",
                selected
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-background text-muted-foreground border-border hover:bg-muted"
              )}
            >
              {selected && <CheckCircle2 className="h-3.5 w-3.5" />}
              {CERT_DISPLAY_LABELS[type] ?? type}
            </button>
          );
        })}
      </div>
      {errors.certs && <p className="text-xs text-destructive">{errors.certs}</p>}

      {/* Per-cert config */}
      {services.certifications.length > 0 && (
        <div className="space-y-3">
          {services.certifications.map((cert) => {
            const levels = CERT_LEVELS[cert.cert_type] ?? [];
            const ratings = getRatings(cert.cert_type);
            const subtypes = cert.cert_rating ? getSubtypes(cert.cert_type, cert.cert_rating) : [];
            return (
              <Card key={cert.cert_type} className="border-primary/20">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Badge variant="secondary" className="font-bold">{CERT_DISPLAY_LABELS[cert.cert_type] ?? cert.cert_type}</Badge>
                    <span className="text-xs text-muted-foreground">Configure this certification</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Rating System</Label>
                      <Select value={cert.cert_rating} onValueChange={(v) => updateCert(cert.cert_type, "cert_rating", v)} disabled={ratings.length === 0}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder={ratings.length === 0 ? "N/A" : "Select"} /></SelectTrigger>
                        <SelectContent>{ratings.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Target Level</Label>
                      <Select value={cert.cert_level} onValueChange={(v) => updateCert(cert.cert_type, "cert_level", v)} disabled={levels.length === 0}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder={levels.length === 0 ? "N/A" : "Select"} /></SelectTrigger>
                        <SelectContent>{levels.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Subtype</Label>
                      <Select value={cert.project_subtype} onValueChange={(v) => updateCert(cert.cert_type, "project_subtype", v)} disabled={subtypes.length === 0}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder={subtypes.length === 0 ? "Select rating first" : "Select"} /></SelectTrigger>
                        <SelectContent>{subtypes.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Monitoring services */}
                  {(showsIaqEnergyWater(cert.cert_type) || showsEnergyRedirect(cert.cert_type)) && (
                    <div className="mt-4 pt-3 border-t border-border/50">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Monitoring services</p>
                      <div className="flex flex-wrap gap-x-5 gap-y-2">
                        {showsIaqEnergyWater(cert.cert_type) && (
                          <>
                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                              <Checkbox checked={cert.flags.iaq} onCheckedChange={(v) => updateCertFlag(cert.cert_type, "iaq", !!v)} />
                              ClAir IAQ
                            </label>
                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                              <Checkbox checked={cert.flags.energy} onCheckedChange={(v) => updateCertFlag(cert.cert_type, "energy", !!v)} />
                              Greeny Energy
                            </label>
                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                              <Checkbox checked={cert.flags.water} onCheckedChange={(v) => updateCertFlag(cert.cert_type, "water", !!v)} />
                              Water
                            </label>
                          </>
                        )}
                        {showsEnergyRedirect(cert.cert_type) && (
                          <>
                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                              <Checkbox checked={cert.flags.energy} onCheckedChange={(v) => updateCertFlag(cert.cert_type, "energy", !!v)} />
                              Greeny Energy
                            </label>
                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                              <Checkbox checked={cert.flags.hardwareRedirect} onCheckedChange={(v) => updateCertFlag(cert.cert_type, "hardwareRedirect", !!v)} />
                              Hardware Redirection
                            </label>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Per-cert Quotation Value */}
                  <div className="mt-4 pt-3 border-t border-border/50 space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Quotation value · {CERT_DISPLAY_LABELS[cert.cert_type] ?? cert.cert_type}</p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Services Fees (€)</Label>
                        <Input type="number" className="h-8 text-sm" placeholder="e.g. 15,000"
                          value={cert.services_fees}
                          onChange={(e) => patchCert(cert.cert_type, { services_fees: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">GBCI / IWBI Fees (€)</Label>
                        <Input type="number" className="h-8 text-sm" placeholder="e.g. 5,000"
                          value={cert.gbci_fees}
                          onChange={(e) => patchCert(cert.cert_type, { gbci_fees: e.target.value })} />
                      </div>
                    </div>

                    <RadioGroup
                      value={cert.quote_mode}
                      onValueChange={(v) => patchCert(cert.cert_type, {
                        quote_mode: v as "direct" | "builder",
                        ...(v === "direct" ? { builder_applied: false } : {}),
                      })}
                      className="grid grid-cols-1 sm:grid-cols-2 gap-2"
                    >
                      <label className={cn(
                        "flex items-center gap-2 rounded-lg border p-2.5 cursor-pointer transition-colors",
                        cert.quote_mode === "direct" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                      )}>
                        <RadioGroupItem value="direct" />
                        <span className="text-sm font-medium">Direct Input</span>
                      </label>
                      <label className={cn(
                        "flex items-center gap-2 rounded-lg border p-2.5 cursor-pointer transition-colors",
                        cert.quote_mode === "builder" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                      )}>
                        <RadioGroupItem value="builder" />
                        <Calculator className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">FTE & Budget Builder</span>
                      </label>
                    </RadioGroup>

                    {cert.quote_mode === "direct" ? (
                      <div className="space-y-1 max-w-xs">
                        <Label className="text-xs font-medium">Total Quotation (€) *</Label>
                        <Input
                          type="number"
                          placeholder="e.g. 20,000"
                          className={cn("h-8 text-sm", errors[`total_${cert.cert_type}`] && "border-destructive")}
                          value={cert.total_fees}
                          onChange={(e) => patchCert(cert.cert_type, { total_fees: e.target.value })}
                        />
                        {errors[`total_${cert.cert_type}`] && (
                          <p className="text-xs text-destructive">{errors[`total_${cert.cert_type}`]}</p>
                        )}
                      </div>
                    ) : (
                      <>
                        {cert.builder_applied && cert.total_fees && (
                          <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm">
                            <span className="font-medium text-emerald-800">Applied: €{Number(cert.total_fees).toLocaleString()}</span>
                            <span className="text-emerald-700 ml-2 text-xs">— recompute and click "Use this value" again to update.</span>
                          </div>
                        )}
                        <QuotationBudgetBuilder
                          state={cert.builder}
                          onChange={(b) => patchCert(cert.cert_type, { builder: b })}
                          hasIaq={cert.flags.iaq}
                          hasEnergy={cert.flags.energy}
                          onApply={(suggested, gbciFees) => {
                            patchCert(cert.cert_type, {
                              total_fees: String(suggested),
                              gbci_fees: gbciFees > 0 ? String(gbciFees) : cert.gbci_fees,
                              builder_applied: true,
                            });
                          }}
                        />
                        {errors[`total_${cert.cert_type}`] && (
                          <p className="text-xs text-destructive">{errors[`total_${cert.cert_type}`]}</p>
                        )}
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Separator />

      {/* Quotation details */}
      <div>
        <h3 className="text-base font-semibold text-foreground">Quotation details</h3>
        <p className="text-sm text-muted-foreground mt-0.5">Fill in the commercial information. All fields are optional at this stage.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Area (sqm)</Label>
          <Input type="number" placeholder="e.g. 1500" value={services.sqm} onChange={(e) => setServices((s) => ({ ...s, sqm: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Quotation sent date</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-full justify-start text-left font-normal text-sm", !services.quotationSentDate && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                {services.quotationSentDate ? format(services.quotationSentDate, "dd MMM yyyy") : "Not sent yet"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <MonthYearCalendar mode="single" selected={services.quotationSentDate} onSelect={(d) => setServices((s) => ({ ...s, quotationSentDate: d }))} initialFocus className="p-3" />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Commercial notes</Label>
        <Textarea
          placeholder="Any notes about this quotation..."
          className="min-h-[72px] text-sm"
          value={services.notes}
          onChange={(e) => setServices((s) => ({ ...s, notes: e.target.value }))}
        />
      </div>
    </div>
  );

  // ── Step 3: Review ────────────────────────────────────────────────────────

  const renderStep3 = () => (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-foreground">Review before saving</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Once saved, the quotation will appear in the <strong>Quotation</strong> pipeline. A PM will be assigned only after the client confirms.
        </p>
      </div>

      {/* Site */}
      <Card className="border-slate-200">
        <CardContent className="pt-4 pb-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Site</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span className="text-muted-foreground">Holding</span>
            <span className="font-medium">{holdingName}</span>
            <span className="text-muted-foreground">Brand</span>
            <span className="font-medium">{brandName}</span>
            <span className="text-muted-foreground">Site</span>
            <span className="font-medium">{siteName}{site.isNew ? " (new)" : ""}</span>
          </div>
        </CardContent>
      </Card>

      {/* Project */}
      <Card className="border-slate-200">
        <CardContent className="pt-4 pb-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Project</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
            <div><p className="text-muted-foreground text-xs">Name</p><p className="font-medium">{services.projectName}</p></div>
            <div><p className="text-muted-foreground text-xs">Client</p><p className="font-medium">{services.client}</p></div>
            <div><p className="text-muted-foreground text-xs">Region</p><p className="font-medium">{services.region}</p></div>
            <div><p className="text-muted-foreground text-xs">Handover</p><p className="font-medium">{services.handoverDate ? format(services.handoverDate, "dd MMM yyyy") : "—"}</p></div>
          </div>
        </CardContent>
      </Card>

      {/* Services */}
      <Card className="border-slate-200">
        <CardContent className="pt-4 pb-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Services to certify</p>
          {services.certifications.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No services selected.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {services.certifications.map((c) => {
                const monitoring = [
                  c.flags.iaq && "IAQ",
                  c.flags.energy && "Energy",
                  c.flags.water && "Water",
                  c.flags.hardwareRedirect && "HW Redirect",
                ].filter(Boolean) as string[];
                return (
                  <div key={c.cert_type} className="px-3 py-1.5 rounded-lg border bg-primary/5 border-primary/20 text-sm">
                    <span className="font-semibold text-primary">{CERT_DISPLAY_LABELS[c.cert_type] ?? c.cert_type}</span>
                    {c.cert_rating && <span className="text-muted-foreground ml-1">· {c.cert_rating}</span>}
                    {c.cert_level && <span className="text-muted-foreground ml-1">· {c.cert_level}</span>}
                    {c.project_subtype && <span className="text-muted-foreground ml-1">· {c.project_subtype}</span>}
                    {monitoring.length > 0 && (
                      <span className="ml-2 text-emerald-700">· {monitoring.join(" + ")}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quotation per certification */}
      {services.certifications.length > 0 && (
        <Card className="border-blue-200 bg-blue-50/30">
          <CardContent className="pt-4 pb-3 space-y-3">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Quotation</p>
            {services.sqm && <p className="text-xs text-muted-foreground">Area: <span className="font-medium text-foreground">{services.sqm} sqm</span>{services.quotationSentDate && <> · Sent on <span className="font-medium text-foreground">{format(services.quotationSentDate, "dd MMM yyyy")}</span></>}</p>}
            <div className="space-y-2">
              {services.certifications.map((c) => (
                <div key={c.cert_type} className="rounded-md border bg-background/60 p-2.5">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="secondary" className="font-bold">{CERT_DISPLAY_LABELS[c.cert_type] ?? c.cert_type}</Badge>
                    <span className="text-[11px] text-muted-foreground">{c.quote_mode === "builder" ? "Builder" : "Direct"}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div><p className="text-muted-foreground">Services</p><p className="font-medium">{c.services_fees ? `€${Number(c.services_fees).toLocaleString()}` : "—"}</p></div>
                    <div><p className="text-muted-foreground">GBCI</p><p className="font-medium">{c.gbci_fees ? `€${Number(c.gbci_fees).toLocaleString()}` : "—"}</p></div>
                    <div><p className="text-muted-foreground">Total</p><p className="font-semibold text-foreground">{c.total_fees ? `€${Number(c.total_fees).toLocaleString()}` : "—"}</p></div>
                  </div>
                </div>
              ))}
            </div>
            {services.notes && <p className="text-xs text-muted-foreground mt-2 italic">"{services.notes}"</p>}
          </CardContent>
        </Card>
      )}

      {/* No PM notice */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
        <span className="mt-0.5 text-base">ℹ️</span>
        <span>No Project Manager will be assigned at this stage. A PM is assigned only after the client signs the contract and the quotation is confirmed.</span>
      </div>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">New Quotation</DialogTitle>
          <DialogDescription>
            Create a site and define the certification services to quote. A PM will be assigned after confirmation.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          <StepIndicator />

          <div className="min-h-[300px]">
            {step === 1 && renderStep1()}
            {step === 2 && renderStep2()}
            {step === 3 && renderStep3()}
          </div>

          {/* Footer */}
          <div className="flex flex-col gap-3 mt-6 pt-4 border-t">
            {step === 1 && !resumeCertId && (
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={isPotential}
                  onChange={(e) => setIsPotential(e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                <span>Save as <strong>Potential</strong> — Site &amp; Project is enough; Services &amp; Quote become optional and can be completed later.</span>
              </label>
            )}
            <div className="flex items-center justify-between">
              <Button type="button" variant="outline" onClick={step === 1 ? handleClose : goBack} className="gap-1.5">
                {step === 1 ? "Cancel" : <><ChevronLeft className="h-4 w-4" /> Back</>}
              </Button>
              <div className="flex items-center gap-2">
                {isPotential && step > 1 && !resumeCertId && (
                  <Button type="button" variant="outline" onClick={handleSave} disabled={saving} className="gap-1.5">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Save as Potential
                  </Button>
                )}
                {step < 3 ? (
                  <Button type="button" onClick={goNext} className="gap-1.5">
                    Continue <ChevronRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className={cn("gap-1.5 px-6", isPotential ? "bg-slate-700 hover:bg-slate-800" : "bg-emerald-600 hover:bg-emerald-700")}
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    {isPotential ? "Save as Potential" : (resumeCertId ? "Confirm Quotation" : "Save Quotation")}
                  </Button>
                )}
              </div>
            </div>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}

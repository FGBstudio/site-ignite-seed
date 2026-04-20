import { useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useHoldings, useBrands, useSites } from "@/hooks/useProjectDetails";
import { RATING_SYSTEMS, RATING_SUBTYPES, type RatingSystem } from "@/data/ratingSubtypes";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { PAYMENT_SCHEMES, TRIGGER_LABELS, generateTranches, validateCustomTranches, type PaymentSchemeId, type TriggerEvent } from "@/lib/paymentSchemes";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  CalendarIcon, Plus, Loader2, CheckCircle2, Building2, Award,
  ChevronRight, ChevronLeft, X,
} from "lucide-react";

// ─── Constants ──────────────────────────────────────────────────────────────

const REGIONS = ["Europe", "America", "APAC", "ME"] as const;
const AVAILABLE_CERTS = ["LEED", "WELL", "BREEAM", "ESG", "GRESB"] as const;
type CertType = (typeof AVAILABLE_CERTS)[number];

const CERT_LEVELS: Record<CertType, string[]> = {
  LEED: ["Certified", "Silver", "Gold", "Platinum"],
  WELL: ["Bronze", "Silver", "Gold", "Platinum"],
  BREEAM: ["Pass", "Good", "Very Good", "Excellent", "Outstanding"],
  ESG: [],
  GRESB: [],
};

const STEPS = [
  { n: 1 as const, label: "Site & Project", icon: Building2 },
  { n: 2 as const, label: "Services & Quote", icon: Award },
  { n: 3 as const, label: "Review", icon: CheckCircle2 },
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

interface CertConfig {
  cert_type: CertType;
  cert_rating: string;
  cert_level: string;
  project_subtype: string;
}

interface ServicesState {
  projectName: string;
  client: string;
  region: string;
  handoverDate: Date | undefined;
  certifications: CertConfig[];
  sqm: string;
  servicesFees: string;
  gbciFees: string;
  totalFees: string;
  quotationSentDate: Date | undefined;
  fgbMonitor: boolean;
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
    certifications: [], sqm: "", servicesFees: "", gbciFees: "", totalFees: "",
    quotationSentDate: undefined, fgbMonitor: false, notes: "",
    paymentScheme: "quotation_construction_50_50",
    customSal: [{ pct: "100", trigger: "manual_sal", name: "SAL 1" }],
  };
}

// ─── Component ──────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function NewQuotationWizard({ open, onOpenChange, onSaved }: Props) {
  const { toast } = useToast();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [site, setSite] = useState<SiteState>(emptySite());
  const [services, setServices] = useState<ServicesState>(emptyServices());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const { data: holdings = [], isLoading: loadingHoldings } = useHoldings();
  const { data: brands = [], isLoading: loadingBrands } = useBrands(site.holdingId || undefined);
  const { data: sites = [], isLoading: loadingSites } = useSites(site.brandId || undefined);

  // ── Lookup helpers ────────────────────────────────────────────────────────

  const holdingName = holdings.find((h: any) => h.id === site.holdingId)?.name ?? "";
  const brandName = brands.find((b: any) => b.id === site.brandId)?.name ?? "";
  const siteName = site.isNew ? site.newName : (sites.find((s: any) => s.id === site.siteId)?.name ?? "");

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
        certifications: [...s.certifications, { cert_type: type, cert_rating: "", cert_level: "", project_subtype: "" }],
      }));
    } else {
      setServices((s) => ({
        ...s,
        certifications: s.certifications.filter((c) => c.cert_type !== type),
      }));
    }
  };

  const updateCert = (type: CertType, field: keyof Omit<CertConfig, "cert_type">, value: string) => {
    setServices((s) => ({
      ...s,
      certifications: s.certifications.map((c) =>
        c.cert_type === type
          ? { ...c, [field]: value, ...(field === "cert_rating" ? { project_subtype: "" } : {}) }
          : c
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
    const errs: Record<string, string> = {};
    if (services.certifications.length === 0) errs.certs = "Select at least one certification service";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Navigation ────────────────────────────────────────────────────────────

  const goNext = () => {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    setStep((s) => (s < 3 ? (s + 1) as 1 | 2 | 3 : s));
  };

  const goBack = () => setStep((s) => (s > 1 ? (s - 1) as 1 | 2 | 3 : s));

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setStep(1);
      setSite(emptySite());
      setServices(emptyServices());
      setErrors({});
    }, 300);
  };

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

      const handoverStr = format(services.handoverDate!, "yyyy-MM-dd");

      // 2. Insert one certification row per selected service
      for (const cert of services.certifications) {
        const name = services.certifications.length > 1
          ? `${services.projectName} – ${cert.cert_type}`
          : services.projectName;

        await supabase.from("certifications").insert({
          name,
          client: services.client,
          region: services.region,
          handover_date: handoverStr,
          status: "quotation",
          pm_id: null,
          site_id: resolvedSiteId,
          cert_type: cert.cert_type,
          cert_rating: cert.cert_rating || null,
          cert_level: cert.cert_level || null,
          project_subtype: cert.project_subtype || null,
          level: cert.cert_rating || null,
          score: 0,
          sqm: services.sqm ? Number(services.sqm) : null,
          fgb_monitor: services.fgbMonitor,
          services_fees: services.servicesFees ? Number(services.servicesFees) : null,
          gbci_fees: services.gbciFees ? Number(services.gbciFees) : null,
          total_fees: services.totalFees ? Number(services.totalFees) : null,
          quotation_sent_date: services.quotationSentDate
            ? format(services.quotationSentDate, "yyyy-MM-dd")
            : null,
          quotation_notes: services.notes || null,
        } as any);
      }

      toast({ title: "Quotation saved", description: `${services.projectName} added to the Quotation pipeline.` });
      onSaved();
      handleClose();
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
          <Select value={site.holdingId} onValueChange={onHoldingChange}>
            <SelectTrigger className={cn(errors.holdingId && "border-destructive")}>
              {loadingHoldings ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SelectValue placeholder="Select holding" />}
            </SelectTrigger>
            <SelectContent>{holdings.map((h: any) => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}</SelectContent>
          </Select>
          {errors.holdingId && <p className="text-xs text-destructive">{errors.holdingId}</p>}
        </div>

        {/* Brand */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Brand *</Label>
          <Select value={site.brandId} onValueChange={onBrandChange} disabled={!site.holdingId}>
            <SelectTrigger className={cn(errors.brandId && "border-destructive")}>
              {loadingBrands && site.holdingId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SelectValue placeholder="Select brand" />}
            </SelectTrigger>
            <SelectContent>{brands.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
          </Select>
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
            placeholder="e.g. Prada Milan Flagship"
            value={services.projectName}
            onChange={(e) => setServices((s) => ({ ...s, projectName: e.target.value }))}
            className={cn(errors.projectName && "border-destructive")}
          />
          {errors.projectName && <p className="text-xs text-destructive">{errors.projectName}</p>}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Client *</Label>
          <Input
            placeholder="e.g. Prada Group"
            value={services.client}
            onChange={(e) => setServices((s) => ({ ...s, client: e.target.value }))}
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
              <Calendar mode="single" selected={services.handoverDate} onSelect={(d) => setServices((s) => ({ ...s, handoverDate: d }))} initialFocus className="p-3" />
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
              {type}
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
            const subtypes = cert.cert_rating && RATING_SUBTYPES[cert.cert_rating as RatingSystem]
              ? RATING_SUBTYPES[cert.cert_rating as RatingSystem]
              : [];
            return (
              <Card key={cert.cert_type} className="border-primary/20">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Badge variant="secondary" className="font-bold">{cert.cert_type}</Badge>
                    <span className="text-xs text-muted-foreground">Configure this certification</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Rating System</Label>
                      <Select value={cert.cert_rating} onValueChange={(v) => updateCert(cert.cert_type, "cert_rating", v)}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>{RATING_SYSTEMS.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Area (sqm)</Label>
          <Input type="number" placeholder="e.g. 1500" value={services.sqm} onChange={(e) => setServices((s) => ({ ...s, sqm: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Services Fees (€)</Label>
          <Input type="number" placeholder="e.g. 15,000" value={services.servicesFees} onChange={(e) => setServices((s) => ({ ...s, servicesFees: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">GBCI Fees (€)</Label>
          <Input type="number" placeholder="e.g. 5,000" value={services.gbciFees} onChange={(e) => setServices((s) => ({ ...s, gbciFees: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Total Fees (€)</Label>
          <Input type="number" placeholder="e.g. 20,000" value={services.totalFees} onChange={(e) => setServices((s) => ({ ...s, totalFees: e.target.value }))} />
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
              <Calendar mode="single" selected={services.quotationSentDate} onSelect={(d) => setServices((s) => ({ ...s, quotationSentDate: d }))} initialFocus className="p-3" />
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex items-center gap-3 pt-5">
          <Checkbox
            id="fgb-monitor"
            checked={services.fgbMonitor}
            onCheckedChange={(v) => setServices((s) => ({ ...s, fgbMonitor: !!v }))}
          />
          <Label htmlFor="fgb-monitor" className="text-sm cursor-pointer">FGB Monitor</Label>
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
              {services.certifications.map((c) => (
                <div key={c.cert_type} className="px-3 py-1.5 rounded-lg border bg-primary/5 border-primary/20 text-sm">
                  <span className="font-semibold text-primary">{c.cert_type}</span>
                  {c.cert_rating && <span className="text-muted-foreground ml-1">· {c.cert_rating}</span>}
                  {c.cert_level && <span className="text-muted-foreground ml-1">· {c.cert_level}</span>}
                  {c.project_subtype && <span className="text-muted-foreground ml-1">· {c.project_subtype}</span>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quotation */}
      {(services.totalFees || services.servicesFees || services.gbciFees || services.quotationSentDate || services.notes) && (
        <Card className="border-blue-200 bg-blue-50/30">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-2">Quotation</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
              {services.servicesFees && <div><p className="text-muted-foreground text-xs">Services fees</p><p className="font-medium">€{Number(services.servicesFees).toLocaleString()}</p></div>}
              {services.gbciFees && <div><p className="text-muted-foreground text-xs">GBCI fees</p><p className="font-medium">€{Number(services.gbciFees).toLocaleString()}</p></div>}
              {services.totalFees && <div><p className="text-muted-foreground text-xs">Total fees</p><p className="font-semibold text-foreground">€{Number(services.totalFees).toLocaleString()}</p></div>}
              {services.quotationSentDate && <div><p className="text-muted-foreground text-xs">Sent on</p><p className="font-medium">{format(services.quotationSentDate, "dd MMM yyyy")}</p></div>}
              {services.sqm && <div><p className="text-muted-foreground text-xs">Area</p><p className="font-medium">{services.sqm} sqm</p></div>}
              {services.fgbMonitor && <div><p className="text-muted-foreground text-xs">FGB Monitor</p><p className="font-medium">Yes</p></div>}
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
          <div className="flex items-center justify-between mt-6 pt-4 border-t">
            <Button type="button" variant="outline" onClick={step === 1 ? handleClose : goBack} className="gap-1.5">
              {step === 1 ? "Cancel" : <><ChevronLeft className="h-4 w-4" /> Back</>}
            </Button>
            {step < 3 ? (
              <Button type="button" onClick={goNext} className="gap-1.5">
                Continue <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button type="button" onClick={handleSave} disabled={saving} className="gap-1.5 px-6 bg-emerald-600 hover:bg-emerald-700">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Save Quotation
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

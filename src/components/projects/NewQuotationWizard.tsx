import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useHoldings, useBrands, useSites } from "@/hooks/useProjectDetails";
import { useAuth } from "@/contexts/AuthContext";
import { NewHoldingButton, NewBrandButton } from "@/components/projects/BrandHoldingCreator";
import { useCertCatalog } from "@/hooks/useCertCatalog";
import {
  agganciodaValore,
  A_SCADENZA,
  ALL_APPROVAZIONE,
  chiaveTimeline,
  proponiPasso,
  usePassiTimeline,
  valoreAggancio,
  type PassoTimeline,
} from "@/hooks/useTimelineServizio";
import { useEmittenti } from "@/hooks/useOfferta";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { PAYMENT_SCHEMES, generateTranches, validateCustomTranches, type PaymentSchemeId, type TriggerEvent } from "@/lib/paymentSchemes";

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
  ChevronRight, ChevronLeft, X, Calculator, Receipt, Trash2,
} from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { QuotationBudgetBuilder } from "@/components/projects/QuotationBudgetBuilder";
import { CurrencySelect, EurHint } from "@/components/common/Money";
import { useFxRates } from "@/hooks/useFxRates";
import { currencySymbol, formatMoney, eurEquivalent } from "@/lib/currency";
import {
  type BudgetBuilderState,
  emptyBuilder,
  computeBudget,
  HOURS_PER_DAY,
} from "@/lib/quotationBudget";

// ─── Constants ──────────────────────────────────────────────────────────────

const REGIONS = ["Europe", "America", "APAC", "ME"] as const;
/**
 * Gli schemi quotabili.
 *
 * `Air` ed `Energy` stanno qui accanto a LEED perché esistono progetti in cui
 * il monitoraggio È il progetto: nessuna certificazione ambientale, solo i
 * sensori. Oggi sono 81 in tabella, tutti di tipo Energy, nati prima che il
 * tipo Air esistesse.
 *
 * Da non confondere con le caselle "Monitoring services" più sotto: quelle
 * dicono che un progetto LEED comprende ANCHE il monitoraggio. Il tipo dice
 * che il monitoraggio è tutto il progetto.
 */
/**
 * Gli schemi offerti in quotazione vengono da `cert_catalog`, la stessa tabella
 * che il database usa per rifiutare le combinazioni inventate. Prima erano una
 * lista fissa qui, una diversa nel form progetto, una terza nei template e una
 * quarta nel vincolo CHECK — e nessuna coincideva con le altre.
 */
type CertType = string;

const CERT_DISPLAY_LABELS: Record<string, string> = {
  LEED: "LEED",
  WELL: "WELL",
  BREEAM: "BREEAM",
  ESG: "Taxonomy ESG",
  GRESB: "GRESB",
  Energy_Audit: "Energy Audit",
  Air: "Air — ClAir IAQ",
  Energy: "Energy — Greeny",
};

/** Le medaglie previste da ogni schema. Vuoto = lo schema non ne ha. */
const CERT_LEVELS: Record<CertType, string[]> = {
  LEED: ["Certified", "Silver", "Gold", "Platinum"],
  WELL: ["Bronze", "Silver", "Gold", "Platinum"],
  BREEAM: ["Pass", "Good", "Very Good", "Excellent", "Outstanding"],
  ESG: [],
  GRESB: [],
  Energy_Audit: [],
  Air: [],
  Energy: [],
};

type QuotationStrategy = "single" | "split" | null;
type StepNum = 1 | 2 | 3 | 4 | 5;

const STEPS = [
  { n: 1 as const, label: "Site & Project", icon: Building2 },
  { n: 2 as const, label: "Services & Quote", icon: Award },
  { n: 3 as const, label: "Strategy", icon: Calculator },
  { n: 4 as const, label: "Payments", icon: Receipt },
  { n: 5 as const, label: "Review", icon: CheckCircle2 },
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

/**
 * Quanti dispositivi promette l'offerta, quando l'offerta lo dice.
 *
 * Spuntare la casella È già la richiesta — vale come se l'avesse fatta il PM.
 * Il numero, se c'è, decide cosa succede all'approvazione: con un numero il
 * progetto entra subito anche nel Monitor con quella quantità; senza, entra
 * solo in Operations e sarà il PM a formulare la richiesta più avanti.
 *
 * Stringa e non numero perché il campo può restare vuoto, ed è proprio il
 * vuoto a portare l'informazione "non lo sappiamo ancora".
 */
interface MonitoringQuantities {
  iaq: string;
  energy: string;
  water: string;
}

const emptyQuantities = (): MonitoringQuantities => ({ iaq: "", energy: "", water: "" });

/** Il numero digitato, o null se il campo è vuoto o non è un numero valido. */
const parseQuantity = (raw: string): number | null => {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

interface CertConfig {
  cert_type: CertType;
  cert_rating: string;
  cert_level: string;
  project_subtype: string;
  flags: MonitoringFlags;
  quantities: MonitoringQuantities;
  // Quotation fields per certification
  services_fees: string;
  gbci_fees: string;
  total_fees: string;
  quote_mode: "direct" | "builder";
  builder: BudgetBuilderState;
  builder_applied: boolean;
  /**
   * How this certification gets invoiced.
   *
   * Per certification and not per quotation: one offer can carry a hardware
   * supply paid in full at signing next to a LEED paid in three steps, and
   * they hang from different milestones because they are different jobs.
   */
  paymentScheme: PaymentSchemeId;
  /** The tranches themselves — seeded from the scheme, then editable. */
  tranches: TrancheDraft[];
}

interface TrancheDraft {
  name: string;
  pct: string;
  /**
   * L'intenzione dichiarata dallo schema: firma, fine design, fine costruzione.
   *
   * Serve solo a proporre il passo giusto quando la timeline del servizio si
   * carica. Non è l'aggancio: l'aggancio è `stepOrder`.
   */
  trigger: TriggerEvent;
  /**
   * Il passo della timeline del servizio a cui la tranche è appesa.
   *
   * È questo che diventa `cert_payment_milestones.step_id`, ed è l'unica cosa
   * che permetta al sistema di sbloccare la fattura quando il PM chiude
   * l'attività. Nullo vuol dire «a scadenza, non legata a un'attività»: una
   * scelta legittima, ma esplicita.
   */
  stepOrder: number | null;
}

/** A scheme's own tranches, turned into editable rows. */
function tranchesDaSchema(scheme: PaymentSchemeId): TrancheDraft[] {
  const def = PAYMENT_SCHEMES[scheme];
  if (def.isCustom) return [{ name: "SAL 1", pct: "100", trigger: "manual_sal", stepOrder: null }];
  return def.tranches.map((t) => ({
    name: t.name,
    pct: String(t.pct),
    trigger: t.trigger,
    // Il passo si propone quando la timeline è nota, non qui: qui il servizio
    // può non essere ancora stato scelto.
    stepOrder: null,
  }));
}

/**
 * L'intenzione dello schema, tradotta nel momento che `proponiPasso` capisce.
 *
 * `quotation_signed` non ha un momento: l'anticipo non aspetta una milestone,
 * lo sblocca il «Mark as approved» dell'offerta. Resta senza passo, ed è così
 * che il trigger del database lo riconosce.
 */
const MOMENTO_DI: Record<TriggerEvent, "design" | "costruzione" | "sottomissione" | null> = {
  quotation_signed: null,
  design_end: "design",
  construction_end: "costruzione",
  submission: "sottomissione",
  manual_sal: null,
};


function emptyFlags(): MonitoringFlags {
  return { iaq: false, energy: false, water: false, hardwareRedirect: false };
}

/**
 * Un servizio di monitoraggio nell'offerta: se serve, e quanti.
 *
 * Il campo della quantità compare solo a servizio spuntato, perché "quanti" ha
 * senso soltanto dopo aver detto "sì". Restare vuoto è una risposta legittima e
 * significa "servono, ma il numero lo definirà il PM".
 */
function MonitoringService({
  label,
  checked,
  quantity,
  onToggle,
  onQuantity,
}: {
  label: string;
  checked: boolean;
  quantity: string;
  onToggle: (value: boolean) => void;
  onQuantity: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <Checkbox checked={checked} onCheckedChange={(v) => onToggle(!!v)} />
        {label}
      </label>
      {checked && (
        <Input
          value={quantity}
          onChange={(e) => onQuantity(e.target.value)}
          placeholder="qty"
          inputMode="numeric"
          className="h-7 w-16 text-xs text-center"
          aria-label={`Quantity for ${label}`}
        />
      )}
    </div>
  );
}

function emptyCertConfig(type: CertType): CertConfig {
  return {
    cert_type: type,
    cert_rating: "",
    cert_level: "",
    project_subtype: "",
    flags: emptyFlags(),
    quantities: emptyQuantities(),
    services_fees: "",
    gbci_fees: "",
    total_fees: "",
    quote_mode: "direct",
    builder: emptyBuilder(),
    builder_applied: false,
    // La fornitura hardware si paga tutta alla firma; tutto il resto parte
    // dallo schema piu' comune e si cambia in un clic.
    paymentScheme: type === "Energy" || type === "Air" ? "signature_100" : "quotation_construction_50_50",
    tranches: tranchesDaSchema(
      type === "Energy" || type === "Air" ? "signature_100" : "quotation_construction_50_50",
    ),
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
  const catalog = useCertCatalog();
  const [step, setStep] = useState<StepNum>(1);
  const [quotationStrategy, setQuotationStrategy] = useState<QuotationStrategy>(null);
  const [site, setSite] = useState<SiteState>(emptySite());
  const [services, setServices] = useState<ServicesState>(emptyServices());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  /**
   * La valuta e' dell'OFFERTA, non della singola certificazione: un'offerta
   * unificata su piu' schemi e' un solo documento e un solo importo per il
   * cliente, e mescolare valute al suo interno renderebbe il totale
   * insommabile.
   *
   * La costruzione FTE e hardware resta in euro: sono i nostri costi.
   */
  const [currency, setCurrency] = useState("EUR");
  const { data: fxRates = [] } = useFxRates();
  const currencyRateToEur = fxRates.find((r) => r.code === currency)?.rateToEur ?? 1;
  const [isPotential, setIsPotential] = useState(false);
  const [projectNameTouched, setProjectNameTouched] = useState(false);

  /**
   * Chi emette l'offerta.
   *
   * Decide l'intestazione del Word e le coordinate bancarie in fondo: UK,
   * Italia o Cina non sono varianti grafiche, sono tre società con tre partite
   * IVA e tre conti. Sceglierlo qui e non a valle evita che il documento parta
   * con l'anagrafica di default e vada corretto a mano dopo.
   */
  const { data: emittenti = [] } = useEmittenti();
  const [emittenteId, setEmittenteId] = useState<string>("");

  /**
   * La timeline di ciascun servizio quotato, e i suoi passi.
   *
   * È l'anello che mancava: senza, le tranche si agganciavano a un elenco
   * generico di momenti che in nessuna timeline esistono, e nessuna milestone
   * chiusa dal PM poteva sbloccarle.
   */
  const chiaviTimeline = useMemo(
    () =>
      services.certifications
        .map((c) =>
          chiaveTimeline(catalog.rows, {
            scheme: c.cert_type,
            rating: c.cert_rating,
            typology: c.project_subtype,
          }),
        )
        .filter((k): k is string => !!k),
    [services.certifications, catalog.rows],
  );
  const { data: passiPerChiave } = usePassiTimeline(chiaviTimeline);

  const passiDi = (c: CertConfig): PassoTimeline[] => {
    const k = chiaveTimeline(catalog.rows, {
      scheme: c.cert_type,
      rating: c.cert_rating,
      typology: c.project_subtype,
    });
    return (k && passiPerChiave?.get(k)) || [];
  };

  /**
   * Appena la timeline è nota, gli schemi preimpostati propongono il loro passo.
   *
   * Una proposta, non una decisione: chi quota vede il passo già scelto e ha
   * davanti tutti gli altri per cambiarlo. Dove la lingua dello schema non
   * combacia con quella del servizio, la proposta traduce invece di arrendersi:
   * una fornitura non ha una fine cantiere, ma ha il momento in cui i sensori
   * cominciano a trasmettere, ed è quello il suo equivalente.
   */
  useEffect(() => {
    if (!passiPerChiave) return;
    setServices((s) => {
      let cambiato = false;
      const certificazioni = s.certifications.map((c) => {
        const k = chiaveTimeline(catalog.rows, {
          scheme: c.cert_type,
          rating: c.cert_rating,
          typology: c.project_subtype,
        });
        const passi = (k && passiPerChiave.get(k)) || [];
        if (!passi.length) return c;

        const tranches = c.tranches.map((t) => {
          if (t.stepOrder !== null) return t;
          const momento = MOMENTO_DI[t.trigger];
          if (!momento) return t;
          const proposto = proponiPasso(passi, momento);
          if (proposto === null) return t;
          cambiato = true;
          return { ...t, stepOrder: proposto };
        });
        return cambiato ? { ...c, tranches } : c;
      });
      return cambiato ? { ...s, certifications: certificazioni } : s;
    });
  }, [passiPerChiave, catalog.rows]);
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
        c.cert_type === type
          ? {
              ...c,
              flags: { ...c.flags, [flag]: value },
              // Togliendo il servizio si toglie anche la quantità: lasciarla
              // scritta significherebbe promettere dispositivi che l'offerta
              // non contiene più.
              quantities:
                !value && (flag === "iaq" || flag === "energy" || flag === "water")
                  ? { ...c.quantities, [flag]: "" }
                  : c.quantities,
            }
          : c
      ),
    }));
  };

  const updateCertQuantity = (type: CertType, domain: keyof MonitoringQuantities, value: string) => {
    // Solo cifre: il campo dice quanti pezzi, non accetta altro.
    const clean = value.replace(/[^\d]/g, "");
    setServices((s) => ({
      ...s,
      certifications: s.certifications.map((c) =>
        c.cert_type === type ? { ...c, quantities: { ...c.quantities, [domain]: clean } } : c
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
    // La data di consegna NON e' piu' obbligatoria qui: quando si manda
    // un'offerta spesso non c'e' ancora, e obbligarla costringeva a
    // inventarsela. Diventa vincolante all'approvazione, che e' il momento in
    // cui il progetto entra in Operations e la data serve davvero.
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

  // ── Lo schema di pagamento ────────────────────────────────────────────────

  const mappaCert = (type: CertType, f: (c: CertConfig) => CertConfig) =>
    setServices((s) => ({
      ...s,
      certifications: s.certifications.map((c) => (c.cert_type === type ? f(c) : c)),
    }));

  /** Cambiare schema riscrive le righe: sono l'espressione di quello schema,
   *  e tenerle da uno vecchio darebbe una scaletta che non esiste. */
  const aggiornaSchema = (type: CertType, scheme: PaymentSchemeId) =>
    mappaCert(type, (c) => ({ ...c, paymentScheme: scheme, tranches: tranchesDaSchema(scheme) }));

  /** Toccare una riga di uno schema preimpostato lo rende, di fatto, su
   *  misura: lo diciamo invece di lasciare un'etichetta che mente. */
  const aggiornaTranche = (type: CertType, i: number, patch: Partial<TrancheDraft>) =>
    mappaCert(type, (c) => ({
      ...c,
      paymentScheme: PAYMENT_SCHEMES[c.paymentScheme].isCustom ? c.paymentScheme : "bdc_sal_custom",
      tranches: c.tranches.map((t, k) => (k === i ? { ...t, ...patch } : t)),
    }));

  const aggiungiTranche = (type: CertType) =>
    mappaCert(type, (c) => ({
      ...c,
      paymentScheme: "bdc_sal_custom",
      tranches: [
        ...c.tranches,
        {
          name: `SAL ${c.tranches.length + 1}`,
          pct: "0",
          trigger: "manual_sal" as TriggerEvent,
          stepOrder: null,
        },
      ],
    }));

  const rimuoviTranche = (type: CertType, i: number) =>
    mappaCert(type, (c) => ({
      ...c,
      paymentScheme: "bdc_sal_custom",
      tranches: c.tranches.filter((_, k) => k !== i),
    }));

  /** Ogni certificazione deve fatturare il cento per cento del suo valore. */
  const validateStepPagamenti = (): boolean => {
    const rotta = services.certifications.find(
      (c) => !validateCustomTranches(c.tranches.map((t) => ({ pct: Number(t.pct) || 0 }))).valid,
    );
    if (!rotta) {
      setErrors((e) => { const { tranches, ...resto } = e; return resto; });
      return true;
    }
    setErrors((e) => ({
      ...e,
      tranches: `${CERT_DISPLAY_LABELS[rotta.cert_type] ?? rotta.cert_type}: the tranches must add up to 100%`,
    }));
    return false;
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
    // Un potenziale non ha ancora un prezzo, quindi non ha una scaletta da
    // validare: il passo si attraversa e basta.
    if (step === 4 && !isPotential && !validateStepPagamenti()) return;
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
        .select("id, name, client, region, handover_date, site_id, currency, sites(id, brand_id, brands(id, holding_id))")
        .eq("id", resumeCertId)
        .maybeSingle();
      if (error || !cert || cancelled) return;
      const s: any = (cert as any).sites || {};
      const brandId = s.brand_id || "";
      const holdingId = s.brands?.holding_id || "";
      setIsPotential(false);
      setStep(2);
      // Una potenziale ripresa mantiene la valuta con cui era stata registrata:
      // ripartire da euro cambierebbe l'offerta senza che nessuno lo chieda.
      setCurrency(((cert as any).currency || "EUR").toUpperCase());
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

      // Strategy resolution: unified quotation groups >1 certs under a shared UUID.
      const isUnified =
        !isPotential && services.certifications.length > 1 && quotationStrategy === "single";
      const groupId = isUnified ? (crypto?.randomUUID?.() ?? null) : null;
      const nameFor = (certType: string) =>
        !isPotential && services.certifications.length > 1 && quotationStrategy === "split"
          ? `${services.projectName} – ${certType}`
          : services.projectName;

      // 1b. Duplicate check within the last 30 seconds (skip for potentials — they may legitimately repeat)
      if (!isPotential) {
        const thirtySecondsAgo = new Date(Date.now() - 30000).toISOString();
        for (const cert of services.certifications) {
          const name = nameFor(cert.cert_type);
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
          // In unified mode all rows share the same name — check only once.
          if (isUnified) break;
        }
      }

      // 2. Insert one certification row per selected service
      for (const cert of services.certifications) {
        const name = nameFor(cert.cert_type);

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
            // Quante unità promette l'offerta. NULL significa "servono ma non
            // sappiamo ancora quante": all'approvazione il progetto entrerà solo
            // in Operations, e il Monitor lo vedrà quando il PM farà la richiesta.
            quoted_iaq_quantity: cert.flags.iaq ? parseQuantity(cert.quantities.iaq) : null,
            quoted_energy_quantity: cert.flags.energy ? parseQuantity(cert.quantities.energy) : null,
            quoted_water_quantity: cert.flags.water ? parseQuantity(cert.quantities.water) : null,
            has_hardware_redirection: cert.flags.hardwareRedirect,
            services_fees: cert.services_fees ? Number(cert.services_fees) : null,
            gbci_fees: cert.gbci_fees ? Number(cert.gbci_fees) : null,
            total_fees: cert.total_fees ? Number(cert.total_fees) : null,
            // Solo la valuta: il cambio lo timbra il database al salvataggio,
            // cosi' non esiste un percorso in cui l'importo e il cambio
            // raccontano due giorni diversi.
            currency,
            allocated_hours: allocatedHours,
            quotation_sent_date: services.quotationSentDate
              ? format(services.quotationSentDate, "yyyy-MM-dd")
              : null,
            quotation_notes: services.notes || null,
            quotation_group_id: groupId,
            // Chi emette: decide intestazione, partita IVA e IBAN del Word.
            // Vuoto vuol dire «quella di default», che è una risposta legittima
            // solo finché di società ce n'è una.
            issuer_contact_id: emittenteId || null,
          } as any)
          .select("id")
          .single();
        if (certErr) throw certErr;


        // ── La scaletta di fatturazione ─────────────────────────────────────
        // Nascono qui e nascono «Pending»: all'approvazione il trigger
        // promuove l'anticipo, e le altre le sbloccherà la milestone a cui
        // sono agganciate. Senza queste righe l'approvazione non avrebbe
        // niente da promuovere — ed è esattamente com'era finora.
        const totaleCert = cert.total_fees ? Number(cert.total_fees) : 0;
        if (insertedCert && totaleCert > 0 && cert.tranches.length > 0) {
          // `step_id` è il punto in cui la fatturazione tocca l'avanzamento
          // dei lavori. Senza, la tranche nasce orfana: nessuna milestone
          // chiusa dal PM può sbloccarla, e l'avviso di fatturazione non parte
          // mai. Era esattamente il difetto della prima versione.
          const passiCert = passiDi(cert);
          const righe = cert.tranches.map((t, i) => ({
            certification_id: insertedCert.id,
            name: t.name || `Tranche ${i + 1}`,
            amount: Math.round(totaleCert * (Number(t.pct) || 0)) / 100,
            status: "Pending",
            tranche_state: "pending",
            payment_scheme: cert.paymentScheme,
            tranche_pct: Number(t.pct) || 0,
            tranche_order: i + 1,
            trigger_event: t.trigger,
            step_id:
              t.stepOrder === null
                ? null
                : passiCert.find((p) => p.order_index === t.stepOrder)?.id ?? null,
          }));
          const { error: trErr } = await supabase
            .from("cert_payment_milestones")
            .insert(righe as never);
          if (trErr) throw trErr;
        }

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
          <Label className="text-xs font-medium">Estimated handover</Label>
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
          <p className="text-[11px] text-muted-foreground">
            Si puo' lasciare vuota. Serve pero' per approvare l'offerta.
          </p>
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
        {catalog.schemes.filter((sc) => sc.isSellable).map(({ scheme, label }) => {
          const type = scheme;
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
              {label}
            </button>
          );
        })}
      </div>
      {errors.certs && <p className="text-xs text-destructive">{errors.certs}</p>}

      {/*
        La valuta si sceglie una volta per tutta l'offerta e sta qui in cima,
        prima degli importi: chi compila deve sapere in che valuta sta
        scrivendo prima di scrivere. Gli importi delle certificazioni qui sotto
        sono tutti in questa valuta.
      */}
      {services.certifications.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
          <Label className="text-xs font-medium">Quotation currency</Label>
          <CurrencySelect value={currency} onChange={setCurrency} className="h-8 w-32" />
          <p className="text-[11px] text-muted-foreground">
            Tutti gli importi dell'offerta sono in questa valuta. Il calcolo FTE e
            l'hardware restano in euro: sono costi nostri.
          </p>
        </div>
      )}

      {/*
        Chi emette l'offerta. Sta accanto alla valuta perché è la stessa
        specie di scelta: vale per tutto il documento e va fatta prima di
        scrivere gli importi. UK, Italia e Cina non sono tre intestazioni
        grafiche, sono tre società con tre partite IVA e tre conti correnti.
      */}
      {services.certifications.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
          <Label className="text-xs font-medium">Issuing company</Label>
          <Select value={emittenteId} onValueChange={setEmittenteId}>
            <SelectTrigger className="h-8 w-[280px]">
              <SelectValue placeholder="Choose who issues the offer" />
            </SelectTrigger>
            <SelectContent>
              {emittenti.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.company_name}
                  {e.country ? ` · ${e.country}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            Decide intestazione, partita IVA e coordinate bancarie del Word.
          </p>
        </div>
      )}

      {/* Per-cert config */}
      {services.certifications.length > 0 && (
        <div className="space-y-3">
          {services.certifications.map((cert) => {
            const ratings = catalog.ratingsOf(cert.cert_type);
            const subtypes = catalog.typologiesOf(cert.cert_type, cert.cert_rating || null);
            const levels = catalog.levelsOf(cert.cert_type, cert.cert_rating || null, cert.project_subtype || null);
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
                        <SelectContent>{levels.map((l) => <SelectItem key={l.level} value={l.level}>{l.level}</SelectItem>)}</SelectContent>
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
                            <MonitoringService
                              label="ClAir IAQ"
                              checked={cert.flags.iaq}
                              quantity={cert.quantities.iaq}
                              onToggle={(v) => updateCertFlag(cert.cert_type, "iaq", v)}
                              onQuantity={(v) => updateCertQuantity(cert.cert_type, "iaq", v)}
                            />
                            <MonitoringService
                              label="Greeny Energy"
                              checked={cert.flags.energy}
                              quantity={cert.quantities.energy}
                              onToggle={(v) => updateCertFlag(cert.cert_type, "energy", v)}
                              onQuantity={(v) => updateCertQuantity(cert.cert_type, "energy", v)}
                            />
                            <MonitoringService
                              label="Water"
                              checked={cert.flags.water}
                              quantity={cert.quantities.water}
                              onToggle={(v) => updateCertFlag(cert.cert_type, "water", v)}
                              onQuantity={(v) => updateCertQuantity(cert.cert_type, "water", v)}
                            />
                          </>
                        )}
                        {showsEnergyRedirect(cert.cert_type) && (
                          <>
                            <MonitoringService
                              label="Greeny Energy"
                              checked={cert.flags.energy}
                              quantity={cert.quantities.energy}
                              onToggle={(v) => updateCertFlag(cert.cert_type, "energy", v)}
                              onQuantity={(v) => updateCertQuantity(cert.cert_type, "energy", v)}
                            />
                            <label className="flex items-center gap-2 text-sm cursor-pointer">
                              <Checkbox checked={cert.flags.hardwareRedirect} onCheckedChange={(v) => updateCertFlag(cert.cert_type, "hardwareRedirect", !!v)} />
                              Hardware Redirection
                            </label>
                          </>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-2.5 leading-relaxed">
                        Spuntare un servizio <strong>è già la richiesta</strong>. Se scrivi anche quanti, all'approvazione
                        il progetto entra subito nel Monitor con quel numero; se lo lasci vuoto entra solo in Operations
                        e sarà il PM a chiedere i dispositivi.
                      </p>
                    </div>
                  )}

                  {/* Per-cert Quotation Value */}
                  <div className="mt-4 pt-3 border-t border-border/50 space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Quotation value · {CERT_DISPLAY_LABELS[cert.cert_type] ?? cert.cert_type}</p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Services Fees ({currencySymbol(currency)})</Label>
                        <Input type="number" className="h-8 text-sm" placeholder="e.g. 15,000"
                          value={cert.services_fees}
                          onChange={(e) => patchCert(cert.cert_type, { services_fees: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">GBCI / IWBI Fees ({currencySymbol(currency)})</Label>
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
                        <Label className="text-xs font-medium">Total Quotation ({currencySymbol(currency)}) *</Label>
                        <Input
                          type="number"
                          placeholder="e.g. 20,000"
                          className={cn("h-8 text-sm", errors[`total_${cert.cert_type}`] && "border-destructive")}
                          value={cert.total_fees}
                          onChange={(e) => patchCert(cert.cert_type, { total_fees: e.target.value })}
                        />
                        <EurHint
                          amount={cert.total_fees ? Number(cert.total_fees) : null}
                          currency={currency}
                          rateToEur={currencyRateToEur}
                        />
                        {errors[`total_${cert.cert_type}`] && (
                          <p className="text-xs text-destructive">{errors[`total_${cert.cert_type}`]}</p>
                        )}
                      </div>
                    ) : (
                      <>
                        {cert.builder_applied && cert.total_fees && (
                          <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm">
                            <span className="font-medium text-emerald-800">Applied: {formatMoney(Number(cert.total_fees), currency)}</span>
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

  // ── Step 3: Quotation Strategy ────────────────────────────────────────────

  const renderStep3 = () => {
    const certs = services.certifications;
    return (
      <div className="space-y-5">
        <div>
          <h3 className="text-base font-semibold text-foreground">Quotation strategy</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            You've selected multiple certifications. Refine the list below and choose how they should be quoted.
          </p>
        </div>

        {/* Selected certs recap with deselect */}
        <Card className="border-slate-200">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Certifications in this quotation ({certs.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {certs.map((c) => (
                <div key={c.cert_type} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-primary/5 border-primary/20 text-sm">
                  <span className="font-medium text-primary">{CERT_DISPLAY_LABELS[c.cert_type] ?? c.cert_type}</span>
                  {c.cert_rating && <span className="text-xs text-muted-foreground">· {c.cert_rating}</span>}
                  <button
                    type="button"
                    onClick={() => toggleCert(c.cert_type, false)}
                    className="ml-1 rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive p-0.5"
                    title="Remove from this quotation"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
            {certs.length <= 1 && (
              <p className="text-xs text-muted-foreground italic mt-3">
                Only one certification remains — the strategy step will be skipped. Click Continue.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Strategy choice — only when >1 cert remains */}
        {certs.length > 1 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              How should this be saved?
            </p>
            <RadioGroup
              value={quotationStrategy ?? ""}
              onValueChange={(v) => {
                setQuotationStrategy(v as QuotationStrategy);
                setErrors((e) => ({ ...e, strategy: "" }));
              }}
              className="grid grid-cols-1 sm:grid-cols-2 gap-3"
            >
              <label className={cn(
                "flex flex-col gap-1 rounded-xl border p-4 cursor-pointer transition-colors",
                quotationStrategy === "single" ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:bg-muted/40"
              )}>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="single" />
                  <span className="font-semibold text-sm">Unified Quotation</span>
                </div>
                <p className="text-xs text-muted-foreground pl-6">
                  One single quotation covering all {certs.length} certifications for this site.
                  Approve / cancel them together.
                </p>
              </label>
              <label className={cn(
                "flex flex-col gap-1 rounded-xl border p-4 cursor-pointer transition-colors",
                quotationStrategy === "split" ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:bg-muted/40"
              )}>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="split" />
                  <span className="font-semibold text-sm">Separate Quotations</span>
                </div>
                <p className="text-xs text-muted-foreground pl-6">
                  Generate {certs.length} independent quotations — one per certification — on the same site.
                </p>
              </label>
            </RadioGroup>
            {errors.strategy && <p className="text-xs text-destructive mt-2">{errors.strategy}</p>}
          </div>
        )}
      </div>
    );
  };

  // ── Step 4: Review ────────────────────────────────────────────────────────

  /**
   * Lo schema di fatturazione, una certificazione per volta.
   *
   * Le quattro opzioni preimpostate sono un punto di partenza, non una gabbia:
   * ogni riga si rinomina, si ripesa e si riaggancia a un altro momento. La
   * somma deve fare cento — non per pedanteria, ma perché una quotazione che
   * fattura il 90% del suo valore è un errore che si scopre mesi dopo.
   */
  const renderStepPagamenti = () => (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold">Payment schedule</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Each certification is invoiced on its own schedule. Tranches unlock when the
          milestone they hang from is closed by the PM.
        </p>
      </div>

      {services.certifications.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No certification selected: go back to <strong>Services &amp; Quote</strong> first.
        </p>
      )}

      {services.certifications.map((cert) => {
        const totale = Number(cert.total_fees) || 0;
        const somma = cert.tranches.reduce((s, t) => s + (Number(t.pct) || 0), 0);
        const quadra = Math.abs(somma - 100) < 0.01;
        const passi = passiDi(cert);
        const chiave = chiaveTimeline(catalog.rows, {
          scheme: cert.cert_type,
          rating: cert.cert_rating,
          typology: cert.project_subtype,
        });

        return (
          <Card key={cert.cert_type}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    {CERT_DISPLAY_LABELS[cert.cert_type] ?? cert.cert_type}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {totale > 0 ? formatMoney(totale, currency) : "no amount yet"}
                  </span>
                </div>
                <Select
                  value={cert.paymentScheme}
                  onValueChange={(v) => aggiornaSchema(cert.cert_type, v as PaymentSchemeId)}
                >
                  <SelectTrigger className="w-[320px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.values(PAYMENT_SCHEMES).map((sc) => (
                      <SelectItem key={sc.id} value={sc.id}>{sc.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <p className="text-xs text-muted-foreground">
                {PAYMENT_SCHEMES[cert.paymentScheme].description}
              </p>
              {/* Dire quale timeline si sta usando è metà del controllo: se
                  qui compare la timeline sbagliata, le tranche finiranno su
                  attività che il PM non vedrà mai. */}
              <p className="text-xs text-muted-foreground">
                {chiave ? (
                  <>
                    Activities from the <strong>{chiave}</strong> timeline
                    {passi.length > 0 && ` · ${passi.length} steps`}
                  </>
                ) : (
                  <span className="text-amber-600">
                    No timeline for this service yet: tranches can only be set on a date.
                  </span>
                )}
              </p>

              <Separator />

              <div className="space-y-2">
                {cert.tranches.map((t, i) => (
                  <div key={i} className="flex items-center gap-2 flex-wrap">
                    <Input
                      value={t.name}
                      onChange={(e) => aggiornaTranche(cert.cert_type, i, { name: e.target.value })}
                      className="flex-1 min-w-[180px]"
                      placeholder="Tranche name"
                    />
                    <Input
                      value={t.pct}
                      onChange={(e) => aggiornaTranche(cert.cert_type, i, { pct: e.target.value })}
                      className="w-[84px]"
                      inputMode="decimal"
                      placeholder="%"
                    />
                    {/* Le attività da cui la tranche si sblocca sono quelle
                        della timeline del servizio quotato, non un elenco
                        generico: è il PM che chiuderà quel passo, e se qui
                        comparisse un'attività che nella sua timeline non
                        esiste la fattura non partirebbe mai. */}
                    <Select
                      value={valoreAggancio(t)}
                      onValueChange={(v) =>
                        aggiornaTranche(cert.cert_type, i, agganciodaValore(v))
                      }
                    >
                      <SelectTrigger className="w-[300px]">
                        <SelectValue placeholder="When does it fall due?" />
                      </SelectTrigger>
                      <SelectContent>
                        {/* L'anticipo non aspetta nessuna attività: lo sblocca
                            l'approvazione dell'offerta. Sta in cima perché è
                            il caso più frequente e perché è di natura diversa
                            da tutti gli altri. */}
                        <SelectItem value={ALL_APPROVAZIONE}>
                          On quotation approval
                        </SelectItem>
                        {passi.map((p) => (
                          <SelectItem key={p.id} value={String(p.order_index)}>
                            {p.order_index}. {p.requirement}
                          </SelectItem>
                        ))}
                        <SelectItem value={A_SCADENZA}>On a date — no activity</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="w-[110px] text-right text-sm tabular-nums text-muted-foreground">
                      {totale > 0
                        ? formatMoney(Math.round(totale * (Number(t.pct) || 0)) / 100, currency)
                        : "—"}
                    </span>
                    <Button
                      type="button" variant="ghost" size="icon"
                      aria-label="Remove tranche"
                      disabled={cert.tranches.length <= 1}
                      onClick={() => rimuoviTranche(cert.cert_type, i)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between gap-3 flex-wrap">
                <Button type="button" variant="outline" size="sm" className="gap-1.5"
                        onClick={() => aggiungiTranche(cert.cert_type)}>
                  <Plus className="h-4 w-4" /> Add tranche
                </Button>
                <div className="flex items-center gap-3">
                  {/* «A scadenza» è una scelta legittima, ma è l'unica che
                      nessun avanzamento potrà sbloccare: né l'approvazione né
                      una milestone. Chi compila deve saperlo adesso, non
                      scoprirlo quando la fattura non parte. */}
                  {cert.tranches.some(
                    (t) => t.stepOrder === null && t.trigger !== "quotation_signed",
                  ) && (
                    <span className="text-xs text-amber-600">
                      {
                        cert.tranches.filter(
                          (t) => t.stepOrder === null && t.trigger !== "quotation_signed",
                        ).length
                      }{" "}
                      on a date only
                    </span>
                  )}
                  <span className={cn("text-sm font-medium", quadra ? "text-emerald-600" : "text-destructive")}>
                    {somma.toFixed(0)}% {quadra ? "— balanced" : "— must add up to 100%"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {errors.tranches && <p className="text-sm text-destructive">{errors.tranches}</p>}
    </div>
  );

  const renderStep4 = () => (
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
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Services to certify</p>
            {services.certifications.length > 1 && !isPotential && (
              <Badge variant="outline" className={cn(
                "text-[11px]",
                quotationStrategy === "single" && "border-primary/30 text-primary bg-primary/5",
                quotationStrategy === "split" && "border-amber-300 text-amber-700 bg-amber-50",
              )}>
                {quotationStrategy === "single"
                  ? `Unified · 1 quotation × ${services.certifications.length} certs`
                  : quotationStrategy === "split"
                  ? `Split · ${services.certifications.length} separate quotations`
                  : "Strategy not chosen"}
              </Badge>
            )}
          </div>
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
                    <div><p className="text-muted-foreground">Services</p><p className="font-medium">{c.services_fees ? formatMoney(Number(c.services_fees), currency) : "—"}</p></div>
                    <div><p className="text-muted-foreground">GBCI</p><p className="font-medium">{c.gbci_fees ? formatMoney(Number(c.gbci_fees), currency) : "—"}</p></div>
                    <div>
                      <p className="text-muted-foreground">Total</p>
                      <p className="font-semibold text-foreground">{c.total_fees ? formatMoney(Number(c.total_fees), currency) : "—"}</p>
                      {c.total_fees && (
                        <p className="text-[10px] text-muted-foreground tabular-nums">
                          {eurEquivalent(Number(c.total_fees), currency, currencyRateToEur)}
                        </p>
                      )}
                    </div>
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
            {step === 4 && renderStepPagamenti()}
            {step === 5 && renderStep4()}
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
                {step < 5 ? (
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

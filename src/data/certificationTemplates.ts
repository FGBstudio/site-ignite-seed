/**
 * Certification Templates Configuration
 *
 * Elastic system: given a cert_type + rating, returns the correct
 * timeline steps (with type, role, offset_days) and scorecard categories.
 *
 * Timeline data sourced from the operational JSON provided by the team.
 * Scorecard data from leedTemplate.ts (LEED) or empty for others.
 */

import { LEED_TEMPLATE } from "./leedTemplate";

// ─── Shared Types ───

export type TimelineEntryType = "manual_input" | "calculated_deadline";

export interface TimelineStep {
  name: string;
  order_index: number;
  /** manual_input = PM fills dates; calculated_deadline = auto-calculated from previous step */
  type: TimelineEntryType;
  /** Role responsible for this step */
  assigned_to_role: string;
  /** For calculated_deadline: days offset from the previous manual_input step */
  offset_days?: number;
}

export interface ScorecardCategory {
  category: string;
  requirement: string;
  max_score: number;
}

export interface CertificationTemplate {
  scorecard: ScorecardCategory[];
  timeline: TimelineStep[];
  label: string;
}

// ─── Helper: convert JSON tasks to TimelineStep[] ───
function toTimeline(
  tasks: Array<{
    order: number;
    task_name: string;
    type: string;
    assigned_to_role: string;
    offset_days?: number;
  }>
): TimelineStep[] {
  return tasks.map((t) => ({
    name: t.task_name,
    order_index: t.order - 1,
    type: t.type as TimelineEntryType,
    assigned_to_role: t.assigned_to_role,
    ...(t.offset_days != null ? { offset_days: t.offset_days } : {}),
  }));
}

// ─── LEED BD+C Timeline (9 steps) ───
const LEED_BDC_TIMELINE = toTimeline([
  { order: 1, task_name: "Pre-assessment", type: "manual_input", assigned_to_role: "PM" },
  { order: 2, task_name: "FGB Design guidelines", type: "manual_input", assigned_to_role: "PM" },
  { order: 3, task_name: "FGB tendering requirement", type: "manual_input", assigned_to_role: "PM" },
  { order: 4, task_name: "Construction phase", type: "manual_input", assigned_to_role: "PM" },
  { order: 5, task_name: "LEED GC training", type: "manual_input", assigned_to_role: "PM" },
  { order: 6, task_name: "Construction end (Handover)", type: "manual_input", assigned_to_role: "PM" },
  { order: 7, task_name: "GC fornisce documentazione", type: "calculated_deadline", offset_days: 60, assigned_to_role: "GC" },
  { order: 8, task_name: "Sottomissione progetto (da parte di PM)", type: "calculated_deadline", offset_days: 90, assigned_to_role: "PM" },
  { order: 9, task_name: "Ottenimento certificazione LEED", type: "calculated_deadline", offset_days: 180, assigned_to_role: "PM" },
]);

// ─── LEED ID+C Timeline (9 steps) ───
const LEED_IDC_TIMELINE = toTimeline([
  { order: 1, task_name: "Pre-assessment", type: "manual_input", assigned_to_role: "PM" },
  { order: 2, task_name: "FGB Design guidelines", type: "manual_input", assigned_to_role: "PM" },
  { order: 3, task_name: "FGB tendering requirement", type: "manual_input", assigned_to_role: "PM" },
  { order: 4, task_name: "Construction phase", type: "manual_input", assigned_to_role: "PM" },
  { order: 5, task_name: "LEED GC training", type: "manual_input", assigned_to_role: "PM" },
  { order: 6, task_name: "Construction end (Handover)", type: "manual_input", assigned_to_role: "PM" },
  { order: 7, task_name: "GC fornisce documentazione", type: "calculated_deadline", offset_days: 30, assigned_to_role: "GC" },
  { order: 8, task_name: "Sottomissione progetto (da parte di PM)", type: "calculated_deadline", offset_days: 60, assigned_to_role: "PM" },
  { order: 9, task_name: "Ottenimento certificazione LEED", type: "calculated_deadline", offset_days: 150, assigned_to_role: "PM" },
]);

// ─── LEED O+M Timeline (5 steps) ───
const LEED_OM_TIMELINE = toTimeline([
  { order: 1, task_name: "Pre-assessment", type: "manual_input", assigned_to_role: "PM" },
  { order: 2, task_name: "Reference period", type: "manual_input", assigned_to_role: "PM" },
  { order: 3, task_name: "On-site visit", type: "manual_input", assigned_to_role: "PM" },
  { order: 4, task_name: "Sottomissione progetto (da parte di PM)", type: "calculated_deadline", offset_days: 60, assigned_to_role: "PM" },
  { order: 5, task_name: "Ottenimento certificazione LEED", type: "calculated_deadline", offset_days: 150, assigned_to_role: "PM" },
]);

// ─── BREEAM New Construction / Refurbishment Timeline (9 steps) ───
const BREEAM_NC_REFURB_TIMELINE = toTimeline([
  { order: 1, task_name: "Pre-assessment", type: "manual_input", assigned_to_role: "PM" },
  { order: 2, task_name: "FGB Design guidelines", type: "manual_input", assigned_to_role: "PM" },
  { order: 3, task_name: "FGB tendering requirement", type: "manual_input", assigned_to_role: "PM" },
  { order: 4, task_name: "Construction phase", type: "manual_input", assigned_to_role: "PM" },
  { order: 5, task_name: "BREEAM GC training", type: "manual_input", assigned_to_role: "PM" },
  { order: 6, task_name: "Construction end (Handover)", type: "manual_input", assigned_to_role: "PM" },
  { order: 7, task_name: "Assessor site visit", type: "manual_input", assigned_to_role: "Assessor" },
  { order: 8, task_name: "GC fornisce documentazione", type: "calculated_deadline", offset_days: 60, assigned_to_role: "GC" },
  { order: 9, task_name: "Sottomissione progetto (da parte di PM)", type: "calculated_deadline", offset_days: 90, assigned_to_role: "PM" },
]);

// ─── BREEAM In-Use Part 1 Timeline (6 steps) ───
const BREEAM_IU_P1_TIMELINE = toTimeline([
  { order: 1, task_name: "Pre-assessment", type: "manual_input", assigned_to_role: "PM" },
  { order: 2, task_name: "Implementation phase (se dovuta)", type: "manual_input", assigned_to_role: "PM" },
  { order: 3, task_name: "Implementation end", type: "manual_input", assigned_to_role: "PM" },
  { order: 4, task_name: "On-site visit", type: "manual_input", assigned_to_role: "PM" },
  { order: 5, task_name: "Cliente fornisce documentazione", type: "calculated_deadline", offset_days: 30, assigned_to_role: "Client" },
  { order: 6, task_name: "Sottomissione a BRE", type: "calculated_deadline", offset_days: 60, assigned_to_role: "PM" },
]);

// ─── BREEAM In-Use Part 2 Timeline (6 steps) ───
const BREEAM_IU_P2_TIMELINE = toTimeline([
  { order: 1, task_name: "Pre-assessment", type: "manual_input", assigned_to_role: "PM" },
  { order: 2, task_name: "Docs provided by Client", type: "calculated_deadline", offset_days: 30, assigned_to_role: "Client" },
  { order: 3, task_name: "Review docs by FGB", type: "calculated_deadline", offset_days: 60, assigned_to_role: "PM" },
  { order: 4, task_name: "Implementation phase (se dovuta)", type: "manual_input", assigned_to_role: "PM" },
  { order: 5, task_name: "Closeout documentation", type: "manual_input", assigned_to_role: "PM" },
  { order: 6, task_name: "Sottomissione a BRE", type: "calculated_deadline", offset_days: 30, assigned_to_role: "PM" },
]);

// ─── WELL New Construction Timeline (9 steps) ───
const WELL_NC_TIMELINE = toTimeline([
  { order: 1, task_name: "Pre-assessment", type: "manual_input", assigned_to_role: "PM" },
  { order: 2, task_name: "FGB Design guidelines", type: "manual_input", assigned_to_role: "PM" },
  { order: 3, task_name: "FGB tendering requirement", type: "manual_input", assigned_to_role: "PM" },
  { order: 4, task_name: "Construction phase", type: "manual_input", assigned_to_role: "PM" },
  { order: 5, task_name: "WELL GC training", type: "manual_input", assigned_to_role: "PM" },
  { order: 6, task_name: "Construction end (Handover)", type: "manual_input", assigned_to_role: "PM" },
  { order: 7, task_name: "GC fornisce documentazione", type: "calculated_deadline", offset_days: 30, assigned_to_role: "GC" },
  { order: 8, task_name: "Sottomissione progetto (da parte di PM)", type: "calculated_deadline", offset_days: 90, assigned_to_role: "PM" },
  { order: 9, task_name: "Ottenimento certificazione WELL", type: "calculated_deadline", offset_days: 180, assigned_to_role: "PM" },
]);

// ─── WELL Existing Buildings Timeline (6 steps) ───
const WELL_EXISTING_TIMELINE = toTimeline([
  { order: 1, task_name: "Pre-assessment", type: "manual_input", assigned_to_role: "PM" },
  { order: 2, task_name: "Policy Review", type: "manual_input", assigned_to_role: "PM" },
  { order: 3, task_name: "Visita + PT (Performance Testing)", type: "manual_input", assigned_to_role: "PM" },
  { order: 4, task_name: "Lab/Cliente fornisce documentazione", type: "calculated_deadline", offset_days: 30, assigned_to_role: "Client" },
  { order: 5, task_name: "Sottomissione progetto (da parte di PM)", type: "calculated_deadline", offset_days: 90, assigned_to_role: "PM" },
  { order: 6, task_name: "Ottenimento certificazione WELL", type: "calculated_deadline", offset_days: 180, assigned_to_role: "PM" },
]);

// ─── Generic fallback (no specific template) ───
const GENERIC_TIMELINE: TimelineStep[] = [
  { name: "Registrazione", order_index: 0, type: "manual_input", assigned_to_role: "PM" },
  { name: "Raccolta Documentazione", order_index: 1, type: "manual_input", assigned_to_role: "PM" },
  { name: "Fase di Design", order_index: 2, type: "manual_input", assigned_to_role: "PM" },
  { name: "Fase di Costruzione", order_index: 3, type: "manual_input", assigned_to_role: "PM" },
  { name: "Sottomissione Review", order_index: 4, type: "calculated_deadline", offset_days: 30, assigned_to_role: "PM" },
  { name: "Risposta Review", order_index: 5, type: "calculated_deadline", offset_days: 60, assigned_to_role: "PM" },
  { name: "Certificazione", order_index: 6, type: "calculated_deadline", offset_days: 90, assigned_to_role: "PM" },
];

// ─── Scorecards ───

const LEED_BDC_SCORECARD: ScorecardCategory[] = LEED_TEMPLATE.map((c) => ({
  category: c.category,
  requirement: c.requirement,
  max_score: c.max_score,
}));

// ID+C reuses BD+C scorecard as close approximation
const LEED_IDC_SCORECARD: ScorecardCategory[] = LEED_BDC_SCORECARD;

const LEED_OM_SCORECARD: ScorecardCategory[] = [
  { category: "Energy & Atmosphere", requirement: "Energy Performance", max_score: 25 },
  { category: "Energy & Atmosphere", requirement: "Existing Building Commissioning", max_score: 5 },
  { category: "Energy & Atmosphere", requirement: "Ongoing Commissioning", max_score: 3 },
  { category: "Energy & Atmosphere", requirement: "Advanced Energy Metering", max_score: 2 },
  { category: "Energy & Atmosphere", requirement: "Demand Response", max_score: 3 },
  { category: "Energy & Atmosphere", requirement: "Renewable Energy", max_score: 5 },
  { category: "Energy & Atmosphere", requirement: "Enhanced Refrigerant Management", max_score: 1 },
  { category: "Water Efficiency", requirement: "Indoor Water Use Reduction", max_score: 12 },
  { category: "Water Efficiency", requirement: "Outdoor Water Use Reduction", max_score: 2 },
  { category: "Water Efficiency", requirement: "Cooling Tower Water Use", max_score: 3 },
  { category: "Water Efficiency", requirement: "Water Metering", max_score: 2 },
  { category: "Materials & Resources", requirement: "Purchasing Policy", max_score: 2 },
  { category: "Materials & Resources", requirement: "Facility Maintenance", max_score: 2 },
  { category: "Materials & Resources", requirement: "Waste Performance", max_score: 2 },
  { category: "Indoor Environmental Quality", requirement: "Indoor Air Quality", max_score: 2 },
  { category: "Indoor Environmental Quality", requirement: "Thermal Comfort", max_score: 1 },
  { category: "Indoor Environmental Quality", requirement: "Interior Lighting", max_score: 2 },
  { category: "Indoor Environmental Quality", requirement: "Daylight & Views", max_score: 4 },
  { category: "Indoor Environmental Quality", requirement: "Green Cleaning", max_score: 2 },
  { category: "Sustainable Sites", requirement: "Site Management", max_score: 2 },
  { category: "Sustainable Sites", requirement: "Rainwater Management", max_score: 3 },
  { category: "Sustainable Sites", requirement: "Heat Island Reduction", max_score: 2 },
  { category: "Sustainable Sites", requirement: "Light Pollution Reduction", max_score: 1 },
  { category: "Location & Transportation", requirement: "Alternative Transportation", max_score: 15 },
  { category: "Innovation", requirement: "Innovation Credit 1", max_score: 1 },
  { category: "Innovation", requirement: "Innovation Credit 2", max_score: 1 },
  { category: "Innovation", requirement: "Innovation Credit 3", max_score: 1 },
  { category: "Innovation", requirement: "Innovation Credit 4", max_score: 1 },
  { category: "Innovation", requirement: "Innovation Credit 5", max_score: 1 },
  { category: "Innovation", requirement: "LEED Accredited Professional", max_score: 1 },
  { category: "Regional Priority", requirement: "Regional Priority Credit 1", max_score: 1 },
  { category: "Regional Priority", requirement: "Regional Priority Credit 2", max_score: 1 },
  { category: "Regional Priority", requirement: "Regional Priority Credit 3", max_score: 1 },
  { category: "Regional Priority", requirement: "Regional Priority Credit 4", max_score: 1 },
];

// ─── Template Registry ───
// Key format: "CERT_TYPE|RATING"

const TEMPLATE_REGISTRY: Record<string, CertificationTemplate> = {
  // LEED
  "LEED|BD+C": {
    scorecard: LEED_BDC_SCORECARD,
    timeline: LEED_BDC_TIMELINE,
    label: "LEED BD+C",
  },
  "LEED|ID+C": {
    scorecard: LEED_IDC_SCORECARD,
    timeline: LEED_IDC_TIMELINE,
    label: "LEED ID+C",
  },
  "LEED|O+M": {
    scorecard: LEED_OM_SCORECARD,
    timeline: LEED_OM_TIMELINE,
    label: "LEED O+M",
  },

  // BREEAM
  "BREEAM|New Construction": {
    scorecard: [],
    timeline: BREEAM_NC_REFURB_TIMELINE,
    label: "BREEAM New Construction",
  },
  "BREEAM|Refurbishment": {
    scorecard: [],
    timeline: BREEAM_NC_REFURB_TIMELINE,
    label: "BREEAM Refurbishment",
  },
  "BREEAM|In-Use Part 1": {
    scorecard: [],
    timeline: BREEAM_IU_P1_TIMELINE,
    label: "BREEAM In-Use Part 1",
  },
  "BREEAM|In-Use Part 2": {
    scorecard: [],
    timeline: BREEAM_IU_P2_TIMELINE,
    label: "BREEAM In-Use Part 2",
  },

  // WELL
  "WELL|New & Existing Buildings": {
    scorecard: [],
    timeline: WELL_NC_TIMELINE,
    label: "WELL New & Existing Buildings",
  },
  "WELL|New & Existing Interiors": {
    scorecard: [],
    timeline: WELL_EXISTING_TIMELINE,
    label: "WELL New & Existing Interiors",
  },
  "WELL|Core": {
    scorecard: [],
    timeline: WELL_NC_TIMELINE,
    label: "WELL Core",
  },
};

// ─── Public API ───

/**
 * Get template for a given cert_type and rating.
 * Returns null if no specific template exists.
 */
export function getCertificationTemplate(
  certType: string | null | undefined,
  rating: string | null | undefined
): CertificationTemplate | null {
  if (!certType) return null;
  const key = rating ? `${certType}|${rating}` : certType;
  return TEMPLATE_REGISTRY[key] || null;
}

/**
 * Get a usable template, falling back to generic if not found.
 */
export function getTemplateOrFallback(
  certType: string | null | undefined,
  rating: string | null | undefined
): { template: CertificationTemplate; isGeneric: boolean } {
  const specific = getCertificationTemplate(certType, rating);
  if (specific) return { template: specific, isGeneric: false };

  return {
    template: {
      scorecard: [],
      timeline: GENERIC_TIMELINE,
      label: certType ? `${certType}${rating ? ` ${rating}` : ""}` : "Generico",
    },
    isGeneric: true,
  };
}

// ─── Available options for UI selects ───

export const CERT_TYPES = ["LEED", "WELL", "BREEAM"] as const;

export const CERT_RATINGS: Record<string, string[]> = {
  LEED: ["BD+C", "ID+C", "O+M"],
  WELL: ["New & Existing Buildings", "New & Existing Interiors", "Core"],
  BREEAM: ["New Construction", "Refurbishment", "In-Use Part 1", "In-Use Part 2"],
};

export const CERT_LEVELS: Record<string, string[]> = {
  LEED: ["Certified", "Silver", "Gold", "Platinum"],
  WELL: ["Bronze", "Silver", "Gold", "Platinum"],
  BREEAM: ["Pass", "Good", "Very Good", "Excellent", "Outstanding"],
};

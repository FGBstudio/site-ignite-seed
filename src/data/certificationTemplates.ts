/**
 * Certification Templates Configuration
 * 
 * Elastic system: given a cert_type + rating, returns the correct
 * scorecard categories and timeline steps.
 * 
 * Only LEED templates are fully defined for now.
 * Other certifications use a generic fallback.
 */

import { LEED_TEMPLATE, type LeedCredit } from "./leedTemplate";

// ─── Shared Types ───
export interface ScorecardCategory {
  category: string;
  requirement: string;
  max_score: number;
}

export interface TimelineStep {
  name: string;
  order_index: number;
}

export interface CertificationTemplate {
  scorecard: ScorecardCategory[];
  timeline: TimelineStep[];
  label: string;
}

// ─── LEED BD+C Timeline (17 steps) ───
const LEED_BDC_TIMELINE: TimelineStep[] = [
  { name: "Pre-Design / Goal Setting", order_index: 0 },
  { name: "Integrative Process Workshop", order_index: 1 },
  { name: "LEED Registration", order_index: 2 },
  { name: "Site Assessment & Documentation", order_index: 3 },
  { name: "Design Phase – SD/DD Credits", order_index: 4 },
  { name: "Design Phase – CD Credits", order_index: 5 },
  { name: "Design Review Submission", order_index: 6 },
  { name: "Design Review Response", order_index: 7 },
  { name: "Construction Phase – Prereqs", order_index: 8 },
  { name: "Construction Phase – Credits", order_index: 9 },
  { name: "Commissioning (Cx)", order_index: 10 },
  { name: "Performance Testing", order_index: 11 },
  { name: "Construction Review Submission", order_index: 12 },
  { name: "Construction Review Response", order_index: 13 },
  { name: "Final Documentation", order_index: 14 },
  { name: "GBCI Final Review", order_index: 15 },
  { name: "Certification Award", order_index: 16 },
];

// ─── LEED ID+C Retail Timeline ───
const LEED_IDC_RETAIL_TIMELINE: TimelineStep[] = [
  { name: "Pre-Design / Goal Setting", order_index: 0 },
  { name: "Integrative Process Workshop", order_index: 1 },
  { name: "LEED Registration", order_index: 2 },
  { name: "Baseline Data Collection", order_index: 3 },
  { name: "Design Phase – SD Credits", order_index: 4 },
  { name: "Design Phase – DD Credits", order_index: 5 },
  { name: "Design Phase – CD Credits", order_index: 6 },
  { name: "Design Review Submission", order_index: 7 },
  { name: "Design Review Response", order_index: 8 },
  { name: "Construction – Material Compliance", order_index: 9 },
  { name: "Construction – IAQ Management", order_index: 10 },
  { name: "Commissioning (Cx)", order_index: 11 },
  { name: "Performance Testing & Metering", order_index: 12 },
  { name: "Construction Review Submission", order_index: 13 },
  { name: "Construction Review Response", order_index: 14 },
  { name: "Final Documentation Assembly", order_index: 15 },
  { name: "Certification Award", order_index: 16 },
];

// ─── LEED O+M Timeline ───
const LEED_OM_TIMELINE: TimelineStep[] = [
  { name: "Pre-Assessment / Data Gathering", order_index: 0 },
  { name: "LEED Registration", order_index: 1 },
  { name: "Baseline Energy Audit", order_index: 2 },
  { name: "Performance Period Start", order_index: 3 },
  { name: "Ongoing Data Collection", order_index: 4 },
  { name: "Midpoint Review", order_index: 5 },
  { name: "Performance Period End", order_index: 6 },
  { name: "Documentation Assembly", order_index: 7 },
  { name: "Review Submission", order_index: 8 },
  { name: "Review Response", order_index: 9 },
  { name: "Certification Award", order_index: 10 },
];

// ─── LEED BD+C Scorecard (from leedTemplate.ts) ───
const LEED_BDC_SCORECARD: ScorecardCategory[] = LEED_TEMPLATE.map((c) => ({
  category: c.category,
  requirement: c.requirement,
  max_score: c.max_score,
}));

// ─── LEED ID+C Retail Scorecard (subset / adjusted) ───
// For ID+C Retail we reuse BD+C with minor adjustments. 
// In a real scenario this would be a distinct list; here we use BD+C as a close approximation.
const LEED_IDC_RETAIL_SCORECARD: ScorecardCategory[] = LEED_BDC_SCORECARD;

// ─── LEED O+M Scorecard (simplified) ───
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

// ─── Generic fallback ───
const GENERIC_TIMELINE: TimelineStep[] = [
  { name: "Registrazione", order_index: 0 },
  { name: "Raccolta Documentazione", order_index: 1 },
  { name: "Fase di Design", order_index: 2 },
  { name: "Fase di Costruzione", order_index: 3 },
  { name: "Sottomissione Review", order_index: 4 },
  { name: "Risposta Review", order_index: 5 },
  { name: "Certificazione", order_index: 6 },
];

// ─── Template Registry ───
type TemplateKey = string; // "LEED|BD+C" or "LEED|ID+C Retail" etc.

const TEMPLATE_REGISTRY: Record<TemplateKey, CertificationTemplate> = {
  "LEED|BD+C": {
    scorecard: LEED_BDC_SCORECARD,
    timeline: LEED_BDC_TIMELINE,
    label: "LEED v4.1 BD+C",
  },
  "LEED|ID+C Retail": {
    scorecard: LEED_IDC_RETAIL_SCORECARD,
    timeline: LEED_IDC_RETAIL_TIMELINE,
    label: "LEED v4.1 ID+C Retail",
  },
  "LEED|O+M": {
    scorecard: LEED_OM_SCORECARD,
    timeline: LEED_OM_TIMELINE,
    label: "LEED v4.1 O+M",
  },
};

/**
 * Get template for a given cert_type and rating.
 * Returns null if no specific template exists (use generic fallback).
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
  LEED: ["BD+C", "ID+C Retail", "ID+C", "O+M"],
  WELL: ["New & Existing Buildings", "New & Existing Interiors", "Core"],
  BREEAM: ["New Construction", "In-Use", "Refurbishment"],
};

export const CERT_LEVELS: Record<string, string[]> = {
  LEED: ["Certified", "Silver", "Gold", "Platinum"],
  WELL: ["Bronze", "Silver", "Gold", "Platinum"],
  BREEAM: ["Pass", "Good", "Very Good", "Excellent", "Outstanding"],
};

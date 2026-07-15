/**
 * Certification taxonomy — 3-level hierarchy:
 *   cert_type  →  cert_rating  →  project_subtype (optional)
 *
 * Storage stays on the existing `certifications` columns:
 *   cert_type, cert_rating, project_subtype
 */

export const CERT_TYPES = ["LEED", "WELL", "BREEAM", "ESG"] as const;
export type CertTaxonomyType = (typeof CERT_TYPES)[number];

/** Nested: cert_type → rating → list of subtypes (empty = no subtype level). */
export const TAXONOMY: Record<CertTaxonomyType, Record<string, string[]>> = {
  LEED: {
    "ID+C": ["Retail", "Commercial Interior", "Hospitality"],
    "BD+C": [
      "New Construction",
      "Core & Shell",
      "Hospitality",
      "Warehouses",
      "Healthcare",
      "School",
    ],
    "O+M": ["Existing Buildings", "Interiors"],
    "ND": [],
  },
  BREEAM: {
    "New Construction": [],
    "In Use": ["Part 1", "Part 2"],
    "Refurbishment": [],
  },
  WELL: {
    Standard: [],
    Core: [],
    HSR: [],
  },
  ESG: {
    "7.1": [],
    "7.2": [],
    "7.5": [],
  },
};

/** Ratings available for a given cert_type. */
export function getRatings(certType: string): string[] {
  const bucket = (TAXONOMY as Record<string, Record<string, string[]>>)[certType];
  return bucket ? Object.keys(bucket) : [];
}

/** Subtypes for cert_type + rating. Empty when the rating has no subtype level. */
export function getSubtypes(certType: string, rating: string): string[] {
  const bucket = (TAXONOMY as Record<string, Record<string, string[]>>)[certType];
  return bucket?.[rating] ?? [];
}

// ─── Back-compat exports (legacy LEED-only shape) ───────────────────────────
// Kept so older imports keep compiling. Prefer getRatings/getSubtypes.

export const RATING_SYSTEMS = Object.keys(TAXONOMY.LEED) as readonly string[];
export type RatingSystem = string;
export const RATING_SUBTYPES: Record<string, string[]> = TAXONOMY.LEED;

/**
 * Mapping between LEED Rating Systems and their available Subtypologies.
 * Used for dependent dropdown logic in project creation forms.
 */

export const RATING_SYSTEMS = ["BD+C", "ID+C", "O+M", "Residential", "ND"] as const;
export type RatingSystem = (typeof RATING_SYSTEMS)[number];

export const RATING_SUBTYPES: Record<RatingSystem, string[]> = {
  "BD+C": [
    "New Construction",
    "Core & Shell",
    "Schools",
    "Retail",
    "Data Centers",
    "Warehouses",
    "Hospitality",
    "Healthcare",
  ],
  "ID+C": ["Commercial Interiors", "Retail", "Hospitality"],
  "O+M": [
    "Existing Buildings",
    "Schools",
    "Retail",
    "Data Centers",
    "Warehouses",
    "Hospitality",
  ],
  Residential: ["Single Family", "Multifamily (Lowrise & Midrise)"],
  ND: ["Plan", "Built Project"],
};

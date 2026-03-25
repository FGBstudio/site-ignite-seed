// LEED v4.1 BD+C default credit structure
export interface LeedCredit {
  category: string;
  requirement: string;
  max_score: number;
}

export const LEED_TEMPLATE: LeedCredit[] = [
  // Integrative Process (IP)
  { category: "Integrative Process", requirement: "Integrative Process", max_score: 1 },

  // Location and Transportation (LT)
  { category: "Location & Transportation", requirement: "LEED for Neighborhood Development Location", max_score: 16 },
  { category: "Location & Transportation", requirement: "Sensitive Land Protection", max_score: 1 },
  { category: "Location & Transportation", requirement: "High-Priority Site", max_score: 2 },
  { category: "Location & Transportation", requirement: "Surrounding Density and Diverse Uses", max_score: 5 },
  { category: "Location & Transportation", requirement: "Access to Quality Transit", max_score: 5 },
  { category: "Location & Transportation", requirement: "Bicycle Facilities", max_score: 1 },
  { category: "Location & Transportation", requirement: "Reduced Parking Footprint", max_score: 1 },
  { category: "Location & Transportation", requirement: "Electric Vehicles", max_score: 1 },

  // Sustainable Sites (SS)
  { category: "Sustainable Sites", requirement: "Construction Activity Pollution Prevention (Prereq)", max_score: 0 },
  { category: "Sustainable Sites", requirement: "Site Assessment", max_score: 1 },
  { category: "Sustainable Sites", requirement: "Site Development – Protect or Restore Habitat", max_score: 2 },
  { category: "Sustainable Sites", requirement: "Open Space", max_score: 1 },
  { category: "Sustainable Sites", requirement: "Rainwater Management", max_score: 3 },
  { category: "Sustainable Sites", requirement: "Heat Island Reduction", max_score: 2 },
  { category: "Sustainable Sites", requirement: "Light Pollution Reduction", max_score: 1 },

  // Water Efficiency (WE)
  { category: "Water Efficiency", requirement: "Outdoor Water Use Reduction (Prereq)", max_score: 0 },
  { category: "Water Efficiency", requirement: "Indoor Water Use Reduction (Prereq)", max_score: 0 },
  { category: "Water Efficiency", requirement: "Building-Level Water Metering (Prereq)", max_score: 0 },
  { category: "Water Efficiency", requirement: "Outdoor Water Use Reduction", max_score: 2 },
  { category: "Water Efficiency", requirement: "Indoor Water Use Reduction", max_score: 6 },
  { category: "Water Efficiency", requirement: "Cooling Tower Water Use", max_score: 2 },
  { category: "Water Efficiency", requirement: "Water Metering", max_score: 1 },

  // Energy and Atmosphere (EA)
  { category: "Energy & Atmosphere", requirement: "Fundamental Commissioning and Verification (Prereq)", max_score: 0 },
  { category: "Energy & Atmosphere", requirement: "Minimum Energy Performance (Prereq)", max_score: 0 },
  { category: "Energy & Atmosphere", requirement: "Building-Level Energy Metering (Prereq)", max_score: 0 },
  { category: "Energy & Atmosphere", requirement: "Fundamental Refrigerant Management (Prereq)", max_score: 0 },
  { category: "Energy & Atmosphere", requirement: "Enhanced Commissioning", max_score: 6 },
  { category: "Energy & Atmosphere", requirement: "Optimize Energy Performance", max_score: 18 },
  { category: "Energy & Atmosphere", requirement: "Advanced Energy Metering", max_score: 1 },
  { category: "Energy & Atmosphere", requirement: "Demand Response", max_score: 2 },
  { category: "Energy & Atmosphere", requirement: "Renewable Energy Production", max_score: 3 },
  { category: "Energy & Atmosphere", requirement: "Enhanced Refrigerant Management", max_score: 1 },
  { category: "Energy & Atmosphere", requirement: "Green Power and Carbon Offsets", max_score: 2 },

  // Materials and Resources (MR)
  { category: "Materials & Resources", requirement: "Storage and Collection of Recyclables (Prereq)", max_score: 0 },
  { category: "Materials & Resources", requirement: "Construction and Demolition Waste Management Planning (Prereq)", max_score: 0 },
  { category: "Materials & Resources", requirement: "Building Life-Cycle Impact Reduction", max_score: 5 },
  { category: "Materials & Resources", requirement: "Building Product Disclosure – EPD", max_score: 2 },
  { category: "Materials & Resources", requirement: "Building Product Disclosure – Sourcing of Raw Materials", max_score: 2 },
  { category: "Materials & Resources", requirement: "Building Product Disclosure – Material Ingredients", max_score: 2 },
  { category: "Materials & Resources", requirement: "Construction and Demolition Waste Management", max_score: 2 },

  // Indoor Environmental Quality (EQ)
  { category: "Indoor Environmental Quality", requirement: "Minimum Indoor Air Quality Performance (Prereq)", max_score: 0 },
  { category: "Indoor Environmental Quality", requirement: "Environmental Tobacco Smoke Control (Prereq)", max_score: 0 },
  { category: "Indoor Environmental Quality", requirement: "Enhanced Indoor Air Quality Strategies", max_score: 2 },
  { category: "Indoor Environmental Quality", requirement: "Low-Emitting Materials", max_score: 3 },
  { category: "Indoor Environmental Quality", requirement: "Construction Indoor Air Quality Management Plan", max_score: 1 },
  { category: "Indoor Environmental Quality", requirement: "Indoor Air Quality Assessment", max_score: 2 },
  { category: "Indoor Environmental Quality", requirement: "Thermal Comfort", max_score: 1 },
  { category: "Indoor Environmental Quality", requirement: "Interior Lighting", max_score: 2 },
  { category: "Indoor Environmental Quality", requirement: "Daylight", max_score: 3 },
  { category: "Indoor Environmental Quality", requirement: "Quality Views", max_score: 1 },
  { category: "Indoor Environmental Quality", requirement: "Acoustic Performance", max_score: 1 },

  // Innovation (IN)
  { category: "Innovation", requirement: "Innovation Credit 1", max_score: 1 },
  { category: "Innovation", requirement: "Innovation Credit 2", max_score: 1 },
  { category: "Innovation", requirement: "Innovation Credit 3", max_score: 1 },
  { category: "Innovation", requirement: "Innovation Credit 4", max_score: 1 },
  { category: "Innovation", requirement: "Innovation Credit 5", max_score: 1 },
  { category: "Innovation", requirement: "LEED Accredited Professional", max_score: 1 },

  // Regional Priority (RP)
  { category: "Regional Priority", requirement: "Regional Priority Credit 1", max_score: 1 },
  { category: "Regional Priority", requirement: "Regional Priority Credit 2", max_score: 1 },
  { category: "Regional Priority", requirement: "Regional Priority Credit 3", max_score: 1 },
  { category: "Regional Priority", requirement: "Regional Priority Credit 4", max_score: 1 },
];

// LEED certification levels
export const LEED_LEVELS = [
  { label: "Certified", min: 40, max: 49, color: "hsl(var(--muted-foreground))" },
  { label: "Silver", min: 50, max: 59, color: "hsl(210, 10%, 70%)" },
  { label: "Gold", min: 60, max: 79, color: "hsl(45, 90%, 50%)" },
  { label: "Platinum", min: 80, max: 110, color: "hsl(210, 15%, 40%)" },
];

export function getLeedLevel(score: number) {
  return LEED_LEVELS.find((l) => score >= l.min && score <= l.max) || null;
}

export const LEED_MAX_TOTAL = 110;

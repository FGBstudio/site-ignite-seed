import { useState, useCallback } from "react";

const STORAGE_KEY = "project-wizard-draft";

export interface CertEntry {
  cert_type: string;
  cert_rating: string;
  cert_level: string;
  project_subtype: string;
  is_commissioning: boolean;
  pm_id: string;
}

export interface WizardDraft {
  // Step 1: Site
  brand_id: string;
  site_id: string;
  site_name: string;
  address: string;
  city: string;
  country: string;
  region: string;
  lat: number | null;
  lng: number | null;
  area_m2: number | null;
  timezone: string;
  module_energy_enabled: boolean;
  module_air_enabled: boolean;
  module_water_enabled: boolean;
  create_new_site: boolean;
  holding_id: string;

  // Step 2: Project (no PM here — it's per-certification now)
  project_name: string;
  client: string;
  handover_date: string;
  status: string;
  project_type: string;

  // Step 3: Certifications (multi)
  certifications: CertEntry[];

  // Legacy single-cert fields kept for migration only
  pm_id?: string;
  cert_type?: string;
  cert_rating?: string;
  cert_level?: string;
  project_subtype?: string;
  is_commissioning?: boolean;
}

export const EMPTY_CERT: CertEntry = {
  cert_type: "",
  cert_rating: "",
  cert_level: "",
  project_subtype: "",
  is_commissioning: false,
  pm_id: "",
};

export const EMPTY_DRAFT: WizardDraft = {
  brand_id: "",
  site_id: "",
  site_name: "",
  address: "",
  city: "",
  country: "",
  region: "Europe",
  lat: null,
  lng: null,
  area_m2: null,
  timezone: "UTC",
  module_energy_enabled: false,
  module_air_enabled: false,
  module_water_enabled: false,
  create_new_site: false,
  holding_id: "",
  project_name: "",
  client: "",
  handover_date: "",
  status: "Design",
  project_type: "",
  certifications: [],
};

/** Migrate old single-cert drafts to the new multi-cert array format */
function migrateDraft(raw: any): WizardDraft {
  if (raw.certifications && Array.isArray(raw.certifications)) {
    // Already new format
    return raw as WizardDraft;
  }

  // Old format — convert single cert fields to certifications array
  const certifications: CertEntry[] = [];
  if (raw.cert_type) {
    certifications.push({
      cert_type: raw.cert_type || "",
      cert_rating: raw.cert_rating || "",
      cert_level: raw.cert_level || "",
      project_subtype: raw.project_subtype || "",
      is_commissioning: raw.is_commissioning || false,
      pm_id: raw.pm_id || "",
    });
  }

  return {
    ...EMPTY_DRAFT,
    ...raw,
    certifications,
  };
}

function loadDraft(): WizardDraft | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return migrateDraft(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function useWizardDraft() {
  const [draft, setDraft] = useState<WizardDraft>(() => loadDraft() ?? { ...EMPTY_DRAFT });
  const [hasSavedDraft, setHasSavedDraft] = useState(() => !!loadDraft());

  const updateDraft = useCallback((partial: Partial<WizardDraft>) => {
    setDraft((prev) => {
      const next = { ...prev, ...partial };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const clearDraft = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setDraft({ ...EMPTY_DRAFT });
    setHasSavedDraft(false);
  }, []);

  const discardDraft = useCallback(() => {
    clearDraft();
  }, [clearDraft]);

  return { draft, updateDraft, clearDraft, discardDraft, hasSavedDraft };
}

// Type definitions for the Monitor → Water table.
// Mirrors public.site_water_records.

export interface SiteWaterRecord {
  id: string;
  site_id: string;
  certification_id: string | null;
  pm_id: string | null;

  project_name: string;
  status: string;
  online_status: string | null;
  notes: string | null;

  total_sensors: number;
  po_numbers: string[];
  handover_date: string | null;

  created_at: string;
  updated_at: string;
}

export type SiteWaterRecordPatch = Partial<
  Omit<SiteWaterRecord, "id" | "site_id" | "created_at" | "updated_at">
>;

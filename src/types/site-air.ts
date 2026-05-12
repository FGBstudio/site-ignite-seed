// Type definitions for the Monitor → Air table.
// Mirrors public.site_air_records.

export interface SiteAirRecord {
  id: string;
  certification_id: string;
  site_id: string | null;
  pm_id: string | null;

  project_name: string | null;
  status: string | null;
  
  // Aggregate & Hardware Data
  total_sensors: number;
  device_ids: string[];
  mac_addresses: string[];
  po_numbers: string[];
  shipment_dates: string[];
  
  online_status: string | null;
  notes: string | null;

  created_at: string;
  updated_at: string;
}

export type SiteAirRecordPatch = Partial<Omit<SiteAirRecord, "id" | "certification_id" | "created_at" | "updated_at">>;

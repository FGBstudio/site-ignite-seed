// Type definitions for the Monitor → Energy table.
// Mirrors public.site_energy_records.

export interface SiteEnergyRecord {
  id: string;
  certification_id: string;
  site_id: string | null;
  brand_id: string | null;
  pm_id: string | null;

  project_name: string | null;
  brand_name: string | null;
  region: string | null;
  country: string | null;
  city: string | null;

  status: string | null;
  frequency: number | null;
  free_software_year: number | null;
  installation_date: string | null;
  contracted: string | null;
  handover_date: string | null;
  category: string | null;
  po_number: string | null;
  installer: string | null;
  reference_contact: string | null;

  package_a: boolean | null;
  package_b: boolean | null;
  customized_package: boolean | null;
  package_type: "A" | "B" | "Customized" | null;

  additional_sensors: number | null;
  additional_bridge: number | null;
  additional_pan42: number | null;

  total_sensors: number | null;
  total_bridges: number | null;
  no_pan10: number | null;
  no_pan12: number | null;
  no_pan14: number | null;
  no_ct: number | null;
  no_mango: number | null;
  fx_rate_usd_eur: number | null;

  bridge_total_cost: number | null;
  sensor_total_cost: number | null;
  total_package_cost_usd: number | null;
  total_package_cost_eur: number | null;

  duty_customs_inbound: number | null;
  vat_fee: number | null;
  pickup_cost: number | null;
  shipment_cost: number | null;
  outbound_custom_cost: number | null;
  installation_cost: number | null;

  quotation_value: number | null;
  company_cost_pct: number | null;
  fgb_resource: number | null;
  total_cost: number | null;
  planned_remaining_value: number | null;
  taxes: number | null;
  profit: number | null;
  roi_pct: number | null;

  tracking_number: string | null;
  ip_configuration: string | null;
  assigned_port: string | null;
  ip_address: string | null;
  subnet_mask: string | null;
  gateway: string | null;
  dns1: string | null;
  dns2: string | null;

  online_status: string | null;
  notes: string | null;

  locked: boolean;
  created_at: string;
  updated_at: string;
}

export type SiteEnergyRecordPatch = Partial<Omit<SiteEnergyRecord, "id" | "certification_id" | "created_at" | "updated_at">>;

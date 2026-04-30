
-- 1. project_allocations: category / requested_quantity / source
ALTER TABLE public.project_allocations
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS requested_quantity integer,
  ADD COLUMN IF NOT EXISTS source text;

COMMENT ON COLUMN public.project_allocations.category IS 'AIR | ENERGY';
COMMENT ON COLUMN public.project_allocations.source   IS 'pm_request | ct_builder';

-- 2. hardwares: bridge network configuration
ALTER TABLE public.hardwares
  ADD COLUMN IF NOT EXISTS ip_configuration text,
  ADD COLUMN IF NOT EXISTS assigned_port    text,
  ADD COLUMN IF NOT EXISTS ip_address       text,
  ADD COLUMN IF NOT EXISTS subnet_mask      text,
  ADD COLUMN IF NOT EXISTS gateway          text,
  ADD COLUMN IF NOT EXISTS dns1             text,
  ADD COLUMN IF NOT EXISTS dns2             text;

-- 3. site_energy_records: feeds Monitor → Energy table
CREATE TABLE IF NOT EXISTS public.site_energy_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  certification_id uuid NOT NULL REFERENCES public.certifications(id) ON DELETE CASCADE,
  site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL,
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  pm_id uuid,

  project_name text,
  brand_name text,
  region text,
  country text,
  city text,

  status text DEFAULT 'Upcoming',
  frequency integer,
  free_software_year integer,
  installation_date date,
  contracted text,
  handover_date date,
  category text,
  po_number text,
  installer text,
  reference_contact text,

  package_a boolean DEFAULT false,
  package_b boolean DEFAULT false,
  customized_package boolean DEFAULT false,

  additional_sensors integer DEFAULT 0,
  additional_bridge integer DEFAULT 0,
  additional_pan42 integer DEFAULT 0,

  total_sensors integer DEFAULT 0,
  total_bridges integer DEFAULT 0,
  no_pan10 integer DEFAULT 0,
  no_pan12 integer DEFAULT 0,
  no_pan14 integer DEFAULT 0,
  no_ct integer DEFAULT 0,

  bridge_total_cost numeric DEFAULT 0,
  sensor_total_cost numeric DEFAULT 0,
  total_package_cost_usd numeric DEFAULT 0,
  total_package_cost_eur numeric DEFAULT 0,

  duty_customs_inbound numeric DEFAULT 0,
  vat_fee numeric DEFAULT 0,
  pickup_cost numeric DEFAULT 0,
  shipment_cost numeric DEFAULT 0,
  outbound_custom_cost numeric DEFAULT 0,
  installation_cost numeric DEFAULT 0,

  quotation_value numeric DEFAULT 0,
  company_cost_pct numeric DEFAULT 20,
  fgb_resource numeric DEFAULT 0,
  total_cost numeric DEFAULT 0,
  planned_remaining_value numeric DEFAULT 0,
  taxes numeric DEFAULT 0,
  profit numeric DEFAULT 0,
  roi_pct numeric DEFAULT 0,

  tracking_number text,
  ip_configuration text,
  assigned_port text,
  ip_address text,
  subnet_mask text,
  gateway text,
  dns1 text,
  dns2 text,

  online_status text,
  notes text,

  locked boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS site_energy_records_certification_uniq
  ON public.site_energy_records (certification_id);

CREATE INDEX IF NOT EXISTS site_energy_records_site_idx
  ON public.site_energy_records (site_id);

ALTER TABLE public.site_energy_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage site_energy_records"
  ON public.site_energy_records
  FOR ALL
  TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "PM read site_energy_records for own certifications"
  ON public.site_energy_records
  FOR SELECT
  TO authenticated
  USING (is_cert_pm(auth.uid(), certification_id));

-- updated_at trigger
CREATE TRIGGER trg_site_energy_records_updated_at
  BEFORE UPDATE ON public.site_energy_records
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

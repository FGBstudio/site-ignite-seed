ALTER TABLE public.site_energy_records
ADD COLUMN IF NOT EXISTS ct_builder_snapshot jsonb;
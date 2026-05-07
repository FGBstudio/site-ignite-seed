ALTER TABLE public.site_energy_records
  ADD COLUMN IF NOT EXISTS package_type text,
  ADD COLUMN IF NOT EXISTS additional_sensors integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS additional_bridge integer NOT NULL DEFAULT 0;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'site_energy_records_package_type_check'
  ) THEN
    ALTER TABLE public.site_energy_records
      ADD CONSTRAINT site_energy_records_package_type_check
      CHECK (package_type IS NULL OR package_type IN ('A','B','Customized'));
  END IF;
END $$;
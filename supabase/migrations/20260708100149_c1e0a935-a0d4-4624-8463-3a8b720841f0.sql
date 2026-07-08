
CREATE TABLE IF NOT EXISTS public.site_water_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL UNIQUE REFERENCES public.sites(id) ON DELETE CASCADE,
  certification_id uuid REFERENCES public.certifications(id) ON DELETE SET NULL,
  pm_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  project_name text NOT NULL,
  status text NOT NULL DEFAULT 'Requested',
  online_status text,
  notes text,
  total_sensors integer DEFAULT 0,
  po_numbers text[] DEFAULT '{}'::text[],
  handover_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_site_water_records_site_id ON public.site_water_records(site_id);
CREATE INDEX IF NOT EXISTS idx_site_water_records_cert_id ON public.site_water_records(certification_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_water_records TO authenticated;
GRANT ALL ON public.site_water_records TO service_role;

ALTER TABLE public.site_water_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins full access site_water_records" ON public.site_water_records;
CREATE POLICY "Admins full access site_water_records"
  ON public.site_water_records FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "PMs read their site_water_records" ON public.site_water_records;
CREATE POLICY "PMs read their site_water_records"
  ON public.site_water_records FOR SELECT TO authenticated
  USING (pm_id = auth.uid() OR public.is_admin(auth.uid()));

DROP TRIGGER IF EXISTS trg_site_water_records_updated_at ON public.site_water_records;
CREATE TRIGGER trg_site_water_records_updated_at
  BEFORE UPDATE ON public.site_water_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.sync_site_monitoring_from_certs(p_site_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_iaq boolean; v_has_energy boolean; v_has_water boolean;
  v_types text[]; v_project text; v_cert RECORD;
BEGIN
  IF p_site_id IS NULL THEN RETURN; END IF;

  SELECT bool_or(COALESCE(has_iaq_monitoring,false)),
         bool_or(COALESCE(has_energy_monitoring,false)),
         bool_or(COALESCE(has_water_monitoring,false))
    INTO v_has_iaq, v_has_energy, v_has_water
    FROM public.certifications WHERE site_id = p_site_id;

  v_has_iaq := COALESCE(v_has_iaq,false);
  v_has_energy := COALESCE(v_has_energy,false);
  v_has_water := COALESCE(v_has_water,false);

  v_types := ARRAY[]::text[];
  IF v_has_iaq    THEN v_types := array_append(v_types, 'AIR'); END IF;
  IF v_has_energy THEN v_types := array_append(v_types, 'ENERGY'); END IF;
  IF v_has_water  THEN v_types := array_append(v_types, 'WATER'); END IF;

  UPDATE public.sites
     SET monitoring_types = v_types,
         module_air_enabled = v_has_iaq,
         module_energy_enabled = v_has_energy,
         module_water_enabled = v_has_water,
         updated_at = now()
   WHERE id = p_site_id;

  SELECT name INTO v_project FROM public.sites WHERE id = p_site_id;

  SELECT id, pm_id, handover_date, name
    INTO v_cert
    FROM public.certifications
   WHERE site_id = p_site_id
   ORDER BY created_at DESC LIMIT 1;

  IF v_cert.id IS NULL THEN RETURN; END IF;

  IF v_has_iaq THEN
    INSERT INTO public.site_air_records (site_id, certification_id, pm_id, project_name, status)
    VALUES (p_site_id, v_cert.id, v_cert.pm_id, COALESCE(v_project, v_cert.name, 'Site'), 'Requested')
    ON CONFLICT (site_id) DO UPDATE SET
      certification_id = COALESCE(public.site_air_records.certification_id, EXCLUDED.certification_id),
      pm_id = COALESCE(public.site_air_records.pm_id, EXCLUDED.pm_id),
      project_name = COALESCE(public.site_air_records.project_name, EXCLUDED.project_name),
      updated_at = now();

    IF v_cert.pm_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.task_alerts
       WHERE certification_id = v_cert.id AND alert_type='monitoring_iaq_requested' AND is_resolved=false
    ) THEN
      INSERT INTO public.task_alerts (certification_id, created_by, alert_type, title, description, escalate_to_admin, is_resolved, target_route)
      VALUES (v_cert.id, v_cert.pm_id, 'monitoring_iaq_requested',
              'IAQ monitoring requested',
              'IAQ monitoring flagged on certification ' || COALESCE(v_cert.name,''),
              true, false, '/monitor');
    END IF;
  END IF;

  IF v_has_energy THEN
    INSERT INTO public.site_energy_records (certification_id, site_id, pm_id, project_name, handover_date, status, created_at, updated_at)
    VALUES (v_cert.id, p_site_id, v_cert.pm_id, COALESCE(v_project, v_cert.name, 'Site'), v_cert.handover_date, 'Requested', now(), now())
    ON CONFLICT (certification_id) DO UPDATE SET
      site_id = COALESCE(public.site_energy_records.site_id, EXCLUDED.site_id),
      pm_id = COALESCE(public.site_energy_records.pm_id, EXCLUDED.pm_id),
      project_name = COALESCE(public.site_energy_records.project_name, EXCLUDED.project_name),
      updated_at = now();

    IF v_cert.pm_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.task_alerts
       WHERE certification_id = v_cert.id AND alert_type='monitoring_energy_requested' AND is_resolved=false
    ) THEN
      INSERT INTO public.task_alerts (certification_id, created_by, alert_type, title, description, escalate_to_admin, is_resolved, target_route)
      VALUES (v_cert.id, v_cert.pm_id, 'monitoring_energy_requested',
              'Energy monitoring requested',
              'Energy monitoring flagged on certification ' || COALESCE(v_cert.name,''),
              true, false, '/monitor');
    END IF;
  END IF;

  IF v_has_water THEN
    INSERT INTO public.site_water_records (site_id, certification_id, pm_id, project_name, status, handover_date)
    VALUES (p_site_id, v_cert.id, v_cert.pm_id, COALESCE(v_project, v_cert.name, 'Site'), 'Requested', v_cert.handover_date)
    ON CONFLICT (site_id) DO UPDATE SET
      certification_id = COALESCE(public.site_water_records.certification_id, EXCLUDED.certification_id),
      pm_id = COALESCE(public.site_water_records.pm_id, EXCLUDED.pm_id),
      project_name = COALESCE(public.site_water_records.project_name, EXCLUDED.project_name),
      updated_at = now();

    IF v_cert.pm_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.task_alerts
       WHERE certification_id = v_cert.id AND alert_type='monitoring_water_requested' AND is_resolved=false
    ) THEN
      INSERT INTO public.task_alerts (certification_id, created_by, alert_type, title, description, escalate_to_admin, is_resolved, target_route)
      VALUES (v_cert.id, v_cert.pm_id, 'monitoring_water_requested',
              'Water monitoring requested',
              'Water monitoring flagged on certification ' || COALESCE(v_cert.name,''),
              true, false, '/monitor');
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_certs_sync_monitoring()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    PERFORM public.sync_site_monitoring_from_certs(NEW.site_id);
  ELSIF TG_OP='UPDATE' THEN
    IF NEW.site_id IS DISTINCT FROM OLD.site_id THEN
      PERFORM public.sync_site_monitoring_from_certs(OLD.site_id);
      PERFORM public.sync_site_monitoring_from_certs(NEW.site_id);
    ELSIF (NEW.has_iaq_monitoring IS DISTINCT FROM OLD.has_iaq_monitoring)
       OR (NEW.has_energy_monitoring IS DISTINCT FROM OLD.has_energy_monitoring)
       OR (NEW.has_water_monitoring IS DISTINCT FROM OLD.has_water_monitoring) THEN
      PERFORM public.sync_site_monitoring_from_certs(NEW.site_id);
    END IF;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'trg_certs_sync_monitoring failed: %', SQLERRM;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_certifications_sync_monitoring ON public.certifications;
CREATE TRIGGER trg_certifications_sync_monitoring
  AFTER INSERT OR UPDATE OF site_id, has_iaq_monitoring, has_energy_monitoring, has_water_monitoring
  ON public.certifications
  FOR EACH ROW EXECUTE FUNCTION public.trg_certs_sync_monitoring();

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT DISTINCT site_id FROM public.certifications WHERE site_id IS NOT NULL LOOP
    PERFORM public.sync_site_monitoring_from_certs(r.site_id);
  END LOOP;
END $$;

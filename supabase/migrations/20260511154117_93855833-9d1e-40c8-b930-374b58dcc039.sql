
-- 1. Granular service flags on certifications
ALTER TABLE public.certifications
  ADD COLUMN IF NOT EXISTS has_iaq_monitoring boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_energy_monitoring boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_water_monitoring boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_hardware_redirection boolean NOT NULL DEFAULT false;

UPDATE public.certifications
SET has_energy_monitoring = true
WHERE fgb_monitor = true AND has_energy_monitoring = false;

-- 2. project_allocations: placeholder + replacement link
ALTER TABLE public.project_allocations
  ADD COLUMN IF NOT EXISTS is_generic_placeholder boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS replaced_by_allocation_id uuid NULL REFERENCES public.project_allocations(id) ON DELETE SET NULL;

-- 3. task_alerts: new alert types + target_route
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_alert_type') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid=t.oid WHERE t.typname='task_alert_type' AND e.enumlabel='monitoring_iaq_requested') THEN
      ALTER TYPE public.task_alert_type ADD VALUE 'monitoring_iaq_requested';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid=t.oid WHERE t.typname='task_alert_type' AND e.enumlabel='monitoring_energy_requested') THEN
      ALTER TYPE public.task_alert_type ADD VALUE 'monitoring_energy_requested';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid=t.oid WHERE t.typname='task_alert_type' AND e.enumlabel='monitoring_water_requested') THEN
      ALTER TYPE public.task_alert_type ADD VALUE 'monitoring_water_requested';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid=t.oid WHERE t.typname='task_alert_type' AND e.enumlabel='monitoring_energy_ready_to_assign') THEN
      ALTER TYPE public.task_alert_type ADD VALUE 'monitoring_energy_ready_to_assign';
    END IF;
  END IF;
END $$;

ALTER TABLE public.task_alerts
  ADD COLUMN IF NOT EXISTS target_route text NULL;

-- 4. SER unique index for upsert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='site_energy_records' AND indexname='site_energy_records_certification_id_uniq'
  ) THEN
    BEGIN
      CREATE UNIQUE INDEX site_energy_records_certification_id_uniq
        ON public.site_energy_records(certification_id);
    EXCEPTION WHEN others THEN NULL;
    END;
  END IF;
END $$;

-- 5. SER sync trigger function
CREATE OR REPLACE FUNCTION public.sync_ser_from_cert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_should_exist boolean;
BEGIN
  v_should_exist := COALESCE(NEW.has_energy_monitoring, false) OR COALESCE(NEW.has_hardware_redirection, false);

  IF v_should_exist THEN
    INSERT INTO public.site_energy_records (certification_id, site_id, pm_id, project_name, handover_date, status, created_at, updated_at)
    VALUES (NEW.id, NEW.site_id, NEW.pm_id, NEW.name, NEW.handover_date, 'Active', now(), now())
    ON CONFLICT (certification_id) DO UPDATE
      SET site_id = EXCLUDED.site_id,
          pm_id = EXCLUDED.pm_id,
          project_name = EXCLUDED.project_name,
          handover_date = EXCLUDED.handover_date,
          updated_at = now();
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'sync_ser_from_cert failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cert_sync_ser ON public.certifications;
CREATE TRIGGER trg_cert_sync_ser
  AFTER INSERT OR UPDATE OF has_energy_monitoring, has_hardware_redirection, pm_id, site_id, name, handover_date
  ON public.certifications
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_ser_from_cert();

-- Backfill SER rows for newly flagged certs
INSERT INTO public.site_energy_records (certification_id, site_id, pm_id, project_name, handover_date, status, created_at, updated_at)
SELECT c.id, c.site_id, c.pm_id, c.name, c.handover_date, 'Active', now(), now()
FROM public.certifications c
WHERE (c.has_energy_monitoring OR c.has_hardware_redirection)
  AND NOT EXISTS (SELECT 1 FROM public.site_energy_records s WHERE s.certification_id = c.id)
ON CONFLICT (certification_id) DO NOTHING;

-- 6. Monitoring alert trigger on project_allocations insert
CREATE OR REPLACE FUNCTION public.create_monitoring_alert_on_allocation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cert RECORD;
  v_product RECORD;
  v_pm_name text;
  v_alert_type public.task_alert_type;
  v_title text;
  v_description text;
  v_route text;
  v_category text;
BEGIN
  SELECT c.* INTO v_cert FROM public.certifications c WHERE c.id = NEW.certification_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT p.* INTO v_product FROM public.products p WHERE p.id = NEW.product_id;
  v_category := lower(COALESCE(v_product.category, ''));

  SELECT COALESCE(pr.full_name, pr.display_name, pr.email, 'PM')
    INTO v_pm_name
    FROM public.profiles pr WHERE pr.user_id = v_cert.pm_id;

  IF NEW.is_generic_placeholder = true OR v_category = 'energy' THEN
    v_alert_type := 'monitoring_energy_requested';
    v_title := 'Energy monitoring requested';
    v_description := COALESCE(v_pm_name, 'PM') || ' requested an energy monitoring system for project ' || COALESCE(v_cert.name, '');
    v_route := '/projects/' || v_cert.id::text || '/hardware/energy';
  ELSIF v_category IN ('iaq','air','clair') THEN
    v_alert_type := 'monitoring_iaq_requested';
    v_title := 'IAQ monitors requested';
    v_description := COALESCE(v_pm_name, 'PM') || ' requested ' || NEW.quantity || ' IAQ monitor(s) for project ' || COALESCE(v_cert.name, '');
    v_route := '/monitor/assign/' || v_cert.id::text;
  ELSIF v_category = 'water' THEN
    v_alert_type := 'monitoring_water_requested';
    v_title := 'Water monitoring requested';
    v_description := COALESCE(v_pm_name, 'PM') || ' requested water monitoring for project ' || COALESCE(v_cert.name, '');
    v_route := '/monitor/assign/' || v_cert.id::text;
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.task_alerts
    (certification_id, created_by, alert_type, title, description, escalate_to_admin, is_resolved, target_route)
  VALUES
    (v_cert.id, v_cert.pm_id, v_alert_type, v_title, v_description, true, false, v_route);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'create_monitoring_alert_on_allocation failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_allocation_create_monitoring_alert ON public.project_allocations;
CREATE TRIGGER trg_allocation_create_monitoring_alert
  AFTER INSERT ON public.project_allocations
  FOR EACH ROW
  EXECUTE FUNCTION public.create_monitoring_alert_on_allocation();

-- 7. CT Builder Confirm RPC
CREATE OR REPLACE FUNCTION public.rpc_confirm_energy_ct_build(
  p_cert_id uuid,
  p_components jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_generic_id uuid;
  v_comp jsonb;
  v_new_id uuid;
  v_inserted_ids uuid[] := '{}';
  v_target_date date;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can confirm CT build';
  END IF;

  SELECT id INTO v_generic_id
  FROM public.project_allocations
  WHERE certification_id = p_cert_id
    AND is_generic_placeholder = true
    AND status = 'Requested'
  ORDER BY created_at DESC
  LIMIT 1;

  SELECT (handover_date - INTERVAL '15 days')::date INTO v_target_date
  FROM public.certifications WHERE id = p_cert_id;

  FOR v_comp IN SELECT * FROM jsonb_array_elements(p_components) LOOP
    INSERT INTO public.project_allocations
      (certification_id, product_id, quantity, requested_quantity, status, target_date, source, is_generic_placeholder)
    VALUES
      (p_cert_id,
       (v_comp->>'product_id')::uuid,
       (v_comp->>'quantity')::int,
       (v_comp->>'quantity')::int,
       'Requested',
       v_target_date,
       'ct_builder',
       false)
    RETURNING id INTO v_new_id;
    v_inserted_ids := array_append(v_inserted_ids, v_new_id);
  END LOOP;

  IF v_generic_id IS NOT NULL THEN
    UPDATE public.project_allocations
      SET status = 'Replaced',
          replaced_by_allocation_id = v_inserted_ids[1]
      WHERE id = v_generic_id;
  END IF;

  UPDATE public.task_alerts
    SET is_resolved = true, resolved_at = now()
    WHERE certification_id = p_cert_id
      AND alert_type = 'monitoring_energy_requested'
      AND is_resolved = false;

  INSERT INTO public.task_alerts
    (certification_id, created_by, alert_type, title, description, escalate_to_admin, is_resolved, target_route)
  VALUES
    (p_cert_id, auth.uid(), 'monitoring_energy_ready_to_assign',
     'Energy components ready to assign',
     'CT Builder confirmed. Assign serial numbers to the site.',
     true, false, '/monitor/assign/' || p_cert_id::text);

  RETURN jsonb_build_object(
    'replaced_generic_id', v_generic_id,
    'inserted_allocation_ids', v_inserted_ids
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_confirm_energy_ct_build(uuid, jsonb) TO authenticated;

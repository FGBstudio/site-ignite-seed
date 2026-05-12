CREATE OR REPLACE FUNCTION public.create_monitoring_alert_on_allocation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    FROM public.profiles pr WHERE pr.id = v_cert.pm_id;

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
$function$;

-- Backfill missing alerts for existing PM hardware requests
INSERT INTO public.task_alerts (certification_id, created_by, alert_type, title, description, escalate_to_admin, is_resolved, target_route)
SELECT
  pa.certification_id,
  c.pm_id,
  CASE
    WHEN pa.is_generic_placeholder = true OR lower(COALESCE(p.category,'')) = 'energy' THEN 'monitoring_energy_requested'::public.task_alert_type
    WHEN lower(COALESCE(p.category,'')) IN ('iaq','air','clair') THEN 'monitoring_iaq_requested'::public.task_alert_type
    WHEN lower(COALESCE(p.category,'')) = 'water' THEN 'monitoring_water_requested'::public.task_alert_type
  END AS alert_type,
  CASE
    WHEN pa.is_generic_placeholder = true OR lower(COALESCE(p.category,'')) = 'energy' THEN 'Energy monitoring requested'
    WHEN lower(COALESCE(p.category,'')) IN ('iaq','air','clair') THEN 'IAQ monitors requested'
    WHEN lower(COALESCE(p.category,'')) = 'water' THEN 'Water monitoring requested'
  END AS title,
  COALESCE(pr.full_name, pr.display_name, pr.email, 'PM') || ' requested ' ||
    CASE
      WHEN pa.is_generic_placeholder = true OR lower(COALESCE(p.category,'')) = 'energy' THEN 'an energy monitoring system'
      WHEN lower(COALESCE(p.category,'')) IN ('iaq','air','clair') THEN pa.quantity::text || ' IAQ monitor(s)'
      WHEN lower(COALESCE(p.category,'')) = 'water' THEN 'water monitoring'
    END || ' for project ' || COALESCE(c.name,'') AS description,
  true,
  false,
  CASE
    WHEN pa.is_generic_placeholder = true OR lower(COALESCE(p.category,'')) = 'energy' THEN '/projects/' || c.id::text || '/hardware/energy'
    ELSE '/monitor/assign/' || c.id::text
  END AS target_route
FROM public.project_allocations pa
JOIN public.certifications c ON c.id = pa.certification_id
LEFT JOIN public.products p ON p.id = pa.product_id
LEFT JOIN public.profiles pr ON pr.id = c.pm_id
WHERE pa.source = 'pm_request'
  AND (pa.is_generic_placeholder = true OR lower(COALESCE(p.category,'')) IN ('energy','iaq','air','clair','water'))
  AND NOT EXISTS (
    SELECT 1 FROM public.task_alerts ta
    WHERE ta.certification_id = pa.certification_id
      AND ta.alert_type::text IN ('monitoring_energy_requested','monitoring_iaq_requested','monitoring_water_requested')
      AND ta.is_resolved = false
  );
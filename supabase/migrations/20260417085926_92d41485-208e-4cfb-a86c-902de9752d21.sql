-- 1. Add new alert type 'extra_canone' to the enum (if alert_type uses an enum)
-- First check: task_alerts.alert_type might be text or enum. Use a DO block to handle both cases.
DO $$
BEGIN
  -- Try to add to enum if it exists
  IF EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'task_alert_type'
  ) THEN
    -- Enum exists, add value if not present
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'task_alert_type' AND e.enumlabel = 'extra_canone'
    ) THEN
      ALTER TYPE public.task_alert_type ADD VALUE 'extra_canone';
    END IF;
  END IF;
END $$;

-- 2. Trigger function: detect Construction End (Handover) date postponement
CREATE OR REPLACE FUNCTION public.fn_detect_construction_end_shift()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requirement TEXT;
  v_cert_name TEXT;
  v_cert_client TEXT;
  v_pm_id UUID;
  v_pm_name TEXT;
  v_actor UUID;
BEGIN
  -- Only react when due_date actually moves FORWARD
  IF NEW.due_date IS NULL OR OLD.due_date IS NULL THEN RETURN NEW; END IF;
  IF NEW.due_date <= OLD.due_date THEN RETURN NEW; END IF;

  v_requirement := lower(trim(coalesce(NEW.requirement, '')));
  IF v_requirement NOT IN ('construction end (handover)', 'construction end', 'handover') THEN
    RETURN NEW;
  END IF;

  -- Skip if this is a milestone_type other than 'timeline'
  IF NEW.milestone_type IS DISTINCT FROM 'timeline' THEN
    RETURN NEW;
  END IF;

  -- Fetch certification context
  SELECT c.name, c.client, c.pm_id
    INTO v_cert_name, v_cert_client, v_pm_id
  FROM public.certifications c
  WHERE c.id = NEW.certification_id;

  -- PM display name
  IF v_pm_id IS NOT NULL THEN
    SELECT COALESCE(p.display_name, p.full_name, p.email, 'PM')
      INTO v_pm_name
    FROM public.profiles p WHERE p.id = v_pm_id;
  END IF;

  v_actor := COALESCE(auth.uid(), v_pm_id);

  -- 1) Audit log entry
  INSERT INTO public.audit_logs (certification_id, user_id, changed_field, old_value, new_value)
  VALUES (
    NEW.certification_id,
    v_actor,
    'construction_end_due_date',
    OLD.due_date::text,
    NEW.due_date::text
  );

  -- 2) Extra-Canone alert (escalated to admin)
  -- created_by must reference an existing user; fall back to pm_id when actor is null
  IF v_actor IS NOT NULL THEN
    INSERT INTO public.task_alerts (
      certification_id,
      created_by,
      alert_type,
      title,
      description,
      escalate_to_admin,
      is_resolved,
      scheduled_date
    )
    VALUES (
      NEW.certification_id,
      v_actor,
      'extra_canone',
      'Extra-Canone: Construction End postponed for ' || COALESCE(v_cert_name, v_cert_client, 'project'),
      COALESCE(v_pm_name, 'PM') || ' moved Construction End from ' || OLD.due_date::text || ' to ' || NEW.due_date::text || '. Possible extra-fee scenario for ' || COALESCE(v_cert_client, 'client') || '.',
      true,
      false,
      NEW.due_date
    );
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Drop & recreate trigger to ensure idempotency
DROP TRIGGER IF EXISTS trg_detect_construction_end_shift ON public.certification_milestones;

CREATE TRIGGER trg_detect_construction_end_shift
AFTER UPDATE OF due_date ON public.certification_milestones
FOR EACH ROW
EXECUTE FUNCTION public.fn_detect_construction_end_shift();
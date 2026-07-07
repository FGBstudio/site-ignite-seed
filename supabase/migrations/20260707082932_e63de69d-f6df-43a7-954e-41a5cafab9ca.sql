
-- 1. Columns on certifications
ALTER TABLE public.certifications
  ADD COLUMN IF NOT EXISTS on_hold boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS on_hold_reason text,
  ADD COLUMN IF NOT EXISTS on_hold_at timestamptz,
  ADD COLUMN IF NOT EXISTS on_hold_by uuid,
  ADD COLUMN IF NOT EXISTS on_hold_previous_status text;

-- 2. Helper: is a certification currently on hold?
CREATE OR REPLACE FUNCTION public.is_cert_on_hold(_cert_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT on_hold FROM public.certifications WHERE id = _cert_id), false)
$$;

-- 3. Admin RPCs
CREATE OR REPLACE FUNCTION public.admin_hold_certification(_cert_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_status text;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can hold a certification';
  END IF;

  IF _reason IS NULL OR length(btrim(_reason)) = 0 THEN
    RAISE EXCEPTION 'A reason is required to put a project on hold';
  END IF;

  SELECT status::text INTO v_current_status FROM public.certifications WHERE id = _cert_id;
  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Certification not found';
  END IF;

  UPDATE public.certifications
     SET on_hold = true,
         on_hold_reason = _reason,
         on_hold_at = now(),
         on_hold_by = auth.uid(),
         on_hold_previous_status = COALESCE(on_hold_previous_status, v_current_status)
   WHERE id = _cert_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_release_certification(_cert_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can release a certification';
  END IF;

  UPDATE public.certifications
     SET on_hold = false,
         on_hold_reason = NULL,
         on_hold_at = NULL,
         on_hold_by = NULL,
         on_hold_previous_status = NULL
   WHERE id = _cert_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_hold_certification(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_release_certification(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_cert_on_hold(uuid) TO authenticated, anon;

-- 4. Generic guard trigger: block writes on child rows when parent cert is on hold and caller is not admin
CREATE OR REPLACE FUNCTION public.enforce_not_on_hold()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cert_id uuid;
BEGIN
  -- Admins bypass
  IF public.is_admin(auth.uid()) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Resolve certification_id from the row (works for NEW on insert/update, OLD on delete)
  v_cert_id := COALESCE(
    (CASE WHEN TG_OP <> 'DELETE' THEN (row_to_json(NEW)->>'certification_id')::uuid END),
    (CASE WHEN TG_OP = 'DELETE' THEN (row_to_json(OLD)->>'certification_id')::uuid END)
  );

  IF v_cert_id IS NOT NULL AND public.is_cert_on_hold(v_cert_id) THEN
    RAISE EXCEPTION 'Project is on hold: edits are disabled until an admin releases it'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Attach to child tables that carry certification_id
DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'cert_tasks',
    'cert_task_checklists',
    'cert_payment_milestones',
    'cert_wbs_phases',
    'certification_milestones',
    'certification_stakeholders',
    'project_canvas_entries',
    'project_allocations',
    'project_tasks',
    'weekly_reports',
    'quotation_budget_history'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    -- Only attach if the table exists and has a certification_id column
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'certification_id'
    ) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_enforce_not_on_hold ON public.%I', t);
      EXECUTE format(
        'CREATE TRIGGER trg_enforce_not_on_hold BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_not_on_hold()',
        t
      );
    END IF;
  END LOOP;
END $$;

-- 5. Guard on certifications itself: block non-admin updates while on_hold (except the on_hold_* columns which only the RPC touches, and RPC is SECURITY DEFINER so auth.uid() still equals the admin user)
CREATE OR REPLACE FUNCTION public.enforce_cert_not_on_hold()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF COALESCE(OLD.on_hold, false) = true THEN
    RAISE EXCEPTION 'Project is on hold: edits are disabled until an admin releases it'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_cert_not_on_hold ON public.certifications;
CREATE TRIGGER trg_enforce_cert_not_on_hold
BEFORE UPDATE ON public.certifications
FOR EACH ROW EXECUTE FUNCTION public.enforce_cert_not_on_hold();


-- 1) Add new columns to cert_payment_milestones
ALTER TABLE public.cert_payment_milestones
  ADD COLUMN IF NOT EXISTS payment_scheme TEXT,
  ADD COLUMN IF NOT EXISTS tranche_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS tranche_order INT,
  ADD COLUMN IF NOT EXISTS trigger_event TEXT,
  ADD COLUMN IF NOT EXISTS invoice_sent_date DATE,
  ADD COLUMN IF NOT EXISTS invoice_sent_by UUID,
  ADD COLUMN IF NOT EXISTS payment_received_date DATE,
  ADD COLUMN IF NOT EXISTS payment_received_by UUID;

-- Constrain trigger_event values
DO $$ BEGIN
  ALTER TABLE public.cert_payment_milestones
    ADD CONSTRAINT cert_payment_milestones_trigger_event_chk
    CHECK (trigger_event IS NULL OR trigger_event IN (
      'quotation_signed','design_end','construction_end','manual_sal'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Trigger to prevent non-admins from editing invoice/payment confirmation fields
CREATE OR REPLACE FUNCTION public.cert_payment_milestones_guard_admin_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'ADMIN'::app_role) THEN
    IF NEW.invoice_sent_date IS DISTINCT FROM OLD.invoice_sent_date
       OR NEW.invoice_sent_by IS DISTINCT FROM OLD.invoice_sent_by
       OR NEW.payment_received_date IS DISTINCT FROM OLD.payment_received_date
       OR NEW.payment_received_by IS DISTINCT FROM OLD.payment_received_by THEN
      RAISE EXCEPTION 'Only admins can update invoice/payment confirmation fields';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cert_payment_milestones_guard ON public.cert_payment_milestones;
CREATE TRIGGER trg_cert_payment_milestones_guard
BEFORE UPDATE ON public.cert_payment_milestones
FOR EACH ROW EXECUTE FUNCTION public.cert_payment_milestones_guard_admin_fields();

-- 3) Helper to apply a scheme: delete pending tranches, insert fresh ones
CREATE OR REPLACE FUNCTION public.apply_payment_scheme(
  _cert_id UUID,
  _scheme TEXT,
  _total NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin BOOLEAN;
  v_is_pm BOOLEAN;
BEGIN
  v_admin := public.has_role(auth.uid(), 'ADMIN'::app_role);
  v_is_pm := public.is_project_pm(auth.uid(), _cert_id);
  IF NOT (v_admin OR v_is_pm) THEN
    RAISE EXCEPTION 'Not authorized to apply scheme on this certification';
  END IF;

  -- Wipe existing Pending tranches (preserve Due/Invoiced/Paid/Overdue)
  DELETE FROM public.cert_payment_milestones
  WHERE certification_id = _cert_id AND status = 'Pending';

  IF _scheme = 'quotation_construction_50_50' THEN
    INSERT INTO public.cert_payment_milestones
      (certification_id, name, amount, status, payment_scheme, tranche_pct, tranche_order, trigger_event)
    VALUES
      (_cert_id, '50% on Quotation Signature', round(_total * 0.50, 2), 'Pending', _scheme, 50, 1, 'quotation_signed'),
      (_cert_id, '50% on Construction End',    round(_total * 0.50, 2), 'Pending', _scheme, 50, 2, 'construction_end');
  ELSIF _scheme = 'quotation_design_construction_30_40_30' THEN
    INSERT INTO public.cert_payment_milestones
      (certification_id, name, amount, status, payment_scheme, tranche_pct, tranche_order, trigger_event)
    VALUES
      (_cert_id, '30% on Quotation Signature', round(_total * 0.30, 2), 'Pending', _scheme, 30, 1, 'quotation_signed'),
      (_cert_id, '40% on Design End',          round(_total * 0.40, 2), 'Pending', _scheme, 40, 2, 'design_end'),
      (_cert_id, '30% on Construction End',    round(_total * 0.30, 2), 'Pending', _scheme, 30, 3, 'construction_end');
  ELSIF _scheme = 'bdc_sal_custom' THEN
    -- Custom SAL: tranches inserted by the wizard separately, do nothing here
    NULL;
  ELSE
    RAISE EXCEPTION 'Unknown payment scheme: %', _scheme;
  END IF;
END;
$$;

-- 4) Trigger on certification_milestones: when a milestone is completed,
--    flip the matching payment tranche to Due and create billing_due alerts
--    for both the Admin (escalated) and the PM.
CREATE OR REPLACE FUNCTION public.trg_payment_status_from_timeline()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event TEXT;
  v_cert_pm UUID;
  v_cert_name TEXT;
  v_pay RECORD;
BEGIN
  -- Map milestone category/requirement to trigger_event keys
  v_event := NULL;
  IF lower(coalesce(NEW.category,'')) IN ('quotation','quotation_signed','quotation signed') THEN
    v_event := 'quotation_signed';
  ELSIF lower(coalesce(NEW.category,'')) IN ('design','design_end','design end') THEN
    v_event := 'design_end';
  ELSIF lower(coalesce(NEW.category,'')) IN ('construction','construction_end','construction end') THEN
    v_event := 'construction_end';
  END IF;

  IF v_event IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only act when transitioning to a completed-like state
  IF (NEW.completed_date IS NOT NULL AND OLD.completed_date IS NULL)
     OR (lower(coalesce(NEW.status,'')) IN ('achieved','completed','done')
         AND lower(coalesce(OLD.status,'')) NOT IN ('achieved','completed','done')) THEN

    SELECT pm_id, COALESCE(name, client) INTO v_cert_pm, v_cert_name
    FROM public.certifications WHERE id = NEW.certification_id;

    -- Flip matching Pending tranches to Due, then create alerts
    FOR v_pay IN
      SELECT id, name, amount FROM public.cert_payment_milestones
      WHERE certification_id = NEW.certification_id
        AND trigger_event = v_event
        AND status = 'Pending'
    LOOP
      UPDATE public.cert_payment_milestones
        SET status = 'Due'
        WHERE id = v_pay.id;

      -- Admin alert (escalated)
      INSERT INTO public.task_alerts
        (certification_id, created_by, alert_type, title, description, escalate_to_admin, is_resolved)
      VALUES
        (NEW.certification_id,
         COALESCE(v_cert_pm, NEW.certification_id), -- created_by must be a uuid; PM is most appropriate
         'billing_due',
         'Billing due: ' || v_pay.name,
         'Tranche €' || v_pay.amount::text || ' is now due for ' || COALESCE(v_cert_name,'project'),
         TRUE,
         FALSE);

      -- PM-visible duplicate (only if PM exists and differs from the row above's created_by usage)
      IF v_cert_pm IS NOT NULL THEN
        INSERT INTO public.task_alerts
          (certification_id, created_by, alert_type, title, description, escalate_to_admin, is_resolved)
        VALUES
          (NEW.certification_id, v_cert_pm, 'billing_due',
           'Billing due: ' || v_pay.name,
           'Follow up with Admin to issue invoice for tranche €' || v_pay.amount::text,
           FALSE, FALSE);
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_status_from_timeline ON public.certification_milestones;
CREATE TRIGGER trg_payment_status_from_timeline
AFTER UPDATE ON public.certification_milestones
FOR EACH ROW EXECUTE FUNCTION public.trg_payment_status_from_timeline();

-- 5) Helpful index for querying tranches by trigger
CREATE INDEX IF NOT EXISTS idx_cert_payment_milestones_cert_trigger
  ON public.cert_payment_milestones (certification_id, trigger_event, status);

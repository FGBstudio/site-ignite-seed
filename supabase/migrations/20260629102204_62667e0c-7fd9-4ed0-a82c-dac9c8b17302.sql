ALTER TABLE public.certifications
  ADD COLUMN IF NOT EXISTS quotation_approved_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS quotation_approved_by uuid NULL REFERENCES auth.users(id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_alert_type') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'task_alert_type' AND e.enumlabel = 'quotation_to_operations'
    ) THEN
      ALTER TYPE public.task_alert_type ADD VALUE 'quotation_to_operations';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'task_alert_type' AND e.enumlabel = 'quotation_to_payments'
    ) THEN
      ALTER TYPE public.task_alert_type ADD VALUE 'quotation_to_payments';
    END IF;
  END IF;
END$$;
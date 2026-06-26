
ALTER TYPE public.task_alert_type ADD VALUE IF NOT EXISTS 'quotation_to_operations';
ALTER TYPE public.task_alert_type ADD VALUE IF NOT EXISTS 'quotation_to_payments';

ALTER TABLE public.certifications
  ADD COLUMN IF NOT EXISTS quotation_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS quotation_approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

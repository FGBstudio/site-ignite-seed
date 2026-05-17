
-- 1. New enum values
ALTER TYPE task_alert_type ADD VALUE IF NOT EXISTS 'budget_warning_80';
ALTER TYPE task_alert_type ADD VALUE IF NOT EXISTS 'budget_overrun';
ALTER TYPE task_alert_type ADD VALUE IF NOT EXISTS 'resource_burnout_warning';

-- 2. Baseline column on certifications
ALTER TABLE public.certifications
  ADD COLUMN IF NOT EXISTS baseline_handover_date date;

-- Backfill: certs already signed get current planned/handover as baseline
UPDATE public.certifications
SET baseline_handover_date = COALESCE(planned_handover_date, handover_date)
WHERE po_sign_date IS NOT NULL
  AND baseline_handover_date IS NULL
  AND COALESCE(planned_handover_date, handover_date) IS NOT NULL;

-- Enum for alert categories
CREATE TYPE public.task_alert_type AS ENUM (
  'timeline_to_configure',
  'milestone_deadline',
  'project_on_hold',
  'pm_operational',
  'other_critical'
);

-- Main table
CREATE TABLE public.task_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  certification_id uuid NOT NULL REFERENCES public.certifications(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_type task_alert_type NOT NULL,
  title text NOT NULL,
  description text,
  is_resolved boolean NOT NULL DEFAULT false,
  escalate_to_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

-- Indexes
CREATE INDEX idx_task_alerts_certification ON public.task_alerts(certification_id);
CREATE INDEX idx_task_alerts_created_by ON public.task_alerts(created_by);
CREATE INDEX idx_task_alerts_unresolved ON public.task_alerts(is_resolved) WHERE is_resolved = false;

-- RLS
ALTER TABLE public.task_alerts ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admin full access on task_alerts"
  ON public.task_alerts FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'ADMIN'::app_role))
  WITH CHECK (has_role(auth.uid(), 'ADMIN'::app_role));

-- PM sees and manages own alerts
CREATE POLICY "PM manages own alerts"
  ON public.task_alerts FOR ALL TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());
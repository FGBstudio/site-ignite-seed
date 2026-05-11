-- Time tracking: budget hours + time_entries

ALTER TABLE public.certifications
  ADD COLUMN IF NOT EXISTS allocated_hours numeric;

ALTER TABLE public.certification_milestones
  ADD COLUMN IF NOT EXISTS allocated_hours numeric;

CREATE TABLE IF NOT EXISTS public.time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  certification_id uuid NOT NULL,
  milestone_id uuid NULL,
  entry_date date NOT NULL,
  hours numeric(5,2) NOT NULL CHECK (hours > 0 AND hours <= 24),
  description text NULL,
  overbudget_note text NULL,
  is_overbudget boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_time_entries_user_date ON public.time_entries(user_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_time_entries_cert ON public.time_entries(certification_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_milestone ON public.time_entries(milestone_id);

ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_time_entries_updated_at ON public.time_entries;
CREATE TRIGGER trg_time_entries_updated_at
BEFORE UPDATE ON public.time_entries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS policies
DROP POLICY IF EXISTS "Users can view own time entries" ON public.time_entries;
CREATE POLICY "Users can view own time entries"
ON public.time_entries FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view all time entries" ON public.time_entries;
CREATE POLICY "Admins can view all time entries"
ON public.time_entries FOR SELECT
TO authenticated
USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Cert PM can view project time entries" ON public.time_entries;
CREATE POLICY "Cert PM can view project time entries"
ON public.time_entries FOR SELECT
TO authenticated
USING (is_cert_pm(auth.uid(), certification_id));

DROP POLICY IF EXISTS "Users can insert own time entries" ON public.time_entries;
CREATE POLICY "Users can insert own time entries"
ON public.time_entries FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own time entries" ON public.time_entries;
CREATE POLICY "Users can update own time entries"
ON public.time_entries FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own time entries" ON public.time_entries;
CREATE POLICY "Users can delete own time entries"
ON public.time_entries FOR DELETE
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins manage all time entries" ON public.time_entries;
CREATE POLICY "Admins manage all time entries"
ON public.time_entries FOR ALL
TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

-- Views (security_invoker so RLS applies for the caller)
DROP VIEW IF EXISTS public.view_cert_hours_burn;
CREATE VIEW public.view_cert_hours_burn
WITH (security_invoker = true) AS
SELECT
  c.id AS certification_id,
  c.name AS certification_name,
  c.client,
  c.pm_id,
  COALESCE(c.allocated_hours, 0) AS allocated_hours,
  COALESCE(SUM(te.hours), 0)::numeric AS consumed_hours,
  CASE
    WHEN COALESCE(c.allocated_hours, 0) = 0 THEN NULL
    ELSE ROUND((COALESCE(SUM(te.hours), 0) / c.allocated_hours) * 100, 1)
  END AS pct_used,
  COUNT(te.id) FILTER (WHERE te.is_overbudget) AS overrun_alerts
FROM public.certifications c
LEFT JOIN public.time_entries te ON te.certification_id = c.id
GROUP BY c.id, c.name, c.client, c.pm_id, c.allocated_hours;

DROP VIEW IF EXISTS public.view_milestone_hours_burn;
CREATE VIEW public.view_milestone_hours_burn
WITH (security_invoker = true) AS
SELECT
  m.id AS milestone_id,
  m.certification_id,
  m.requirement,
  COALESCE(m.allocated_hours, 0) AS allocated_hours,
  COALESCE(SUM(te.hours), 0)::numeric AS consumed_hours,
  CASE
    WHEN COALESCE(m.allocated_hours, 0) = 0 THEN NULL
    ELSE ROUND((COALESCE(SUM(te.hours), 0) / m.allocated_hours) * 100, 1)
  END AS pct_used
FROM public.certification_milestones m
LEFT JOIN public.time_entries te ON te.milestone_id = m.id
WHERE m.allocated_hours IS NOT NULL
GROUP BY m.id, m.certification_id, m.requirement, m.allocated_hours;

DROP VIEW IF EXISTS public.view_user_weekly_saturation;
CREATE VIEW public.view_user_weekly_saturation
WITH (security_invoker = true) AS
SELECT
  te.user_id,
  date_trunc('week', te.entry_date)::date AS week_start,
  SUM(te.hours)::numeric AS total_hours,
  COUNT(DISTINCT te.certification_id) AS active_projects
FROM public.time_entries te
GROUP BY te.user_id, date_trunc('week', te.entry_date);
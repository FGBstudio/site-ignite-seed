
CREATE TABLE public.pm_weekly_allocations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  certification_id UUID NOT NULL REFERENCES public.certifications(id) ON DELETE CASCADE,
  milestone_id UUID NULL REFERENCES public.certification_milestones(id) ON DELETE SET NULL,
  week_start DATE NOT NULL,
  planned_hours NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (planned_hours >= 0 AND planned_hours <= 40),
  note TEXT,
  has_conflict BOOLEAN NOT NULL DEFAULT false,
  has_overbudget BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pm_wa_week_is_monday CHECK (EXTRACT(ISODOW FROM week_start) = 1),
  CONSTRAINT pm_wa_unique UNIQUE (user_id, certification_id, milestone_id, week_start)
);

CREATE INDEX idx_pm_wa_user_week ON public.pm_weekly_allocations(user_id, week_start);
CREATE INDEX idx_pm_wa_cert ON public.pm_weekly_allocations(certification_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pm_weekly_allocations TO authenticated;
GRANT ALL ON public.pm_weekly_allocations TO service_role;

ALTER TABLE public.pm_weekly_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pm_wa_owner_all" ON public.pm_weekly_allocations
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "pm_wa_admin_all" ON public.pm_weekly_allocations
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "pm_wa_guest_read" ON public.pm_weekly_allocations
  FOR SELECT TO authenticated
  USING (public.is_cert_collaborator(certification_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.pm_weekly_allocations_validate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_week NUMERIC;
  cert_total NUMERIC;
  cert_budget NUMERIC;
  off_overlap BOOLEAN;
BEGIN
  NEW.updated_at := now();

  SELECT COALESCE(SUM(planned_hours), 0)
    INTO total_week
    FROM public.pm_weekly_allocations
   WHERE user_id = NEW.user_id
     AND week_start = NEW.week_start
     AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  IF (total_week + NEW.planned_hours) > 40 THEN
    RAISE EXCEPTION 'WEEKLY_CAP_EXCEEDED: PM already has % planned hours for week %, adding % exceeds 40h cap',
      total_week, NEW.week_start, NEW.planned_hours;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.hr_availability a
     WHERE a.user_id = NEW.user_id
       AND a.status IN ('vacation','sick','unavailable','permit')
       AND a.date BETWEEN NEW.week_start AND (NEW.week_start + INTERVAL '4 days')::date
  ) INTO off_overlap;
  NEW.has_conflict := COALESCE(off_overlap, false);

  SELECT COALESCE(SUM(planned_hours), 0)
    INTO cert_total
    FROM public.pm_weekly_allocations
   WHERE certification_id = NEW.certification_id
     AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  SELECT COALESCE(allocated_hours, 0) INTO cert_budget
    FROM public.certifications WHERE id = NEW.certification_id;

  NEW.has_overbudget := (cert_budget > 0) AND ((cert_total + NEW.planned_hours) > cert_budget);

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pm_wa_validate
BEFORE INSERT OR UPDATE ON public.pm_weekly_allocations
FOR EACH ROW EXECUTE FUNCTION public.pm_weekly_allocations_validate();

CREATE OR REPLACE VIEW public.view_pm_week_load AS
WITH loads AS (
  SELECT user_id, week_start, SUM(planned_hours)::numeric AS total_planned
  FROM public.pm_weekly_allocations
  GROUP BY user_id, week_start
),
offs AS (
  SELECT l.user_id, l.week_start,
    (SELECT COUNT(DISTINCT a.date)::int
       FROM public.hr_availability a
      WHERE a.user_id = l.user_id
        AND a.status IN ('vacation','sick','unavailable','permit')
        AND a.date BETWEEN l.week_start AND (l.week_start + INTERVAL '4 days')::date
    ) AS off_days
  FROM loads l
)
SELECT
  l.user_id,
  l.week_start,
  l.total_planned,
  COALESCE(o.off_days, 0) AS off_days,
  GREATEST(0, 40 - (COALESCE(o.off_days,0) * 8))::numeric AS cap_effective,
  CASE WHEN GREATEST(0, 40 - (COALESCE(o.off_days,0)*8)) = 0 THEN 0
       ELSE ROUND((l.total_planned / GREATEST(1, 40 - (COALESCE(o.off_days,0)*8))::numeric) * 100, 1)
  END AS saturation_pct
FROM loads l
LEFT JOIN offs o ON o.user_id = l.user_id AND o.week_start = l.week_start;

GRANT SELECT ON public.view_pm_week_load TO authenticated, service_role;

CREATE OR REPLACE VIEW public.view_cert_allocation_status AS
WITH sums AS (
  SELECT certification_id, SUM(planned_hours)::numeric AS planned
  FROM public.pm_weekly_allocations GROUP BY certification_id
)
SELECT
  c.id AS certification_id,
  c.pm_id,
  COALESCE(c.allocated_hours, 0)::numeric AS budget,
  COALESCE(s.planned, 0)::numeric AS planned,
  (COALESCE(c.allocated_hours,0) - COALESCE(s.planned,0))::numeric AS unallocated_hours,
  c.handover_date,
  GREATEST(0, CEIL(EXTRACT(EPOCH FROM (c.handover_date::timestamp - now())) / (86400*7)))::int AS weeks_to_deadline,
  CASE
    WHEN c.handover_date IS NULL THEN false
    WHEN (COALESCE(c.allocated_hours,0) - COALESCE(s.planned,0)) <= 0 THEN false
    WHEN (COALESCE(c.allocated_hours,0) - COALESCE(s.planned,0)) >
         (GREATEST(0, CEIL(EXTRACT(EPOCH FROM (c.handover_date::timestamp - now())) / (86400*7))) * 40)
      THEN true
    ELSE false
  END AS is_red
FROM public.certifications c
LEFT JOIN sums s ON s.certification_id = c.id;

GRANT SELECT ON public.view_cert_allocation_status TO authenticated, service_role;


CREATE TABLE public.pm_calendar_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  certification_id uuid REFERENCES public.certifications(id) ON DELETE CASCADE,
  milestone_id uuid REFERENCES public.certification_milestones(id) ON DELETE SET NULL,
  slot_start timestamptz NOT NULL,
  duration_minutes int NOT NULL DEFAULT 30 CHECK (duration_minutes > 0 AND duration_minutes % 30 = 0),
  kind text NOT NULL DEFAULT 'project' CHECK (kind IN ('project','admin','pto','sick','training')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pm_calendar_slots_user_start_idx ON public.pm_calendar_slots(user_id, slot_start);
CREATE INDEX pm_calendar_slots_cert_start_idx ON public.pm_calendar_slots(certification_id, slot_start);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pm_calendar_slots TO authenticated;
GRANT ALL ON public.pm_calendar_slots TO service_role;

ALTER TABLE public.pm_calendar_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own slots"
  ON public.pm_calendar_slots FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins view all slots"
  ON public.pm_calendar_slots FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins manage all slots"
  ON public.pm_calendar_slots FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.tg_pm_calendar_slots_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER pm_calendar_slots_updated_at
BEFORE UPDATE ON public.pm_calendar_slots
FOR EACH ROW EXECUTE FUNCTION public.tg_pm_calendar_slots_updated_at();


CREATE TABLE public.change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  certification_id uuid NOT NULL REFERENCES public.certifications(id) ON DELETE CASCADE,
  milestone_id uuid REFERENCES public.certification_milestones(id) ON DELETE SET NULL,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delta_hours numeric NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  resolved_by uuid REFERENCES auth.users(id),
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX change_requests_cert_idx ON public.change_requests(certification_id);
CREATE INDEX change_requests_status_idx ON public.change_requests(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.change_requests TO authenticated;
GRANT ALL ON public.change_requests TO service_role;

ALTER TABLE public.change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "PM creates own change requests"
  ON public.change_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND (public.is_cert_pm(auth.uid(), certification_id) OR public.is_admin(auth.uid()))
  );

CREATE POLICY "PM view own change requests"
  ON public.change_requests FOR SELECT
  TO authenticated
  USING (
    requested_by = auth.uid()
    OR public.is_cert_pm(auth.uid(), certification_id)
    OR public.is_admin(auth.uid())
  );

CREATE POLICY "Admins update change requests"
  ON public.change_requests FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER change_requests_updated_at
BEFORE UPDATE ON public.change_requests
FOR EACH ROW EXECUTE FUNCTION public.tg_pm_calendar_slots_updated_at();


CREATE OR REPLACE VIEW public.view_user_weekly_capacity AS
WITH planned AS (
  SELECT user_id, date_trunc('week', slot_start)::date AS week_start,
         SUM(duration_minutes)::numeric / 60 AS planned_hours
  FROM public.pm_calendar_slots GROUP BY 1, 2
),
logged AS (
  SELECT user_id, date_trunc('week', entry_date::timestamp)::date AS week_start,
         SUM(hours)::numeric AS logged_hours
  FROM public.time_entries GROUP BY 1, 2
)
SELECT
  COALESCE(p.user_id, l.user_id) AS user_id,
  COALESCE(p.week_start, l.week_start) AS week_start,
  COALESCE(p.planned_hours, 0) AS planned_hours,
  COALESCE(l.logged_hours, 0) AS logged_hours,
  40::numeric AS contract_hours,
  ROUND((COALESCE(p.planned_hours, 0) / 40::numeric) * 100, 1) AS saturation_pct
FROM planned p FULL OUTER JOIN logged l ON p.user_id = l.user_id AND p.week_start = l.week_start;

GRANT SELECT ON public.view_user_weekly_capacity TO authenticated;

CREATE OR REPLACE VIEW public.view_user_monthly_capacity AS
WITH planned AS (
  SELECT user_id, date_trunc('month', slot_start)::date AS month_start,
         SUM(duration_minutes)::numeric / 60 AS planned_hours
  FROM public.pm_calendar_slots GROUP BY 1, 2
),
logged AS (
  SELECT user_id, date_trunc('month', entry_date::timestamp)::date AS month_start,
         SUM(hours)::numeric AS logged_hours
  FROM public.time_entries GROUP BY 1, 2
)
SELECT
  COALESCE(p.user_id, l.user_id) AS user_id,
  COALESCE(p.month_start, l.month_start) AS month_start,
  COALESCE(p.planned_hours, 0) AS planned_hours,
  COALESCE(l.logged_hours, 0) AS logged_hours,
  168::numeric AS workable_hours,
  ROUND((COALESCE(p.planned_hours, 0) / 168::numeric) * 100, 1) AS saturation_pct
FROM planned p FULL OUTER JOIN logged l ON p.user_id = l.user_id AND p.month_start = l.month_start;

GRANT SELECT ON public.view_user_monthly_capacity TO authenticated;

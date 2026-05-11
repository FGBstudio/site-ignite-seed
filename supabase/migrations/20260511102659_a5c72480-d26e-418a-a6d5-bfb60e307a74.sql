-- Weekly reports table for PM/Admin weekly canvas
CREATE TABLE public.weekly_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  week_start date NOT NULL,
  content jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  locked_at timestamptz,
  last_edited_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_start),
  CHECK (status IN ('draft','saved','locked'))
);

CREATE INDEX idx_weekly_reports_user_week ON public.weekly_reports (user_id, week_start DESC);
CREATE INDEX idx_weekly_reports_week ON public.weekly_reports (week_start);

ALTER TABLE public.weekly_reports ENABLE ROW LEVEL SECURITY;

-- Owner can read own
CREATE POLICY "weekly_reports_select_own"
ON public.weekly_reports FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR is_admin(auth.uid()));

-- Owner can insert own (only if not locked)
CREATE POLICY "weekly_reports_insert_own"
ON public.weekly_reports FOR INSERT
TO authenticated
WITH CHECK ((user_id = auth.uid() AND status <> 'locked') OR is_admin(auth.uid()));

-- Owner can update own only when not locked; Admins always
CREATE POLICY "weekly_reports_update_own_unless_locked"
ON public.weekly_reports FOR UPDATE
TO authenticated
USING ((user_id = auth.uid() AND status <> 'locked') OR is_admin(auth.uid()))
WITH CHECK ((user_id = auth.uid() AND status <> 'locked') OR is_admin(auth.uid()));

-- Admins can delete
CREATE POLICY "weekly_reports_delete_admin"
ON public.weekly_reports FOR DELETE
TO authenticated
USING (is_admin(auth.uid()));

-- updated_at trigger
CREATE TRIGGER trg_weekly_reports_updated_at
BEFORE UPDATE ON public.weekly_reports
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
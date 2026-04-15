
-- Create the project_canvas_entries table
CREATE TABLE public.project_canvas_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  certification_id uuid NOT NULL REFERENCES public.certifications(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id),
  entry_type text NOT NULL DEFAULT 'general',
  content text NOT NULL,
  source_alert_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_canvas_cert ON public.project_canvas_entries(certification_id);
CREATE INDEX idx_canvas_created ON public.project_canvas_entries(created_at DESC);

-- Enable RLS
ALTER TABLE public.project_canvas_entries ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admin full access on canvas"
  ON public.project_canvas_entries FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'ADMIN'::app_role))
  WITH CHECK (has_role(auth.uid(), 'ADMIN'::app_role));

-- PM can read entries on their projects
CREATE POLICY "PM can read project canvas"
  ON public.project_canvas_entries FOR SELECT TO authenticated
  USING (
    is_project_pm(auth.uid(), certification_id)
    OR author_id = auth.uid()
  );

-- Authenticated users can insert entries they author
CREATE POLICY "Users can create canvas entries"
  ON public.project_canvas_entries FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());

-- Authors can update their own entries
CREATE POLICY "Authors can update own canvas entries"
  ON public.project_canvas_entries FOR UPDATE TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

-- Trigger function: auto-create canvas entry from task_alerts
CREATE OR REPLACE FUNCTION public.auto_canvas_from_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- PM escalation to admin
  IF NEW.escalate_to_admin = true THEN
    INSERT INTO public.project_canvas_entries (certification_id, author_id, entry_type, content, source_alert_id)
    VALUES (
      NEW.certification_id,
      NEW.created_by,
      'admin_support_request',
      COALESCE(NEW.title, '') || E'\n' || COALESCE(NEW.description, ''),
      NEW.id
    );
  END IF;

  -- Admin creating an alert on a project (not escalation, admin-originated)
  IF NEW.escalate_to_admin = false AND has_role(NEW.created_by, 'ADMIN'::app_role) THEN
    INSERT INTO public.project_canvas_entries (certification_id, author_id, entry_type, content, source_alert_id)
    VALUES (
      NEW.certification_id,
      NEW.created_by,
      'admin_note',
      COALESCE(NEW.title, '') || E'\n' || COALESCE(NEW.description, ''),
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger to task_alerts
CREATE TRIGGER trg_canvas_from_alert
  AFTER INSERT ON public.task_alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_canvas_from_alert();

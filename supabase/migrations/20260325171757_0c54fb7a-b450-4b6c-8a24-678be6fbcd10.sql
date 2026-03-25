
-- ============================================================
-- Certification WBS & Gantt Schema
-- ============================================================

-- 1. cert_wbs_phases
CREATE TABLE public.cert_wbs_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cert_wbs_phases ENABLE ROW LEVEL SECURITY;

-- 2. cert_tasks
CREATE TABLE public.cert_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  phase_id UUID REFERENCES public.cert_wbs_phases(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'Not_Started'
    CHECK (status IN ('Not_Started','In_Progress','Blocked','Completed')),
  start_date DATE,
  end_date DATE,
  assignee_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  dependencies UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cert_tasks ENABLE ROW LEVEL SECURITY;

-- 3. cert_task_checklists
CREATE TABLE public.cert_task_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.cert_tasks(id) ON DELETE CASCADE,
  requirement_text TEXT NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT false
);

ALTER TABLE public.cert_task_checklists ENABLE ROW LEVEL SECURITY;

-- 4. cert_payment_milestones
CREATE TABLE public.cert_payment_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending','Invoiced','Paid','Overdue')),
  trigger_task_id UUID REFERENCES public.cert_tasks(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cert_payment_milestones ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Helper: check if user is PM of a given project
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_project_pm(_user_id UUID, _project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = _project_id AND pm_id = _user_id
  );
$$;

-- ============================================================
-- RLS Policies – cert_wbs_phases
-- ============================================================
CREATE POLICY "Admin full access on cert_wbs_phases"
  ON public.cert_wbs_phases FOR ALL TO authenticated
  USING  (public.has_role(auth.uid(), 'ADMIN'))
  WITH CHECK (public.has_role(auth.uid(), 'ADMIN'));

CREATE POLICY "PM manage own project phases"
  ON public.cert_wbs_phases FOR ALL TO authenticated
  USING  (public.is_project_pm(auth.uid(), project_id))
  WITH CHECK (public.is_project_pm(auth.uid(), project_id));

CREATE POLICY "Assignees can view phases"
  ON public.cert_wbs_phases FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cert_tasks ct
      WHERE ct.phase_id = cert_wbs_phases.id
        AND ct.assignee_id = auth.uid()
    )
  );

-- ============================================================
-- RLS Policies – cert_tasks
-- ============================================================
CREATE POLICY "Admin full access on cert_tasks"
  ON public.cert_tasks FOR ALL TO authenticated
  USING  (public.has_role(auth.uid(), 'ADMIN'))
  WITH CHECK (public.has_role(auth.uid(), 'ADMIN'));

CREATE POLICY "PM manage own project tasks"
  ON public.cert_tasks FOR ALL TO authenticated
  USING  (public.is_project_pm(auth.uid(), project_id))
  WITH CHECK (public.is_project_pm(auth.uid(), project_id));

CREATE POLICY "Assignees can view their tasks"
  ON public.cert_tasks FOR SELECT TO authenticated
  USING (assignee_id = auth.uid());

CREATE POLICY "Assignees can update status on their tasks"
  ON public.cert_tasks FOR UPDATE TO authenticated
  USING (assignee_id = auth.uid())
  WITH CHECK (assignee_id = auth.uid());

-- ============================================================
-- RLS Policies – cert_task_checklists
-- ============================================================
CREATE POLICY "Admin full access on cert_task_checklists"
  ON public.cert_task_checklists FOR ALL TO authenticated
  USING  (public.has_role(auth.uid(), 'ADMIN'))
  WITH CHECK (public.has_role(auth.uid(), 'ADMIN'));

CREATE POLICY "PM manage checklists via project"
  ON public.cert_task_checklists FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cert_tasks ct
      WHERE ct.id = cert_task_checklists.task_id
        AND public.is_project_pm(auth.uid(), ct.project_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.cert_tasks ct
      WHERE ct.id = cert_task_checklists.task_id
        AND public.is_project_pm(auth.uid(), ct.project_id)
    )
  );

CREATE POLICY "Assignees can view checklists"
  ON public.cert_task_checklists FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cert_tasks ct
      WHERE ct.id = cert_task_checklists.task_id
        AND ct.assignee_id = auth.uid()
    )
  );

CREATE POLICY "Assignees can update is_completed"
  ON public.cert_task_checklists FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cert_tasks ct
      WHERE ct.id = cert_task_checklists.task_id
        AND ct.assignee_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.cert_tasks ct
      WHERE ct.id = cert_task_checklists.task_id
        AND ct.assignee_id = auth.uid()
    )
  );

-- ============================================================
-- RLS Policies – cert_payment_milestones
-- ============================================================
CREATE POLICY "Admin full access on cert_payment_milestones"
  ON public.cert_payment_milestones FOR ALL TO authenticated
  USING  (public.has_role(auth.uid(), 'ADMIN'))
  WITH CHECK (public.has_role(auth.uid(), 'ADMIN'));

CREATE POLICY "PM manage own project payment milestones"
  ON public.cert_payment_milestones FOR ALL TO authenticated
  USING  (public.is_project_pm(auth.uid(), project_id))
  WITH CHECK (public.is_project_pm(auth.uid(), project_id));

CREATE POLICY "Assignees can view payment milestones"
  ON public.cert_payment_milestones FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cert_tasks ct
      WHERE ct.project_id = cert_payment_milestones.project_id
        AND ct.assignee_id = auth.uid()
    )
  );

-- ============================================================
-- Indexes for performance
-- ============================================================
CREATE INDEX idx_cert_wbs_phases_project ON public.cert_wbs_phases(project_id);
CREATE INDEX idx_cert_tasks_project ON public.cert_tasks(project_id);
CREATE INDEX idx_cert_tasks_phase ON public.cert_tasks(phase_id);
CREATE INDEX idx_cert_tasks_assignee ON public.cert_tasks(assignee_id);
CREATE INDEX idx_cert_task_checklists_task ON public.cert_task_checklists(task_id);
CREATE INDEX idx_cert_payment_milestones_project ON public.cert_payment_milestones(project_id);
CREATE INDEX idx_cert_payment_milestones_trigger ON public.cert_payment_milestones(trigger_task_id);

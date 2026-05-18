
-- 1) Teams
CREATE TABLE IF NOT EXISTS public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  color text DEFAULT '#009193',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, user_id)
);

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.team_sprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  label text NOT NULL,
  start_date date,
  end_date date,
  meeting_notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.team_sprints ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_team_members_user ON public.team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team ON public.team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_sprints_team ON public.team_sprints(team_id);

-- 2) Helper: is_team_member
CREATE OR REPLACE FUNCTION public.is_team_member(_user_id uuid, _team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE user_id = _user_id AND team_id = _team_id
  );
$$;

-- 3) Extend project_tasks
ALTER TABLE public.project_tasks ALTER COLUMN certification_id DROP NOT NULL;
ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sprint_id uuid REFERENCES public.team_sprints(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS task_kind text NOT NULL DEFAULT 'project',
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS priority text,
  ADD COLUMN IF NOT EXISTS due_date date;

CREATE INDEX IF NOT EXISTS idx_project_tasks_team ON public.project_tasks(team_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_sprint ON public.project_tasks(sprint_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_assigned ON public.project_tasks(assigned_to);

-- 4) updated_at triggers
CREATE TRIGGER trg_teams_updated_at
  BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_team_sprints_updated_at
  BEFORE UPDATE ON public.team_sprints
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) RLS Policies
-- Teams: any authenticated can view; admins manage; members can view their team
CREATE POLICY "Teams viewable by authenticated"
  ON public.teams FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage teams"
  ON public.teams FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Creator can update own team"
  ON public.teams FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Authenticated can create teams"
  ON public.teams FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

-- Team members
CREATE POLICY "Team members viewable by authenticated"
  ON public.team_members FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage team members"
  ON public.team_members FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Team leads manage members"
  ON public.team_members FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = team_members.team_id
      AND tm.user_id = auth.uid()
      AND tm.role = 'lead'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = team_members.team_id
      AND tm.user_id = auth.uid()
      AND tm.role = 'lead'
  ));

-- Sprints
CREATE POLICY "Sprints viewable by authenticated"
  ON public.team_sprints FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage sprints"
  ON public.team_sprints FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Team members manage sprints"
  ON public.team_sprints FOR ALL TO authenticated
  USING (public.is_team_member(auth.uid(), team_id))
  WITH CHECK (public.is_team_member(auth.uid(), team_id));

-- Extend project_tasks policies: team members can manage their team's tasks
CREATE POLICY "Team members manage team tasks"
  ON public.project_tasks FOR ALL TO authenticated
  USING (team_id IS NOT NULL AND public.is_team_member(auth.uid(), team_id))
  WITH CHECK (team_id IS NOT NULL AND public.is_team_member(auth.uid(), team_id));

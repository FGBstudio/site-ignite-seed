
-- Restrict team visibility: admins see all, others see teams they created or belong to
DROP POLICY IF EXISTS "Teams viewable by authenticated" ON public.teams;
CREATE POLICY "Teams visible to admins, creators and members"
ON public.teams FOR SELECT
TO authenticated
USING (
  is_admin(auth.uid())
  OR created_by = auth.uid()
  OR is_team_member(auth.uid(), id)
);

-- Allow team creator to manage members (needed to add the lead row right after creating the team,
-- and to invite people to teams they own). Existing leads keep their power via is_team_lead.
CREATE POLICY "Team creator manages members"
ON public.team_members FOR ALL
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_members.team_id AND t.created_by = auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_members.team_id AND t.created_by = auth.uid())
);

-- Restrict team_members visibility to admins and members of the same team
DROP POLICY IF EXISTS "Team members viewable by authenticated" ON public.team_members;
CREATE POLICY "Team members visible to admins and team members"
ON public.team_members FOR SELECT
TO authenticated
USING (
  is_admin(auth.uid())
  OR is_team_member(auth.uid(), team_id)
  OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_members.team_id AND t.created_by = auth.uid())
);

-- Restrict sprints visibility similarly
DROP POLICY IF EXISTS "Sprints viewable by authenticated" ON public.team_sprints;
CREATE POLICY "Sprints visible to admins and team members"
ON public.team_sprints FOR SELECT
TO authenticated
USING (
  is_admin(auth.uid())
  OR is_team_member(auth.uid(), team_id)
  OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_sprints.team_id AND t.created_by = auth.uid())
);

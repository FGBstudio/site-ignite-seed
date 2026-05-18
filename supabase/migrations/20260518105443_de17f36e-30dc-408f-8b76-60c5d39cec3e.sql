CREATE OR REPLACE FUNCTION public.is_team_lead(_user_id uuid, _team_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = _team_id AND user_id = _user_id AND role = 'lead'
  );
$$;

DROP POLICY IF EXISTS "Team leads manage members" ON public.team_members;

CREATE POLICY "Team leads manage members"
ON public.team_members
FOR ALL
TO authenticated
USING (public.is_team_lead(auth.uid(), team_id))
WITH CHECK (public.is_team_lead(auth.uid(), team_id));
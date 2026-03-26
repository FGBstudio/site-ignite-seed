CREATE POLICY "Authenticated can read user_roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (true);
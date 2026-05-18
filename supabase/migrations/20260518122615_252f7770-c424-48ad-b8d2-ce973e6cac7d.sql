-- Use is_admin() (covers 'admin' + 'superuser') instead of has_role(uid,'ADMIN')
DROP POLICY IF EXISTS "Admins can manage tasks" ON public.project_tasks;
CREATE POLICY "Admins can manage tasks"
ON public.project_tasks
FOR ALL
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));
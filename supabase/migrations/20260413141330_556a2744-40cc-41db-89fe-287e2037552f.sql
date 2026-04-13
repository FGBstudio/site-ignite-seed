-- Fix: Replace has_role('ADMIN') with is_admin() which correctly handles lowercase 'admin' and 'superuser'
DROP POLICY IF EXISTS "Admin full access on task_alerts" ON public.task_alerts;

CREATE POLICY "Admin full access on task_alerts"
ON public.task_alerts
FOR ALL
TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));
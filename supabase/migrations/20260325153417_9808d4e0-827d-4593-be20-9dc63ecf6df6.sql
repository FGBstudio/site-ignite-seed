
-- Fix: Replace overly permissive policies with authenticated-only ones
DROP POLICY IF EXISTS "Authenticated access contracts" ON public.contracts;
DROP POLICY IF EXISTS "Authenticated access payments" ON public.payment_milestones;
DROP POLICY IF EXISTS "Authenticated access tasks" ON public.project_tasks;

CREATE POLICY "Authenticated read contracts" ON public.contracts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage contracts" ON public.contracts FOR ALL TO authenticated USING (has_role(auth.uid(), 'ADMIN'::app_role)) WITH CHECK (has_role(auth.uid(), 'ADMIN'::app_role));

CREATE POLICY "Authenticated read payments" ON public.payment_milestones FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage payments" ON public.payment_milestones FOR ALL TO authenticated USING (has_role(auth.uid(), 'ADMIN'::app_role)) WITH CHECK (has_role(auth.uid(), 'ADMIN'::app_role));
CREATE POLICY "PM manages own project payments" ON public.payment_milestones FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = payment_milestones.project_id AND projects.pm_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM projects WHERE projects.id = payment_milestones.project_id AND projects.pm_id = auth.uid()));

CREATE POLICY "Authenticated read tasks" ON public.project_tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage tasks" ON public.project_tasks FOR ALL TO authenticated USING (has_role(auth.uid(), 'ADMIN'::app_role)) WITH CHECK (has_role(auth.uid(), 'ADMIN'::app_role));
CREATE POLICY "PM manages own project tasks" ON public.project_tasks FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = project_tasks.project_id AND projects.pm_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM projects WHERE projects.id = project_tasks.project_id AND projects.pm_id = auth.uid()));

-- Fix: Make view use invoker security
DROP VIEW IF EXISTS public.view_resource_saturation;
CREATE VIEW public.view_resource_saturation WITH (security_invoker = true) AS
SELECT 
  assigned_to as user_id,
  COUNT(id) as total_active_tasks,
  MIN(start_date) as next_deadline
FROM public.project_tasks
WHERE status IN ('todo', 'in_progress') AND assigned_to IS NOT NULL
GROUP BY assigned_to;

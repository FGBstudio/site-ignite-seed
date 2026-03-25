
-- Add PM INSERT policy on projects (PM can create projects assigned to themselves)
CREATE POLICY "PM inserts own projects"
ON public.projects
FOR INSERT
TO authenticated
WITH CHECK (pm_id = auth.uid() AND public.has_role(auth.uid(), 'PM'));

-- Add PM UPDATE policy on projects (only own projects)
CREATE POLICY "PM updates own projects"
ON public.projects
FOR UPDATE
TO authenticated
USING (pm_id = auth.uid() AND public.has_role(auth.uid(), 'PM'));

-- Add PM INSERT policy on project_allocations (only for own projects)
CREATE POLICY "PM inserts own allocations"
ON public.project_allocations
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'PM') AND
  EXISTS (SELECT 1 FROM projects WHERE projects.id = project_allocations.project_id AND projects.pm_id = auth.uid())
);

-- Add PM DELETE policy on project_allocations (only for own projects, only Draft status)
CREATE POLICY "PM deletes draft allocations"
ON public.project_allocations
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'PM') AND
  status = 'Draft' AND
  EXISTS (SELECT 1 FROM projects WHERE projects.id = project_allocations.project_id AND projects.pm_id = auth.uid())
);

-- Allow ADMIN to delete allocations
CREATE POLICY "Admins delete allocations"
ON public.project_allocations
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'ADMIN'));

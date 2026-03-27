
-- Allow PMs to manage certification_milestones for certifications linked to their projects
CREATE OR REPLACE FUNCTION public.is_cert_pm(p_user_id uuid, p_certification_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM projects p
    JOIN certifications c ON c.site_id = p.site_id
    WHERE p.pm_id = p_user_id
      AND c.id = p_certification_id
  )
$$;

-- PM can manage milestones for their project certifications
CREATE POLICY "PM can manage certification milestones"
ON public.certification_milestones
FOR ALL
TO authenticated
USING (public.is_cert_pm(auth.uid(), certification_id))
WITH CHECK (public.is_cert_pm(auth.uid(), certification_id));

-- PM can update certifications linked to their projects (for score/status updates)
CREATE POLICY "PM can update own certifications"
ON public.certifications
FOR UPDATE
TO authenticated
USING (public.is_cert_pm(auth.uid(), id))
WITH CHECK (public.is_cert_pm(auth.uid(), id));

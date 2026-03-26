-- Allow the ensure_site_config_row trigger (and admins) to insert into site_config
CREATE POLICY "Allow insert for authenticated users"
ON public.site_config
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Also allow updates
CREATE POLICY "Allow update for authenticated users"
ON public.site_config
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);
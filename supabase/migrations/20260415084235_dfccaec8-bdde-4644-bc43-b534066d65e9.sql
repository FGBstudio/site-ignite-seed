
-- Drop the old PM ALL policy
DROP POLICY IF EXISTS "PM manages own alerts" ON task_alerts;

-- PM can READ alerts they created OR alerts on their assigned projects
CREATE POLICY "PM can read own and project alerts"
  ON task_alerts FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM certifications c
      WHERE c.id = task_alerts.certification_id
        AND c.pm_id = auth.uid()
    )
  );

-- PM can INSERT alerts they create
CREATE POLICY "PM can create alerts"
  ON task_alerts FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

-- PM can UPDATE (resolve) alerts they created OR on their projects
CREATE POLICY "PM can update own and project alerts"
  ON task_alerts FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM certifications c
      WHERE c.id = task_alerts.certification_id
        AND c.pm_id = auth.uid()
    )
  )
  WITH CHECK (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM certifications c
      WHERE c.id = task_alerts.certification_id
        AND c.pm_id = auth.uid()
    )
  );

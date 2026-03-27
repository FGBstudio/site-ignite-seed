-- 1. Ripristino dei privilegi di base
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

-- 2. Ricostruzione pulita della policy di Lettura per i PM
DROP POLICY IF EXISTS "PM reads own projects" ON public.projects;
CREATE POLICY "PM reads own projects" ON public.projects 
  FOR SELECT TO authenticated 
  USING (pm_id = auth.uid());
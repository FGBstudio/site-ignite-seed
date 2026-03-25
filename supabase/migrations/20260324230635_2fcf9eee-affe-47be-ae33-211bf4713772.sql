
-- 1. Create project_type enum
CREATE TYPE public.project_type AS ENUM ('LEED', 'WELL', 'Monitoring', 'Consulting');

-- 2. Create milestone_status enum
CREATE TYPE public.milestone_status AS ENUM ('pending', 'in_progress', 'completed');

-- 3. Create sites table
CREATE TABLE public.sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  country TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;

-- 4. Add site_id and project_type to projects
ALTER TABLE public.projects 
  ADD COLUMN site_id UUID REFERENCES public.sites(id),
  ADD COLUMN project_type public.project_type;

-- 5. Create certifications table
CREATE TABLE public.certifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES public.sites(id),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  cert_type public.project_type NOT NULL,
  score NUMERIC NOT NULL DEFAULT 0,
  target_score NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.certifications ENABLE ROW LEVEL SECURITY;

-- 6. Create certification_milestones table
CREATE TABLE public.certification_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  certification_id UUID NOT NULL REFERENCES public.certifications(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  requirement TEXT NOT NULL,
  score NUMERIC NOT NULL DEFAULT 0,
  max_score NUMERIC NOT NULL DEFAULT 0,
  status public.milestone_status NOT NULL DEFAULT 'pending',
  evidence_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.certification_milestones ENABLE ROW LEVEL SECURITY;

-- 7. Create storage bucket for evidence
INSERT INTO storage.buckets (id, name, public) VALUES ('evidence', 'evidence', false);

-- 8. RLS for sites
CREATE POLICY "Authenticated read sites" ON public.sites FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage sites" ON public.sites FOR ALL TO authenticated USING (has_role(auth.uid(), 'ADMIN'));

-- 9. RLS for certifications
CREATE POLICY "Admins manage certifications" ON public.certifications FOR ALL TO authenticated USING (has_role(auth.uid(), 'ADMIN'));
CREATE POLICY "PM reads own certifications" ON public.certifications FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = certifications.project_id AND projects.pm_id = auth.uid()));
CREATE POLICY "PM updates own certifications" ON public.certifications FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = certifications.project_id AND projects.pm_id = auth.uid()));

-- 10. RLS for certification_milestones
CREATE POLICY "Admins manage milestones" ON public.certification_milestones FOR ALL TO authenticated USING (has_role(auth.uid(), 'ADMIN'));
CREATE POLICY "PM reads own milestones" ON public.certification_milestones FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.certifications c JOIN public.projects p ON p.id = c.project_id WHERE c.id = certification_milestones.certification_id AND p.pm_id = auth.uid()));
CREATE POLICY "PM updates own milestones" ON public.certification_milestones FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.certifications c JOIN public.projects p ON p.id = c.project_id WHERE c.id = certification_milestones.certification_id AND p.pm_id = auth.uid()));

-- 11. RLS for evidence storage
CREATE POLICY "Authenticated upload evidence" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'evidence');
CREATE POLICY "Authenticated read evidence" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'evidence');
CREATE POLICY "Authenticated delete own evidence" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'evidence' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 12. Updated_at triggers
CREATE TRIGGER update_sites_updated_at BEFORE UPDATE ON public.sites FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_certifications_updated_at BEFORE UPDATE ON public.certifications FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_milestones_updated_at BEFORE UPDATE ON public.certification_milestones FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 13. Add realtime for milestones
ALTER PUBLICATION supabase_realtime ADD TABLE public.certification_milestones;
ALTER PUBLICATION supabase_realtime ADD TABLE public.certifications;

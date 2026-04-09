
-- Phase 1: Add business columns to certifications table
ALTER TABLE public.certifications
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS client text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'Europe',
  ADD COLUMN IF NOT EXISTS handover_date date NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS cert_rating text,
  ADD COLUMN IF NOT EXISTS project_subtype text,
  ADD COLUMN IF NOT EXISTS is_commissioning boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS cert_level text;

-- Backfill from existing projects data
UPDATE public.certifications c
SET
  name = p.name,
  client = p.client,
  region = p.region,
  handover_date = p.handover_date,
  cert_rating = p.cert_rating,
  project_subtype = p.project_subtype,
  is_commissioning = p.is_commissioning,
  cert_level = p.cert_level
FROM public.projects p
WHERE p.certification_id = c.id;

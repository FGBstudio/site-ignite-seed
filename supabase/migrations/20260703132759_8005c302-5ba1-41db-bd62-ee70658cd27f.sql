ALTER TABLE public.certifications
  DROP CONSTRAINT IF EXISTS certifications_status_check;

ALTER TABLE public.certifications
  ADD CONSTRAINT certifications_status_check
  CHECK (
    status IS NULL OR status = ANY (ARRAY[
      'potential'::text,
      'quotation'::text,
      'quotation_approved'::text,
      'canceled'::text,
      'da_configurare'::text,
      'in_corso'::text,
      'completato'::text,
      'certificato'::text,
      'active'::text,
      'in_progress'::text
    ])
  );
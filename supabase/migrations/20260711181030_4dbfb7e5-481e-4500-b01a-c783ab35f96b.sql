ALTER TABLE public.certifications DROP CONSTRAINT certifications_chk_cert_type;

ALTER TABLE public.certifications
  ADD CONSTRAINT certifications_chk_cert_type
  CHECK (upper(cert_type) = ANY (ARRAY[
    'LEED','BREEAM','WELL','ENERGY','ESG','GRESB','ENERGY_AUDIT',
    'TAXONOMY','ESG-TAXONOMY'
  ]));
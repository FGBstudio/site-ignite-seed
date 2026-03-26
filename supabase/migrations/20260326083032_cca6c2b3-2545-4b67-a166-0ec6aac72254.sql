
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS cert_type text,
ADD COLUMN IF NOT EXISTS cert_rating text,
ADD COLUMN IF NOT EXISTS is_commissioning boolean DEFAULT false;

-- Add check constraints
ALTER TABLE public.projects
ADD CONSTRAINT chk_cert_type CHECK (cert_type IS NULL OR cert_type IN ('LEED', 'WELL', 'BREEAM', 'CO2')),
ADD CONSTRAINT chk_cert_rating CHECK (cert_rating IS NULL OR cert_rating IN ('ID+C v.4', 'ID+C v.4.1', 'BD+C', 'O+M'));

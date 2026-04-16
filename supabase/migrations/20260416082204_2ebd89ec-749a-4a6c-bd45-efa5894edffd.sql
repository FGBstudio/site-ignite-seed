ALTER TABLE public.certifications
  ADD COLUMN IF NOT EXISTS sqm numeric,
  ADD COLUMN IF NOT EXISTS fgb_monitor boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS services_fees numeric,
  ADD COLUMN IF NOT EXISTS gbci_fees numeric,
  ADD COLUMN IF NOT EXISTS total_fees numeric,
  ADD COLUMN IF NOT EXISTS quotation_notes text,
  ADD COLUMN IF NOT EXISTS quotation_sent_date date,
  ADD COLUMN IF NOT EXISTS po_sign_date date;
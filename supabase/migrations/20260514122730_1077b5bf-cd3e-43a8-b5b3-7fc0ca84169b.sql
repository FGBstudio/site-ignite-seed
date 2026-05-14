-- History of admin-only quotation budget calculations.
-- Generated whenever an admin applies a Builder-computed value to a certification quotation.
CREATE TABLE public.quotation_budget_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  certification_id UUID NOT NULL REFERENCES public.certifications(id) ON DELETE CASCADE,
  created_by UUID,
  total_suggested NUMERIC NOT NULL,
  total_cost NUMERIC NOT NULL,
  total_effort_days NUMERIC NOT NULL DEFAULT 0,
  markup_pct NUMERIC NOT NULL DEFAULT 0,
  breakdown JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_qbh_certification_id ON public.quotation_budget_history(certification_id);

ALTER TABLE public.quotation_budget_history ENABLE ROW LEVEL SECURITY;

-- Admin-only access
CREATE POLICY "Admins can view quotation budget history"
ON public.quotation_budget_history
FOR SELECT
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert quotation budget history"
ON public.quotation_budget_history
FOR INSERT
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete quotation budget history"
ON public.quotation_budget_history
FOR DELETE
USING (public.is_admin(auth.uid()));

-- Create holdings table
CREATE TABLE public.holdings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.holdings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read holdings" ON public.holdings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage holdings" ON public.holdings FOR ALL TO authenticated USING (has_role(auth.uid(), 'ADMIN'::app_role));

CREATE TRIGGER update_holdings_updated_at BEFORE UPDATE ON public.holdings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create brands table
CREATE TABLE public.brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_id uuid NOT NULL REFERENCES public.holdings(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read brands" ON public.brands FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage brands" ON public.brands FOR ALL TO authenticated USING (has_role(auth.uid(), 'ADMIN'::app_role));

CREATE TRIGGER update_brands_updated_at BEFORE UPDATE ON public.brands FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add brand_id to sites (nullable for now to not break existing data)
ALTER TABLE public.sites ADD COLUMN brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL;

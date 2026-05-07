
ALTER TABLE public.site_energy_records 
  ADD COLUMN IF NOT EXISTS no_mango integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fx_rate_usd_eur numeric DEFAULT 0.86;

CREATE TABLE IF NOT EXISTS public.energy_finance_settings (
  id integer PRIMARY KEY DEFAULT 1,
  vat_pct numeric NOT NULL DEFAULT 22,
  customs_inbound_pct numeric NOT NULL DEFAULT 5,
  customs_outbound_pct numeric NOT NULL DEFAULT 0,
  pickup_default_usd numeric NOT NULL DEFAULT 0,
  shipment_default_usd numeric NOT NULL DEFAULT 0,
  installation_default_usd numeric NOT NULL DEFAULT 0,
  company_cost_pct numeric NOT NULL DEFAULT 20,
  fx_rate_usd_eur numeric NOT NULL DEFAULT 0.86,
  quotation_markup_pct numeric NOT NULL DEFAULT 30,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT energy_finance_singleton CHECK (id = 1)
);

INSERT INTO public.energy_finance_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.energy_finance_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read finance settings" ON public.energy_finance_settings;
CREATE POLICY "Authenticated can read finance settings"
  ON public.energy_finance_settings FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins manage finance settings" ON public.energy_finance_settings;
CREATE POLICY "Admins manage finance settings"
  ON public.energy_finance_settings FOR ALL
  TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_system_placeholder boolean NOT NULL DEFAULT false;

INSERT INTO public.products (name, sku, category, is_system_placeholder)
VALUES
  ('Greeny Energy Monitoring System', 'SYS-ENERGY', 'Energy', true),
  ('Water Monitoring System', 'SYS-WATER', 'Water', true)
ON CONFLICT (sku) DO UPDATE SET is_system_placeholder = true, name = EXCLUDED.name, category = EXCLUDED.category;
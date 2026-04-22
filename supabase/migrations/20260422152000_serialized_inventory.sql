
-- Final Hardware Inventory Migration
-- Focus: Simplification, Serialization, and Site-Linking

-- 1. HARDWARES TABLE
CREATE TABLE IF NOT EXISTS public.hardwares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id TEXT NOT NULL UNIQUE,   -- The "ID" from Excel
    mac_address TEXT,                -- The "MAC" from Excel
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL, -- The Product UUID
    site_id UUID REFERENCES public.sites(id) ON DELETE SET NULL,      -- The Site/Project UUID
    status TEXT DEFAULT 'In Stock' CHECK (status IN ('In Stock', 'Assigned', 'Shipped', 'Installed', 'RMA')),
    shipment_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. SECURITY
ALTER TABLE public.hardwares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Read Hardwares" ON public.hardwares FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins Manage Hardwares" ON public.hardwares FOR ALL TO authenticated USING (true);

-- 3. TRIGGER FOR UPDATED_AT
CREATE TRIGGER update_hardwares_updated_at 
    BEFORE UPDATE ON public.hardwares 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

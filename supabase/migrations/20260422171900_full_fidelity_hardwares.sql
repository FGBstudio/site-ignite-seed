
-- 1. PURGE DATA (Wipe it clean)
TRUNCATE TABLE public.hardwares;

-- 2. EXPAND TABLE (Add all columns from the Excel sheets)
ALTER TABLE public.hardwares 
    ADD COLUMN IF NOT EXISTS po TEXT,
    ADD COLUMN IF NOT EXISTS project TEXT,
    ADD COLUMN IF NOT EXISTS hardware_type TEXT,
    ADD COLUMN IF NOT EXISTS region TEXT;

-- (Device ID, MAC, Country, Notes already exist from previous steps)

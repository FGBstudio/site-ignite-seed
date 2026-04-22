
-- Simplified Location: Just Country and Notes
ALTER TABLE public.hardwares ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE public.hardwares ADD COLUMN IF NOT EXISTS notes TEXT;

-- Ensure device_id is unique for UPSERT logic
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hardwares_device_id_key') THEN
        ALTER TABLE public.hardwares ADD CONSTRAINT hardwares_device_id_key UNIQUE (device_id);
    END IF;
END $$;


ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sites_status_check') THEN
    ALTER TABLE public.sites ADD CONSTRAINT sites_status_check CHECK (status IN ('active','canceled'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.cascade_site_status_from_certification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_count int;
BEGIN
  IF NEW.site_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Transition TO canceled
  IF NEW.status = 'canceled' AND (OLD.status IS DISTINCT FROM 'canceled') THEN
    SELECT COUNT(*) INTO active_count
      FROM public.certifications
     WHERE site_id = NEW.site_id
       AND id <> NEW.id
       AND status <> 'canceled';
    IF active_count = 0 THEN
      UPDATE public.sites SET status = 'canceled', updated_at = now() WHERE id = NEW.site_id;
    END IF;
  END IF;

  -- Transition FROM canceled
  IF OLD.status = 'canceled' AND NEW.status <> 'canceled' THEN
    UPDATE public.sites SET status = 'active', updated_at = now() WHERE id = NEW.site_id AND status = 'canceled';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sites_cascade_from_certifications ON public.certifications;
CREATE TRIGGER trg_sites_cascade_from_certifications
AFTER UPDATE OF status ON public.certifications
FOR EACH ROW
EXECUTE FUNCTION public.cascade_site_status_from_certification();

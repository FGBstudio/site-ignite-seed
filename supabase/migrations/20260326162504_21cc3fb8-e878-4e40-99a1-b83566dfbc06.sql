CREATE OR REPLACE FUNCTION public.ensure_site_config_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.site_config (site_id)
  VALUES (NEW.id)
  ON CONFLICT (site_id) DO NOTHING;

  RETURN NEW;
END;
$$;
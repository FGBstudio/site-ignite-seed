
-- 1. Enable RLS on tables that already have policies
ALTER TABLE public.hardwares    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles   ENABLE ROW LEVEL SECURITY;

-- Drop the duplicate fully-open SELECT policy on user_roles
DROP POLICY IF EXISTS "Anyone can read roles" ON public.user_roles;

-- 2. Enable RLS + admin-only policies on ops_* tables (no policies today)
ALTER TABLE public.ops_hardware_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_locations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_shipments          ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage ops_hardware_movements" ON public.ops_hardware_movements
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins manage ops_locations" ON public.ops_locations
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins manage ops_shipments" ON public.ops_shipments
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- 3. Admin-only policies for the *_history tables (RLS enabled, no policies)
CREATE POLICY "Admins read hardware_status_history" ON public.hardware_status_history
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins read site_alerts_history" ON public.site_alerts_history
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- 4. Recreate views with security_invoker so they enforce caller's RLS
ALTER VIEW public.energy_site_daily_stitched SET (security_invoker = on);
ALTER VIEW public.site_energy_hourly         SET (security_invoker = on);
ALTER VIEW public.site_energy_daily          SET (security_invoker = on);
ALTER VIEW public.view_resource_saturation   SET (security_invoker = on);
ALTER VIEW public.energy_power_computed      SET (security_invoker = on);
ALTER VIEW public.energy_phase_latest        SET (security_invoker = on);

-- 5. Pin search_path on all user-owned public functions to prevent hijacking
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
      AND (p.proconfig IS NULL
           OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'))
  LOOP
    BEGIN
      EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', r.sig);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'skip %: %', r.sig, SQLERRM;
    END;
  END LOOP;
END $$;

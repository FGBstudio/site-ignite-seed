-- ============================================================================
-- Monitor · Report — keep monitor handover dates in sync with Operations
--                    FROM NOW ON. No historical data is rewritten.
--
-- ── What was wrong ──────────────────────────────────────────────────────────
--
-- Nothing propagated a certification's handover_date to the monitor tables once
-- the record existed:
--
--   • Energy — `sync_ser_from_cert` fires on `UPDATE OF handover_date`, but it
--     opens with `IF has_energy_monitoring OR has_hardware_redirection THEN`.
--     A certification whose monitoring flags were later switched off stops
--     propagating entirely. All 77 divergent energy rows are exactly that: the
--     record was created while the flag was on, the flag went off, the row
--     froze on 2026-05-08 while Operations moved on through June and July.
--
--   • Air — `fn_recalculate_site_air` does write handover_date, but its upsert
--     resolves the conflict with
--         handover_date = COALESCE(site_air_records.handover_date, EXCLUDED.handover_date)
--     so the stored value always wins and the column is only ever filled when
--     null. A date written once survives every later recalculation.
--
--   • Water — the date was set at creation and never again (table is empty
--     today; covered here for the future).
--
-- ── What this migration deliberately does NOT do ────────────────────────────
--
-- An earlier draft force-aligned every existing row to certifications.
-- Measurement showed that premise does not hold: `certifications.handover_date`
-- is itself largely bulk-filled. 461 certifications share 2026-06-29 (354 of
-- them already `certificato`/`completato`), 115 share 2026-06-30, 102 share
-- 2026-05-06, 86 share 2026-04-09 — 764 of ~1027 certifications on four dates,
-- all written in one pass starting 2026-07-06. 296 of the 319 certified
-- projects carry 2026-06-29, which is not a handover date for work already
-- finished.
--
-- Checked against physical shipment dates, on 6 of the 8 divergent AIR rows
-- that have one, the MONITOR date is closer to the shipment than the Operations
-- date (Prada Houston 5d vs 19d, Boucheron Siam 12d vs 66d, Balenciaga Nice 64d
-- vs 397d). A backfill would have replaced the better date with a placeholder.
--
-- So: the sync mechanism is installed, the existing values are left untouched,
-- and the divergence is recorded in monitor_handover_sync_backup for whoever
-- reconciles it by hand. From here on, any change made in Operations does
-- propagate — which is the behaviour that was missing.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Defensive: the column exists in the live schema but in no migration file.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.site_air_records   ADD COLUMN IF NOT EXISTS handover_date date;
ALTER TABLE public.site_water_records ADD COLUMN IF NOT EXISTS handover_date date;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Point-in-time snapshot of every monitor record and the Operations figure
--    it disagrees with. Nothing is overwritten, so this is evidence rather than
--    a rollback target: it is what lets someone work through the divergent rows
--    later without having to reconstruct today's state.
--    (audit_logs cannot be used: its user_id is NOT NULL and there is no
--    acting user here.)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.monitor_handover_sync_backup (
  id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain                       text NOT NULL,          -- 'air' | 'water' | 'energy'
  record_id                    uuid NOT NULL,
  site_id                      uuid,
  certification_id             uuid,
  monitor_handover_date        date,
  certification_handover_date  date,
  monitor_project_name         text,
  monitor_pm_id                uuid,
  /** True when the two dates disagreed at snapshot time. */
  was_divergent                boolean NOT NULL DEFAULT false,
  captured_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_monitor_handover_backup_lookup
  ON public.monitor_handover_sync_backup (domain, record_id);
CREATE INDEX IF NOT EXISTS idx_monitor_handover_backup_divergent
  ON public.monitor_handover_sync_backup (was_divergent) WHERE was_divergent;

ALTER TABLE public.monitor_handover_sync_backup ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read monitor handover backup" ON public.monitor_handover_sync_backup;
CREATE POLICY "admins read monitor handover backup"
  ON public.monitor_handover_sync_backup
  FOR SELECT
  USING (public.is_admin(auth.uid()));

GRANT SELECT ON public.monitor_handover_sync_backup TO authenticated;
GRANT ALL    ON public.monitor_handover_sync_backup TO service_role;

INSERT INTO public.monitor_handover_sync_backup
  (domain, record_id, site_id, certification_id,
   monitor_handover_date, certification_handover_date,
   monitor_project_name, monitor_pm_id, was_divergent)
SELECT 'air', sar.id, sar.site_id, sar.certification_id,
       sar.handover_date, c.handover_date,
       sar.project_name, sar.pm_id,
       (c.id IS NOT NULL AND sar.handover_date IS DISTINCT FROM c.handover_date)
FROM public.site_air_records sar
LEFT JOIN public.certifications c ON c.id = sar.certification_id;

INSERT INTO public.monitor_handover_sync_backup
  (domain, record_id, site_id, certification_id,
   monitor_handover_date, certification_handover_date,
   monitor_project_name, monitor_pm_id, was_divergent)
SELECT 'water', swr.id, swr.site_id, swr.certification_id,
       swr.handover_date, c.handover_date,
       swr.project_name, swr.pm_id,
       (c.id IS NOT NULL AND swr.handover_date IS DISTINCT FROM c.handover_date)
FROM public.site_water_records swr
LEFT JOIN public.certifications c ON c.id = swr.certification_id;

INSERT INTO public.monitor_handover_sync_backup
  (domain, record_id, site_id, certification_id,
   monitor_handover_date, certification_handover_date,
   monitor_project_name, monitor_pm_id, was_divergent)
SELECT 'energy', ser.id, ser.site_id, ser.certification_id,
       ser.handover_date, c.handover_date,
       ser.project_name, ser.pm_id,
       (c.id IS NOT NULL AND ser.handover_date IS DISTINCT FROM c.handover_date)
FROM public.site_energy_records ser
LEFT JOIN public.certifications c ON c.id = ser.certification_id;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Energy: close the gate that stopped propagation.
--
--    The INSERT stays conditional — a certification with no monitoring flags
--    should not spawn an energy record. But when a record already EXISTS it is
--    kept in sync unconditionally: whatever the flags say today, that row is on
--    someone's screen, and a certification saved in Operations must reach it.
--
--    Note this only fires when someone actually saves a certification. The 77
--    rows that are already out of step stay as they are until then, by design.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_ser_from_cert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_should_exist boolean;
BEGIN
  v_should_exist := COALESCE(NEW.has_energy_monitoring, false)
                 OR COALESCE(NEW.has_hardware_redirection, false);

  IF v_should_exist THEN
    INSERT INTO public.site_energy_records
      (certification_id, site_id, pm_id, project_name, handover_date, status, created_at, updated_at)
    VALUES
      (NEW.id, NEW.site_id, NEW.pm_id, NEW.name, NEW.handover_date, 'Active', now(), now())
    ON CONFLICT (certification_id) DO UPDATE
      SET site_id       = EXCLUDED.site_id,
          pm_id         = EXCLUDED.pm_id,
          project_name  = EXCLUDED.project_name,
          handover_date = EXCLUDED.handover_date,
          updated_at    = now();
  ELSE
    -- Flags are off, but an orphaned record may still exist from when they were
    -- on. Update it in place; never create one here.
    UPDATE public.site_energy_records
       SET site_id       = NEW.site_id,
           pm_id         = NEW.pm_id,
           project_name  = NEW.name,
           handover_date = NEW.handover_date,
           updated_at    = now()
     WHERE certification_id = NEW.id
       AND (site_id       IS DISTINCT FROM NEW.site_id
         OR pm_id         IS DISTINCT FROM NEW.pm_id
         OR project_name  IS DISTINCT FROM NEW.name
         OR handover_date IS DISTINCT FROM NEW.handover_date);
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block a certification save because a monitor record failed to sync.
  RAISE NOTICE 'sync_ser_from_cert failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Air and Water: propagate certifications → monitor records.
--    Energy is deliberately absent — trg_cert_sync_ser already owns it, and
--    writing it from two triggers would mean two writes per save.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_monitor_handover_from_cert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.site_air_records
     SET handover_date = NEW.handover_date,
         updated_at    = now()
   WHERE certification_id = NEW.id
     AND handover_date IS DISTINCT FROM NEW.handover_date;

  UPDATE public.site_water_records
     SET handover_date = NEW.handover_date,
         updated_at    = now()
   WHERE certification_id = NEW.id
     AND handover_date IS DISTINCT FROM NEW.handover_date;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'sync_monitor_handover_from_cert failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cert_sync_monitor_handover ON public.certifications;
CREATE TRIGGER trg_cert_sync_monitor_handover
  AFTER INSERT OR UPDATE OF handover_date
  ON public.certifications
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_monitor_handover_from_cert();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. New monitor records inherit the date at insert time.
--    BEFORE INSERT, so the row is written correct rather than corrected after.
--    Only new rows are affected — existing ones are never revisited.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fill_monitor_handover_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_handover date;
  v_found    boolean := false;
BEGIN
  IF NEW.certification_id IS NOT NULL THEN
    SELECT handover_date, true
      INTO v_handover, v_found
      FROM public.certifications
     WHERE id = NEW.certification_id;
  END IF;

  -- Fall back to the most recent certification on the same site, which is how
  -- request_monitoring() and fn_recalculate_site_air() resolve the project when
  -- they create these rows.
  IF NOT v_found AND NEW.site_id IS NOT NULL THEN
    SELECT handover_date, true
      INTO v_handover, v_found
      FROM public.certifications
     WHERE site_id = NEW.site_id
     ORDER BY created_at DESC
     LIMIT 1;
  END IF;

  -- Mirror Operations only when the project could actually be resolved. With no
  -- certification to point at there is nothing authoritative to copy, so a date
  -- supplied by the caller is kept rather than blanked.
  IF v_found THEN
    NEW.handover_date := v_handover;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_air_fill_handover ON public.site_air_records;
CREATE TRIGGER trg_air_fill_handover
  BEFORE INSERT ON public.site_air_records
  FOR EACH ROW
  EXECUTE FUNCTION public.fill_monitor_handover_on_insert();

DROP TRIGGER IF EXISTS trg_water_fill_handover ON public.site_water_records;
CREATE TRIGGER trg_water_fill_handover
  BEFORE INSERT ON public.site_water_records
  FOR EACH ROW
  EXECUTE FUNCTION public.fill_monitor_handover_on_insert();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Documentation.
-- ─────────────────────────────────────────────────────────────────────────────
COMMENT ON COLUMN public.site_air_records.handover_date IS
  'Follows certifications.handover_date whenever Operations changes it (trg_cert_sync_monitor_handover). Values predating 2026-08-05 were NOT realigned and may still differ — see monitor_handover_sync_backup.';
COMMENT ON COLUMN public.site_water_records.handover_date IS
  'Follows certifications.handover_date whenever Operations changes it (trg_cert_sync_monitor_handover). Values predating 2026-08-05 were NOT realigned and may still differ — see monitor_handover_sync_backup.';
COMMENT ON COLUMN public.site_energy_records.handover_date IS
  'Follows certifications.handover_date whenever Operations changes it (trg_cert_sync_ser). Values predating 2026-08-05 were NOT realigned and may still differ — see monitor_handover_sync_backup.';
COMMENT ON TABLE public.monitor_handover_sync_backup IS
  'Snapshot of every monitor record taken on 2026-08-05, when handover sync triggers were installed. Nothing was overwritten: was_divergent marks the rows where monitor and Operations disagreed at that moment, for manual reconciliation.';

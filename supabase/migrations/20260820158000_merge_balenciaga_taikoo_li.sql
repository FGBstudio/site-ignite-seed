-- ============================================================================
-- Deduplica sito · BALENCIAGA — Chengdu, Taikoo Li
--
-- Due siti con lo stesso indirizzo carattere per carattere, creati nello stesso
-- import del 2026-06-29, ciascuno con la propria certification gemella:
--
--   6ea47337  "Balenciaga Chengdu Taikoo Li"  cert 77887e82 Taikoo Li/certificato
--   a03691be  "Balenciaga Taikoo Li"          cert c99eab1d Taikoo Li/certificato
--
--   8 Zhong Sha Mao Jie, Jin Jiang Qu, Cheng Du Shi, Si Chuan Sheng, China
--
-- Nessuno dei due ha device, righe monitor, telemetria o monitoring_types:
-- sono due gusci identici. Entrambe le certification sono state verificate su
-- tutte le tabelle che portano certification_id — fasi WBS, task, milestone,
-- allocazioni, stakeholder, collaborazioni, ore, pagamenti, canvas, audit,
-- alert, change request, righe monitor: zero righe ovunque, per entrambe.
--
-- Qui non si sposta nulla: sopravvive 6ea47337 con la sua certification, e il
-- gemello sparisce insieme alla propria — che non e' un progetto diverso, e'
-- lo stesso progetto scritto due volte. Backup di entrambi prima di procedere.
--
-- ── Sui trigger ─────────────────────────────────────────────────────────────
--
-- Cancellare la certification fa scattare trg_refresh_air_on_certs, quindi
-- fn_recalculate_site_air sul sito morente: la funzione trova zero hardware,
-- zero allocazioni e nessun 'air_quality', ed esegue un DELETE su
-- site_air_records che non ha righe da cancellare. Innocuo.
--
-- trg_certifications_sync_monitoring non si attiva affatto: e' dichiarato
-- AFTER INSERT OR UPDATE OF site_id, has_iaq/energy/water_monitoring — non su
-- DELETE. Il superstite quindi non viene toccato in alcun modo.
-- ============================================================================

DO $merge$
DECLARE
  v_survivor    constant uuid := '6ea47337-8f64-48df-b0f3-bcae934ba46d';
  v_dying       constant uuid := 'a03691be-2815-4261-94e7-951c799b1492';
  v_cert_keep   constant uuid := '77887e82-f0f9-42c9-9c94-53d31b7fe000';
  v_cert_drop   constant uuid := 'c99eab1d-7e1b-41e0-8689-874e971fb6f3';
  r record;
  v_n bigint;
  v_total bigint := 0;
BEGIN
  -- ── 0) Guardie ──────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM public.sites WHERE id = v_survivor) THEN
    RAISE EXCEPTION 'Superstite % assente. Deduplica annullata.', v_survivor;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.certifications
                  WHERE id = v_cert_keep AND site_id = v_survivor) THEN
    RAISE EXCEPTION 'La certification da tenere % non sta sul superstite. Deduplica annullata.', v_cert_keep;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.certifications
                  WHERE id = v_cert_drop AND site_id = v_dying) THEN
    RAISE EXCEPTION 'La certification da cancellare % non sta sul duplicato. Deduplica annullata.', v_cert_drop;
  END IF;

  -- Il gemello deve essere rimasto un guscio.
  SELECT (SELECT count(*) FROM public.hardwares           WHERE site_id = v_dying)
       + (SELECT count(*) FROM public.site_air_records    WHERE site_id = v_dying)
       + (SELECT count(*) FROM public.site_energy_records WHERE site_id = v_dying)
       + (SELECT count(*) FROM public.site_water_records  WHERE site_id = v_dying)
       + (SELECT count(*) FROM public.devices             WHERE site_id = v_dying)
       + (SELECT count(*) FROM public.certifications      WHERE site_id = v_dying AND id <> v_cert_drop)
    INTO v_n;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'Il duplicato % non e'' piu'' un guscio (% righe inattese). Deduplica annullata.', v_dying, v_n;
  END IF;

  -- La certification da cancellare deve essere ancora vuota: se nel frattempo
  -- ci hanno attaccato del lavoro, la transazione muore qui invece di
  -- distruggerlo. Costa una query e vale tutta la differenza fra una deduplica
  -- e una perdita di dati.
  SELECT (SELECT count(*) FROM public.cert_wbs_phases           WHERE certification_id = v_cert_drop)
       + (SELECT count(*) FROM public.cert_tasks                WHERE certification_id = v_cert_drop)
       + (SELECT count(*) FROM public.cert_payment_milestones   WHERE certification_id = v_cert_drop)
       + (SELECT count(*) FROM public.cert_collaborations       WHERE certification_id = v_cert_drop)
       + (SELECT count(*) FROM public.certification_stakeholders WHERE certification_id = v_cert_drop)
       + (SELECT count(*) FROM public.certification_milestones  WHERE certification_id = v_cert_drop)
       + (SELECT count(*) FROM public.project_allocations       WHERE certification_id = v_cert_drop)
       + (SELECT count(*) FROM public.time_entries              WHERE certification_id = v_cert_drop)
       + (SELECT count(*) FROM public.payment_milestones        WHERE certification_id = v_cert_drop)
       + (SELECT count(*) FROM public.quotation_budget_history  WHERE certification_id = v_cert_drop)
       + (SELECT count(*) FROM public.project_canvas_entries    WHERE certification_id = v_cert_drop)
       + (SELECT count(*) FROM public.task_alerts               WHERE certification_id = v_cert_drop)
       + (SELECT count(*) FROM public.change_requests           WHERE certification_id = v_cert_drop)
       + (SELECT count(*) FROM public.audit_logs                WHERE certification_id = v_cert_drop)
       + (SELECT count(*) FROM public.pm_calendar_slots         WHERE certification_id = v_cert_drop)
       + (SELECT count(*) FROM public.pm_weekly_allocations     WHERE certification_id = v_cert_drop)
       + (SELECT count(*) FROM public.project_tasks             WHERE certification_id = v_cert_drop)
       + (SELECT count(*) FROM public.projects                  WHERE certification_id = v_cert_drop)
       + (SELECT count(*) FROM public.site_air_records          WHERE certification_id = v_cert_drop)
       + (SELECT count(*) FROM public.site_energy_records       WHERE certification_id = v_cert_drop)
       + (SELECT count(*) FROM public.site_water_records        WHERE certification_id = v_cert_drop)
    INTO v_n;
  IF v_n > 0 THEN
    RAISE EXCEPTION
      'La certification da cancellare non e'' piu'' vuota (% righe collegate). Deduplica annullata.', v_n;
  END IF;

  -- ── 1) Backup di tutto cio' che sparisce ────────────────────────────────
  CREATE TABLE IF NOT EXISTS public._bak_merge_taikooli_sites AS
    SELECT * FROM public.sites WHERE id = v_dying;
  CREATE TABLE IF NOT EXISTS public._bak_merge_taikooli_certs AS
    SELECT * FROM public.certifications WHERE id = v_cert_drop;

  -- ── 2) Via la certification gemella, poi il sito gemello ───────────────
  UPDATE public.monitor_handover_sync_backup
     SET certification_id = NULL
   WHERE certification_id = v_cert_drop;

  DELETE FROM public.certifications WHERE id = v_cert_drop;

  DELETE FROM public.site_weather_energy_hourly WHERE site_id = v_dying;
  DELETE FROM public.site_weather_energy_daily  WHERE site_id = v_dying;
  DELETE FROM public.weather_data               WHERE site_id = v_dying;
  DELETE FROM public.site_config                WHERE site_id = v_dying;
  DELETE FROM public.site_kpis                  WHERE site_id = v_dying;
  DELETE FROM public.ops_locations              WHERE site_id = v_dying;
  DELETE FROM public.monitor_handover_sync_backup WHERE site_id = v_dying;

  -- ── 3) Rete di sicurezza: nessun orfano ─────────────────────────────────
  FOR r IN
    SELECT c.table_name FROM information_schema.columns c
    JOIN pg_class pc ON pc.relname = c.table_name AND pc.relkind = 'r'
    JOIN pg_namespace pn ON pn.oid = pc.relnamespace AND pn.nspname = 'public'
    WHERE c.table_schema = 'public' AND c.column_name = 'site_id'
      AND c.table_name <> 'sites'
      AND c.table_name NOT LIKE '\_bak\_%'
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE site_id = %L', r.table_name, v_dying)
      INTO v_n;
    IF v_n > 0 THEN
      RAISE NOTICE 'Righe rimaste in %: %', r.table_name, v_n;
      v_total := v_total + v_n;
    END IF;
  END LOOP;
  IF v_total > 0 THEN
    RAISE EXCEPTION 'Il sito duplicato ha ancora % righe collegate. Deduplica annullata.', v_total;
  END IF;

  DELETE FROM public.sites WHERE id = v_dying;

  -- ── 4) Il superstite deve essere rimasto intero ─────────────────────────
  IF NOT EXISTS (SELECT 1 FROM public.certifications
                  WHERE id = v_cert_keep AND site_id = v_survivor) THEN
    RAISE EXCEPTION 'Il superstite ha perso la sua certification. Deduplica annullata.';
  END IF;
END;
$merge$;

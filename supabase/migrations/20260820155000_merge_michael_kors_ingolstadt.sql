-- ============================================================================
-- Deduplica sito · MICHAEL KORS — Ingolstadt Village, Otto-Hahn-Straße 1
--
-- Lo stesso store esiste due volte (163 m di pin, stesso civico):
--
--   6d047b74  "Michael Kors Ingolstad"            creato 2026-01-21
--             Otto-Hahn-Straße 1, Unit 83/84, Ingolstadt Village
--             0 certifications, 1 device AIR (2504090038, Delivered, PO-2),
--             1 riga site_air_records, monitoring_types = air_quality
--
--   6b2d4bec  "Michael Kors Otto-Hahn-Straße 1"   creato 2026-06-29 (import)
--             Otto-Hahn-Straße 1/Unit 96-7, 85055 Ingolstadt
--             1 certification (Otto-Hahn-Straße 1 / da_configurare),
--             0 device, 0 righe monitor, solo site_config e meteo derivato
--
-- Stesso civico, unit diversa: trasloco interno all'outlet o refuso d'import.
-- Michael Kors ha un solo store nell'Ingolstadt Village.
--
-- Sopravvive 6d047b74, che possiede il device. Alla fine sito e certification
-- si chiamano entrambi "Otto-Hahn-Straße".
--
-- ── monitoring_types va salvato e rimesso ───────────────────────────────────
--
-- Spostare una certification fa scattare `trg_certs_sync_monitoring`, che
-- RICALCOLA sites.monitoring_types dai flag has_iaq/has_energy/has_water della
-- certification e lo SOVRASCRIVE. La certification qui spostata ha
-- has_iaq_monitoring = false, quindi il ricalcolo scriverebbe un array vuoto
-- sopra l'air_quality del superstite — che invece un sensore ce l'ha davvero,
-- installato e consegnato.
--
-- Lo si rilegge prima e lo si riscrive dopo, nella stessa transazione. Senza
-- questo passaggio il sito resterebbe senza il marcatore che protegge la sua
-- riga monitor dal DELETE di fn_recalculate_site_air il giorno in cui il
-- device venisse riassegnato.
--
-- Resta vero, e non si risolve qui, che le due convenzioni 'air_quality' (65
-- siti, l'unica che la funzione riconosce) e 'AIR' (106 siti, quella scritta
-- da sync_site_monitoring_from_certs) continuano a convivere.
-- ============================================================================

DO $merge$
DECLARE
  v_survivor  constant uuid := '6d047b74-41a1-48f2-ac38-b0327e42f9ee';
  v_dying     constant uuid := '6b2d4bec-724c-41fd-8349-94ddc8c80838';
  v_cert      constant uuid := '43665f2b-993d-4d65-b1ec-ebfe9c87d4fe';
  v_name      constant text := 'Otto-Hahn-Straße';
  v_mon_types text[];
  r record;
  v_n bigint;
  v_total bigint := 0;
BEGIN
  -- ── 0) Guardie ──────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM public.sites WHERE id = v_survivor) THEN
    RAISE EXCEPTION 'Superstite % assente. Deduplica annullata.', v_survivor;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.certifications
                  WHERE id = v_cert AND site_id = v_dying) THEN
    RAISE EXCEPTION 'La certification % non sta piu'' sul duplicato. Deduplica annullata.', v_cert;
  END IF;
  SELECT (SELECT count(*) FROM public.hardwares           WHERE site_id = v_dying)
       + (SELECT count(*) FROM public.site_air_records    WHERE site_id = v_dying)
       + (SELECT count(*) FROM public.site_energy_records WHERE site_id = v_dying)
       + (SELECT count(*) FROM public.site_water_records  WHERE site_id = v_dying)
       + (SELECT count(*) FROM public.devices             WHERE site_id = v_dying)
       + (SELECT count(*) FROM public.certifications      WHERE site_id = v_dying AND id <> v_cert)
    INTO v_n;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'Il duplicato % non e'' piu'' un guscio (% righe inattese). Deduplica annullata.', v_dying, v_n;
  END IF;

  -- ── 1) Backup + memoria di cio' che il trigger sta per sovrascrivere ────
  CREATE TABLE IF NOT EXISTS public._bak_merge_ingolstadt_sites AS
    SELECT * FROM public.sites WHERE id = v_dying;

  SELECT monitoring_types INTO v_mon_types FROM public.sites WHERE id = v_survivor;

  -- ── 2) La certification vera passa sul sito superstite ──────────────────
  UPDATE public.certifications SET site_id = v_survivor WHERE id = v_cert;

  -- ── 3) Svuota il duplicato: solo derivati rigenerabili ──────────────────
  DELETE FROM public.site_weather_energy_hourly WHERE site_id = v_dying;
  DELETE FROM public.site_weather_energy_daily  WHERE site_id = v_dying;
  DELETE FROM public.weather_data               WHERE site_id = v_dying;
  DELETE FROM public.site_config                WHERE site_id = v_dying;
  DELETE FROM public.site_kpis                  WHERE site_id = v_dying;
  DELETE FROM public.ops_locations              WHERE site_id = v_dying;

  -- ── 4) Rete di sicurezza: nessun orfano ─────────────────────────────────
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

  -- ── 5) Nome nuovo e monitoring_types rimesso, in una sola UPDATE ───────
  -- Con air_quality di nuovo presente, il trigger sui siti sincronizza da solo
  -- project_name sulla riga monitor.
  UPDATE public.sites
     SET name             = v_name,
         monitoring_types = v_mon_types,
         updated_at       = now()
   WHERE id = v_survivor;

  UPDATE public.certifications
     SET name = v_name, updated_at = now()
   WHERE id = v_cert;

  -- ── 6) Rete di sicurezza sul nome in tabella monitor ────────────────────
  UPDATE public.site_air_records
     SET project_name = v_name, updated_at = now()
   WHERE site_id = v_survivor
     AND project_name IS DISTINCT FROM v_name;
END;
$merge$;

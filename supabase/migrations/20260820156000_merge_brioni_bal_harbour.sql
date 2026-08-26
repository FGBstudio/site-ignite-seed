-- ============================================================================
-- Deduplica sito · BRIONI — Bal Harbour Shops, 9700 Collins Ave
--
-- La stessa boutique esiste due volte:
--
--   bb247c1e  "Bal Harbour"         creato 2026-08-05, a mano
--             indirizzo NULL, city MIAMI, country "U.S.A", niente coordinate,
--             timezone UTC — ma porta la certification (Bal Harbour /
--             da_configurare, has_iaq_monitoring = true), 1 riga air agganciata
--             a quella cert con 1 sensore Upcoming e handover 2026-09-30,
--             e 1 allocazione AIR in stato Requested
--
--   1b3f10f4  "Brioni Bal Harbour"  creato 2026-06-26
--             9700 Collins Ave, Bal Harbour, FL 33154 — coordinate sul mall,
--             city BAL HARBOUR, timezone America/New_York,
--             0 certifications, 0 device, 1 riga air gemella e orfana
--
-- Qui il superstite e' quello che porta il lavoro (la certification e la
-- richiesta di sensore), non quello meglio descritto: nessuno dei due ha
-- hardware o telemetria, quindi non c'e' niente di irrigenerabile da
-- proteggere e conviene tenere la riga a cui il progetto e' gia' agganciato.
-- Al superstite si travasa l'identita' del gemello: indirizzo completo,
-- coordinate del mall, city e country in forma canonica.
--
-- Il timezone passa da UTC ad America/New_York insieme al resto: e' lo stesso
-- fatto geografico dell'indirizzo, e il sito non ha una sola riga di
-- telemetria da ri-bucketizzare, quindi il cambio non sposta nessun dato.
--
-- La riga air del gemello viene cancellata — e' il doppione senza
-- certification, e la richiesta vera vive sull'altra. Backup prima.
--
-- ── Cosa NON si tocca ───────────────────────────────────────────────────────
--
-- Nessuna certification cambia sito, quindi `trg_certs_sync_monitoring` non
-- scatta e monitoring_types del superstite resta 'AIR' — che e' il valore
-- derivato correttamente da has_iaq_monitoring = true sulla sua certification.
--
-- Va detto che 'AIR' NON e' il valore che fn_recalculate_site_air cerca (lei
-- legge solo 'air_quality'): oggi la riga monitor e' protetta dal DELETE
-- soltanto perche' esiste l'allocazione AIR in stato Requested. Se quella
-- cambiasse stato, la riga sparirebbe al primo ricalcolo. Non si rattoppa qui
-- con un valore che il prossimo sync riscriverebbe comunque: e' la
-- riconciliazione delle due convenzioni a doverlo risolvere.
-- ============================================================================

DO $merge$
DECLARE
  v_survivor constant uuid := 'bb247c1e-604e-41d5-9ca0-ee9a2659ad7e';
  v_dying    constant uuid := '1b3f10f4-fabd-4290-a821-7e4b5a47454a';
  v_address  text;
  v_lat      numeric;
  v_lng      numeric;
  r record;
  v_n bigint;
  v_total bigint := 0;
BEGIN
  -- ── 0) Guardie ──────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM public.sites WHERE id = v_survivor) THEN
    RAISE EXCEPTION 'Superstite % assente. Deduplica annullata.', v_survivor;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.certifications WHERE site_id = v_survivor) THEN
    RAISE EXCEPTION 'Il superstite % ha perso la sua certification. Deduplica annullata.', v_survivor;
  END IF;
  -- Il gemello deve essere rimasto senza lavoro attaccato: la sua unica riga
  -- ammessa e' quella air, che si cancella di proposito.
  SELECT (SELECT count(*) FROM public.certifications      WHERE site_id = v_dying)
       + (SELECT count(*) FROM public.hardwares           WHERE site_id = v_dying)
       + (SELECT count(*) FROM public.devices             WHERE site_id = v_dying)
       + (SELECT count(*) FROM public.site_energy_records WHERE site_id = v_dying)
       + (SELECT count(*) FROM public.site_water_records  WHERE site_id = v_dying)
    INTO v_n;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'Il duplicato % non e'' piu'' vuoto (% righe inattese). Deduplica annullata.', v_dying, v_n;
  END IF;
  IF EXISTS (SELECT 1 FROM public.site_air_records
              WHERE site_id = v_dying AND certification_id IS NOT NULL) THEN
    RAISE EXCEPTION 'La riga air del duplicato % ha una certification: non e'' piu'' un doppione. Deduplica annullata.', v_dying;
  END IF;

  -- ── 1) Backup di tutto cio' che sparisce ────────────────────────────────
  CREATE TABLE IF NOT EXISTS public._bak_merge_brioni_sites AS
    SELECT * FROM public.sites WHERE id = v_dying;
  CREATE TABLE IF NOT EXISTS public._bak_merge_brioni_air AS
    SELECT * FROM public.site_air_records WHERE site_id = v_dying;

  -- ── 2) L'identita' del gemello viene letta prima di cancellarlo ─────────
  SELECT address, lat, lng INTO v_address, v_lat, v_lng
  FROM public.sites WHERE id = v_dying;

  -- ── 3) Svuota e cancella il gemello ─────────────────────────────────────
  DELETE FROM public.site_air_records            WHERE site_id = v_dying;
  DELETE FROM public.monitor_handover_sync_backup WHERE site_id = v_dying;
  DELETE FROM public.site_weather_energy_hourly  WHERE site_id = v_dying;
  DELETE FROM public.site_weather_energy_daily   WHERE site_id = v_dying;
  DELETE FROM public.weather_data                WHERE site_id = v_dying;
  DELETE FROM public.site_config                 WHERE site_id = v_dying;
  DELETE FROM public.site_kpis                   WHERE site_id = v_dying;
  DELETE FROM public.ops_locations               WHERE site_id = v_dying;

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

  -- ── 5) Il superstite prende l'identita' del posto ───────────────────────
  UPDATE public.sites
     SET address    = v_address,
         lat        = v_lat,
         lng        = v_lng,
         city       = 'BAL HARBOUR',
         country    = 'United States',
         timezone   = 'America/New_York',
         updated_at = now()
   WHERE id = v_survivor;
END;
$merge$;

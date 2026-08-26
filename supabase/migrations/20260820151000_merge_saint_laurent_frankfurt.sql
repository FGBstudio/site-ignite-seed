-- ============================================================================
-- Deduplica sito · SAINT LAURENT — Frankfurt, Goethestraße 7
--
-- Lo stesso punto vendita esiste due volte (27 m di pin, indirizzo identico):
--
--   733bb17c  "Saint Laurent Frankfurt"   creato 2026-01-21
--             Goethestraße 7, 60313 Frankfurt am Main (CANTIERE YSL)
--             0 certifications, 1 device AIR ONLINE con 49.018 letture
--             telemetry (+4 telemetry_latest), 1 riga site_air_records
--
--   9853846f  "FRANKFURT, Goethestraße"   creato 2026-04-07 (import SL)
--             Goethestraße 7 — 1 certification (Goethestrasse / certificato),
--             1 riga nella tabella legacy `projects` (gia' chiamata
--             "FRANKFURT, Goethestraße"), ops_locations, site_kpis,
--             0 device, 0 righe monitor; meteo derivato rigenerabile
--
-- Sopravvive 733bb17c, che possiede il device e le 49.018 letture: spostare la
-- certification e' UNA riga, spostare la telemetria sarebbero decine di
-- migliaia. Alla fine il superstite prende il nome richiesto
-- "FRANKFURT, Goethestraße" — su ENTRAMBI i piani: sites.name e
-- certifications.name, perche' il Monitor Hub mostra il nome della
-- certification prima di quello del sito (useAirRows). L'indirizzo resta
-- quello del superstite, che oltre al civico porta la nota di cantiere.
--
-- La riga legacy `projects` viene ripuntata, non cancellata: e' l'unica
-- traccia in quella tabella e qualche vista storica potrebbe ancora leggerla.
--
-- Tutto in un solo blocco DO: o va a buon fine per intero o non tocca nulla.
-- ============================================================================

DO $merge$
DECLARE
  v_survivor constant uuid := '733bb17c-fd26-4b13-9ad8-97f3fb028133';
  v_dying    constant uuid := '9853846f-cacc-4d3e-9cbf-cab1623564a2';
  v_cert     constant uuid := '5475c9ea-bc7d-4965-bb6a-36d2d8f6bf6c';
  v_name     constant text := 'FRANKFURT, Goethestraße';
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
       + (SELECT count(*) FROM public.certifications      WHERE site_id = v_dying AND id <> v_cert)
    INTO v_n;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'Il duplicato % non e'' piu'' un guscio (% righe inattese). Deduplica annullata.', v_dying, v_n;
  END IF;

  -- ── 1) Backup di cio' che sparisce ──────────────────────────────────────
  CREATE TABLE IF NOT EXISTS public._bak_merge_frankfurt_sites AS
    SELECT * FROM public.sites WHERE id = v_dying;

  -- ── 2) La certification vera passa sul sito superstite ──────────────────
  UPDATE public.certifications SET site_id = v_survivor WHERE id = v_cert;

  -- ── 3) La riga legacy `projects` viene ripuntata ────────────────────────
  UPDATE public.projects SET site_id = v_survivor WHERE site_id = v_dying;

  -- ── 4) Svuota il duplicato: solo derivati rigenerabili ──────────────────
  DELETE FROM public.site_weather_energy_hourly WHERE site_id = v_dying;
  DELETE FROM public.site_weather_energy_daily  WHERE site_id = v_dying;
  DELETE FROM public.weather_data               WHERE site_id = v_dying;
  DELETE FROM public.site_config                WHERE site_id = v_dying;
  DELETE FROM public.site_kpis                  WHERE site_id = v_dying;
  DELETE FROM public.ops_locations              WHERE site_id = v_dying;

  -- ── 5) Rete di sicurezza: nessun orfano (55 tabelle site_id, zero FK) ───
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

  -- ── 6) Il nome richiesto, su entrambi i piani ───────────────────────────
  UPDATE public.sites
     SET name = v_name, updated_at = now()
   WHERE id = v_survivor;
  UPDATE public.certifications
     SET name = v_name, updated_at = now()
   WHERE id = v_cert;

  -- ── 7) Ricostruisci la riga monitor: la certification ora e' univoca ────
  PERFORM public.fn_recalculate_site_air(v_survivor);
END;
$merge$;

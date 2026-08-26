-- ============================================================================
-- Deduplica sito · SAINT LAURENT — Warsaw, Bracka 9 (Vitkac)
--
-- Lo stesso punto vendita esiste due volte (106 m di pin, stesso civico):
--
--   ef05ca9c  "Saint Laurent Warsaw"  creato 2026-03-04
--             GF, Bracka 9/00-501, Warszawa
--             0 certifications, 1 device AIR (2504090046, Delivered, PO-2),
--             1 riga site_air_records, 1 allarme, monitoring_types=air_quality
--
--   8b3bd997  "WARSAW, Vitkac"        creato 2026-04-07 (import SL)
--             Bracka 9 — Vitkac E' il department store a quel civico.
--             1 certification (Vitkac / certificato), 0 device, 0 righe
--             monitor, 1 riga legacy `projects`, ops_locations, site_config,
--             site_kpis, meteo derivato rigenerabile
--
-- Sopravvive ef05ca9c, che possiede il device. La certification vera passa sul
-- superstite (UNA riga) e il sito prende il nome richiesto "Vitkac". La
-- certification si chiama gia' "Vitkac" e non viene toccata: un UPDATE inutile
-- farebbe solo scattare un ricalcolo in piu'.
--
-- ── Cosa fa il ricalcolo, e perche' qui va bene ─────────────────────────────
--
-- Spostare la certification fa scattare `trg_refresh_air_on_certs`, che chiama
-- fn_recalculate_site_air sul sito superstite. Il sito HA hardware AIR attivo,
-- quindi la funzione prende il ramo hardware — mai il DELETE — e riscrive la
-- riga air a partire dai device: certification_id finalmente valorizzato (oggi
-- e' NULL), status ricostruito dalle spedizioni outbound e po_numbers dal PO.
--
-- Verificato sul dato reale: il device ha una spedizione outbound in stato
-- 'delivered' e il PO-2, quindi il ricalcolo riproduce esattamente lo stato
-- attuale ("1 delivered", PO-2). Nessuna sorpresa in tabella.
--
-- Il rename del sito fa scattare `trg_air_on_site_monitoring`, che qui — il
-- sito ha 'air_quality' fra i monitoring_types — sincronizza da solo
-- project_name sulla riga air.
-- ============================================================================

DO $merge$
DECLARE
  v_survivor constant uuid := 'ef05ca9c-d1b5-435b-a11a-216eb03c2921';
  v_dying    constant uuid := '8b3bd997-10d3-4778-9752-580ddc811c0f';
  v_cert     constant uuid := 'd2f4c2a5-48c4-4a08-8e2f-d742d8719c43';
  v_name     constant text := 'Vitkac';
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

  -- ── 1) Backup di cio' che sparisce ──────────────────────────────────────
  CREATE TABLE IF NOT EXISTS public._bak_merge_warsaw_sites AS
    SELECT * FROM public.sites WHERE id = v_dying;

  -- ── 2) La certification vera passa sul sito superstite ──────────────────
  UPDATE public.certifications SET site_id = v_survivor WHERE id = v_cert;

  -- ── 3) La riga legacy `projects` viene ripuntata, non cancellata ────────
  UPDATE public.projects SET site_id = v_survivor WHERE site_id = v_dying;

  -- ── 4) Svuota il duplicato: solo derivati rigenerabili e default d'import
  DELETE FROM public.site_weather_energy_hourly WHERE site_id = v_dying;
  DELETE FROM public.site_weather_energy_daily  WHERE site_id = v_dying;
  DELETE FROM public.weather_data               WHERE site_id = v_dying;
  DELETE FROM public.site_config                WHERE site_id = v_dying;
  DELETE FROM public.site_kpis                  WHERE site_id = v_dying;
  DELETE FROM public.ops_locations              WHERE site_id = v_dying;

  -- ── 5) Rete di sicurezza: nessun orfano ─────────────────────────────────
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

  -- ── 6) Il nome richiesto ────────────────────────────────────────────────
  UPDATE public.sites
     SET name = v_name, updated_at = now()
   WHERE id = v_survivor;

  -- Rete di sicurezza sul nome in tabella monitor: il trigger del punto 6 lo
  -- sincronizza gia', questa riga copre il caso in cui cambiasse.
  UPDATE public.site_air_records
     SET project_name = v_name, updated_at = now()
   WHERE site_id = v_survivor
     AND project_name IS DISTINCT FROM v_name;
END;
$merge$;

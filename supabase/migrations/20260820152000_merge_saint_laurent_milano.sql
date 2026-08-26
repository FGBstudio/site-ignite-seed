-- ============================================================================
-- Deduplica sito · SAINT LAURENT — Milano, Via Monte Napoleone 8
--
-- Lo stesso punto vendita esiste due volte (32 m di pin, stesso civico):
--
--   11cd8bbe  "Saint Laurent Milano"      creato 2026-03-02
--             Via Monte Napoleone, 8, 20121 Milano MI
--             1 certification (Milano / in_progress), 51 device Energy,
--             48 devices, 394.876 righe energy_telemetry, 1 riga energy,
--             1 riga air, 56 allarmi attivi + 74 storici
--
--   e5b8439e  "MILANO, Montenapoleone"    creato 2026-04-07 (import SL)
--             Via Monte Napoleone, 8 — 0 certifications, 0 device,
--             0 righe monitor: pura ombra. Porta solo 1 riga nella tabella
--             legacy `projects`, 2 alert_rules di default, ops_locations,
--             site_config, site_kpis e meteo derivato rigenerabile
--
-- Sopravvive 11cd8bbe, che possiede tutto. Alla fine prende il nome richiesto
-- "MILANO, Montenapoleone" su ENTRAMBI i piani — sites.name e
-- certifications.name — perche' il Monitor Hub e Operations mostrano il nome
-- della certification prima di quello del sito.
--
-- ── Perche' l'ordine delle UPDATE conta ─────────────────────────────────────
--
-- `trg_refresh_air_on_certs` chiama fn_recalculate_site_air a ogni modifica di
-- una certification, e la funzione riscrive site_air_records.project_name con
-- il nome del SITO. Quindi si rinomina prima il sito e poi la certification:
-- cosi' il ricalcolo scattato dal rename della cert trova gia' il nome nuovo.
--
-- Verificato che quel ricalcolo qui e' innocuo: il sito non ha hardware AIR
-- (i 51 device sono tutti categoria Energy) ma ha 1 allocazione AIR in stato
-- 'Requested' con quantity = 1, quindi la funzione prende il ramo 'Upcoming'
-- e NON il DELETE che scatterebbe con zero richieste e nessun 'air_quality'
-- fra i monitoring_types. La riga air sopravvive, e con lei la nota scritta a
-- mano dal PM ("Hanno perso il monitor, ne serve uno nuovo"): l'UPSERT della
-- funzione non tocca la colonna `notes`.
--
-- ── Acqua ed energia ────────────────────────────────────────────────────────
--
-- Il sito non ha monitoraggio dell'acqua: il modulo resta disabilitato ma con
-- la demo accesa, che e' cio' che fa comparire la didascalia "Vuoi vedere una
-- demo della dashboard Acqua?" al posto dei riquadri vuoti (ModuleGate:
-- enabled=false + showDemo=true → invito alla demo; showDemo=false →
-- ModulePlaceholderGrid).
--
-- L'energia NON si tocca: ne' i flag di modulo, ne' site_energy_records, ne'
-- le 394.876 righe di telemetria. Restano esattamente come sono oggi.
-- ============================================================================

DO $merge$
DECLARE
  v_survivor constant uuid := '11cd8bbe-5f2c-4ca2-8cee-791bf0b6cd92';
  v_dying    constant uuid := 'e5b8439e-30b2-4549-b8d4-5c3c8842cecf';
  v_cert     constant uuid := '1337971b-a151-488f-a914-117f3e47175b';
  v_name     constant text := 'MILANO, Montenapoleone';
  r record;
  v_n bigint;
  v_total bigint := 0;
BEGIN
  -- ── 0) Guardie ──────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM public.sites WHERE id = v_survivor) THEN
    RAISE EXCEPTION 'Superstite % assente. Deduplica annullata.', v_survivor;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.certifications
                  WHERE id = v_cert AND site_id = v_survivor) THEN
    RAISE EXCEPTION 'La certification % non sta sul superstite. Deduplica annullata.', v_cert;
  END IF;
  -- Il duplicato deve essere rimasto l'ombra che era: se nel frattempo ci hanno
  -- attaccato una certification, un device o una riga monitor, ci si ferma.
  SELECT (SELECT count(*) FROM public.certifications      WHERE site_id = v_dying)
       + (SELECT count(*) FROM public.hardwares           WHERE site_id = v_dying)
       + (SELECT count(*) FROM public.site_air_records    WHERE site_id = v_dying)
       + (SELECT count(*) FROM public.site_energy_records WHERE site_id = v_dying)
       + (SELECT count(*) FROM public.site_water_records  WHERE site_id = v_dying)
       + (SELECT count(*) FROM public.devices             WHERE site_id = v_dying)
    INTO v_n;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'Il duplicato % non e'' piu'' un''ombra (% righe inattese). Deduplica annullata.', v_dying, v_n;
  END IF;

  -- ── 1) Backup di cio' che sparisce ──────────────────────────────────────
  CREATE TABLE IF NOT EXISTS public._bak_merge_milano_sites AS
    SELECT * FROM public.sites WHERE id = v_dying;
  CREATE TABLE IF NOT EXISTS public._bak_merge_milano_alert_rules AS
    SELECT * FROM public.alert_rules WHERE site_id = v_dying;

  -- ── 2) La riga legacy `projects` viene ripuntata, non cancellata ────────
  -- E' l'unica traccia in quella tabella e il superstite non ne ha una propria.
  UPDATE public.projects SET site_id = v_survivor WHERE site_id = v_dying;

  -- ── 3) Svuota il duplicato ──────────────────────────────────────────────
  -- Meteo e derivati si rigenerano dal feed; config, kpis, locations e regole
  -- di allarme sono i default dell'import e il superstite ha gia' i propri.
  DELETE FROM public.site_weather_energy_hourly WHERE site_id = v_dying;
  DELETE FROM public.site_weather_energy_daily  WHERE site_id = v_dying;
  DELETE FROM public.weather_data               WHERE site_id = v_dying;
  DELETE FROM public.site_config                WHERE site_id = v_dying;
  DELETE FROM public.site_kpis                  WHERE site_id = v_dying;
  DELETE FROM public.ops_locations              WHERE site_id = v_dying;
  DELETE FROM public.alert_rules                WHERE site_id = v_dying;

  -- ── 4) Rete di sicurezza: nessun orfano (55 tabelle site_id, zero FK) ───
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

  -- ── 5) Il nome richiesto: prima il sito, poi la certification ───────────
  -- Acqua: modulo spento ma demo accesa, cioe' la didascalia invece del vuoto.
  -- I flag energy non compaiono qui di proposito: restano come sono.
  UPDATE public.sites
     SET name                    = v_name,
         module_water_enabled    = false,
         module_water_show_demo  = true,
         updated_at              = now()
   WHERE id = v_survivor;

  UPDATE public.certifications
     SET name = v_name, updated_at = now()
   WHERE id = v_cert;

  -- ── 6) Allinea il nome sulla riga monitor ───────────────────────────────
  -- Il ricalcolo scattato al punto 5 lo fa gia'; questa e' la rete di sicurezza
  -- se un domani il trigger cambiasse. `notes` non si tocca mai.
  UPDATE public.site_air_records
     SET project_name = v_name, updated_at = now()
   WHERE site_id = v_survivor
     AND project_name IS DISTINCT FROM v_name;
END;
$merge$;

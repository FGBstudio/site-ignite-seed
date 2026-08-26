-- ============================================================================
-- Deduplica sito · BOXENGO — Famagosta, Milano
--
-- E' il caso che ha originato tutto il lavoro sui progetti cancellati.
--
--   70138a05  "Boxengo Famagosta"  creato 2026-06-29
--             1 riga site_air_records (Upcoming, 1 sensore, nota "DELATED"),
--             monitoring_types = air_quality, 0 certifications, 0 device
--
--   cba79117  "Famagosta"          creato 2026-07-13
--             porta la certification "Famagosta / canceled" e nient'altro:
--             0 device, 0 righe monitor, solo site_config e meteo derivato
--
-- Il progetto cancellato e il progetto visibile nel Monitor sono due siti
-- diversi: e' esattamente per questo che il predicato "sito cancellato" di
-- 20260820120000 non poteva scattare su Famagosta — il sito con la riga air
-- non ha nessuna certification, quindi non ha nessuna certification cancellata.
-- Riunirli chiude il caso.
--
-- ── Perche' questa migration disabilita due trigger ─────────────────────────
--
-- Spostare la certification farebbe scattare, in quest'ordine (i trigger AFTER
-- girano in ordine alfabetico di nome):
--
--   1. trg_certifications_sync_monitoring → sync_site_monitoring_from_certs
--      ricalcola monitoring_types dai flag has_iaq/energy/water delle
--      certifications del sito. Quella spostata ha has_iaq_monitoring = false,
--      quindi scriverebbe un array vuoto sopra 'air_quality'.
--
--   2. trg_refresh_air_on_certs → fn_recalculate_site_air, che nella versione
--      oggi in produzione, non trovando ne' hardware AIR, ne' allocazioni
--      'Requested', ne' — ormai — 'air_quality' fra i monitoring_types, esegue
--      DELETE FROM site_air_records.
--
-- Il risultato sarebbe la sparizione della riga e della nota "DELATED" scritta
-- a mano: l'opposto di cio' che questa deduplica deve ottenere. I due trigger
-- vengono quindi spenti per la sola durata dello spostamento e riaccesi subito
-- dopo, dentro la stessa transazione — se qualcosa fallisce, il rollback
-- ripristina anche loro, perche' in Postgres il DDL e' transazionale.
--
-- Non e' un rattoppo permanente: e' il modo di non far girare, su questa riga,
-- una funzione che verra' sostituita. Applicata 20260805170000 (la riga non si
-- cancella mai) e 20260820120000 (progetto cancellato → status 'Cancelled',
-- conto a zero, fabbisogno ricordato nelle note), il primo ricalcolo portera'
-- questa riga allo stato che le compete, senza bisogno di toccare altro.
--
-- Stato atteso oggi, subito dopo questa migration:
--   riga air ancora presente, Upcoming, 1 sensore, nota "DELATED" intatta,
--   agganciata alla certification cancellata, su un sito che ora sa di essere
--   cancellato.
-- ============================================================================

DO $merge$
DECLARE
  v_survivor  constant uuid := '70138a05-54bf-4e30-8383-e79b0cd8e671';
  v_dying     constant uuid := 'cba79117-036a-44bd-a42b-33556ca58b97';
  v_cert      constant uuid := '5c46fc1c-6a09-468e-aa4f-98a5e3aa1897';
  v_mon_types text[];
  v_air_on    boolean;
  r record;
  v_n bigint;
  v_total bigint := 0;
BEGIN
  -- ── 0) Guardie ──────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM public.sites WHERE id = v_survivor) THEN
    RAISE EXCEPTION 'Superstite % assente. Deduplica annullata.', v_survivor;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.certifications
                  WHERE id = v_cert AND site_id = v_dying
                    AND lower(COALESCE(status,'')) IN ('canceled','cancelled')) THEN
    RAISE EXCEPTION 'La certification % non e'' piu'' quella cancellata sul duplicato. Deduplica annullata.', v_cert;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.site_air_records WHERE site_id = v_survivor) THEN
    RAISE EXCEPTION 'Il superstite % ha perso la sua riga air. Deduplica annullata.', v_survivor;
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

  -- ── 1) Backup, e memoria di cio' che i trigger vorrebbero sovrascrivere ─
  CREATE TABLE IF NOT EXISTS public._bak_merge_famagosta_sites AS
    SELECT * FROM public.sites WHERE id = v_dying;
  CREATE TABLE IF NOT EXISTS public._bak_merge_famagosta_air AS
    SELECT * FROM public.site_air_records WHERE site_id = v_survivor;

  SELECT monitoring_types, module_air_enabled
    INTO v_mon_types, v_air_on
    FROM public.sites WHERE id = v_survivor;

  -- ── 2) Spostamento della certification, al riparo dai due trigger ───────
  ALTER TABLE public.certifications DISABLE TRIGGER trg_certifications_sync_monitoring;
  ALTER TABLE public.certifications DISABLE TRIGGER trg_refresh_air_on_certs;

  UPDATE public.certifications SET site_id = v_survivor WHERE id = v_cert;

  ALTER TABLE public.certifications ENABLE TRIGGER trg_refresh_air_on_certs;
  ALTER TABLE public.certifications ENABLE TRIGGER trg_certifications_sync_monitoring;

  -- ── 3) La riga monitor dichiara a quale progetto appartiene ─────────────
  -- Restano intatti status, sensori e la nota: qui si aggiunge solo il legame
  -- che finora mancava, ed e' quel legame a rendere leggibile la cancellazione.
  UPDATE public.site_air_records
     SET certification_id = v_cert, updated_at = now()
   WHERE site_id = v_survivor
     AND certification_id IS NULL;

  -- ── 4) Svuota il duplicato: solo derivati rigenerabili ──────────────────
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

  -- ── 6) monitoring_types come prima ──────────────────────────────────────
  -- Con i trigger spenti al punto 2 non e' stato toccato, ma lo si riafferma:
  -- e' il marcatore che tiene la riga al riparo dal DELETE finche' la funzione
  -- non viene sostituita.
  UPDATE public.sites
     SET monitoring_types   = v_mon_types,
         module_air_enabled = v_air_on,
         updated_at         = now()
   WHERE id = v_survivor
     AND (monitoring_types IS DISTINCT FROM v_mon_types
          OR module_air_enabled IS DISTINCT FROM v_air_on);

  -- ── 7) Verifica finale: la riga e la nota devono essere ancora li' ──────
  IF NOT EXISTS (
    SELECT 1 FROM public.site_air_records
     WHERE site_id = v_survivor AND COALESCE(notes,'') <> ''
  ) THEN
    RAISE EXCEPTION 'La riga air del superstite e'' sparita o ha perso le note. Deduplica annullata.';
  END IF;
END;
$merge$;

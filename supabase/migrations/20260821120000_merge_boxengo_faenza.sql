-- ============================================================================
-- Deduplica sito · BOXENGO — Viale Faenza, Milano
--
-- Un solo immobile, due progetti fatti in tempi diversi, registrati come due
-- siti:
--
--   9a6befaf  "Boxengo Faenza"  creato 2026-03-09
--             Viale Faenza, 20 — 1 device AIR, 1 riga monitor, telemetria
--             attiva, monitoring_types = air_quality
--             cert "Faenza" / completato / LEED
--
--   ae6650d0  "Faenza"          creato 2026-07-13
--             Viale Faenza, 16-22 — 0 device, 0 righe monitor
--             cert "Faenza" / da_configurare / LEED
--
-- Confermato lato business: il sito e' uno, prima e' stata certificata una
-- parte e poi l'altra. Quindi un solo sito con DUE certification, non una che
-- sostituisce l'altra: la prima e' finita, la seconda e' in corso, ed entrambe
-- devono restare leggibili.
--
-- ── I nomi delle due certification ─────────────────────────────────────────
--
-- Si chiamavano tutte e due "Faenza": affiancate sullo stesso sito sarebbero
-- indistinguibili in Operations e nel Monitor, che mostrano il nome della
-- certification. Vengono distinte per civico, che e' il fatto che le separa
-- davvero — 20 la parte gia' completata, 16-22 quella in configurazione. Se
-- preferisci nominarle per fase si cambiano con due UPDATE.
--
-- ── Sull'indirizzo del sito superstite ─────────────────────────────────────
--
-- Resta "Viale Faenza, 20": e' l'indirizzo del sito che sopravvive e quello a
-- cui e' fisicamente installato il sensore. Il civico 16-22 resta nel nome
-- della sua certification, dove indica la porzione di immobile.
-- ============================================================================

DO $merge$
DECLARE
  v_survivor  constant uuid := '9a6befaf-df9b-4ea4-98a9-f1daa4b790ec';
  v_dying     constant uuid := 'ae6650d0-5910-405a-aa60-03bf287de2d5';
  v_cert_move constant uuid := '3fb52459-4c5f-4d99-84e5-1910de6b12be';  -- Faenza / da_configurare
  v_cert_keep constant uuid := '7ff31bd5-91ac-409f-a9d3-99fcdc06ec7f';  -- Faenza / completato
  r record;
  v_n bigint;
  v_total bigint := 0;
BEGIN
  -- ── 0) Guardie ──────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM public.sites WHERE id = v_survivor) THEN
    RAISE EXCEPTION 'Superstite % assente. Deduplica annullata.', v_survivor;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.certifications WHERE id = v_cert_move AND site_id = v_dying) THEN
    RAISE EXCEPTION 'La certification % non sta piu'' sul duplicato. Deduplica annullata.', v_cert_move;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.certifications WHERE id = v_cert_keep AND site_id = v_survivor) THEN
    RAISE EXCEPTION 'La certification % non sta sul superstite. Deduplica annullata.', v_cert_keep;
  END IF;
  SELECT (SELECT count(*) FROM public.hardwares           WHERE site_id = v_dying)
       + (SELECT count(*) FROM public.site_air_records    WHERE site_id = v_dying)
       + (SELECT count(*) FROM public.site_energy_records WHERE site_id = v_dying)
       + (SELECT count(*) FROM public.site_water_records  WHERE site_id = v_dying)
       + (SELECT count(*) FROM public.devices             WHERE site_id = v_dying)
       + (SELECT count(*) FROM public.certifications      WHERE site_id = v_dying AND id <> v_cert_move)
    INTO v_n;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'Il duplicato % non e'' piu'' un guscio (% righe inattese). Deduplica annullata.', v_dying, v_n;
  END IF;

  -- ── 1) Backup ───────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS public._bak_merge_faenza_sites AS
    SELECT * FROM public.sites WHERE id = v_dying;

  -- ── 2) La seconda certification passa sul sito ──────────────────────────
  UPDATE public.certifications SET site_id = v_survivor WHERE id = v_cert_move;

  -- ── 3) Due nomi distinti, per civico ────────────────────────────────────
  UPDATE public.certifications SET name = 'Faenza 20',    updated_at = now() WHERE id = v_cert_keep;
  UPDATE public.certifications SET name = 'Faenza 16-22', updated_at = now() WHERE id = v_cert_move;

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
      AND c.table_name <> 'sites' AND c.table_name NOT LIKE '\_bak\_%'
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE site_id = %L', r.table_name, v_dying) INTO v_n;
    IF v_n > 0 THEN
      RAISE NOTICE 'Righe rimaste in %: %', r.table_name, v_n;
      v_total := v_total + v_n;
    END IF;
  END LOOP;
  IF v_total > 0 THEN
    RAISE EXCEPTION 'Il sito duplicato ha ancora % righe collegate. Deduplica annullata.', v_total;
  END IF;

  DELETE FROM public.sites WHERE id = v_dying;

  -- ── 6) Il sito deve essere rimasto con entrambe le certification ───────
  SELECT count(*) INTO v_n FROM public.certifications WHERE site_id = v_survivor;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'Il superstite ha % certification invece di 2. Deduplica annullata.', v_n;
  END IF;
END;
$merge$;

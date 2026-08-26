-- ============================================================================
-- Deduplica sito · POMELLATO — Bal Harbour Shops, 9700 Collins Ave
--
-- La stessa boutique registrata due volte, ma con una divisione che rendeva la
-- cosa difficile da vedere: su un sito sta la CERTIFICAZIONE, sull'altro il
-- MONITORAGGIO ENERGETICO dello stesso negozio.
--
--   2c4d95ca  "MIAMI, Bal Harbour"              creato 2026-06-17
--             9700 Collins Ave, Bal Harbour, FL 33154
--             cert "Bal Harbour" / in_corso / LEED
--             1 riga site_air_records + 1 riga site_energy_records,
--             monitoring_types = air_quality, energy_monitor
--             0 device
--
--   a113634f  "Bal Harbour, Bal Harbour Shops"  creato 2026-01-20
--             9700 Collins Ave, Bal Harbour, FL 33154 (stesso indirizzo)
--             cert "Bal Harbour, Bal Harbour Shops" / da_configurare / Energy,
--             in hold
--             13 device Energy, 0 righe monitor, 0 telemetria
--
-- Sopravvive 2c4d95ca, che possiede le righe monitor: quelle sono uniche per
-- sito e non si possono spostare, mentre i 13 device sono 13 UPDATE. Nessuno
-- dei due ha telemetria, quindi non c'e' storico irrigenerabile in gioco.
--
-- Alla fine il sito porta entrambe le certification — la LEED in corso e
-- quella Energy — e i 13 apparecchi, che e' esattamente il quadro reale: un
-- negozio, una certificazione ambientale, un impianto di monitoraggio
-- energetico.
--
-- ── I nomi ─────────────────────────────────────────────────────────────────
--
-- Il sito prende "Bal Harbour, Bal Harbour Shops", che nomina il centro
-- commerciale ed e' la forma usata dagli altri brand allo stesso indirizzo.
-- Le due certification si distinguono per cio' che certificano davvero, che e'
-- anche il loro cert_type: "Bal Harbour — LEED" e "Bal Harbour — Energy".
-- Lasciarle entrambe "Bal Harbour" le renderebbe indistinguibili in Operations
-- e nel Monitor, che mostrano il nome della certification.
--
-- ── Perche' si spegne un trigger ───────────────────────────────────────────
--
-- La certification Energy e' in hold, e trg_enforce_cert_not_on_hold vieta
-- ogni modifica a un progetto sospeso a chi non e' admin — questa migration
-- gira come servizio, senza auth.uid(). Viene spento per il solo spostamento e
-- riacceso subito: se qualcosa fallisce, il rollback ripristina anche lui.
--
-- L'hold NON viene tolto: il progetto energetico resta sospeso com'era, e ora
-- lo e' accanto alla certificazione LEED che invece corre. Il sito non risulta
-- "in hold" proprio per questo — la regola vuole che TUTTE le certification
-- vive siano sospese, e qui una non lo e'.
-- ============================================================================

DO $merge$
DECLARE
  v_survivor   constant uuid := '2c4d95ca-b85c-44c1-a579-60b6afd9ea1c';
  v_dying      constant uuid := 'a113634f-6501-4dd3-bf52-491c29ef5e72';
  v_cert_leed  constant uuid := 'e9e7409c-5716-4919-88cf-fd1dd3104347';
  v_cert_ener  constant uuid := '4189bd6a-edbd-4cab-a6e9-4102438fdcac';
  v_nome       constant text := 'Bal Harbour, Bal Harbour Shops';
  r record;
  v_n bigint;
  v_hw bigint;
  v_total bigint := 0;
BEGIN
  -- ── 0) Guardie ──────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM public.sites WHERE id = v_survivor) THEN
    RAISE EXCEPTION 'Superstite % assente. Deduplica annullata.', v_survivor;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.certifications WHERE id = v_cert_leed AND site_id = v_survivor) THEN
    RAISE EXCEPTION 'La certification LEED non sta sul superstite. Deduplica annullata.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.certifications WHERE id = v_cert_ener AND site_id = v_dying) THEN
    RAISE EXCEPTION 'La certification Energy non sta sul duplicato. Deduplica annullata.';
  END IF;
  -- Il duplicato non deve avere righe monitor: sono uniche per sito e il
  -- superstite ha gia' le sue.
  SELECT (SELECT count(*) FROM public.site_air_records    WHERE site_id = v_dying)
       + (SELECT count(*) FROM public.site_energy_records WHERE site_id = v_dying)
       + (SELECT count(*) FROM public.site_water_records  WHERE site_id = v_dying)
       + (SELECT count(*) FROM public.certifications      WHERE site_id = v_dying AND id <> v_cert_ener)
    INTO v_n;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'Il duplicato % ha % righe che collidono col superstite. Deduplica annullata.', v_dying, v_n;
  END IF;

  SELECT count(*) INTO v_hw FROM public.hardwares WHERE site_id = v_dying;

  -- ── 1) Backup ───────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS public._bak_merge_pomellato_sites AS
    SELECT * FROM public.sites WHERE id = v_dying;
  CREATE TABLE IF NOT EXISTS public._bak_merge_pomellato_hardwares AS
    SELECT id, site_id, device_id, now() AS _bak_at FROM public.hardwares WHERE site_id = v_dying;

  -- ── 2) I 13 apparecchi passano sul sito superstite ──────────────────────
  UPDATE public.hardwares SET site_id = v_survivor WHERE site_id = v_dying;

  -- ── 3) La certification Energy lo segue, hold compreso ──────────────────
  ALTER TABLE public.certifications DISABLE TRIGGER trg_enforce_cert_not_on_hold;

  UPDATE public.certifications SET site_id = v_survivor WHERE id = v_cert_ener;

  UPDATE public.certifications SET name = 'Bal Harbour — LEED',   updated_at = now() WHERE id = v_cert_leed;
  UPDATE public.certifications SET name = 'Bal Harbour — Energy', updated_at = now() WHERE id = v_cert_ener;

  ALTER TABLE public.certifications ENABLE TRIGGER trg_enforce_cert_not_on_hold;

  -- ── 4) Svuota il duplicato: solo derivati rigenerabili ──────────────────
  DELETE FROM public.site_weather_energy_hourly WHERE site_id = v_dying;
  DELETE FROM public.site_weather_energy_daily  WHERE site_id = v_dying;
  DELETE FROM public.weather_data               WHERE site_id = v_dying;
  DELETE FROM public.site_config                WHERE site_id = v_dying;
  DELETE FROM public.site_kpis                  WHERE site_id = v_dying;
  DELETE FROM public.ops_locations              WHERE site_id = v_dying;
  DELETE FROM public.monitor_handover_sync_backup WHERE site_id = v_dying;

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

  -- ── 6) Il nome del centro commerciale ───────────────────────────────────
  UPDATE public.sites SET name = v_nome, updated_at = now() WHERE id = v_survivor;

  -- ── 7) Verifica: due certification e tutti gli apparecchi ──────────────
  SELECT count(*) INTO v_n FROM public.certifications WHERE site_id = v_survivor;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'Il superstite ha % certification invece di 2. Deduplica annullata.', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.hardwares WHERE site_id = v_survivor;
  IF v_n < v_hw THEN
    RAISE EXCEPTION 'Apparecchi persi: attesi almeno %, trovati %. Deduplica annullata.', v_hw, v_n;
  END IF;
END;
$merge$;

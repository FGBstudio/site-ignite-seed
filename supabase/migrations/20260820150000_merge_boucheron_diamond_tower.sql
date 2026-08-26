-- ============================================================================
-- Deduplica sito · BOUCHERON — Taipei Diamond Tower
--
-- Lo stesso punto vendita esiste due volte (19 m di distanza sul pin):
--
--   964d00e8  "Boucheron Taiwan Diamond Tower"  creato 2026-03-26
--             1F, Section 3, Zhongxiao E Rd, Da'an District, Taipei
--             0 certifications, 1 device AIR, 1 riga site_air_records
--
--   af32cc46  "Boucheron Diamon Tower"          creato 2026-06-29 (import massivo)
--             268號3樓, Section 3, Zhongxiao E Rd (stesso edificio, piano diverso)
--             1 certification (Diamon Tower / LEED / certificato), 0 device,
--             0 righe monitor; solo meteo derivato, rigenerabile dal feed
--
-- Sopravvive 964d00e8, che possiede il device: come per Hamburg
-- (20260820140000), l'identita' di un sito sono le sue colonne, non il suo id,
-- e non si sposta un byte di cio' che non si puo' rigenerare. Nome e indirizzo
-- del superstite sono gia' quelli giusti ("Boucheron Taiwan Diamond Tower",
-- 1F) e restano; la certification vera passa sul superstite (UNA riga).
--
-- La riga air del superstite non si tocca a mano: il ricalcolo finale la
-- riaggancia alla certification appena arrivata, che ora e' l'unica del sito.
--
-- Tutto in un solo blocco DO: o va a buon fine per intero o non tocca nulla.
-- ============================================================================

DO $merge$
DECLARE
  v_survivor constant uuid := '964d00e8-f72b-450b-859b-dc4c516762ad';
  v_dying    constant uuid := 'af32cc46-2e4e-4789-812b-d33efee0d02b';
  v_cert     constant uuid := '428552aa-f739-40bd-a3c3-d2f39b9e6313';
  r record;
  v_n bigint;
  v_total bigint := 0;
BEGIN
  -- ── 0) Guardie: il mondo deve essere ancora come quando e' stato deciso ──
  IF NOT EXISTS (SELECT 1 FROM public.sites WHERE id = v_survivor) THEN
    RAISE EXCEPTION 'Superstite % assente. Deduplica annullata.', v_survivor;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.certifications
                  WHERE id = v_cert AND site_id = v_dying) THEN
    RAISE EXCEPTION 'La certification % non sta piu'' sul duplicato. Deduplica annullata.', v_cert;
  END IF;
  -- Il duplicato deve essere rimasto un guscio: niente device, niente righe
  -- monitor. Se nel frattempo qualcuno ci ha attaccato del lavoro, ci si ferma.
  SELECT (SELECT count(*) FROM public.hardwares          WHERE site_id = v_dying)
       + (SELECT count(*) FROM public.site_air_records   WHERE site_id = v_dying)
       + (SELECT count(*) FROM public.site_energy_records WHERE site_id = v_dying)
       + (SELECT count(*) FROM public.site_water_records WHERE site_id = v_dying)
       + (SELECT count(*) FROM public.certifications     WHERE site_id = v_dying AND id <> v_cert)
    INTO v_n;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'Il duplicato % non e'' piu'' un guscio (% righe inattese). Deduplica annullata.', v_dying, v_n;
  END IF;

  -- ── 1) Backup di cio' che sparisce (il meteo derivato si rigenera, non si salva)
  CREATE TABLE IF NOT EXISTS public._bak_merge_boucheron_sites AS
    SELECT * FROM public.sites WHERE id = v_dying;

  -- ── 2) La certification vera passa sul sito superstite ──────────────────
  UPDATE public.certifications SET site_id = v_survivor WHERE id = v_cert;

  -- ── 3) Svuota il duplicato: solo derivati rigenerabili ──────────────────
  DELETE FROM public.site_weather_energy_hourly WHERE site_id = v_dying;
  DELETE FROM public.site_weather_energy_daily  WHERE site_id = v_dying;
  DELETE FROM public.weather_data               WHERE site_id = v_dying;
  DELETE FROM public.site_config                WHERE site_id = v_dying;

  -- ── 4) Rete di sicurezza: nessun orfano ─────────────────────────────────
  -- sites.id non ha nessuna foreign key: 55 tabelle portano site_id e nessuna
  -- e' vincolata. Si verifica esplicitamente prima di cancellare.
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

  -- ── 5) Il superstite e' gia' se stesso: si tocca solo updated_at ────────
  UPDATE public.sites SET updated_at = now() WHERE id = v_survivor;

  -- ── 6) Ricostruisci la riga monitor: ora la certification e' univoca ────
  PERFORM public.fn_recalculate_site_air(v_survivor);
END;
$merge$;

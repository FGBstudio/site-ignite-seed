-- ============================================================================
-- Deduplica sito · SAINT LAURENT — Hamburg
--
-- Lo stesso punto vendita esiste due volte:
--
--   5ebf9e1a  "Saint Laurent Hamburg"  creato 2026-02-20
--             Alsterhaus, Jungfernstieg 16-20
--             0 certifications, 1 device consegnato (2508140015, LEED ClAir),
--             37.020 letture telemetry + 14.072 orarie + 616 giornaliere,
--             4 allarmi attivi, 15 storici
--
--   59d2d993  "Neuer Wall"             creato 2026-04-07
--             Neuer Wall 34
--             4 certifications, 0 device, 0 telemetria,
--             riga air fantasma da 1 sensore in stato Upcoming
--
-- Sopravvive 5ebf9e1a e gli si riscrive sopra l'identita' di Neuer Wall.
-- L'identita' di un sito sono le sue colonne, non il suo id: spostare una
-- certification e' UNA riga, spostare la telemetria ne sarebbe 52.000. Il
-- risultato visibile e' identico — un solo sito "Neuer Wall", a Neuer Wall 34,
-- con la sua certification e il suo sensore completo di storico — ma non si
-- tocca un byte di cio' che non si puo' rigenerare.
--
-- La riga in site_air_records NON viene spostata: e' derivata, non sorgente.
-- fn_recalculate_site_air la ricostruisce da `hardwares`, e il device e' gia'
-- sul sito superstite.
--
-- ── Le 3 certifications senza nome ──────────────────────────────────────────
--
-- 4ec8174f, 89cdbba4, a16e8e28: tutte LEED 'potential' senza nome, create nello
-- stesso istante del 2026-06-29 dall'import massivo. Verificate su tutte le 25
-- tabelle che portano certification_id: zero task, ore, milestone, allocazioni,
-- stakeholder, audit. Le referenziano solo due viste (derivate), una riga di
-- backup e — ed e' il punto — la riga air di Neuer Wall.
--
-- Perche' proprio una di quelle: fn_recalculate_site_air sceglie la
-- certification con ORDER BY created_at DESC, e i gusci del 29 giugno sono piu'
-- recenti della certification vera del 7 aprile. useAirRows ripiega poi sul nome
-- del sito perche' quella agganciata non ne ha. Cancellandoli resta una sola
-- certification e l'aggancio diventa univoco da solo.
-- ============================================================================

BEGIN;

-- ── 0) Backup di tutto cio' che sparisce ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public._bak_merge_hamburg_sites AS
  SELECT * FROM public.sites WHERE id = '59d2d993-820b-40ef-9ad3-aec780f57fbb';

CREATE TABLE IF NOT EXISTS public._bak_merge_hamburg_certs AS
  SELECT * FROM public.certifications
  WHERE id IN ('4ec8174f-a57f-497c-aa5a-7954b40642dc',
               '89cdbba4-f143-478c-b3a9-73a1f273d28f',
               'a16e8e28-cb10-4394-90a0-b45c5fd2c96f');

CREATE TABLE IF NOT EXISTS public._bak_merge_hamburg_air AS
  SELECT * FROM public.site_air_records
  WHERE site_id IN ('59d2d993-820b-40ef-9ad3-aec780f57fbb',
                    '5ebf9e1a-cfd6-4ff3-9ef5-e4be2c49b6dc');

-- ── 1) Guardia: i gusci devono essere ancora vuoti ──────────────────────────
--
-- Se nel frattempo qualcuno ci ha attaccato del lavoro, la transazione muore
-- qui invece di cancellarlo. Costa una query e vale tutta la differenza fra
-- una deduplica e una perdita di dati.
DO $$
DECLARE
  v_ids uuid[] := ARRAY[
    '4ec8174f-a57f-497c-aa5a-7954b40642dc',
    '89cdbba4-f143-478c-b3a9-73a1f273d28f',
    'a16e8e28-cb10-4394-90a0-b45c5fd2c96f'
  ]::uuid[];
  v_attached integer;
BEGIN
  SELECT
      (SELECT count(*) FROM public.cert_wbs_phases          WHERE certification_id = ANY(v_ids))
    + (SELECT count(*) FROM public.cert_tasks               WHERE certification_id = ANY(v_ids))
    + (SELECT count(*) FROM public.cert_payment_milestones  WHERE certification_id = ANY(v_ids))
    + (SELECT count(*) FROM public.project_allocations      WHERE certification_id = ANY(v_ids))
    + (SELECT count(*) FROM public.certification_stakeholders WHERE certification_id = ANY(v_ids))
    + (SELECT count(*) FROM public.cert_collaborations      WHERE certification_id = ANY(v_ids))
    + (SELECT count(*) FROM public.time_entries             WHERE certification_id = ANY(v_ids))
    INTO v_attached;

  IF v_attached > 0 THEN
    RAISE EXCEPTION
      'Le certifications da cancellare non sono piu'' vuote (% righe collegate). Deduplica annullata.',
      v_attached;
  END IF;
END $$;

-- ── 2) Sgancia la riga air dal guscio, poi cancella i gusci ─────────────────
UPDATE public.site_air_records
   SET certification_id = NULL
 WHERE certification_id IN ('4ec8174f-a57f-497c-aa5a-7954b40642dc',
                            '89cdbba4-f143-478c-b3a9-73a1f273d28f',
                            'a16e8e28-cb10-4394-90a0-b45c5fd2c96f');

UPDATE public.monitor_handover_sync_backup
   SET certification_id = NULL
 WHERE certification_id IN ('4ec8174f-a57f-497c-aa5a-7954b40642dc',
                            '89cdbba4-f143-478c-b3a9-73a1f273d28f',
                            'a16e8e28-cb10-4394-90a0-b45c5fd2c96f');

DELETE FROM public.certifications
 WHERE id IN ('4ec8174f-a57f-497c-aa5a-7954b40642dc',
              '89cdbba4-f143-478c-b3a9-73a1f273d28f',
              'a16e8e28-cb10-4394-90a0-b45c5fd2c96f');

-- ── 3) La certification vera passa sul sito superstite ─────────────────────
UPDATE public.certifications
   SET site_id = '5ebf9e1a-cfd6-4ff3-9ef5-e4be2c49b6dc'
 WHERE site_id = '59d2d993-820b-40ef-9ad3-aec780f57fbb';

-- ── 4) Il superstite prende l'identita' di Neuer Wall ──────────────────────
--
-- Citta', paese, regione e fuso orario coincidono gia'. Cambiano nome,
-- indirizzo e coordinate: il pin sulla mappa si sposta dall'Alsterhaus a
-- Neuer Wall 34, ~200 m. monitoring_types resta ['air_quality'], che e' vero:
-- questo sito un sensore ce l'ha davvero.
UPDATE public.sites
   SET name    = 'Neuer Wall',
       address = 'Neuer Wall 34',
       lat     = 53.5512000,
       lng     = 9.9912000,
       updated_at = now()
 WHERE id = '5ebf9e1a-cfd6-4ff3-9ef5-e4be2c49b6dc';

-- ── 5) Svuota e cancella il sito duplicato ─────────────────────────────────
--
-- Meteo e derivati: si rigenerano dal feed, non vengono spostati. Spostarli
-- violerebbe comunque i vincoli di unicita' su (site_id, timestamp), visto che
-- il superstite ha gia' le proprie righe per le stesse ore.
DELETE FROM public.site_weather_energy_hourly WHERE site_id = '59d2d993-820b-40ef-9ad3-aec780f57fbb';
DELETE FROM public.site_weather_energy_daily  WHERE site_id = '59d2d993-820b-40ef-9ad3-aec780f57fbb';
DELETE FROM public.weather_data               WHERE site_id = '59d2d993-820b-40ef-9ad3-aec780f57fbb';

-- Righe uniche per sito: il superstite ha gia' le sue.
DELETE FROM public.site_config    WHERE site_id = '59d2d993-820b-40ef-9ad3-aec780f57fbb';
DELETE FROM public.site_kpis      WHERE site_id = '59d2d993-820b-40ef-9ad3-aec780f57fbb';
DELETE FROM public.ops_locations  WHERE site_id = '59d2d993-820b-40ef-9ad3-aec780f57fbb';

-- La riga air fantasma (1 sensore, Upcoming, nessun hardware).
DELETE FROM public.site_air_records WHERE site_id = '59d2d993-820b-40ef-9ad3-aec780f57fbb';

DELETE FROM public.monitor_handover_sync_backup WHERE site_id = '59d2d993-820b-40ef-9ad3-aec780f57fbb';

-- ── 5-bis) Rete di sicurezza: nessun orfano ────────────────────────────────
--
-- sites.id non ha NESSUNA foreign key: 55 tabelle portano site_id e nessuna e'
-- vincolata. Cancellare senza controllare lascia orfani silenziosi, quindi si
-- verifica esplicitamente prima di procedere.
DO $$
DECLARE r record; v_left bigint; v_total bigint := 0;
BEGIN
  FOR r IN
    SELECT table_name FROM information_schema.columns
     WHERE table_schema = 'public' AND column_name = 'site_id'
       AND table_name IN (SELECT relname FROM pg_class c
                          JOIN pg_namespace n ON n.oid = c.relnamespace
                          WHERE n.nspname = 'public' AND c.relkind = 'r')
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM public.%I WHERE site_id = %L',
      r.table_name, '59d2d993-820b-40ef-9ad3-aec780f57fbb'
    ) INTO v_left;
    IF v_left > 0 THEN
      RAISE NOTICE 'Righe rimaste in %: %', r.table_name, v_left;
      v_total := v_total + v_left;
    END IF;
  END LOOP;

  IF v_total > 0 THEN
    RAISE EXCEPTION 'Il sito duplicato ha ancora % righe collegate. Deduplica annullata.', v_total;
  END IF;
END $$;

DELETE FROM public.sites WHERE id = '59d2d993-820b-40ef-9ad3-aec780f57fbb';

-- ── 6) Ricostruisci la riga monitor dal device ─────────────────────────────
SELECT public.fn_recalculate_site_air('5ebf9e1a-cfd6-4ff3-9ef5-e4be2c49b6dc');

COMMIT;

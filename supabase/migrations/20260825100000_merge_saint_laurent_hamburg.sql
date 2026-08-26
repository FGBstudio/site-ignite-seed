-- SAINT LAURENT — Hamburg: due siti, un solo negozio.
--
--   5ebf9e1a  "Saint Laurent Hamburg"   Alsterhaus, Jungfernstieg 16-20
--             0 certificazioni, 1 apparecchio consegnato, 46.794 letture
--
--   59d2d993  "Neuer Wall"              Neuer Wall 34
--             4 certificazioni (1 vera + 3 gusci vuoti), 0 apparecchi, 0 letture
--
-- Sopravvive Neuer Wall, con la sua LEED. L'apparecchio e tutto il suo storico
-- si spostano li'.
--
-- Attenzione a una cosa: le tabelle di telemetria hanno ON DELETE SET NULL, non
-- CASCADE. Cancellare il sito senza spostarle prima non le avrebbe distrutte —
-- le avrebbe staccate, lasciando 46.794 letture con site_id nullo, invisibili e
-- indistinguibili. Per questo lo spostamento viene prima, sempre.
--
-- Il meteo invece non si sposta: i due siti hanno gia' due serie identiche
-- (14.432 letture ciascuno, stesse date) perche' viene raccolto per sito e
-- Hamburg e' Hamburg. Quella del gemello se ne va con lui.
--
-- I 3 gusci: LEED 'potential' senza nome, creati nello stesso istante del
-- 2026-06-29 dall'import massivo. Verificato su tutte le tabelle che portano
-- certification_id: zero figli, ovunque. Sono le stesse "certificazioni senza
-- nome" che comparivano come righe vuote nel menu del Monitor.

BEGIN;

-- ── 0) Backup di cio' che sparisce ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public._bak_merge_hamburg AS
  SELECT 'site' AS kind, to_jsonb(s) AS row FROM public.sites s
   WHERE s.id = '5ebf9e1a-cfd6-4ff3-9ef5-e4be2c49b6dc'
  UNION ALL
  SELECT 'air', to_jsonb(r) FROM public.site_air_records r
   WHERE r.site_id = '5ebf9e1a-cfd6-4ff3-9ef5-e4be2c49b6dc'
  UNION ALL
  SELECT 'ops_location', to_jsonb(l) FROM public.ops_locations l
   WHERE l.id = '5ebf9e1a-cfd6-4ff3-9ef5-e4be2c49b6dc'
  UNION ALL
  SELECT 'cert_guscio', to_jsonb(c) FROM public.certifications c
   WHERE c.id IN ('4ec8174f-a57f-497c-aa5a-7954b40642dc',
                  '89cdbba4-f143-478c-b3a9-73a1f273d28f',
                  'a16e8e28-cb10-4394-90a0-b45c5fd2c96f');

-- ── 1) Guardia: i gusci devono essere ancora vuoti ─────────────────────────
DO $guard$
DECLARE v_figli integer;
BEGIN
  SELECT COUNT(*) INTO v_figli
  FROM public.cert_tasks t
  WHERE t.certification_id IN ('4ec8174f-a57f-497c-aa5a-7954b40642dc',
                               '89cdbba4-f143-478c-b3a9-73a1f273d28f',
                               'a16e8e28-cb10-4394-90a0-b45c5fd2c96f');
  IF v_figli > 0 THEN
    RAISE EXCEPTION 'I gusci hanno acquisito % task: non sono piu'' vuoti, fermarsi.', v_figli;
  END IF;

  SELECT COUNT(*) INTO v_figli
  FROM public.project_allocations pa
  WHERE pa.certification_id IN ('4ec8174f-a57f-497c-aa5a-7954b40642dc',
                                '89cdbba4-f143-478c-b3a9-73a1f273d28f',
                                'a16e8e28-cb10-4394-90a0-b45c5fd2c96f');
  IF v_figli > 0 THEN
    RAISE EXCEPTION 'I gusci hanno acquisito % allocazioni: fermarsi.', v_figli;
  END IF;
END;
$guard$;

-- ── 2) La spedizione consegnata cambia destinazione ────────────────────────
-- ops_locations.site_id e' ON DELETE SET NULL: la destinazione sarebbe rimasta
-- li' orfana, e la spedizione avrebbe continuato a puntarci.
UPDATE public.ops_shipments
   SET destination_location_id = '59d2d993-820b-40ef-9ad3-aec780f57fbb'
 WHERE destination_location_id = '5ebf9e1a-cfd6-4ff3-9ef5-e4be2c49b6dc';

UPDATE public.ops_shipments
   SET origin_location_id = '59d2d993-820b-40ef-9ad3-aec780f57fbb'
 WHERE origin_location_id = '5ebf9e1a-cfd6-4ff3-9ef5-e4be2c49b6dc';

-- ── 3) Apparecchio e storico traslocano ────────────────────────────────────
UPDATE public.hardwares        SET site_id = '59d2d993-820b-40ef-9ad3-aec780f57fbb' WHERE site_id = '5ebf9e1a-cfd6-4ff3-9ef5-e4be2c49b6dc';
UPDATE public.devices          SET site_id = '59d2d993-820b-40ef-9ad3-aec780f57fbb' WHERE site_id = '5ebf9e1a-cfd6-4ff3-9ef5-e4be2c49b6dc';
UPDATE public.telemetry        SET site_id = '59d2d993-820b-40ef-9ad3-aec780f57fbb' WHERE site_id = '5ebf9e1a-cfd6-4ff3-9ef5-e4be2c49b6dc';
UPDATE public.telemetry_hourly SET site_id = '59d2d993-820b-40ef-9ad3-aec780f57fbb' WHERE site_id = '5ebf9e1a-cfd6-4ff3-9ef5-e4be2c49b6dc';
UPDATE public.telemetry_daily  SET site_id = '59d2d993-820b-40ef-9ad3-aec780f57fbb' WHERE site_id = '5ebf9e1a-cfd6-4ff3-9ef5-e4be2c49b6dc';
UPDATE public.telemetry_latest SET site_id = '59d2d993-820b-40ef-9ad3-aec780f57fbb' WHERE site_id = '5ebf9e1a-cfd6-4ff3-9ef5-e4be2c49b6dc';
UPDATE public.sensor_health    SET site_id = '59d2d993-820b-40ef-9ad3-aec780f57fbb' WHERE site_id = '5ebf9e1a-cfd6-4ff3-9ef5-e4be2c49b6dc';
UPDATE public.site_alerts      SET site_id = '59d2d993-820b-40ef-9ad3-aec780f57fbb' WHERE site_id = '5ebf9e1a-cfd6-4ff3-9ef5-e4be2c49b6dc';

-- ── 4) I tre gusci senza nome ──────────────────────────────────────────────
DELETE FROM public.certifications
 WHERE id IN ('4ec8174f-a57f-497c-aa5a-7954b40642dc',
              '89cdbba4-f143-478c-b3a9-73a1f273d28f',
              'a16e8e28-cb10-4394-90a0-b45c5fd2c96f');

-- ── 5) Il gemello se ne va ─────────────────────────────────────────────────
-- La sua riga d'aria e' derivata: la ricostruisce fn_recalculate_site_air, e
-- l'apparecchio ora e' sul sito superstite. site_config, site_kpis e il meteo
-- duplicato scendono in CASCADE.
DELETE FROM public.site_air_records WHERE site_id = '5ebf9e1a-cfd6-4ff3-9ef5-e4be2c49b6dc';
DELETE FROM public.ops_locations    WHERE id      = '5ebf9e1a-cfd6-4ff3-9ef5-e4be2c49b6dc';
DELETE FROM public.sites            WHERE id      = '5ebf9e1a-cfd6-4ff3-9ef5-e4be2c49b6dc';

-- ── 6) Il monitor si riallinea sulla LEED superstite ───────────────────────
UPDATE public.sites
   SET monitoring_types = ARRAY['air_quality']::text[], updated_at = now()
 WHERE id = '59d2d993-820b-40ef-9ad3-aec780f57fbb'
   AND NOT ('air_quality' = ANY(COALESCE(monitoring_types, '{}'::text[])));

SELECT public.fn_recalculate_site_air('59d2d993-820b-40ef-9ad3-aec780f57fbb');
SELECT public.fn_sync_air_typology('59d2d993-820b-40ef-9ad3-aec780f57fbb');

COMMIT;

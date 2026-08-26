-- Il pallino verde smette di essere una decorazione.
--
-- site_air_records.online_status era NULL su tutte le 437 righe: nessuna
-- funzione, nessun trigger, nessun cron la scriveva. Il Monitor mostrava un
-- pallino grigio per tutti, compresi i sensori che trasmettevano da mesi.
--
-- La verita' pero' c'era gia': detect_offline_sensors() gira come cron e tiene
-- aggiornata sensor_health per ogni apparecchio, con le soglie giuste — 30
-- minuti per l'aria, 4 ore per l'energia. Bastava collegarla.
--
-- Tre stati invece di due, perche' due mentirebbero: una linea con otto sensori
-- di cui uno morto non e' "Online" (nasconde il guasto) ne' "Offline" (sette
-- stanno lavorando). 'Partial' e' l'unica risposta vera.

BEGIN;

-- ── 1) Lo stato di UNA linea di monitoraggio ───────────────────────────────
-- Gli apparecchi sono quelli attribuiti alla linea: su un sito con piu'
-- progetti ognuno risponde dei propri. NULL quando di apparecchi non ce ne sono
-- — non e' offline, e' che non c'e' ancora niente da guardare.
CREATE OR REPLACE FUNCTION public.fn_air_line_online_status(
  p_site_id uuid,
  p_certification_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
           WHEN COUNT(*) = 0 THEN NULL
           WHEN COUNT(*) FILTER (WHERE NOT COALESCE(sh.is_offline, true)) = 0 THEN 'Offline'
           WHEN COUNT(*) FILTER (WHERE COALESCE(sh.is_offline, true)) = 0 THEN 'Online'
           ELSE 'Partial'
         END
  FROM public.fn_air_device_owner(p_site_id) o
  JOIN public.hardwares h ON h.id = o.hardware_id
  JOIN public.devices   d ON d.device_id = h.device_id AND d.site_id = h.site_id
  LEFT JOIN public.sensor_health sh ON sh.sensor_id = d.id
  WHERE o.certification_id IS NOT DISTINCT FROM p_certification_id;
$function$;

-- ── 2) Il rinfresco di tutte le righe ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_refresh_air_online_status()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  WITH calcolo AS (
    SELECT r.id,
           public.fn_air_line_online_status(r.site_id, r.certification_id) AS stato
    FROM public.site_air_records r
  )
  UPDATE public.site_air_records r
     SET online_status = calcolo.stato,
         updated_at = now()
    FROM calcolo
   WHERE calcolo.id = r.id
     AND r.online_status IS DISTINCT FROM calcolo.stato;
END;
$function$;

-- ── 3) Si aggancia al cron che gia' esiste ─────────────────────────────────
-- detect_offline_sensors() e' l'unico posto dove si sa, per ogni apparecchio,
-- se sta trasmettendo. Aggiornare la riga monitor subito dopo evita di avere
-- due verita' che divergono.
CREATE OR REPLACE FUNCTION public.detect_offline_sensors()
RETURNS void
LANGUAGE plpgsql
AS $function$
BEGIN
    WITH device_last_seen AS (
        SELECT
            d.id as device_id,
            d.site_id,
            d.device_type,
            CASE
                WHEN d.device_type = 'energy_monitor' THEN (
                    SELECT MAX(ts) FROM public.energy_latest el WHERE el.device_id = d.id
                )
                ELSE (
                    SELECT MAX(ts) FROM public.telemetry_latest tl WHERE tl.device_id = d.id
                )
            END as last_seen,
            4 as expected_samples  -- 15-min intervals = 4 samples expected per hour
        FROM public.devices d
        -- Exclude only devices explicitly marked virtual in metadata (VirtualMeter MQTT aggregates).
        WHERE NOT (COALESCE((d.metadata->>'virtual')::boolean, false) = true)
    ),
    status_now AS (
        SELECT
            d.device_id,
            d.site_id,
            d.last_seen,
            CASE
                WHEN d.last_seen IS NULL THEN true
                WHEN d.device_type = 'air_quality' AND d.last_seen < now() - INTERVAL '30 minutes' THEN true
                WHEN d.device_type = 'energy_monitor' AND d.last_seen < now() - INTERVAL '4 hours' THEN true
                ELSE false
            END as is_offline,
            CASE
                WHEN d.last_seen IS NULL THEN 100.0
                ELSE GREATEST(0.0, LEAST(100.0,
                    (1.0 - (COALESCE(
                        CASE WHEN d.device_type = 'energy_monitor' THEN
                            (SELECT COUNT(DISTINCT ts) FROM public.energy_telemetry et WHERE et.device_id = d.device_id AND et.ts > d.last_seen - INTERVAL '75 minutes' AND et.ts <= d.last_seen)
                        ELSE
                            (SELECT COUNT(DISTINCT ts) FROM public.telemetry t WHERE t.device_id = d.device_id AND t.ts > d.last_seen - INTERVAL '75 minutes' AND t.ts <= d.last_seen)
                        END, 0)::float / d.expected_samples)) * 100.0
                ))
            END as packet_loss_pct
        FROM device_last_seen d
    )
    INSERT INTO public.sensor_health (
        sensor_id, site_id, last_seen, is_offline, packet_loss_pct, last_evaluated_at
    )
    SELECT device_id, site_id, last_seen, is_offline, packet_loss_pct, now()
    FROM status_now
    ON CONFLICT (sensor_id) DO UPDATE SET
        site_id = EXCLUDED.site_id,
        last_seen = EXCLUDED.last_seen,
        is_offline = EXCLUDED.is_offline,
        packet_loss_pct = EXCLUDED.packet_loss_pct,
        last_evaluated_at = now();

    -- Appena la salute degli apparecchi e' aggiornata, il Monitor la riflette.
    PERFORM public.fn_refresh_air_online_status();
END;
$function$;

SELECT public.fn_refresh_air_online_status();

COMMIT;

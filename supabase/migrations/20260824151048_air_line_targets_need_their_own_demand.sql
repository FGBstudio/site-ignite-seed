-- ============================================================================
-- Monitor · Air — chi merita una riga, e chi no
--
-- Correzione di 20260824150000. Quella versione apriva una riga aria per ogni
-- certificazione del sito che avesse `has_iaq_monitoring`, e la bandiera e' un
-- desiderio, non una domanda: sono comparse 29 righe a zero su progetti che non
-- hanno mai chiesto un sensore. Ripristinate dal backup e riprovato.
--
-- Le tre condizioni che restano, tutte necessarie:
--
--   • Una certificazione ha diritto alla sua riga solo se ha una domanda
--     CONCRETA — una quantita' IAQ quotata, un'allocazione AIR, oppure e' essa
--     stessa un progetto cert_type = Air. La bandiera da sola non basta piu'.
--
--   • Se sul sito esiste ancora una riga senza certificazione, non se ne aprono
--     altre: quella riga va prima assegnata a mano. Aprirne di nuove accanto
--     produrrebbe doppioni che nessuno sa riconciliare.
--
--   • Il ripiego sulla certificazione principale — il ramo che serve ai siti
--     che hanno apparecchi ma nessuna domanda scritta — vale solo quando il
--     sito non ha alcuna riga scoperta.
--
-- Le righe gia' esistenti restano sempre fra i bersagli: si ricalcolano, non si
-- rimettono in discussione.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_recalculate_site_air(p_site_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  v_site_flagged  boolean := false;
  v_site_canceled boolean := false;

  v_total_certs integer := 0;
  v_live_certs  integer := 0;
  v_held_certs  integer := 0;
  v_is_canceled boolean := false;
  v_is_on_hold  boolean := false;

  v_line     record;
  v_target   record;
  v_expected integer := 0;
  v_notes_clean text;
  v_notes_new   text;
BEGIN
  IF p_site_id IS NULL THEN RETURN; END IF;

  SELECT
    (s.monitoring_types IS NOT NULL AND 'air_quality' = ANY(s.monitoring_types)),
    lower(COALESCE(s.status, '')) IN ('canceled', 'cancelled')
  INTO v_site_flagged, v_site_canceled
  FROM public.sites s
  WHERE s.id = p_site_id;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE lower(COALESCE(c.status, '')) NOT IN ('canceled', 'cancelled')),
    COUNT(*) FILTER (WHERE lower(COALESCE(c.status, '')) NOT IN ('canceled', 'cancelled')
                       AND COALESCE(c.on_hold, false))
  INTO v_total_certs, v_live_certs, v_held_certs
  FROM public.certifications c
  WHERE c.site_id = p_site_id;

  v_is_canceled := COALESCE(v_site_canceled, false)
                   OR (v_total_certs > 0 AND v_live_certs = 0);

  v_is_on_hold := (NOT v_is_canceled)
                  AND v_live_certs > 0
                  AND v_held_certs = v_live_certs;

  IF v_is_canceled THEN
    FOR v_line IN
      SELECT r.id, r.certification_id, r.notes, r.total_sensors
      FROM public.site_air_records r
      WHERE r.site_id = p_site_id
    LOOP
      SELECT GREATEST(
               (SELECT COUNT(*) FROM public.fn_air_device_owner(p_site_id) o
                 WHERE o.certification_id IS NOT DISTINCT FROM v_line.certification_id),
               COALESCE((SELECT SUM(COALESCE(pa.requested_quantity, pa.quantity, 0))
                           FROM public.project_allocations pa
                           LEFT JOIN public.products p ON p.id = pa.product_id
                          WHERE pa.certification_id = v_line.certification_id
                            AND lower(COALESCE(pa.status,'')) NOT IN ('replaced','canceled','cancelled','rejected')
                            AND (pa.category ILIKE '%AIR%' OR pa.category ILIKE '%IAQ%'
                              OR p.category ILIKE '%AIR%' OR p.category ILIKE '%IAQ%')), 0),
               COALESCE(v_line.total_sensors, 0)
             )
        INTO v_expected;

      v_notes_clean := btrim(
        regexp_replace(COALESCE(v_line.notes, ''), '\s*-\s*\[Cancellato:[^\]]*\]', '', 'g')
      );

      IF v_expected > 0 THEN
        v_notes_new := CASE WHEN v_notes_clean = '' THEN '' ELSE v_notes_clean || ' ' END
                       || '- [Cancellato: ' || v_expected || ' sensori previsti]';
      ELSE
        v_notes_new := NULLIF(v_notes_clean, '');
      END IF;

      UPDATE public.site_air_records
         SET total_sensors        = 0,
             hardware_cost        = 0,
             quotation_value      = 0,
             inbound_cost         = 0,
             outbound_cost        = 0,
             internal_cost        = 0,
             customs_cost         = 0,
             vat_cost             = 0,
             total_cost           = 0,
             planned_remaining    = 0,
             taxes                = 0,
             profit               = 0,
             roi                  = 0,
             status               = 'Cancelled',
             po_numbers           = '{}'::text[],
             latest_shipment_date = NULL,
             notes                = v_notes_new,
             updated_at           = now()
       WHERE id = v_line.id;
    END LOOP;
    RETURN;
  END IF;

  UPDATE public.site_air_records r
     SET notes = NULLIF(btrim(regexp_replace(COALESCE(r.notes, ''), '\s*-\s*\[Cancellato:[^\]]*\]', '', 'g')), ''),
         updated_at = now()
   WHERE r.site_id = p_site_id
     AND r.notes ILIKE '%[Cancellato:%';

  FOR v_target IN
    SELECT DISTINCT cert_id FROM (
      SELECT c.id AS cert_id
        FROM public.certifications c
       WHERE c.site_id = p_site_id
         AND lower(COALESCE(c.status, '')) NOT IN ('canceled', 'cancelled')
         AND NOT EXISTS (SELECT 1 FROM public.site_air_records r3
                          WHERE r3.site_id = p_site_id AND r3.certification_id IS NULL)
         AND (
           COALESCE(c.quoted_iaq_quantity, 0) > 0
           OR lower(COALESCE(c.cert_type, '')) = 'air'
           OR EXISTS (
                SELECT 1 FROM public.project_allocations pa
                LEFT JOIN public.products p ON p.id = pa.product_id
                 WHERE pa.certification_id = c.id
                   AND lower(COALESCE(pa.status,'')) NOT IN ('replaced','canceled','cancelled','rejected')
                   AND (pa.category ILIKE '%AIR%' OR pa.category ILIKE '%IAQ%'
                     OR p.category ILIKE '%AIR%' OR p.category ILIKE '%IAQ%'))
         )

      UNION

      SELECT r.certification_id
        FROM public.site_air_records r
       WHERE r.site_id = p_site_id

      UNION

      SELECT public.fn_air_primary_cert(p_site_id)
       WHERE (v_site_flagged
          OR EXISTS (SELECT 1 FROM public.hardwares h
                      WHERE h.site_id = p_site_id
                        AND h.category = 'AIR'
                        AND h.status <> 'In Stock'))
         AND NOT EXISTS (SELECT 1 FROM public.site_air_records r4
                          WHERE r4.site_id = p_site_id AND r4.certification_id IS NULL)
    ) t
    WHERE cert_id IS NOT NULL
       OR EXISTS (SELECT 1 FROM public.site_air_records r2
                   WHERE r2.site_id = p_site_id AND r2.certification_id IS NULL)
       OR EXISTS (SELECT 1 FROM public.hardwares h
                   WHERE h.site_id = p_site_id
                     AND h.category = 'AIR'
                     AND h.status <> 'In Stock')
  LOOP
    PERFORM public.fn_recalculate_air_line(
      p_site_id, v_target.cert_id, v_is_on_hold, COALESCE(v_site_flagged, false)
    );
  END LOOP;
END;
$function$;

-- Il monitoraggio dell'aria appartiene alla certificazione, una riga ciascuna.
--
-- Fino a qui site_air_records portava UNIQUE (site_id): una sola riga d'aria per
-- sito, comunque fossero le certificazioni perseguite. Kering Eyewear a Padova e'
-- il caso che l'ha rotta: la LEED chiede 15 CO-CO2, la WELL chiede 5 WELL. Sono
-- due progetti, con due nomi e due committenti, e finivano schiacciati in una
-- riga sola da "20 sensori" senza modello ne' progetto.
--
-- L'energia lavora gia' cosi' (site_energy_records non ha unique sul sito e
-- discende dalla certificazione). Questa migrazione porta l'aria alla stessa
-- grana: una riga per (sito, certificazione), piu' al massimo una riga senza
-- progetto per sito — quelle il cui aggancio si decide a mano.
--
-- Il punto di calcolo resta uno solo: fn_recalculate_site_air decide QUALI righe
-- esistono, fn_recalculate_air_line calcola UNA riga. Tutti i 13 trigger che
-- chiamano fn_recalculate_site_air(site) continuano a funzionare senza modifiche.

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. La grana
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.site_air_records
  DROP CONSTRAINT IF EXISTS site_air_records_site_id_key;

-- Una certificazione, una riga d'aria su quel sito. L'aggancio fra siti diversi
-- resta permesso (fn_attach_air_record_to_certification lo consente di proposito),
-- quindi il vincolo e' sulla coppia e non sulla sola certificazione.
CREATE UNIQUE INDEX IF NOT EXISTS site_air_records_site_cert_key
  ON public.site_air_records (site_id, certification_id)
  WHERE certification_id IS NOT NULL;

-- Il monitor ancora senza progetto: al massimo uno per sito.
CREATE UNIQUE INDEX IF NOT EXISTS site_air_records_site_unattached_key
  ON public.site_air_records (site_id)
  WHERE certification_id IS NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. A chi appartiene un apparecchio
--
-- hardwares porta solo site_id: non esiste una colonna che dica a quale
-- certificazione appartiene un sensore. L'attribuzione va quindi dedotta, e
-- l'unico dato che la rende deducibile e' il modello: la LEED ha chiesto CO-CO2,
-- la WELL ha chiesto WELL ClAir, e gli apparecchi arrivati portano il product_id.
-- Dove due certificazioni dello stesso sito chiedono lo stesso modello, gli
-- apparecchi si dividono in ordine di richiesta fino a coprire ogni quantita'.
-- Cio' che avanza va alla certificazione di riferimento del sito.
-- ────────────────────────────────────────────────────────────────────────────

-- La certificazione che "possiede" l'aria di un sito: quella viva piu'
-- significativa. Dove il sito non ne ha nessuna di suo, vale l'aggancio deciso a
-- mano — c'e' chi tiene il monitor di un sito sulla certificazione di un altro,
-- e fn_attach_air_record_to_certification lo consente di proposito. Vale solo se
-- l'aggancio e' uno: con piu' righe la scelta non e' deducibile.
CREATE OR REPLACE FUNCTION public.fn_air_primary_cert(p_site_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (
      SELECT c.id
      FROM public.certifications c
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS n_air
    FROM public.project_allocations pa
    LEFT JOIN public.products p ON p.id = pa.product_id
    WHERE pa.certification_id = c.id
      AND lower(COALESCE(pa.status, '')) NOT IN ('replaced', 'canceled', 'cancelled', 'rejected')
      AND (
        pa.category = 'AIR' OR p.category = 'AIR'
        OR pa.category ILIKE '%AIR%' OR pa.category ILIKE '%IAQ%'
        OR p.category ILIKE '%AIR%' OR p.category ILIKE '%IAQ%'
      )
      ) alloc ON true
      WHERE c.site_id = p_site_id
        AND lower(COALESCE(c.status, '')) NOT IN ('canceled', 'cancelled')
      ORDER BY
        (alloc.n_air > 0) DESC,
        COALESCE(c.has_iaq_monitoring, false) DESC,
        (COALESCE(btrim(c.name), '') <> '') DESC,
        c.created_at DESC
      LIMIT 1
    ),
    (
      SELECT x.certification_id
      FROM (
        SELECT r.certification_id, COUNT(*) OVER () AS n
        FROM public.site_air_records r
        WHERE r.site_id = p_site_id
          AND r.certification_id IS NOT NULL
      ) x
      WHERE x.n = 1
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.fn_air_device_owner(p_site_id uuid)
RETURNS TABLE (hardware_id uuid, product_id uuid, certification_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH demand AS (
    SELECT c.id AS cert_id,
           c.created_at,
           pa.product_id,
           SUM(GREATEST(COALESCE(pa.requested_quantity, pa.quantity, 0), 0))::int AS qty
    FROM public.certifications c
    JOIN public.project_allocations pa ON pa.certification_id = c.id
    LEFT JOIN public.products p ON p.id = pa.product_id
    WHERE c.site_id = p_site_id
      AND lower(COALESCE(c.status, '')) NOT IN ('canceled', 'cancelled')
      AND pa.product_id IS NOT NULL
      AND lower(COALESCE(pa.status, '')) NOT IN ('replaced', 'canceled', 'cancelled', 'rejected')
      AND (
        pa.category = 'AIR' OR p.category = 'AIR'
        OR pa.category ILIKE '%AIR%' OR pa.category ILIKE '%IAQ%'
        OR p.category ILIKE '%AIR%' OR p.category ILIKE '%IAQ%'
      )
    GROUP BY c.id, c.created_at, pa.product_id
    HAVING SUM(GREATEST(COALESCE(pa.requested_quantity, pa.quantity, 0), 0)) > 0
  ),
  -- Ogni richiesta prende una fetta contigua degli apparecchi di quel modello.
  sliced AS (
    SELECT d.cert_id,
           d.product_id,
           COALESCE(SUM(d.qty) OVER (PARTITION BY d.product_id ORDER BY d.created_at, d.cert_id
                                     ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS cum_start,
           SUM(d.qty) OVER (PARTITION BY d.product_id ORDER BY d.created_at, d.cert_id
                            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cum_end
    FROM demand d
  ),
  devices AS (
    SELECT h.id,
           h.product_id,
           ROW_NUMBER() OVER (PARTITION BY h.product_id ORDER BY h.device_id NULLS LAST, h.id) AS pos
    FROM public.hardwares h
    WHERE h.site_id = p_site_id
      AND h.category = 'AIR'
      AND h.status <> 'In Stock'
  )
  SELECT dv.id,
         dv.product_id,
         COALESCE(s.cert_id, public.fn_air_primary_cert(p_site_id))
  FROM devices dv
  LEFT JOIN sliced s
    ON s.product_id = dv.product_id
   AND dv.pos > s.cum_start
   AND dv.pos <= s.cum_end;
$function$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. La tipologia, per riga e non piu' per sito
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_air_typology_for_line(p_site_id uuid, p_certification_id uuid)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_from_hw  uuid[];
  v_from_req uuid[];
BEGIN
  IF p_site_id IS NULL THEN RETURN NULL; END IF;

  -- Gli apparecchi attribuiti a questa riga, uno per unita'.
  SELECT array_agg(o.product_id ORDER BY o.product_id)
    INTO v_from_hw
    FROM public.fn_air_device_owner(p_site_id) o
   WHERE o.certification_id IS NOT DISTINCT FROM p_certification_id
     AND o.product_id IS NOT NULL;

  IF COALESCE(cardinality(v_from_hw), 0) > 0 THEN
    RETURN v_from_hw;
  END IF;

  -- Nessun apparecchio: il mix richiesto da QUESTA certificazione, una voce per
  -- unita'. La riga senza progetto non ha una richiesta da cui dedurre nulla.
  IF p_certification_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT array_agg(x.pid)
    INTO v_from_req
    FROM (
      SELECT pa.product_id AS pid
        FROM public.project_allocations pa
        LEFT JOIN public.products p ON p.id = pa.product_id
        CROSS JOIN LATERAL generate_series(
          1, GREATEST(COALESCE(pa.requested_quantity, pa.quantity, 0), 0)
        )
       WHERE pa.certification_id = p_certification_id
         AND pa.product_id IS NOT NULL
         AND lower(COALESCE(pa.status, '')) NOT IN ('replaced', 'canceled', 'cancelled', 'rejected')
         AND (pa.category ILIKE '%AIR%' OR pa.category ILIKE '%IAQ%'
           OR p.category ILIKE '%AIR%' OR p.category ILIKE '%IAQ%')
    ) x;

  RETURN v_from_req;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_sync_air_typology(p_site_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_line   record;
  v_new    uuid[];
  v_has_hw boolean;
BEGIN
  IF p_site_id IS NULL THEN RETURN; END IF;

  FOR v_line IN
    SELECT r.id, r.certification_id, r.air_product_ids
    FROM public.site_air_records r
    WHERE r.site_id = p_site_id
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM public.fn_air_device_owner(p_site_id) o
       WHERE o.certification_id IS NOT DISTINCT FROM v_line.certification_id
    ) INTO v_has_hw;

    v_new := public.fn_air_typology_for_line(p_site_id, v_line.certification_id);

    -- Con apparecchi comanda la realta'. Senza, si riempie solo il vuoto: una
    -- tipologia gia' scelta a mano resta la sua.
    IF COALESCE(cardinality(v_new), 0) > 0
       AND (v_has_hw OR COALESCE(cardinality(v_line.air_product_ids), 0) = 0)
       AND v_line.air_product_ids IS DISTINCT FROM v_new THEN
      UPDATE public.site_air_records
         SET air_product_ids = v_new, updated_at = now()
       WHERE id = v_line.id;
    END IF;
  END LOOP;
END;
$function$;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Il calcolo di UNA riga
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_recalculate_air_line(
  p_site_id          uuid,
  p_certification_id uuid,
  p_on_hold          boolean,
  p_site_flagged     boolean
)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  v_hw_count integer := 0;
  v_po_numbers text[] := '{}'::text[];
  v_latest_shipment_date date;
  v_summarized_status text;
  v_project_name text;
  v_pm_id uuid;
  v_handover_date date;

  v_hw_cost numeric := 0;
  v_hw_sale numeric := 0;
  v_inbound numeric := 0;
  v_outbound numeric := 0;
  v_internal numeric := 0;
  v_customs numeric := 0;
  v_vat numeric := 0;
  v_working_time numeric := 60;
  v_total_cost numeric := 0;
  v_planned_rem numeric := 0;
  v_taxes numeric := 0;
  v_profit numeric := 0;
  v_roi numeric := 0;

  v_sensor_count integer := 0;
  v_requested_count integer := 0;
  v_req_cost numeric := 0;
  v_req_sale numeric := 0;
  v_has_active_hw boolean := false;
BEGIN
  IF p_site_id IS NULL THEN RETURN; END IF;

  -- A) Apparecchi attribuiti a questa riga
  SELECT
    COUNT(*),
    ARRAY_AGG(DISTINCT opo.po_number) FILTER (WHERE opo.po_number IS NOT NULL),
    MAX(h.shipment_date),
    SUM(COALESCE(p.unit_cost, 0)),
    SUM(COALESCE(p.unit_sale_price, 0))
  INTO v_hw_count, v_po_numbers, v_latest_shipment_date, v_hw_cost, v_hw_sale
  FROM public.fn_air_device_owner(p_site_id) o
  JOIN public.hardwares h ON h.id = o.hardware_id
  JOIN public.products p ON p.id = h.product_id
  LEFT JOIN public.ops_purchase_orders opo ON opo.id = h.purchase_order_id
  WHERE o.certification_id IS NOT DISTINCT FROM p_certification_id;

  v_hw_count := COALESCE(v_hw_count, 0);
  v_has_active_hw := (v_hw_count > 0);

  -- B) Domanda di QUESTA certificazione
  IF p_certification_id IS NOT NULL THEN
    SELECT
      COALESCE(SUM(COALESCE(pa.requested_quantity, pa.quantity, 0)), 0),
      COALESCE(SUM(COALESCE(p.unit_cost, 0)       * COALESCE(pa.requested_quantity, pa.quantity, 0)), 0),
      COALESCE(SUM(COALESCE(p.unit_sale_price, 0) * COALESCE(pa.requested_quantity, pa.quantity, 0)), 0)
    INTO v_requested_count, v_req_cost, v_req_sale
    FROM public.project_allocations pa
    LEFT JOIN public.products p ON pa.product_id = p.id
    WHERE pa.certification_id = p_certification_id
      AND lower(COALESCE(pa.status, '')) NOT IN ('replaced', 'canceled', 'cancelled', 'rejected')
      AND (
        pa.category = 'AIR' OR p.category = 'AIR'
        OR pa.category ILIKE '%AIR%' OR pa.category ILIKE '%IAQ%'
        OR p.category ILIKE '%AIR%' OR p.category ILIKE '%IAQ%'
      );
  END IF;

  IF v_has_active_hw THEN
    v_sensor_count := v_hw_count;

    SELECT string_agg(cnt || ' ' || ship_status, ', ' ORDER BY ship_status)
    INTO v_summarized_status
    FROM (
      SELECT sh.status AS ship_status, COUNT(*) AS cnt
      FROM public.fn_air_device_owner(p_site_id) o2
      JOIN public.ops_hardware_movements hm ON hm.hardware_id = o2.hardware_id
      JOIN public.ops_shipments sh ON hm.shipment_id = sh.id
      WHERE o2.certification_id IS NOT DISTINCT FROM p_certification_id
        AND sh.shipment_type ILIKE 'Outbound'
      GROUP BY sh.status
    ) status_counts;

    IF v_summarized_status IS NULL THEN
      v_summarized_status := 'Assigned';
    END IF;

    SELECT
      SUM(CASE WHEN shipment_type ILIKE 'Inbound'  THEN pro_rated_cost ELSE 0 END),
      SUM(CASE WHEN shipment_type ILIKE 'Outbound' THEN pro_rated_cost ELSE 0 END),
      SUM(CASE WHEN shipment_type ILIKE 'Internal' THEN pro_rated_cost ELSE 0 END),
      SUM(pro_rated_customs),
      SUM(pro_rated_vat)
    INTO v_inbound, v_outbound, v_internal, v_customs, v_vat
    FROM (
      SELECT
        sh.shipment_type,
        (COALESCE(sh.total_shipping_cost, 0) / NULLIF(sh_stats.total_devices, 0)) AS pro_rated_cost,
        (COALESCE(sh.customs_cost, 0)        / NULLIF(sh_stats.total_devices, 0)) AS pro_rated_customs,
        (COALESCE(sh.vat, 0)                 / NULLIF(sh_stats.total_devices, 0)) AS pro_rated_vat
      FROM public.fn_air_device_owner(p_site_id) o3
      JOIN public.ops_hardware_movements hm ON hm.hardware_id = o3.hardware_id
      JOIN public.ops_shipments sh ON hm.shipment_id = sh.id
      JOIN (
        SELECT shipment_id, COUNT(*) AS total_devices
        FROM public.ops_hardware_movements
        GROUP BY shipment_id
      ) sh_stats ON sh.id = sh_stats.shipment_id
      WHERE o3.certification_id IS NOT DISTINCT FROM p_certification_id
    ) pro_rated;

  ELSIF v_requested_count > 0 THEN
    v_sensor_count := v_requested_count;
    v_hw_cost := v_req_cost;
    v_hw_sale := v_req_sale;
    v_summarized_status := 'Upcoming';
    v_po_numbers := '{}'::text[];
    v_latest_shipment_date := NULL;

  ELSIF p_site_flagged OR p_certification_id IS NOT NULL THEN
    v_sensor_count := 0;
    v_hw_cost := 0;
    v_hw_sale := 0;
    v_summarized_status := 'Upcoming';
    v_po_numbers := '{}'::text[];
    v_latest_shipment_date := NULL;

  ELSE
    -- Niente apparecchi, niente richiesta, nessun progetto: la riga esiste solo
    -- come memoria. Si azzera, non si cancella.
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
           status               = CASE WHEN p_on_hold THEN 'On hold' ELSE 'Upcoming' END,
           po_numbers           = '{}'::text[],
           latest_shipment_date = NULL,
           updated_at           = now()
     WHERE site_id = p_site_id
       AND certification_id IS NULL;
    RETURN;
  END IF;

  IF p_on_hold THEN
    v_summarized_status := 'On hold';
  END IF;

  -- C) Metadati: dalla certificazione della riga, non piu' dalla "piu' significativa"
  IF p_certification_id IS NOT NULL THEN
    SELECT c.name, c.pm_id, c.handover_date
      INTO v_project_name, v_pm_id, v_handover_date
      FROM public.certifications c
     WHERE c.id = p_certification_id;
  ELSE
    SELECT s.name INTO v_project_name FROM public.sites s WHERE s.id = p_site_id;
  END IF;

  IF v_pm_id IS NULL THEN
    SELECT ser.pm_id INTO v_pm_id
    FROM public.site_energy_records ser
    WHERE ser.site_id = p_site_id
    ORDER BY ser.created_at DESC
    LIMIT 1;
  END IF;

  -- D) Conto economico
  v_total_cost  := COALESCE(v_hw_cost,0) + COALESCE(v_inbound,0) + COALESCE(v_outbound,0)
                 + COALESCE(v_internal,0) + COALESCE(v_customs,0) + COALESCE(v_vat,0) + v_working_time;
  v_planned_rem := COALESCE(v_hw_sale,0) - v_total_cost;
  v_taxes       := CASE WHEN v_planned_rem > 0 THEN v_planned_rem * 0.27 ELSE 0 END;
  v_profit      := v_planned_rem - v_taxes;
  v_roi         := CASE WHEN COALESCE(v_hw_sale,0) > 0 THEN (v_profit / v_hw_sale) * 100 ELSE 0 END;

  -- E) UPSERT sulla riga giusta
  IF p_certification_id IS NOT NULL THEN
    INSERT INTO public.site_air_records (
      site_id, certification_id, pm_id, project_name, status,
      total_sensors, po_numbers, handover_date, latest_shipment_date,
      inbound_cost, outbound_cost, internal_cost, customs_cost, vat_cost,
      hardware_cost, working_time_cost, total_cost, quotation_value,
      planned_remaining, taxes, profit, roi, updated_at
    )
    VALUES (
      p_site_id, p_certification_id, v_pm_id, v_project_name, v_summarized_status,
      v_sensor_count, COALESCE(v_po_numbers, '{}'::text[]), v_handover_date, v_latest_shipment_date,
      COALESCE(v_inbound,0), COALESCE(v_outbound,0), COALESCE(v_internal,0), COALESCE(v_customs,0), COALESCE(v_vat,0),
      COALESCE(v_hw_cost,0), v_working_time, v_total_cost, COALESCE(v_hw_sale,0),
      v_planned_rem, v_taxes, v_profit, v_roi, now()
    )
    ON CONFLICT (site_id, certification_id) WHERE certification_id IS NOT NULL
    DO UPDATE SET
      pm_id            = EXCLUDED.pm_id,
      project_name     = EXCLUDED.project_name,
      status           = EXCLUDED.status,
      total_sensors    = EXCLUDED.total_sensors,
      po_numbers       = EXCLUDED.po_numbers,
      handover_date    = COALESCE(site_air_records.handover_date, EXCLUDED.handover_date),
      latest_shipment_date = EXCLUDED.latest_shipment_date,
      inbound_cost     = EXCLUDED.inbound_cost,
      outbound_cost    = EXCLUDED.outbound_cost,
      internal_cost    = EXCLUDED.internal_cost,
      customs_cost     = EXCLUDED.customs_cost,
      vat_cost         = EXCLUDED.vat_cost,
      hardware_cost    = EXCLUDED.hardware_cost,
      total_cost       = EXCLUDED.total_cost,
      quotation_value  = EXCLUDED.quotation_value,
      planned_remaining = EXCLUDED.planned_remaining,
      taxes            = EXCLUDED.taxes,
      profit           = EXCLUDED.profit,
      roi              = EXCLUDED.roi,
      updated_at       = now();
  ELSE
    INSERT INTO public.site_air_records (
      site_id, certification_id, pm_id, project_name, status,
      total_sensors, po_numbers, handover_date, latest_shipment_date,
      inbound_cost, outbound_cost, internal_cost, customs_cost, vat_cost,
      hardware_cost, working_time_cost, total_cost, quotation_value,
      planned_remaining, taxes, profit, roi, updated_at
    )
    VALUES (
      p_site_id, NULL, v_pm_id, v_project_name, v_summarized_status,
      v_sensor_count, COALESCE(v_po_numbers, '{}'::text[]), v_handover_date, v_latest_shipment_date,
      COALESCE(v_inbound,0), COALESCE(v_outbound,0), COALESCE(v_internal,0), COALESCE(v_customs,0), COALESCE(v_vat,0),
      COALESCE(v_hw_cost,0), v_working_time, v_total_cost, COALESCE(v_hw_sale,0),
      v_planned_rem, v_taxes, v_profit, v_roi, now()
    )
    ON CONFLICT (site_id) WHERE certification_id IS NULL
    DO UPDATE SET
      pm_id            = EXCLUDED.pm_id,
      status           = EXCLUDED.status,
      total_sensors    = EXCLUDED.total_sensors,
      po_numbers       = EXCLUDED.po_numbers,
      latest_shipment_date = EXCLUDED.latest_shipment_date,
      inbound_cost     = EXCLUDED.inbound_cost,
      outbound_cost    = EXCLUDED.outbound_cost,
      internal_cost    = EXCLUDED.internal_cost,
      customs_cost     = EXCLUDED.customs_cost,
      vat_cost         = EXCLUDED.vat_cost,
      hardware_cost    = EXCLUDED.hardware_cost,
      total_cost       = EXCLUDED.total_cost,
      quotation_value  = EXCLUDED.quotation_value,
      planned_remaining = EXCLUDED.planned_remaining,
      taxes            = EXCLUDED.taxes,
      profit           = EXCLUDED.profit,
      roi              = EXCLUDED.roi,
      updated_at       = now();
  END IF;
END;
$function$;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Quali righe esistono su un sito
-- ────────────────────────────────────────────────────────────────────────────

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

  -- Cancellato: ogni riga del sito va a zero, ma la quantita' prevista resta
  -- scritta nelle note. Non si cancella mai una riga d'aria.
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

  -- Non piu' cancellato: la memoria nelle note si toglie.
  UPDATE public.site_air_records r
     SET notes = NULLIF(btrim(regexp_replace(COALESCE(r.notes, ''), '\s*-\s*\[Cancellato:[^\]]*\]', '', 'g')), ''),
         updated_at = now()
   WHERE r.site_id = p_site_id
     AND r.notes ILIKE '%[Cancellato:%';

  -- Le righe che devono esistere:
  --  · ogni certificazione con una domanda d'aria PROPRIA — quantita' quotata,
  --    allocazioni, o progetto di tipo Air. E' questa la regola che separa la
  --    LEED dalla WELL sullo stesso sito. La sola spunta has_iaq_monitoring non
  --    basta a far nascere una riga: dichiara un'intenzione, non un numero, e
  --    su un sito con piu' certificazioni farebbe nascere righe vuote a raffica.
  --  · ogni certificazione che una riga ce l'ha gia', cosi' nessuna resta ferma
  --    su numeri vecchi;
  --  · la certificazione di riferimento, se sul sito ci sono apparecchi o la
  --    spunta del monitoraggio ma nessuna richiesta;
  --  · la riga senza progetto, se esiste: l'aggancio lo decide una persona.
  --
  -- Finche' sul sito resta una riga senza progetto non se ne creano di nuove:
  -- quella riga e' li' perche' qualcuno deve ancora decidere a quale progetto
  -- appartiene, e affiancarle una riga per la certificazione conterebbe due
  -- volte gli stessi sensori.
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

      -- Serve solo a dare una casa ad apparecchi o spunta su un sito che di
      -- righe non ne ha ancora nessuna. Dove una riga c'e' gia', quella e' la
      -- casa: se anche fosse agganciata alla certificazione di un altro sito,
      -- l'ha decisa una persona e non la si affianca con una seconda riga.
      SELECT public.fn_air_primary_cert(p_site_id)
       WHERE (v_site_flagged
          OR EXISTS (SELECT 1 FROM public.hardwares h
                      WHERE h.site_id = p_site_id
                        AND h.category = 'AIR'
                        AND h.status <> 'In Stock'))
         AND NOT EXISTS (SELECT 1 FROM public.site_air_records r4
                          WHERE r4.site_id = p_site_id)
    ) t
    WHERE cert_id IS NOT NULL
       -- La riga senza progetto si ricalcola se gia' esiste — l'aggancio lo
       -- decide una persona, non questo calcolo — oppure se sul sito ci sono
       -- apparecchi e nessuna certificazione viva a cui appartenere: un sensore
       -- installato deve comunque comparire da qualche parte.
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

-- ────────────────────────────────────────────────────────────────────────────
-- 6. Le funzioni che scrivevano "la riga del sito"
-- ────────────────────────────────────────────────────────────────────────────

-- La riga nasce con la certificazione, e non si prende piu' quella senza
-- progetto: l'aggancio a mano e' una decisione di chi guarda il Monitor.
CREATE OR REPLACE FUNCTION public.sync_sar_from_cert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_declared    boolean;
  v_is_air_proj boolean;
  v_live        boolean;
  v_has_number  boolean;
BEGIN
  IF NEW.site_id IS NULL THEN RETURN NEW; END IF;

  v_is_air_proj := lower(COALESCE(NEW.cert_type, '')) = 'air';
  v_declared    := COALESCE(NEW.has_iaq_monitoring, false) OR v_is_air_proj;
  v_live        := lower(COALESCE(NEW.status, '')) NOT IN ('quotation', 'potential');

  v_has_number :=
       COALESCE(NEW.quoted_iaq_quantity, 0) > 0
    OR EXISTS (
         SELECT 1 FROM public.project_allocations pa
         LEFT JOIN public.products p ON p.id = pa.product_id
          WHERE pa.certification_id = NEW.id
            AND lower(COALESCE(pa.status,'')) NOT IN ('replaced','canceled','cancelled','rejected')
            AND (pa.category ILIKE '%AIR%' OR pa.category ILIKE '%IAQ%'
              OR p.category ILIKE '%AIR%' OR p.category ILIKE '%IAQ%'))
    OR EXISTS (
         SELECT 1 FROM public.hardwares h
          WHERE h.site_id = NEW.site_id AND h.category = 'AIR' AND h.status <> 'In Stock');

  IF v_declared AND v_live AND (v_has_number OR v_is_air_proj) THEN
    INSERT INTO public.site_air_records
      (site_id, certification_id, pm_id, project_name, handover_date, status, total_sensors)
    VALUES
      (NEW.site_id, NEW.id, NEW.pm_id, NEW.name, NEW.handover_date, 'Upcoming', 0)
    ON CONFLICT (site_id, certification_id) WHERE certification_id IS NOT NULL DO NOTHING;
  END IF;

  UPDATE public.site_air_records
     SET project_name = NEW.name,
         pm_id        = COALESCE(NEW.pm_id, pm_id),
         updated_at   = now()
   WHERE certification_id = NEW.id
     AND (project_name IS DISTINCT FROM NEW.name
       OR (NEW.pm_id IS NOT NULL AND pm_id IS DISTINCT FROM NEW.pm_id));

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'sync_sar_from_cert failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;

-- Su un sito con piu' righe, "quella del sito" non identifica piu' niente:
-- l'aggancio si fa sulla riga.
DROP FUNCTION IF EXISTS public.fn_attach_air_record_to_certification(uuid, uuid);

CREATE FUNCTION public.fn_attach_air_record_to_certification(
  p_record_id        uuid,
  p_certification_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cert record;
  v_row  record;
BEGIN
  IF p_record_id IS NULL THEN
    RAISE EXCEPTION 'Serve la riga da agganciare.';
  END IF;

  SELECT id, site_id, certification_id INTO v_row
    FROM public.site_air_records WHERE id = p_record_id;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'La riga % non esiste.', p_record_id;
  END IF;

  -- Sganciare e' legittimo: si torna a una riga senza progetto. Ma di righe
  -- senza progetto ne esiste una sola per sito.
  IF p_certification_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.site_air_records
                WHERE site_id = v_row.site_id
                  AND certification_id IS NULL
                  AND id <> p_record_id) THEN
      RAISE EXCEPTION 'Su questo sito c''e'' gia'' una riga senza progetto.';
    END IF;
    UPDATE public.site_air_records
       SET certification_id = NULL, updated_at = now()
     WHERE id = p_record_id;
    RETURN;
  END IF;

  SELECT id, name, pm_id, handover_date, site_id
    INTO v_cert
    FROM public.certifications
   WHERE id = p_certification_id;

  IF v_cert.id IS NULL THEN
    RAISE EXCEPTION 'La certificazione % non esiste.', p_certification_id;
  END IF;

  IF EXISTS (SELECT 1 FROM public.site_air_records
              WHERE site_id = v_row.site_id
                AND certification_id = p_certification_id
                AND id <> p_record_id) THEN
    RAISE EXCEPTION 'Questa certificazione ha gia'' una riga di monitoraggio su questo sito.';
  END IF;

  -- Nessun controllo sul sito: la scelta e' di chi la fa. Si annota soltanto,
  -- perche' un aggancio fra siti diversi merita di lasciare traccia nei log.
  IF v_cert.site_id IS DISTINCT FROM v_row.site_id THEN
    RAISE NOTICE 'Aggancio fra siti diversi: riga del sito %, certificazione del sito %',
      v_row.site_id, v_cert.site_id;
  END IF;

  UPDATE public.site_air_records
     SET certification_id = v_cert.id,
         project_name     = v_cert.name,
         pm_id            = COALESCE(v_cert.pm_id, pm_id),
         handover_date    = COALESCE(v_cert.handover_date, handover_date),
         updated_at       = now()
   WHERE id = p_record_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_attach_air_record_to_certification(uuid, uuid) TO authenticated;

-- Il PM di una certificazione cancellata tocca solo la riga senza progetto:
-- le altre righe hanno una certificazione propria da cui prendere il loro.
CREATE OR REPLACE FUNCTION public.trg_sync_cert_pm_to_air()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_site_id uuid;
BEGIN
  v_site_id := COALESCE(NEW.site_id, OLD.site_id);
  IF v_site_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  IF TG_OP = 'DELETE' THEN
    UPDATE public.site_air_records
       SET pm_id = (SELECT pm_id FROM public.certifications
                     WHERE site_id = v_site_id AND pm_id IS NOT NULL
                     ORDER BY created_at DESC LIMIT 1),
           updated_at = now()
     WHERE site_id = v_site_id
       AND certification_id IS NULL;
    RETURN OLD;
  END IF;

  IF NEW.pm_id IS NOT NULL THEN
    UPDATE public.site_air_records
       SET pm_id = NEW.pm_id, updated_at = now()
     WHERE certification_id = NEW.id
       AND pm_id IS DISTINCT FROM NEW.pm_id;
  END IF;

  RETURN NEW;
END;
$function$;

-- L'handover lo possiede la certificazione della riga. Senza certificazione non
-- c'e' niente di autorevole da copiare: si tiene la data fornita da chi scrive.
CREATE OR REPLACE FUNCTION public.fill_monitor_handover_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_handover date;
  v_found    boolean := false;
BEGIN
  IF NEW.certification_id IS NOT NULL THEN
    SELECT handover_date, true
      INTO v_handover, v_found
      FROM public.certifications
     WHERE id = NEW.certification_id;
  END IF;

  IF v_found THEN
    NEW.handover_date := v_handover;
  END IF;

  RETURN NEW;
END;
$function$;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. Riallineamento
-- ────────────────────────────────────────────────────────────────────────────

-- Ogni sito che ha una riga d'aria o una certificazione che la chiede.
DO $backfill$
DECLARE s record;
BEGIN
  FOR s IN
    SELECT DISTINCT site_id FROM (
      SELECT site_id FROM public.site_air_records
      UNION
      SELECT c.site_id FROM public.certifications c
       WHERE lower(COALESCE(c.status,'')) NOT IN ('canceled','cancelled')
         AND (COALESCE(c.quoted_iaq_quantity,0) > 0
           OR lower(COALESCE(c.cert_type,'')) = 'air'
           OR EXISTS (SELECT 1 FROM public.project_allocations pa
                      LEFT JOIN public.products p ON p.id = pa.product_id
                      WHERE pa.certification_id = c.id
                        AND lower(COALESCE(pa.status,'')) NOT IN ('replaced','canceled','cancelled','rejected')
                        AND (pa.category ILIKE '%AIR%' OR pa.category ILIKE '%IAQ%'
                          OR p.category ILIKE '%AIR%' OR p.category ILIKE '%IAQ%')))
    ) t WHERE site_id IS NOT NULL
  LOOP
    PERFORM public.fn_recalculate_site_air(s.site_id);
    PERFORM public.fn_sync_air_typology(s.site_id);
  END LOOP;
END;
$backfill$;

-- Le righe nate dallo split portavano l'array del vecchio "tutto il sito": non
-- e' una scelta manuale, e' un residuo della grana precedente. Si riallinea alla
-- richiesta propria. Vale solo dove il sito ha piu' di una riga — altrove la
-- tipologia scritta a mano resta intoccata.
UPDATE public.site_air_records r
   SET air_product_ids = public.fn_air_typology_for_line(r.site_id, r.certification_id),
       updated_at = now()
 WHERE r.site_id IN (SELECT site_id FROM public.site_air_records GROUP BY site_id HAVING COUNT(*) > 1)
   AND NOT EXISTS (SELECT 1 FROM public.hardwares h
                    WHERE h.site_id = r.site_id AND h.category = 'AIR' AND h.status <> 'In Stock')
   AND public.fn_air_typology_for_line(r.site_id, r.certification_id) IS NOT NULL
   AND r.air_product_ids IS DISTINCT FROM public.fn_air_typology_for_line(r.site_id, r.certification_id);

COMMIT;

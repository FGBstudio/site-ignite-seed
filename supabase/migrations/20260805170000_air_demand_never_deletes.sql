-- ============================================================================
-- Monitor · Air — la domanda non si cancella e non si conta a metà
--
-- Due difetti in fn_recalculate_site_air, entrambi su cosa conta come
-- fabbisogno di un progetto.
--
--   1. CANCELLAVA la riga monitor. Quando un sito non ha hardware attivo, non ha
--      allocazioni in stato 'Requested' e non ha 'air_quality' fra i
--      monitoring_types, la funzione faceva DELETE e usciva. Un progetto che
--      esiste ma non ha ancora pezzi spariva dal report invece di comparire a
--      zero — e siccome il report itera sulle righe di site_air_records, con la
--      riga spariva anche la richiesta collegata. Oggi 9 siti sono in questa
--      condizione: hanno allocazioni reali in stato diverso da 'Requested' e
--      nessun hardware, quindi al prossimo ricalcolo la loro riga verrebbe
--      eliminata.
--
--   2. Riconosceva come domanda SOLO status = 'Requested'. Le allocazioni
--      'Confirmed', 'Partially Confirmed', 'Shipped' e 'Installed_Online'
--      valevano zero. Sono 221 unità su 504 nel complesso; di queste, 138
--      cadono sui 57 siti che non hanno ancora nessun pezzo ed è lì che il
--      difetto morde, perché su quei siti la richiesta è l'unica cosa che la
--      riga può dichiarare. Le altre 83 stanno su siti che hanno già hardware,
--      dove è il conteggio dei pezzi a prevalere ed è giusto così.
--
-- ── Cosa questa migration NON fa più ────────────────────────────────────────
--
-- Una versione precedente scriveva `total_sensors = GREATEST(pezzi, richiesti)`.
-- Era sbagliato. Un dispositivo riceve un id solo dopo essere stato prodotto,
-- quindi `total_sensors` è la sola traccia di cosa è stato fabbricato: fondendoci
-- dentro il richiesto si perdeva l'unico dato che dice alla produzione quanto
-- resta da costruire. Il totale di progetto — massimo fra previsto e prodotto —
-- è una regola di lettura del report, non un fatto da congelare nella tabella,
-- e `adaptAir` lo calcola già.
--
-- ── Il contratto della colonna, da non rompere ──────────────────────────────
--
-- `total_sensors` ha due significati, distinti dallo stato della riga:
--
--     status = 'Upcoming'  →  nessun hardware attaccato: il numero è la
--                             RICHIESTA ancora da servire
--     altrimenti           →  il numero sono i pezzi PRODOTTI e assegnati
--
-- Verificato sul dato reale (2026-08-06): tutte e 92 le righe 'Upcoming' hanno
-- zero hardware, e nessuna delle altre 277 è 'Upcoming'. Il report si appoggia
-- esattamente a questo discriminante per separare "assegnato" da "da produrre"
-- (src/lib/monitorPivot.ts, adaptAir). Cambiando la regola qui va cambiato
-- anche lì.
--
-- ── Effetto atteso ──────────────────────────────────────────────────────────
--
-- Misurato il 2026-08-06, sulle 369 righe air esistenti:
--
--   • 9 siti smettono di essere a un ricalcolo dalla cancellazione, e la loro
--     riga viene creata al primo ricalcolo utile
--   • sui 57 siti senza hardware la domanda dichiarata passa da 282 a 420
--     unità (+138), perché smette di ignorare i quattro stati non-'Requested'
--   • 20 righe prive di qualsiasi evidenza vengono azzerate invece che
--     cancellate: oggi dichiarano 10 sensori che non esistono
--   • le righe con hardware restano invariate: continuano a contare i pezzi
--
-- Il totale di colonna scende da 1046 a 997 proprio per l'azzeramento di quelle
-- righe stantie. Il fabbisogno del report NON cala: lo legge da
-- project_allocations tramite useRequestedDemand, che conta già tutti gli stati
-- vivi indipendentemente da questa funzione.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_recalculate_site_air(p_site_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  v_sensor_count integer := 0;
  v_hw_count integer := 0;
  v_po_numbers text[] := '{}'::text[];
  v_latest_shipment_date date;
  v_handover_date date;
  v_summarized_status text;
  v_project_name text;
  v_pm_id uuid;
  v_cert_id uuid;

  -- Financial variables
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

  -- Requested variables
  v_requested_count integer := 0;
  v_req_cost numeric := 0;
  v_req_sale numeric := 0;
  v_has_active_hw boolean := false;
  v_site_flagged boolean := false;
BEGIN
  IF p_site_id IS NULL THEN RETURN; END IF;

  -- A) Hardware assegnato (AIR, escluso lo stock libero). Questi sono i pezzi
  --    che esistono davvero: hanno un id, quindi sono stati prodotti.
  SELECT
    COUNT(*),
    ARRAY_AGG(DISTINCT opo.po_number) FILTER (WHERE opo.po_number IS NOT NULL),
    MAX(h.shipment_date),
    SUM(COALESCE(p.unit_cost, 0)),
    SUM(COALESCE(p.unit_sale_price, 0))
  INTO v_hw_count, v_po_numbers, v_latest_shipment_date, v_hw_cost, v_hw_sale
  FROM public.hardwares h
  JOIN public.products p ON h.product_id = p.id
  LEFT JOIN public.ops_purchase_orders opo ON opo.id = h.purchase_order_id
  WHERE h.site_id = p_site_id
    AND h.category = 'AIR'
    AND h.status != 'In Stock';

  v_hw_count := COALESCE(v_hw_count, 0);
  v_has_active_hw := (v_hw_count > 0);

  -- B) Domanda richiesta da Operations/PM, su TUTTI gli stati vivi.
  --    Prima contava solo 'Requested': una richiesta confermata o già installata
  --    resta fabbisogno del progetto e non può valere zero. Si escludono solo
  --    gli stati morti, gli stessi che filtra src/hooks/useRequestedDemand.ts.
  --    Quantità come COALESCE(requested_quantity, quantity) per allinearsi al
  --    resto dell'applicazione: prima usava solo quantity.
  SELECT
    COALESCE(SUM(COALESCE(pa.requested_quantity, pa.quantity, 0)), 0),
    COALESCE(SUM(COALESCE(p.unit_cost, 0)       * COALESCE(pa.requested_quantity, pa.quantity, 0)), 0),
    COALESCE(SUM(COALESCE(p.unit_sale_price, 0) * COALESCE(pa.requested_quantity, pa.quantity, 0)), 0)
  INTO v_requested_count, v_req_cost, v_req_sale
  FROM public.project_allocations pa
  LEFT JOIN public.products p ON pa.product_id = p.id
  JOIN public.certifications c ON c.id = pa.certification_id
  WHERE c.site_id = p_site_id
    AND lower(COALESCE(pa.status, '')) NOT IN ('replaced', 'canceled', 'cancelled', 'rejected')
    AND (
      pa.category = 'AIR'
      OR p.category = 'AIR'
      OR pa.category ILIKE '%AIR%'
      OR pa.category ILIKE '%IAQ%'
      OR p.category ILIKE '%AIR%'
      OR p.category ILIKE '%IAQ%'
    );

  SELECT EXISTS (
    SELECT 1 FROM public.sites
     WHERE id = p_site_id
       AND monitoring_types IS NOT NULL
       AND 'air_quality' = ANY(monitoring_types)
  ) INTO v_site_flagged;

  IF v_has_active_hw THEN
    -- Ci sono pezzi: la riga descrive la produzione, non la richiesta.
    v_sensor_count := v_hw_count;

    SELECT string_agg(cnt || ' ' || ship_status, ', ' ORDER BY ship_status)
    INTO v_summarized_status
    FROM (
      SELECT sh.status AS ship_status, COUNT(*) AS cnt
      FROM public.hardwares h2
      JOIN public.ops_hardware_movements hm ON h2.id = hm.hardware_id
      JOIN public.ops_shipments sh ON hm.shipment_id = sh.id
      WHERE h2.site_id = p_site_id
        AND h2.category = 'AIR'
        AND h2.status != 'In Stock'
        AND sh.shipment_type ILIKE 'Outbound'
      GROUP BY sh.status
    ) status_counts;

    IF v_summarized_status IS NULL THEN
      v_summarized_status := 'Assigned';
    END IF;

    -- Costi di spedizione, pro-rata per dispositivo
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
      FROM public.hardwares h2
      JOIN public.ops_hardware_movements hm ON h2.id = hm.hardware_id
      JOIN public.ops_shipments sh ON hm.shipment_id = sh.id
      JOIN (
        SELECT shipment_id, COUNT(*) AS total_devices
        FROM public.ops_hardware_movements
        GROUP BY shipment_id
      ) sh_stats ON sh.id = sh_stats.shipment_id
      WHERE h2.site_id = p_site_id
        AND h2.category = 'AIR'
        AND h2.status != 'In Stock'
    ) pro_rated;

  ELSIF v_requested_count > 0 THEN
    -- Nessun pezzo ancora: la riga descrive la richiesta da servire. 'Upcoming'
    -- è ciò che dice al report di NON contarla come prodotta.
    v_sensor_count := v_requested_count;
    v_hw_cost := v_req_cost;
    v_hw_sale := v_req_sale;
    v_summarized_status := 'Upcoming';
    v_po_numbers := '{}'::text[];
    v_latest_shipment_date := NULL;

  ELSIF v_site_flagged THEN
    -- Monitoraggio aria previsto sul sito ma nulla di concreto: riga a zero.
    v_sensor_count := 0;
    v_hw_cost := 0;
    v_hw_sale := 0;
    v_summarized_status := 'Upcoming';
    v_po_numbers := '{}'::text[];
    v_latest_shipment_date := NULL;

  ELSE
    -- Nessuna evidenza di monitoraggio aria su questo sito.
    --
    -- Qui prima c'era un DELETE. Non si cancella più: se una riga esiste viene
    -- azzerata e resta visibile, perché un progetto che sparisce dal report è
    -- indistinguibile da un progetto che non è mai esistito. Se invece la riga
    -- non c'è, non la si crea — altrimenti ogni sito toccato da un trigger
    -- guadagnerebbe un record aria vuoto, e i trigger su certifications girano
    -- su tutte e ~1130.
    --
    -- Si azzera anche il conto economico: lasciare profitto e ROI di ieri su una
    -- riga che dichiara zero sensori è peggio che cancellarla.
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
           status               = 'Upcoming',
           po_numbers           = '{}'::text[],
           latest_shipment_date = NULL,
           updated_at           = now()
     WHERE site_id = p_site_id;
    RETURN;
  END IF;

  -- C) Metadati
  SELECT s.name INTO v_project_name FROM public.sites s WHERE s.id = p_site_id;

  SELECT c.id, c.pm_id, c.handover_date
  INTO v_cert_id, v_pm_id, v_handover_date
  FROM public.certifications c
  WHERE c.site_id = p_site_id
  ORDER BY c.created_at DESC
  LIMIT 1;

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

  -- E) UPSERT
  INSERT INTO public.site_air_records (
    site_id, certification_id, pm_id, project_name, status,
    total_sensors, po_numbers, handover_date, latest_shipment_date,
    inbound_cost, outbound_cost, internal_cost, customs_cost, vat_cost,
    hardware_cost, working_time_cost, total_cost, quotation_value,
    planned_remaining, taxes, profit, roi, updated_at
  )
  VALUES (
    p_site_id, v_cert_id, v_pm_id, v_project_name,
    v_summarized_status,
    v_sensor_count, COALESCE(v_po_numbers, '{}'::text[]), v_handover_date, v_latest_shipment_date,
    COALESCE(v_inbound,0), COALESCE(v_outbound,0), COALESCE(v_internal,0), COALESCE(v_customs,0), COALESCE(v_vat,0),
    COALESCE(v_hw_cost,0), v_working_time, v_total_cost, COALESCE(v_hw_sale,0),
    v_planned_rem, v_taxes, v_profit, v_roi, now()
  )
  ON CONFLICT (site_id) DO UPDATE SET
    certification_id = EXCLUDED.certification_id,
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
END;
$function$;

COMMENT ON FUNCTION public.fn_recalculate_site_air(uuid) IS
  'Ricalcola site_air_records per un sito. total_sensors = pezzi prodotti quando esistono, altrimenti unità richieste con status Upcoming. Non cancella mai la riga: un progetto senza pezzi resta visibile a zero.';

COMMENT ON COLUMN public.site_air_records.total_sensors IS
  'Doppio significato, discriminato da status: con status Upcoming è la RICHIESTA ancora da servire (nessun hardware attaccato), altrimenti sono i pezzi PRODOTTI e assegnati. adaptAir in src/lib/monitorPivot.ts si appoggia a questa regola per separare assegnato da da-produrre.';

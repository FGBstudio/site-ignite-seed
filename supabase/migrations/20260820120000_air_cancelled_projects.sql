-- ============================================================================
-- Monitor · Air — un progetto cancellato conta zero ma non perde la memoria
--
-- Il difetto, visto su BOXENGO / MILAN / Boxengo Famagosta: cancellare un
-- progetto lo toglie da Operations (src/pages/Projects.tsx filtra via
-- setup_status = 'canceled') ma NON lo toglie dal Monitor. useAirRows legge
-- site_air_records senza alcun filtro, e da 20260805170000 la riga non viene
-- piu' cancellata — per una ragione giusta, ma pensata per progetti vivi senza
-- hardware, non per progetti morti. Risultato: un progetto cancellato resta nel
-- report dell'aria con i suoi sensori, e le sue project_allocations continuano
-- a contare come fabbisogno da produrre.
--
-- ── La regola ───────────────────────────────────────────────────────────────
--
-- Un sito e' cancellato quando il sito stesso e' 'canceled', oppure quando ha
-- almeno una certification e NESSUNA di esse e' viva. La seconda meta' conta:
-- un sito certificato sotto piu' schemi, con una cancellata e una in corso,
-- NON e' cancellato — quella viva ha ancora bisogno dei suoi sensori.
--
-- Quando lo e':
--   • total_sensors e tutto il conto economico vanno a zero
--   • status diventa 'Cancelled' — un terzo significato della colonna, accanto
--     a 'Upcoming' e agli stati di spedizione, e un valore in piu' nel filtro
--     Status del report
--   • il numero che il progetto avrebbe richiesto viene ricordato in coda alle
--     note, in modo leggibile
--
-- ── Perche' le note e non una colonna ───────────────────────────────────────
--
-- Scelta esplicita: il numero deve restare sotto gli occhi di chi legge la
-- tabella, non in una colonna che nessuno guarda. Il prezzo e' che `notes` e'
-- un campo libero che il PM edita a mano (AirTable.tsx, textarea con
-- .update({ notes })), quindi il testo del PM non si tocca MAI: si appende una
-- coda marcata, e la coda viene rimossa e riscritta a ogni ricalcolo invece di
-- accumularsi. I trigger air scattano su hardwares, movimenti, spedizioni, PO,
-- sites e certifications: senza il marcatore, dopo una settimana la nota
-- sarebbe una fila di "- [Cancellato: 24 sensori previsti]" ripetuti.
--
-- Il marcatore e' `- [Cancellato: N sensori previsti]`. Se il progetto viene
-- riattivato la coda sparisce da sola al primo ricalcolo (ramo non cancellato,
-- in fondo alla sezione B). Resta vero che un PM che cancella a mano la coda
-- perde il numero: e' un campo suo, e questa e' la conseguenza accettata.
--
-- ── Cosa NON fa ─────────────────────────────────────────────────────────────
--
-- Non crea la riga se non esiste. Un sito cancellato che non ha mai avuto un
-- record aria non deve guadagnarne uno adesso: non c'e' niente da nascondere
-- dal report e niente da ricordare. Vale la stessa ragione dell'ELSE finale
-- introdotto da 20260805170000.
--
-- Non tocca energy e water, che hanno lo stesso buco.
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

  -- Cancellation variables
  v_total_certs integer := 0;
  v_live_certs integer := 0;
  v_site_canceled boolean := false;
  v_is_canceled boolean := false;
  v_expected integer := 0;
  v_notes_raw text;
  v_notes_clean text;
  v_notes_new text;
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
  --    Prima contava solo 'Requested': una richiesta confermata o gia' installata
  --    resta fabbisogno del progetto e non puo' valere zero. Si escludono solo
  --    gli stati morti, gli stessi che filtra src/hooks/useRequestedDemand.ts.
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

  -- ── B-bis) Il sito e' cancellato? ────────────────────────────────────────
  --
  -- Si guardano entrambe le spellings ('canceled' e 'cancelled'): la prima e'
  -- quella scritta da Quotations.tsx e da ProjectFormModal, la seconda gira
  -- altrove nell'applicazione e costa nulla accettarla.
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE lower(COALESCE(c.status, '')) NOT IN ('canceled', 'cancelled'))
  INTO v_total_certs, v_live_certs
  FROM public.certifications c
  WHERE c.site_id = p_site_id;

  SELECT lower(COALESCE(s.status, '')) IN ('canceled', 'cancelled')
  INTO v_site_canceled
  FROM public.sites s
  WHERE s.id = p_site_id;

  v_is_canceled := COALESCE(v_site_canceled, false)
                   OR (v_total_certs > 0 AND v_live_certs = 0);

  SELECT sar.notes INTO v_notes_raw
  FROM public.site_air_records sar
  WHERE sar.site_id = p_site_id;

  -- La coda di sistema viene sempre staccata prima di decidere cosa scriverci:
  -- cosi' il ramo cancellato la riscrive aggiornata e il ramo vivo la lascia
  -- fuori, senza che nessuno dei due debba conoscere l'altro.
  v_notes_clean := btrim(
    regexp_replace(COALESCE(v_notes_raw, ''), '\s*-\s*\[Cancellato:[^\]]*\]', '', 'g')
  );

  IF v_is_canceled THEN
    -- Quanti sensori chiedeva questo progetto. Se dei pezzi erano gia' stati
    -- prodotti sono loro la misura del fabbisogno; altrimenti lo e' la richiesta.
    v_expected := GREATEST(v_hw_count, COALESCE(v_requested_count, 0));

    IF v_expected > 0 THEN
      v_notes_new := CASE WHEN v_notes_clean = '' THEN '' ELSE v_notes_clean || ' ' END
                     || '- [Cancellato: ' || v_expected || ' sensori previsti]';
    ELSE
      v_notes_new := NULLIF(v_notes_clean, '');
    END IF;

    -- Solo UPDATE, mai INSERT: si veda l'intestazione.
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
     WHERE site_id = p_site_id;
    RETURN;
  END IF;

  -- Progetto vivo: se porta ancora la coda di una cancellazione precedente,
  -- e' stato riattivato e la coda va via.
  IF v_notes_clean IS DISTINCT FROM COALESCE(v_notes_raw, '') THEN
    UPDATE public.site_air_records
       SET notes = NULLIF(v_notes_clean, ''), updated_at = now()
     WHERE site_id = p_site_id;
  END IF;

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
    -- e' cio' che dice al report di NON contarla come prodotta.
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
    -- Qui prima c'era un DELETE. Non si cancella piu': se una riga esiste viene
    -- azzerata e resta visibile, perche' un progetto che sparisce dal report e'
    -- indistinguibile da un progetto che non e' mai esistito. Se invece la riga
    -- non c'e', non la si crea.
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

  -- La certification di riferimento e' la piu' recente fra quelle VIVE: su un
  -- sito con una cancellata e una in corso, la riga deve parlare di quella in
  -- corso. Il COALESCE tiene il vecchio comportamento per i siti che non ne
  -- hanno nessuna viva ma non sono cancellati (caso raro: certifications
  -- assenti del tutto, dove entrambe le query non tornano nulla).
  SELECT c.id, c.pm_id, c.handover_date
  INTO v_cert_id, v_pm_id, v_handover_date
  FROM public.certifications c
  WHERE c.site_id = p_site_id
    AND lower(COALESCE(c.status, '')) NOT IN ('canceled', 'cancelled')
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
  'Ricalcola site_air_records per un sito. Progetto cancellato (sito canceled, o nessuna certification viva): total_sensors e conto economico a zero, status Cancelled, fabbisogno previsto appeso alle note come "- [Cancellato: N sensori previsti]". Altrimenti total_sensors = pezzi prodotti quando esistono, altrimenti unita'' richieste con status Upcoming. Non cancella mai la riga.';

COMMENT ON COLUMN public.site_air_records.status IS
  'Tre significati: Cancelled = progetto cancellato, la riga conta zero e il fabbisogno previsto sta nelle note; Upcoming = nessun hardware attaccato, total_sensors e'' la richiesta; altrimenti stato di spedizione aggregato e total_sensors sono i pezzi prodotti.';

-- ============================================================================
-- Backfill: riallinea i siti che hanno gia' subito una cancellazione.
-- Solo quelli con una riga air esistente — la funzione non ne crea comunque.
-- ============================================================================
DO $backfill$
DECLARE
  r record;
  v_count integer := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT sar.site_id
    FROM public.site_air_records sar
    LEFT JOIN public.sites s ON s.id = sar.site_id
    WHERE lower(COALESCE(s.status, '')) IN ('canceled', 'cancelled')
       OR (
         EXISTS (SELECT 1 FROM public.certifications c WHERE c.site_id = sar.site_id)
         AND NOT EXISTS (
           SELECT 1 FROM public.certifications c
           WHERE c.site_id = sar.site_id
             AND lower(COALESCE(c.status, '')) NOT IN ('canceled', 'cancelled')
         )
       )
  LOOP
    PERFORM public.fn_recalculate_site_air(r.site_id);
    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'fn_recalculate_site_air: % siti cancellati riallineati', v_count;
END;
$backfill$;

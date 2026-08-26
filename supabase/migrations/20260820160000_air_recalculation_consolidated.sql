-- ============================================================================
-- Monitor · Air — fn_recalculate_site_air, versione unica
--
-- Questo file SOSTITUISCE per intero 20260805170000 e 20260820120000, che non
-- sono mai stati applicati e che riscrivevano la stessa funzione in due file
-- concorrenti: applicarli in ordine sbagliato avrebbe fatto vincere la versione
-- meno completa, senza che nulla lo segnalasse. Qui c'e' un solo punto di
-- verita'. I due file precedenti vanno considerati storia, non da eseguire.
--
-- Cinque regole, tutte dentro la stessa funzione.
--
-- ── 1. La riga non si cancella mai ─────────────────────────────────────────
--
-- La funzione faceva DELETE quando un sito non aveva hardware AIR attivo, ne'
-- allocazioni in stato 'Requested', ne' 'air_quality' fra i monitoring_types.
-- Un progetto che esiste ma non ha ancora pezzi spariva dal report invece di
-- comparire a zero, e con la riga spariva la richiesta collegata — e le note
-- scritte a mano dai PM, che vivono in quella riga e in nessun altro posto.
--
-- Misurato il 2026-08-20: 17 righe si trovano oggi in quella condizione e
-- dichiarano 10 sensori. Fra loro ci sono progetti con note vere. D'ora in poi
-- una riga esistente viene azzerata e resta visibile; se non esiste non viene
-- creata, altrimenti ogni sito toccato da un trigger guadagnerebbe un record
-- aria vuoto (i trigger su certifications girano su tutte e ~1.140).
--
-- ── 2. La domanda si conta su tutti gli stati vivi ─────────────────────────
--
-- Prima valeva solo status = 'Requested'. Le allocazioni 'Confirmed',
-- 'Partially Confirmed', 'Shipped' e 'Installed_Online' contavano zero: sono
-- 28 righe per 236 unita' sulle 104 righe / 533 unita' vive complessive. Si
-- escludono solo gli stati morti, gli stessi che filtra
-- src/hooks/useRequestedDemand.ts. Le quantita' usano
-- COALESCE(requested_quantity, quantity) come il resto dell'applicazione:
-- prima leggevano solo `quantity`.
--
-- ── 3. Progetto cancellato: conta zero, ma non perde la memoria ────────────
--
-- Un sito e' cancellato quando il sito stesso e' 'canceled', oppure quando ha
-- almeno una certification e NESSUNA di esse e' viva. La seconda meta' conta:
-- un sito con una certification cancellata e una in corso NON e' cancellato.
--
-- Allora total_sensors e tutto il conto economico vanno a zero, lo status
-- diventa 'Cancelled', e il numero che il progetto avrebbe richiesto viene
-- ricordato in coda alle note come "- [Cancellato: N sensori previsti]".
--
-- Le note sono un campo libero che il PM edita a mano (AirTable.tsx), quindi
-- il suo testo non si tocca MAI: si appende una coda marcata, e la coda viene
-- staccata e riscritta a ogni ricalcolo invece di accumularsi — senza il
-- marcatore, dopo una settimana di trigger la nota sarebbe una fila di code
-- ripetute. Se il progetto viene riattivato la coda sparisce da sola.
--
-- Oggi riguarda un sito solo: Boxengo Famagosta, che dopo la deduplica del
-- 20260820157000 ha finalmente la sua certification cancellata sullo stesso
-- sito della riga monitor. Fino a ieri il predicato non poteva proprio
-- scattare, perche' progetto cancellato e riga monitor stavano su due siti
-- diversi.
--
-- ── 4. Badge "On hold" ─────────────────────────────────────────────────────
--
-- Un sito e' in hold quando ha certification vive e TUTTE portano
-- on_hold = true. Se una e' sospesa e una corre, il sito non e' in hold: la
-- seconda ha ancora bisogno dei suoi sensori.
--
-- L'hold e' una pausa, non una morte: a differenza della cancellazione NON
-- azzera nulla. total_sensors e il conto economico restano quello che sono, il
-- Monitor Hub continua a dichiarare i sensori che il progetto vorra', e cambia
-- soltanto lo status, che diventa 'On hold'. E' il report a non doverli
-- ordinare oggi, e quel lato e' gia' gestito da useRequestedDemand.
--
-- Il prezzo, dichiarato: su una riga con hardware lo status di spedizione
-- aggregato ("2 Delivered, 1 In Transit") viene coperto dal badge. I dispositivi
-- restano visibili nel dettaglio del sito. Oggi il caso non si presenta: l'unico
-- sito interamente in hold con una riga air e' Versace Umeda Hankyu WRTW, che
-- di hardware non ne ha.
--
-- ATTENZIONE, cambia un contratto: fino a ieri 'Upcoming' era il discriminante
-- esatto fra "nessun hardware attaccato" e "pezzi prodotti", e adaptAir ci si
-- appoggia. Una riga in hold e senza hardware ora dice 'On hold' e non piu'
-- 'Upcoming', quindi src/lib/monitorPivot.ts deve riconoscere anche questo
-- valore: senza quella modifica le unita' richieste verrebbero contate come
-- gia' prodotte. Le due cose vanno applicate insieme.
--
-- ── 5. La certification di riferimento e' la piu' significativa ────────────
--
-- Prima: ORDER BY created_at DESC LIMIT 1 — la piu' recente. Che e' quasi
-- sempre la piu' sbagliata, perche' gli import massivi creano gusci vuoti in
-- blocco e quei gusci sono per definizione i piu' recenti.
--
-- Ora si sceglie fra le sole certification VIVE, in quest'ordine:
--
--   1. quella che ha davvero chiesto sensori AIR (project_allocations)
--   2. quella che dichiara has_iaq_monitoring
--   3. quella che ha un nome
--   4. a parita' di tutto, la piu' recente — il comportamento storico, che
--      resta valido quando i candidati sono equivalenti
--
-- I due casi che questo corregge oggi:
--
--   • Ripa89 — la riga air pende da "Ripa89 – WELL - BREEAM" mentre le
--     allocazioni AIR stanno su "Ripa89 – WELL - WELL". Stessa data di
--     creazione, quindi il vecchio ORDER BY sceglieva a caso.
--   • Neuer Wall — la riga pende da un guscio senza nome del 29 giugno invece
--     che dalla certification vera del 7 aprile, ed e' il motivo per cui
--     useAirRows ripiega sul nome del sito.
--
-- ── Il contratto di total_sensors, invariato ───────────────────────────────
--
--     status 'Upcoming' o 'On hold'  →  nessun hardware attaccato: il numero e'
--                                       la RICHIESTA ancora da servire
--     status 'Cancelled'             →  zero
--     altrimenti                     →  pezzi PRODOTTI e assegnati
--
-- Verificato sul dato reale (2026-08-20): tutte e 109 le righe 'Upcoming' hanno
-- zero hardware AIR, e nessuna delle altre 275 e' 'Upcoming'.
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

  -- Conto economico
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

  -- Domanda
  v_requested_count integer := 0;
  v_req_cost numeric := 0;
  v_req_sale numeric := 0;
  v_has_active_hw boolean := false;
  v_site_flagged boolean := false;

  -- Stato del progetto
  v_total_certs integer := 0;
  v_live_certs integer := 0;
  v_held_certs integer := 0;
  v_site_canceled boolean := false;
  v_is_canceled boolean := false;
  v_is_on_hold boolean := false;
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

  -- B) Domanda richiesta da Operations/PM, su TUTTI gli stati vivi (regola 2).
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

  -- B-bis) Cancellato? In hold? (regole 3 e 4)
  --
  -- Si guardano entrambe le grafie di 'canceled': la prima e' quella scritta da
  -- Quotations.tsx e da ProjectFormModal, la seconda gira altrove e accettarla
  -- non costa nulla.
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE lower(COALESCE(c.status, '')) NOT IN ('canceled', 'cancelled')),
    COUNT(*) FILTER (WHERE lower(COALESCE(c.status, '')) NOT IN ('canceled', 'cancelled')
                       AND COALESCE(c.on_hold, false))
  INTO v_total_certs, v_live_certs, v_held_certs
  FROM public.certifications c
  WHERE c.site_id = p_site_id;

  SELECT lower(COALESCE(s.status, '')) IN ('canceled', 'cancelled')
  INTO v_site_canceled
  FROM public.sites s
  WHERE s.id = p_site_id;

  v_is_canceled := COALESCE(v_site_canceled, false)
                   OR (v_total_certs > 0 AND v_live_certs = 0);

  -- In hold solo se TUTTE le vive lo sono, e non se e' gia' cancellato: la
  -- cancellazione e' piu' forte della pausa.
  v_is_on_hold := (NOT v_is_canceled)
                  AND v_live_certs > 0
                  AND v_held_certs = v_live_certs;

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
    -- Quanti sensori chiedeva questo progetto: se dei pezzi erano gia' stati
    -- prodotti sono loro la misura, altrimenti lo e' la richiesta.
    v_expected := GREATEST(v_hw_count, COALESCE(v_requested_count, 0));

    IF v_expected > 0 THEN
      v_notes_new := CASE WHEN v_notes_clean = '' THEN '' ELSE v_notes_clean || ' ' END
                     || '- [Cancellato: ' || v_expected || ' sensori previsti]';
    ELSE
      v_notes_new := NULLIF(v_notes_clean, '');
    END IF;

    -- Solo UPDATE, mai INSERT: un sito cancellato che non ha mai avuto un
    -- record aria non deve guadagnarne uno adesso.
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

  -- Progetto vivo: se porta ancora la coda di una cancellazione precedente, e'
  -- stato riattivato e la coda va via.
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
    -- Nessun pezzo ancora: la riga descrive la richiesta da servire.
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
    -- Nessuna evidenza di monitoraggio aria su questo sito (regola 1).
    --
    -- Qui prima c'era un DELETE. Non si cancella piu': una riga esistente viene
    -- azzerata e resta visibile, perche' un progetto che sparisce dal report e'
    -- indistinguibile da un progetto che non e' mai esistito — e con la riga
    -- sparirebbero le note del PM. Se invece la riga non c'e', non la si crea.
    --
    -- Si azzera anche il conto economico: lasciare profitto e ROI di ieri su
    -- una riga che dichiara zero sensori e' peggio che cancellarla.
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
           status               = CASE WHEN v_is_on_hold THEN 'On hold' ELSE 'Upcoming' END,
           po_numbers           = '{}'::text[],
           latest_shipment_date = NULL,
           updated_at           = now()
     WHERE site_id = p_site_id;
    RETURN;
  END IF;

  -- Badge On hold (regola 4): copre lo status calcolato, senza toccare
  -- quantita' ne' conto economico. La pausa non cancella il fabbisogno.
  IF v_is_on_hold THEN
    v_summarized_status := 'On hold';
  END IF;

  -- C) Metadati. La certification di riferimento e' la piu' SIGNIFICATIVA fra
  --    le vive, non la piu' recente (regola 5).
  SELECT s.name INTO v_project_name FROM public.sites s WHERE s.id = p_site_id;

  SELECT c.id, c.pm_id, c.handover_date
  INTO v_cert_id, v_pm_id, v_handover_date
  FROM public.certifications c
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS n_air
    FROM public.project_allocations pa
    LEFT JOIN public.products p ON p.id = pa.product_id
    WHERE pa.certification_id = c.id
      AND lower(COALESCE(pa.status, '')) NOT IN ('replaced', 'canceled', 'cancelled', 'rejected')
      AND (
        pa.category = 'AIR'
        OR p.category = 'AIR'
        OR pa.category ILIKE '%AIR%'
        OR pa.category ILIKE '%IAQ%'
        OR p.category ILIKE '%AIR%'
        OR p.category ILIKE '%IAQ%'
      )
  ) alloc ON true
  WHERE c.site_id = p_site_id
    AND lower(COALESCE(c.status, '')) NOT IN ('canceled', 'cancelled')
  ORDER BY
    (alloc.n_air > 0) DESC,                     -- ha chiesto i sensori
    COALESCE(c.has_iaq_monitoring, false) DESC, -- dichiara di monitorare l'aria
    (COALESCE(btrim(c.name), '') <> '') DESC,   -- ha un nome
    c.created_at DESC                           -- a parita', la piu' recente
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
  'Ricalcola site_air_records per un sito. Non cancella mai la riga. Progetto cancellato (sito canceled, o nessuna certification viva): tutto a zero, status Cancelled, fabbisogno previsto appeso alle note come "- [Cancellato: N sensori previsti]". Progetto in hold (tutte le certification vive on_hold): status On hold, quantita'' e conto economico invariati. Altrimenti total_sensors = pezzi prodotti quando esistono, altrimenti unita'' richieste su tutti gli stati vivi con status Upcoming. La certification agganciata e'' la piu'' significativa fra le vive, non la piu'' recente.';

COMMENT ON COLUMN public.site_air_records.total_sensors IS
  'Significato discriminato dallo status: con Upcoming o On hold e'' la RICHIESTA ancora da servire (nessun hardware attaccato); con Cancelled e'' zero; altrimenti sono i pezzi PRODOTTI e assegnati. adaptAir in src/lib/monitorPivot.ts si appoggia a questa regola per separare assegnato da da-produrre.';

COMMENT ON COLUMN public.site_air_records.status IS
  'Quattro significati: Cancelled = progetto cancellato, la riga conta zero e il fabbisogno previsto sta nelle note; On hold = progetto sospeso, la riga dichiara ancora il suo fabbisogno ma il report non lo ordina; Upcoming = nessun hardware attaccato, total_sensors e'' la richiesta; altrimenti stato di spedizione aggregato e total_sensors sono i pezzi prodotti.';

-- ============================================================================
-- Backfill: riallinea i siti che le nuove regole riguardano davvero.
--
-- Non si ricalcola tutto: solo i siti cancellati, quelli in hold e quelli la
-- cui riga air pende da una certification che non e' la piu' significativa.
-- La funzione non crea comunque righe che non esistono.
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
    WHERE
      -- cancellati
      lower(COALESCE(s.status, '')) IN ('canceled', 'cancelled')
      OR (
        EXISTS (SELECT 1 FROM public.certifications c WHERE c.site_id = sar.site_id)
        AND NOT EXISTS (
          SELECT 1 FROM public.certifications c
          WHERE c.site_id = sar.site_id
            AND lower(COALESCE(c.status, '')) NOT IN ('canceled', 'cancelled')
        )
      )
      -- in hold: esistono vive e sono tutte sospese
      OR (
        EXISTS (SELECT 1 FROM public.certifications c
                 WHERE c.site_id = sar.site_id
                   AND lower(COALESCE(c.status, '')) NOT IN ('canceled', 'cancelled'))
        AND NOT EXISTS (
          SELECT 1 FROM public.certifications c
          WHERE c.site_id = sar.site_id
            AND lower(COALESCE(c.status, '')) NOT IN ('canceled', 'cancelled')
            AND COALESCE(c.on_hold, false) = false
        )
      )
      -- aggancio da rifare: la certification attuale non ha allocazioni AIR
      -- mentre una sorella viva ce le ha, oppure non ha nome mentre una
      -- sorella viva ce l'ha
      OR EXISTS (
        SELECT 1
        FROM public.certifications c_now
        WHERE c_now.id = sar.certification_id
          AND (
            (NOT EXISTS (SELECT 1 FROM public.project_allocations pa
                          LEFT JOIN public.products p ON p.id = pa.product_id
                          WHERE pa.certification_id = c_now.id
                            AND (pa.category ILIKE '%AIR%' OR pa.category ILIKE '%IAQ%'
                                 OR p.category ILIKE '%AIR%' OR p.category ILIKE '%IAQ%'))
             AND EXISTS (SELECT 1 FROM public.certifications c2
                          JOIN public.project_allocations pa ON pa.certification_id = c2.id
                          LEFT JOIN public.products p ON p.id = pa.product_id
                          WHERE c2.site_id = sar.site_id AND c2.id <> c_now.id
                            AND lower(COALESCE(c2.status, '')) NOT IN ('canceled', 'cancelled')
                            AND (pa.category ILIKE '%AIR%' OR pa.category ILIKE '%IAQ%'
                                 OR p.category ILIKE '%AIR%' OR p.category ILIKE '%IAQ%')))
            OR
            (COALESCE(btrim(c_now.name), '') = ''
             AND EXISTS (SELECT 1 FROM public.certifications c2
                          WHERE c2.site_id = sar.site_id
                            AND lower(COALESCE(c2.status, '')) NOT IN ('canceled', 'cancelled')
                            AND COALESCE(btrim(c2.name), '') <> ''))
          )
      )
  LOOP
    PERFORM public.fn_recalculate_site_air(r.site_id);
    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'fn_recalculate_site_air: % siti riallineati', v_count;
END;
$backfill$;

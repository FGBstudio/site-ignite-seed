-- ============================================================================
-- Monitor · Air — la tipologia segue gli apparecchi, non resta vuota
--
-- Assegnando un device dalla tabella Hardware la colonna MONITOR TYPOLOGY del
-- Monitor restava vuota, con l'invito "Set typology..." — anche quando il
-- device era assegnato correttamente e visibile nel dettaglio. Il caso che l'ha
-- mostrato: 563 Götgatan, un WELL ClAir online, un sensore contato, tipologia
-- vuota.
--
-- Il motivo: `air_product_ids` era un campo che nessuno riempiva. Non lo
-- scriveva l'assegnazione hardware (AssignToSiteDialog per l'aria non tocca
-- questa tabella) e non lo scriveva il ricalcolo. Si popolava solo a mano,
-- dall'editor nel Monitor Hub. Misurato: 46 righe hanno apparecchi assegnati e
-- tipologia vuota, 100 righe in attesa idem, 9 dichiarano una tipologia che
-- non coincide col numero di apparecchi.
--
-- ── La regola, la stessa dei contatori ─────────────────────────────────────
--
--   • Ci sono apparecchi → la tipologia È quella degli apparecchi. La realtà
--     fisica vince: se al posto di un CO2 è stato montato un WELL, il Monitor
--     deve dire WELL.
--   • Non ci sono apparecchi e la tipologia è vuota → si mostra il MIX
--     RICHIESTO, preso dalle allocazioni. È il caso di Offices HQ: 20 sensori
--     senza modello, quando la richiesta diceva 15 CO-CO2 e 5 WELL.
--   • Non ci sono apparecchi ma la tipologia è già scritta → non si tocca. È
--     la scelta di Monitoring su cosa installare, e precede la consegna.
--
-- L'array contiene una voce per unità, non per modello: è così che il frontend
-- conta le quantità per tipo.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_air_typology_for_site(p_site_id uuid)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_from_hw uuid[];
  v_from_req uuid[];
BEGIN
  IF p_site_id IS NULL THEN RETURN NULL; END IF;

  -- Gli apparecchi realmente assegnati, uno per unità.
  SELECT array_agg(h.product_id ORDER BY h.device_id)
    INTO v_from_hw
    FROM public.hardwares h
   WHERE h.site_id = p_site_id
     AND h.category = 'AIR'
     AND h.status <> 'In Stock'
     AND h.product_id IS NOT NULL;

  IF COALESCE(cardinality(v_from_hw), 0) > 0 THEN
    RETURN v_from_hw;
  END IF;

  -- Nessun apparecchio: il mix richiesto, espanso in una voce per unità.
  SELECT array_agg(x.pid)
    INTO v_from_req
    FROM (
      SELECT pa.product_id AS pid
        FROM public.project_allocations pa
        JOIN public.certifications c ON c.id = pa.certification_id
        LEFT JOIN public.products p ON p.id = pa.product_id
        CROSS JOIN LATERAL generate_series(
          1, GREATEST(COALESCE(pa.requested_quantity, pa.quantity, 0), 0)
        )
       WHERE c.site_id = p_site_id
         AND pa.product_id IS NOT NULL
         AND lower(COALESCE(pa.status,'')) NOT IN ('replaced','canceled','cancelled','rejected')
         AND (pa.category ILIKE '%AIR%' OR pa.category ILIKE '%IAQ%'
           OR p.category ILIKE '%AIR%' OR p.category ILIKE '%IAQ%')
    ) x;

  RETURN v_from_req;
END;
$function$;

COMMENT ON FUNCTION public.fn_air_typology_for_site(uuid) IS
  'Il mix di modelli aria di un sito: gli apparecchi assegnati se esistono, altrimenti il mix richiesto dalle allocazioni. Una voce per unità, non per modello.';

-- ── Il ricalcolo scrive anche la tipologia ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_sync_air_typology(p_site_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_new uuid[];
  v_has_hw boolean;
BEGIN
  IF p_site_id IS NULL THEN RETURN; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.hardwares h
     WHERE h.site_id = p_site_id AND h.category = 'AIR' AND h.status <> 'In Stock'
  ) INTO v_has_hw;

  v_new := public.fn_air_typology_for_site(p_site_id);

  UPDATE public.site_air_records r
     SET air_product_ids = v_new,
         updated_at = now()
   WHERE r.site_id = p_site_id
     -- Con apparecchi comanda la realta'. Senza, si riempie solo il vuoto: una
     -- tipologia gia' scelta da Monitoring resta la sua.
     AND (v_has_hw OR COALESCE(cardinality(r.air_product_ids), 0) = 0)
     AND COALESCE(cardinality(v_new), 0) > 0
     AND r.air_product_ids IS DISTINCT FROM v_new;
END;
$function$;

COMMENT ON FUNCTION public.fn_sync_air_typology(uuid) IS
  'Allinea site_air_records.air_product_ids alla realta'': gli apparecchi assegnati quando ci sono, altrimenti il mix richiesto se la tipologia e'' ancora vuota. Non sovrascrive mai una scelta gia'' fatta da Monitoring su una riga senza apparecchi.';

-- ── Si aggancia agli stessi eventi che gia' ricalcolano la riga ────────────
CREATE OR REPLACE FUNCTION public.trg_refresh_air_on_hardware()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.site_id IS DISTINCT FROM OLD.site_id THEN
    PERFORM public.fn_recalculate_site_air(OLD.site_id);
    PERFORM public.fn_sync_air_typology(OLD.site_id);
  END IF;
  PERFORM public.fn_recalculate_site_air(COALESCE(NEW.site_id, OLD.site_id));
  PERFORM public.fn_sync_air_typology(COALESCE(NEW.site_id, OLD.site_id));
  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'trg_refresh_air_on_hardware: %', SQLERRM;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_air_project_allocation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_site uuid;
BEGIN
  SELECT c.site_id INTO v_site
    FROM public.certifications c
   WHERE c.id = COALESCE(NEW.certification_id, OLD.certification_id);

  IF v_site IS NOT NULL THEN
    PERFORM public.fn_recalculate_site_air(v_site);
    PERFORM public.fn_sync_air_typology(v_site);
  END IF;

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'trg_air_project_allocation: %', SQLERRM;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- ── Allineamento di quanto c'e' oggi ───────────────────────────────────────
DO $backfill$
DECLARE
  r record;
  v_n integer := 0;
BEGIN
  CREATE TABLE IF NOT EXISTS public._bak_air_typology AS
    SELECT id, site_id, air_product_ids, now() AS _bak_at
    FROM public.site_air_records WHERE false;

  INSERT INTO public._bak_air_typology
    SELECT id, site_id, air_product_ids, now() FROM public.site_air_records;

  FOR r IN SELECT site_id FROM public.site_air_records WHERE site_id IS NOT NULL
  LOOP
    PERFORM public.fn_sync_air_typology(r.site_id);
    v_n := v_n + 1;
  END LOOP;

  RAISE NOTICE 'tipologia allineata su % siti', v_n;
END;
$backfill$;

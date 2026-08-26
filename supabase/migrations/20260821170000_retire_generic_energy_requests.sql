-- ============================================================================
-- Monitor · Energy — il segnaposto si ritira quando Monitoring prende in carico
--
-- Il processo, come deciso:
--
--   1. il PM chiede un "Greeny", senza saper dire quanti pezzi servono
--   2. Monitoring stima con il CT Builder — e la stima resta una STIMA: non
--      diventa fabbisogno, non entra nell'ordine di produzione
--   3. Monitoring assegna gli apparecchi A MANO, anche meno di quanti stimati
--   4. da quel momento fa fede l'assegnazione
--
-- Manca il ritiro del cartello. "Greeny Energy Monitoring System" e' un sistema,
-- non un dispositivo: in magazzino di apparecchi Greeny ce ne sono ZERO, quindi
-- quell'allocazione non potra' MAI essere soddisfatta assegnando hardware e
-- resterebbe 'Requested' per sempre — cioe' domanda inevasa su un progetto gia'
-- servito. Oggi succede su Milan, Galleria Vittorio Emanuele II: 7 apparecchi
-- montati e il suo Greeny ancora in attesa.
--
-- ── La regola ──────────────────────────────────────────────────────────────
--
-- Quando a un sito viene assegnato il primo apparecchio Energy, le richieste
-- generiche di quel progetto passano a 'replaced'. E' lo stato che
-- useRequestedDemand gia' scarta come morto, ed e' la parola giusta: la
-- richiesta generica non e' stata evasa, e' stata SUPERATA da qualcosa di piu'
-- preciso — gli apparecchi veri.
--
-- `replaced_by_allocation_id` resta NULL di proposito: a sostituire il
-- segnaposto non e' un'altra allocazione ma l'assegnazione fisica. La colonna
-- serve per la catena allocazione→allocazione, che qui non c'e'.
--
-- ── Cosa conta come "richiesta generica" ───────────────────────────────────
--
-- Due casi, in OR:
--   • is_generic_placeholder = true — il flag che scrive PMProjectConfigModal
--   • il prodotto e' il Greeny — perche' i PM lo richiedono anche senza flag:
--     delle 5 allocazioni Greeny in tabella una sola ce l'ha
--
-- Il nome del prodotto e' scritto qui esplicitamente, ed e' l'unico punto
-- fragile di questa migration: se un domani nascesse un altro prodotto-sistema
-- andrebbe aggiunto. La soluzione duratura sarebbe una colonna su `products`
-- che dica "questo e' un sistema, non un pezzo"; non la aggiungo adesso perche'
-- e' un cambiamento di schema piu' invasivo di quanto serva per chiudere questo
-- caso.
--
-- Si ritirano solo le richieste in stato 'Requested'. Una Greeny gia'
-- 'Installed_Online' — Smart Up HANNOVER e HOF — e' fuori dalla domanda per
-- conto suo e non va toccata: dice che quel sistema e' in funzione.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_retire_generic_energy_requests(p_site_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_n integer;
BEGIN
  IF p_site_id IS NULL THEN RETURN; END IF;

  -- Solo se il monitoraggio ha davvero preso in carico: almeno un apparecchio
  -- Energy assegnato, stock libero escluso.
  IF NOT EXISTS (
    SELECT 1 FROM public.hardwares h
     WHERE h.site_id = p_site_id
       AND h.category = 'Energy'
       AND h.status <> 'In Stock'
  ) THEN
    RETURN;
  END IF;

  UPDATE public.project_allocations pa
     SET status = 'replaced'
    FROM public.certifications c
   WHERE c.id = pa.certification_id
     AND c.site_id = p_site_id
     AND pa.status = 'Requested'
     AND (
       COALESCE(pa.is_generic_placeholder, false)
       OR EXISTS (
         SELECT 1 FROM public.products p
          WHERE p.id = pa.product_id
            AND p.name ILIKE '%greeny%'
       )
     )
     AND (
       pa.category ILIKE '%ENERGY%'
       OR EXISTS (SELECT 1 FROM public.products p2
                   WHERE p2.id = pa.product_id AND p2.category ILIKE '%ENERGY%')
     );

  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN
    RAISE NOTICE 'Richieste generiche ritirate sul sito %: %', p_site_id, v_n;
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.fn_retire_generic_energy_requests(uuid) IS
  'Porta a ''replaced'' le richieste generiche di energia (flag is_generic_placeholder, oppure prodotto Greeny) di un sito, non appena a quel sito viene assegnato il primo apparecchio Energy. Il segnaposto non viene evaso ma superato: a sostituirlo e'' l''assegnazione fisica, non un''altra allocazione.';

-- ── Lo stesso trigger che ricalcola i contatori ritira anche il cartello ───
CREATE OR REPLACE FUNCTION public.trg_refresh_energy_on_hardware()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.site_id IS DISTINCT FROM OLD.site_id THEN
    PERFORM public.fn_recalculate_site_energy(OLD.site_id);
  END IF;
  PERFORM public.fn_recalculate_site_energy(COALESCE(NEW.site_id, OLD.site_id));
  PERFORM public.fn_retire_generic_energy_requests(COALESCE(NEW.site_id, OLD.site_id));
  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'trg_refresh_energy_on_hardware: %', SQLERRM;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- ── Backfill: i progetti gia' serviti che hanno ancora il cartello ─────────
DO $backfill$
DECLARE
  r record;
  v_n integer := 0;
BEGIN
  CREATE TABLE IF NOT EXISTS public._bak_generic_energy_requests AS
    SELECT pa.*, now() AS _bak_at
    FROM public.project_allocations pa
    WHERE pa.status = 'Requested'
      AND (COALESCE(pa.is_generic_placeholder, false)
           OR EXISTS (SELECT 1 FROM public.products p WHERE p.id = pa.product_id AND p.name ILIKE '%greeny%'));

  FOR r IN
    SELECT DISTINCT site_id FROM public.hardwares
     WHERE category = 'Energy' AND status <> 'In Stock' AND site_id IS NOT NULL
  LOOP
    PERFORM public.fn_retire_generic_energy_requests(r.site_id);
    v_n := v_n + 1;
  END LOOP;

  RAISE NOTICE 'ritiro segnaposto: % siti valutati', v_n;
END;
$backfill$;

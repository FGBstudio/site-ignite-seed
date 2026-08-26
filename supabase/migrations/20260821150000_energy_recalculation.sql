-- ============================================================================
-- Monitor · Energy — i pezzi assegnati si contano da soli
--
-- La regola concordata, nelle parole in cui e' stata detta: comanda la
-- richiesta finche' la richiesta non viene presa in carico dal monitoraggio;
-- quando vengono assegnati gli apparecchi, da quel momento comanda
-- l'assegnazione. Il CT Builder definisce cosa serve, chi installa puo' montare
-- un modello diverso per esigenze di campo, e fa fede cio' che e' stato
-- realmente collegato.
--
-- E' la stessa regola gia' in vigore per l'aria, dove total_sensors vale la
-- richiesta finche' non c'e' hardware e i pezzi prodotti appena ce n'e'.
--
-- ── Cosa non funzionava ────────────────────────────────────────────────────
--
-- Le colonne total_bridges / no_pan10 / no_pan12 / no_pan14 / total_sensors
-- avevano due scrittori:
--
--   EnergyMonitoringPanel  ci scrive il PIANO del CT Builder, e marca la riga
--                          locked = true salvando ct_builder_snapshot
--   AssignToSiteDialog     ci scrive i PEZZI ASSEGNATI, sovrascrivendo il piano
--
-- Il passaggio di consegne avveniva quindi gia', ed era pure nell'ordine
-- giusto — ma una volta sola e senza ritorno: se un apparecchio veniva poi
-- rimosso o riassegnato, i numeri restavano fermi all'ultimo salvataggio.
-- Nessuno li ricalcolava. Misurato il 2026-08-21: le colonne dichiarano 801
-- apparecchi contro gli 813 realmente assegnati, e 5 righe dichiarano zero pur
-- avendo device sul sito.
--
-- ── Cosa fa questa funzione ────────────────────────────────────────────────
--
-- Conta gli apparecchi Energy davvero assegnati al sito, per tipo, e li scrive
-- nelle colonne. Se sul sito non c'e' nessun apparecchio NON tocca niente: il
-- piano del CT Builder resta intatto ed e' lui a comandare, esattamente come
-- da regola. Non crea mai una riga che non esiste.
--
-- I tipi vivono su hardwares.hardware_type e sono sei: FGB-10, FGB-12, FGB-14,
-- Bridge-LAN, Bridge-LTE, Mango. La classificazione e' la stessa che fa
-- useMonitorRows in TypeScript, cosi' il report e la tabella non possono
-- divergere.
--
-- ── Il limite, dichiarato ──────────────────────────────────────────────────
--
-- `hardwares` ha solo site_id: un apparecchio sa a quale LUOGO appartiene, non
-- a quale certificazione. Su un sito con due progetti energia — oggi tre siti:
-- Los Angeles Rodeo Drive, Prada Oslo, London Regent Street — non c'e' modo di
-- dire quale dei due ha ricevuto quali pezzi. In quel caso i pezzi vengono
-- attribuiti alla riga piu' significativa (certification viva, con allocazioni
-- energia, con un nome) e le altre righe restano col loro piano, non azzerate:
-- meglio una attribuzione dichiarata che la distruzione di un piano.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_recalculate_site_energy(p_site_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_bridges integer := 0;
  v_pan10   integer := 0;
  v_pan12   integer := 0;
  v_pan14   integer := 0;
  v_mango   integer := 0;
  v_totale  integer := 0;
  v_record  uuid;
BEGIN
  IF p_site_id IS NULL THEN RETURN; END IF;

  -- Apparecchi Energy realmente assegnati: escluso lo stock libero, che non
  -- appartiene ancora a nessun progetto.
  SELECT
    COUNT(*) FILTER (WHERE upper(COALESCE(h.hardware_type,'')) LIKE '%BRIDGE%'),
    COUNT(*) FILTER (WHERE upper(COALESCE(h.hardware_type,'')) LIKE '%10%'
                       AND upper(COALESCE(h.hardware_type,'')) NOT LIKE '%BRIDGE%'),
    COUNT(*) FILTER (WHERE upper(COALESCE(h.hardware_type,'')) LIKE '%12%'
                       AND upper(COALESCE(h.hardware_type,'')) NOT LIKE '%BRIDGE%'),
    COUNT(*) FILTER (WHERE upper(COALESCE(h.hardware_type,'')) LIKE '%14%'
                       AND upper(COALESCE(h.hardware_type,'')) NOT LIKE '%BRIDGE%'),
    COUNT(*) FILTER (WHERE upper(COALESCE(h.hardware_type,'')) LIKE '%MANGO%'),
    COUNT(*)
  INTO v_bridges, v_pan10, v_pan12, v_pan14, v_mango, v_totale
  FROM public.hardwares h
  WHERE h.site_id = p_site_id
    AND h.category = 'Energy'
    AND h.status <> 'In Stock';

  -- Nessun apparecchio: comanda ancora la richiesta. Non si tocca nulla —
  -- azzerare qui distruggerebbe il piano del CT Builder.
  IF COALESCE(v_totale, 0) = 0 THEN
    RETURN;
  END IF;

  -- La riga a cui attribuire i pezzi: la piu' significativa fra quelle del
  -- sito, con lo stesso criterio usato per l'aria.
  SELECT ser.id
  INTO v_record
  FROM public.site_energy_records ser
  LEFT JOIN public.certifications c ON c.id = ser.certification_id
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS n
    FROM public.project_allocations pa
    LEFT JOIN public.products p ON p.id = pa.product_id
    WHERE pa.certification_id = ser.certification_id
      AND lower(COALESCE(pa.status,'')) NOT IN ('replaced','canceled','cancelled','rejected')
      AND (pa.category ILIKE '%ENERGY%' OR p.category ILIKE '%ENERGY%')
  ) alloc ON true
  WHERE ser.site_id = p_site_id
  ORDER BY
    (lower(COALESCE(c.status,'')) NOT IN ('canceled','cancelled')) DESC,
    (alloc.n > 0) DESC,
    (COALESCE(btrim(c.name), '') <> '') DESC,
    ser.created_at DESC
  LIMIT 1;

  -- Nessuna riga da aggiornare: non se ne crea una. Un sito con apparecchi ma
  -- senza progetto energia registrato e' un caso da guardare, non da inventare.
  IF v_record IS NULL THEN RETURN; END IF;

  UPDATE public.site_energy_records
     SET total_bridges = v_bridges,
         no_pan10      = v_pan10,
         no_pan12      = v_pan12,
         no_pan14      = v_pan14,
         no_mango      = v_mango,
         total_sensors = v_pan10 + v_pan12 + v_pan14,
         updated_at    = now()
   WHERE id = v_record
     AND (total_bridges, no_pan10, no_pan12, no_pan14, no_mango, total_sensors)
         IS DISTINCT FROM (v_bridges, v_pan10, v_pan12, v_pan14, v_mango, v_pan10 + v_pan12 + v_pan14);
END;
$function$;

COMMENT ON FUNCTION public.fn_recalculate_site_energy(uuid) IS
  'Scrive nei contatori di site_energy_records gli apparecchi Energy realmente assegnati al sito, per tipo. Se il sito non ha apparecchi non tocca nulla: comanda il piano del CT Builder finche'' il monitoraggio non prende in carico la richiesta. Non crea mai righe.';

COMMENT ON COLUMN public.site_energy_records.total_sensors IS
  'Sensori del progetto energia. Finche'' il sito non ha apparecchi Energy assegnati e'' il PIANO del CT Builder; dal primo apparecchio assegnato sono i pezzi REALMENTE collegati, ricalcolati da fn_recalculate_site_energy a ogni movimento di hardware. Il piano originale resta consultabile in ct_builder_snapshot.';

-- ── Il trigger: gli apparecchi che si muovono aggiornano i conti ───────────
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
  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'trg_refresh_energy_on_hardware: %', SQLERRM;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_refresh_energy_on_hardware ON public.hardwares;
CREATE TRIGGER trg_refresh_energy_on_hardware
  AFTER INSERT OR UPDATE OR DELETE ON public.hardwares
  FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_energy_on_hardware();

-- ── Un indice unico di troppo ──────────────────────────────────────────────
-- site_energy_records_certification_uniq e site_energy_records_certification_id_uniq
-- sono lo stesso indice scritto due volte: stessa tabella, stessa colonna,
-- entrambi UNIQUE. Costano due scritture per ogni riga e non aggiungono nulla.
DROP INDEX IF EXISTS public.site_energy_records_certification_uniq;

-- ── Backfill ───────────────────────────────────────────────────────────────
DO $backfill$
DECLARE
  r record;
  v_n integer := 0;
BEGIN
  CREATE TABLE IF NOT EXISTS public._bak_energy_counters AS
    SELECT id, certification_id, site_id, total_sensors, total_bridges,
           no_pan10, no_pan12, no_pan14, no_mango, now() AS _bak_at
    FROM public.site_energy_records;

  FOR r IN
    SELECT DISTINCT site_id FROM public.hardwares
     WHERE category = 'Energy' AND status <> 'In Stock' AND site_id IS NOT NULL
  LOOP
    PERFORM public.fn_recalculate_site_energy(r.site_id);
    v_n := v_n + 1;
  END LOOP;

  RAISE NOTICE 'fn_recalculate_site_energy: % siti ricalcolati', v_n;
END;
$backfill$;

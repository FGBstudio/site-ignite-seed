-- ============================================================================
-- Monitor · Energy — il piano non si perde quando l'assegnazione prende il posto
--
-- La regola e' quella concordata: comanda la richiesta finche' il monitoraggio
-- non prende in carico; dal primo apparecchio assegnato comanda l'assegnazione.
-- 20260821150000 ha implementato la seconda meta' — i contatori si ricalcolano
-- da `hardwares` a ogni movimento — ma ha lasciato scoperta la prima: nel
-- momento del passaggio di consegne il piano viene sovrascritto e sparisce.
--
-- Avevo scritto che restava consultabile in `ct_builder_snapshot`. Era falso:
-- lo snapshot e' valorizzato su 1 riga su 88. E il piano non vive nemmeno in
-- project_allocations come accade per l'aria — le allocazioni ENERGY sono 14 in
-- tutto, contro 103 AIR, e il CT Builder non ne crea. Per l'energia il piano
-- SONO i contatori, e non ha nessun altro posto dove stare.
--
-- Il danno era gia' avvenuto: il backfill di 20260821150000 ha riscritto 16
-- righe, alcune con scarti che dicono qualcosa —
--
--     Hong Kong, Canton Road      piano 19  →  assegnati 10
--     Beverly Hills, Rodeo Drive  piano 23  →  assegnati 11
--     Monaco, One Monte-Carlo     piano 17  →  assegnati  5
--
-- — e quei numeri sopravvivevano solo in _bak_energy_counters, che e' una
-- tabella di servizio, non un posto dove un'applicazione va a leggere.
--
-- ── La memoria ─────────────────────────────────────────────────────────────
--
-- Si aggiunge `planned_counts`: i contatori come stavano nell'istante prima che
-- l'assegnazione prendesse il controllo. Si scrive UNA volta sola e non si
-- tocca piu', esattamente come baseline_handover_date fa con la data promessa.
--
-- E' anche il discriminante che mancava. `status` non puo' farlo — misurato:
-- 28 righe 'Upcoming' hanno apparecchi e 8 righe non-'Upcoming' non ne hanno,
-- quindi quella colonna descrive la fase del progetto, non chi comanda i
-- numeri. La regola diventa leggibile da sola:
--
--     planned_counts IS NULL      →  i contatori sono ancora la RICHIESTA
--     planned_counts valorizzato  →  i contatori sono l'ASSEGNAZIONE,
--                                    e la richiesta di allora sta li' dentro
--
-- ── Onesta' sul backfill ───────────────────────────────────────────────────
--
-- Per le 16 righe gia' riscritte si recupera il valore da _bak_energy_counters.
-- Va detto cos'e' davvero: e' il contatore com'era ieri, non necessariamente il
-- piano originale del CT Builder — se AssignToSiteDialog lo aveva gia'
-- sovrascritto in passato, quello che si recupera e' una assegnazione
-- precedente. E' il dato piu' vecchio che esista; piu' indietro non si va,
-- perche' nessuno lo aveva conservato.
--
-- Le righe il cui sito ha apparecchi ma i cui contatori gia' coincidevano non
-- ricevono nulla: li' il piano era gia' stato perso prima, e inventarlo
-- copiando l'assegnazione significherebbe dichiarare uno scarto zero che non
-- e' mai stato misurato.
-- ============================================================================

ALTER TABLE public.site_energy_records
  ADD COLUMN IF NOT EXISTS planned_counts jsonb;

COMMENT ON COLUMN public.site_energy_records.planned_counts IS
  'I contatori come stavano prima che l''assegnazione degli apparecchi prendesse il controllo: {bridges, pan10, pan12, pan14, mango, sensors, frozen_at}. Scritto una volta sola da fn_recalculate_site_energy e mai piu'' modificato. NULL significa che il monitoraggio non ha ancora preso in carico la richiesta e che i contatori sono tuttora il piano.';

-- ── La funzione, con la memoria ────────────────────────────────────────────
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
  v_record  record;
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

  -- Nessun apparecchio: comanda ancora la richiesta, non si tocca nulla.
  IF COALESCE(v_totale, 0) = 0 THEN
    RETURN;
  END IF;

  -- La riga a cui attribuire gli apparecchi: la piu' significativa fra quelle
  -- del sito. `hardwares` porta solo site_id, quindi su un sito con due
  -- progetti energia non c'e' modo di sapere quale ha ricevuto cosa; le altre
  -- righe restano col loro piano, non azzerate.
  SELECT ser.id, ser.planned_counts,
         ser.total_bridges, ser.no_pan10, ser.no_pan12, ser.no_pan14,
         ser.no_mango, ser.total_sensors
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

  IF v_record.id IS NULL THEN RETURN; END IF;

  -- Niente da fare se i numeri gia' coincidono: si evita anche di congelare
  -- una memoria che sarebbe identica all'assegnazione.
  IF (v_record.total_bridges, v_record.no_pan10, v_record.no_pan12,
      v_record.no_pan14, v_record.no_mango, v_record.total_sensors)
     IS NOT DISTINCT FROM
     (v_bridges, v_pan10, v_pan12, v_pan14, v_mango, v_pan10 + v_pan12 + v_pan14)
  THEN
    RETURN;
  END IF;

  UPDATE public.site_energy_records
     SET planned_counts = COALESCE(
           planned_counts,
           jsonb_build_object(
             'bridges', COALESCE(v_record.total_bridges, 0),
             'pan10',   COALESCE(v_record.no_pan10, 0),
             'pan12',   COALESCE(v_record.no_pan12, 0),
             'pan14',   COALESCE(v_record.no_pan14, 0),
             'mango',   COALESCE(v_record.no_mango, 0),
             'sensors', COALESCE(v_record.total_sensors, 0),
             'frozen_at', now()
           )
         ),
         total_bridges = v_bridges,
         no_pan10      = v_pan10,
         no_pan12      = v_pan12,
         no_pan14      = v_pan14,
         no_mango      = v_mango,
         total_sensors = v_pan10 + v_pan12 + v_pan14,
         updated_at    = now()
   WHERE id = v_record.id;
END;
$function$;

COMMENT ON FUNCTION public.fn_recalculate_site_energy(uuid) IS
  'Scrive nei contatori di site_energy_records gli apparecchi Energy realmente assegnati al sito. Se il sito non ha apparecchi non tocca nulla: comanda il piano finche'' il monitoraggio non prende in carico la richiesta. Al primo passaggio di consegne congela in planned_counts i contatori com''erano, una volta sola. Non crea mai righe.';

-- ── Recupero delle 16 righe gia' riscritte ─────────────────────────────────
DO $recupero$
DECLARE
  v_n integer;
BEGIN
  UPDATE public.site_energy_records ser
     SET planned_counts = jsonb_build_object(
           'bridges', COALESCE(b.total_bridges, 0),
           'pan10',   COALESCE(b.no_pan10, 0),
           'pan12',   COALESCE(b.no_pan12, 0),
           'pan14',   COALESCE(b.no_pan14, 0),
           'mango',   COALESCE(b.no_mango, 0),
           'sensors', COALESCE(b.total_sensors, 0),
           'frozen_at', b._bak_at,
           'recuperato_da', '_bak_energy_counters'
         )
    FROM public._bak_energy_counters b
   WHERE b.id = ser.id
     AND ser.planned_counts IS NULL
     AND (ser.total_bridges, ser.no_pan10, ser.no_pan12, ser.no_pan14, ser.no_mango, ser.total_sensors)
         IS DISTINCT FROM (b.total_bridges, b.no_pan10, b.no_pan12, b.no_pan14, b.no_mango, b.total_sensors);

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'planned_counts recuperato su % righe', v_n;
END;
$recupero$;

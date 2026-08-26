-- ============================================================================
-- Sites · il monitoraggio si accende quando arrivano i dati
--
-- Il sito e' un luogo: un marker sulla mappa a cui si agganciano certificazioni
-- e monitor. Quali monitor abbia non e' una cosa da dichiarare a mano, e' una
-- conseguenza di cio' che gli e' attaccato — e la prova piu' forte che un
-- monitor esiste ed e' vivo e' che stia trasmettendo.
--
-- Oggi non funziona cosi', e il risultato e' che i dati ci sono ma il cliente
-- non li vede:
--
--   145 siti hanno letture iaq.* in telemetry_latest e module_air_enabled = false
--    14 siti hanno letture di energia e module_energy_enabled = false
--
-- Sono sensori installati, online, che trasmettono in un modulo spento.
--
-- ── Tre pezzi ──────────────────────────────────────────────────────────────
--
-- 1. UN SOLO VOCABOLARIO. `sites.monitoring_types` conteneva due grafie
--    incompatibili: 'air_quality' (67 siti, scritta dall'import storico) e
--    'AIR' (106 siti, scritta da sync_site_monitoring_from_certs). La dash
--    mappa traduce SOLO la prima — mapDbMonitoringTypeToFrontend in
--    useRealTimeData.ts accetta air_quality / energy_monitor / water_monitor —
--    quindi i 106 siti maiuscoli risultavano privi di monitoraggio sulla mappa
--    pur avendone. Anche fn_recalculate_site_air legge solo 'air_quality'.
--    Qui si normalizza: AIR → air_quality, ENERGY → energy_monitor,
--    WATER → water_monitor.
--
-- 2. LA TELEMETRIA ACCENDE IL MODULO. Quando arriva una lettura per un sito,
--    il dominio corrispondente viene acceso: modulo abilitato e tipo di
--    monitoraggio aggiunto. iaq.* ed env.* sono aria (il ClAir misura anche
--    temperatura e umidita'), energy.* e internal.calc_kw sono energia,
--    water.* acqua.
--
--    Il trigger sta su telemetry_latest — una riga per dispositivo e metrica,
--    2.400 righe in tutto — e non sulla telemetria grezza, che ne ha 48
--    milioni. E' scritto per costare quasi nulla a regime: l'UPDATE ha nel
--    WHERE la condizione "modulo ancora spento", quindi dalla seconda lettura
--    in poi tocca zero righe.
--
-- 3. LE DICHIARAZIONI NON SPENGONO PIU' NULLA. sync_site_monitoring_from_certs
--    ricalcolava monitoring_types dai flag has_iaq/has_energy/has_water delle
--    certification e li SOVRASCRIVEVA. Ma quei flag sono false su 1.100
--    certification su 1.141: non sono una negazione, sono un campo non
--    compilato. Trattarli come negazione e' cio' che, durante le deduplica di
--    ieri, cancellava il marcatore ai siti che i sensori ce li avevano.
--    Da qui in poi la funzione AGGIUNGE soltanto: una certification che
--    dichiara il monitoraggio lo accende, una che non lo dichiara lascia le
--    cose come stanno. Spegnere resta possibile, ma va fatto sul sito, di
--    proposito.
--
-- ── Cosa NON fa ────────────────────────────────────────────────────────────
--
-- Non spegne mai un modulo. Se un sito ha module_air_enabled = true per scelta
-- — un progetto in arrivo, una demo — resta acceso anche senza telemetria.
-- L'accensione automatica e' un pavimento, non un interruttore a due vie.
-- ============================================================================

-- ── 1) Un solo vocabolario ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public._bak_monitoring_types_vocab AS
  SELECT id, monitoring_types, module_air_enabled, module_energy_enabled, module_water_enabled, now() AS _bak_at
  FROM public.sites
  WHERE monitoring_types && ARRAY['AIR', 'ENERGY', 'WATER'];

UPDATE public.sites
   SET monitoring_types = (
         SELECT array_agg(DISTINCT canonico)
         FROM unnest(monitoring_types) AS t(valore)
         CROSS JOIN LATERAL (
           SELECT CASE upper(valore)
                    WHEN 'AIR'   THEN 'air_quality'
                    WHEN 'ENERGY' THEN 'energy_monitor'
                    WHEN 'WATER' THEN 'water_monitor'
                    ELSE valore
                  END
         ) AS c(canonico)
       ),
       updated_at = now()
 WHERE monitoring_types && ARRAY['AIR', 'ENERGY', 'WATER'];

-- ── 2) Il dominio di una metrica ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_monitoring_domain_of_metric(p_metric text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE
           WHEN p_metric LIKE 'iaq.%'  THEN 'air'
           -- temperatura e umidita' arrivano dal sensore aria
           WHEN p_metric LIKE 'env.%'  THEN 'air'
           WHEN p_metric LIKE 'energy.%' THEN 'energy'
           WHEN p_metric = 'internal.calc_kw' THEN 'energy'
           WHEN p_metric LIKE 'water.%' THEN 'water'
           ELSE NULL
         END;
$function$;

-- ── 3) Accendere un dominio su un sito ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_enable_monitoring_domain(p_site_id uuid, p_domain text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tipo text;
BEGIN
  IF p_site_id IS NULL OR p_domain IS NULL THEN RETURN; END IF;

  v_tipo := CASE p_domain
              WHEN 'air'    THEN 'air_quality'
              WHEN 'energy' THEN 'energy_monitor'
              WHEN 'water'  THEN 'water_monitor'
            END;
  IF v_tipo IS NULL THEN RETURN; END IF;

  -- Il WHERE fa tutto il lavoro: dalla seconda lettura in poi non c'e' niente
  -- da aggiornare e l'UPDATE tocca zero righe.
  UPDATE public.sites
     SET module_air_enabled    = CASE WHEN p_domain = 'air'    THEN true ELSE module_air_enabled END,
         module_energy_enabled = CASE WHEN p_domain = 'energy' THEN true ELSE module_energy_enabled END,
         module_water_enabled  = CASE WHEN p_domain = 'water'  THEN true ELSE module_water_enabled END,
         monitoring_types      = CASE
                                   WHEN v_tipo = ANY(COALESCE(monitoring_types, ARRAY[]::text[]))
                                     THEN monitoring_types
                                   ELSE array_append(COALESCE(monitoring_types, ARRAY[]::text[]), v_tipo)
                                 END,
         updated_at            = now()
   WHERE id = p_site_id
     AND (
       NOT (v_tipo = ANY(COALESCE(monitoring_types, ARRAY[]::text[])))
       OR (p_domain = 'air'    AND NOT COALESCE(module_air_enabled, false))
       OR (p_domain = 'energy' AND NOT COALESCE(module_energy_enabled, false))
       OR (p_domain = 'water'  AND NOT COALESCE(module_water_enabled, false))
     );
END;
$function$;

COMMENT ON FUNCTION public.fn_enable_monitoring_domain(uuid, text) IS
  'Accende un dominio di monitoraggio su un sito: flag di modulo e tipo in monitoring_types. Non spegne mai nulla — l''accensione automatica e'' un pavimento, non un interruttore a due vie.';

-- ── 4) Il trigger sulla telemetria ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_modules_from_telemetry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.fn_enable_monitoring_domain(
    NEW.site_id,
    public.fn_monitoring_domain_of_metric(NEW.metric)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- L'ingestione della telemetria non deve mai fallire per colpa di questo.
  RAISE NOTICE 'trg_modules_from_telemetry: %', SQLERRM;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_telemetry_latest_enables_modules ON public.telemetry_latest;
CREATE TRIGGER trg_telemetry_latest_enables_modules
  AFTER INSERT OR UPDATE ON public.telemetry_latest
  FOR EACH ROW EXECUTE FUNCTION public.trg_modules_from_telemetry();

-- ── 5) Le dichiarazioni aggiungono, non tolgono ────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_site_monitoring_from_certs(p_site_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_has_iaq boolean; v_has_energy boolean; v_has_water boolean;
  v_project text; v_cert RECORD;
BEGIN
  IF p_site_id IS NULL THEN RETURN; END IF;

  SELECT bool_or(COALESCE(has_iaq_monitoring,false)),
         bool_or(COALESCE(has_energy_monitoring,false)),
         bool_or(COALESCE(has_water_monitoring,false))
    INTO v_has_iaq, v_has_energy, v_has_water
    FROM public.certifications WHERE site_id = p_site_id;

  v_has_iaq    := COALESCE(v_has_iaq,false);
  v_has_energy := COALESCE(v_has_energy,false);
  v_has_water  := COALESCE(v_has_water,false);

  -- Solo accensioni. Prima qui c'era un UPDATE che riscriveva monitoring_types
  -- e i tre flag da zero: con i flag delle certification quasi sempre false,
  -- quel ricalcolo spegneva il monitoraggio a siti che i sensori li avevano
  -- installati e funzionanti.
  IF v_has_iaq    THEN PERFORM public.fn_enable_monitoring_domain(p_site_id, 'air');    END IF;
  IF v_has_energy THEN PERFORM public.fn_enable_monitoring_domain(p_site_id, 'energy'); END IF;
  IF v_has_water  THEN PERFORM public.fn_enable_monitoring_domain(p_site_id, 'water');  END IF;

  SELECT name INTO v_project FROM public.sites WHERE id = p_site_id;

  SELECT id, pm_id, handover_date, name
    INTO v_cert
    FROM public.certifications
   WHERE site_id = p_site_id
   ORDER BY created_at DESC LIMIT 1;

  IF v_cert.id IS NULL THEN RETURN; END IF;

  IF v_has_iaq THEN
    INSERT INTO public.site_air_records (site_id, certification_id, pm_id, project_name, status)
    VALUES (p_site_id, v_cert.id, v_cert.pm_id, COALESCE(v_project, v_cert.name, 'Site'), 'Requested')
    ON CONFLICT (site_id) DO UPDATE SET
      certification_id = COALESCE(public.site_air_records.certification_id, EXCLUDED.certification_id),
      pm_id = COALESCE(public.site_air_records.pm_id, EXCLUDED.pm_id),
      project_name = COALESCE(public.site_air_records.project_name, EXCLUDED.project_name),
      updated_at = now();

    IF v_cert.pm_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.task_alerts
       WHERE certification_id = v_cert.id AND alert_type='monitoring_iaq_requested' AND is_resolved=false
    ) THEN
      INSERT INTO public.task_alerts (certification_id, created_by, alert_type, title, description, escalate_to_admin, is_resolved, target_route)
      VALUES (v_cert.id, v_cert.pm_id, 'monitoring_iaq_requested',
              'IAQ monitoring requested',
              'IAQ monitoring flagged on certification ' || COALESCE(v_cert.name,''),
              true, false, '/monitor');
    END IF;
  END IF;

  IF v_has_energy THEN
    INSERT INTO public.site_energy_records (certification_id, site_id, pm_id, project_name, handover_date, status, created_at, updated_at)
    VALUES (v_cert.id, p_site_id, v_cert.pm_id, COALESCE(v_project, v_cert.name, 'Site'), v_cert.handover_date, 'Requested', now(), now())
    ON CONFLICT (certification_id) DO UPDATE SET
      site_id = COALESCE(public.site_energy_records.site_id, EXCLUDED.site_id),
      pm_id = COALESCE(public.site_energy_records.pm_id, EXCLUDED.pm_id),
      project_name = COALESCE(public.site_energy_records.project_name, EXCLUDED.project_name),
      updated_at = now();

    IF v_cert.pm_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.task_alerts
       WHERE certification_id = v_cert.id AND alert_type='monitoring_energy_requested' AND is_resolved=false
    ) THEN
      INSERT INTO public.task_alerts (certification_id, created_by, alert_type, title, description, escalate_to_admin, is_resolved, target_route)
      VALUES (v_cert.id, v_cert.pm_id, 'monitoring_energy_requested',
              'Energy monitoring requested',
              'Energy monitoring flagged on certification ' || COALESCE(v_cert.name,''),
              true, false, '/monitor');
    END IF;
  END IF;

  IF v_has_water THEN
    INSERT INTO public.site_water_records (site_id, certification_id, pm_id, project_name, status, handover_date)
    VALUES (p_site_id, v_cert.id, v_cert.pm_id, COALESCE(v_project, v_cert.name, 'Site'), 'Requested', v_cert.handover_date)
    ON CONFLICT (site_id) DO UPDATE SET
      certification_id = COALESCE(public.site_water_records.certification_id, EXCLUDED.certification_id),
      pm_id = COALESCE(public.site_water_records.pm_id, EXCLUDED.pm_id),
      project_name = COALESCE(public.site_water_records.project_name, EXCLUDED.project_name),
      updated_at = now();

    IF v_cert.pm_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.task_alerts
       WHERE certification_id = v_cert.id AND alert_type='monitoring_water_requested' AND is_resolved=false
    ) THEN
      INSERT INTO public.task_alerts (certification_id, created_by, alert_type, title, description, escalate_to_admin, is_resolved, target_route)
      VALUES (v_cert.id, v_cert.pm_id, 'monitoring_water_requested',
              'Water monitoring requested',
              'Water monitoring flagged on certification ' || COALESCE(v_cert.name,''),
              true, false, '/monitor');
    END IF;
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.sync_site_monitoring_from_certs(uuid) IS
  'Accende sul sito i domini che le sue certification dichiarano. Solo accensioni: has_*_monitoring = false significa "non dichiarato", non "assente", ed e'' false su 1.100 certification su 1.141.';

-- ── 6) Backfill: i siti che gia' trasmettono ───────────────────────────────
DO $backfill$
DECLARE
  r record;
  v_n integer := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT tl.site_id, public.fn_monitoring_domain_of_metric(tl.metric) AS dominio
    FROM public.telemetry_latest tl
    WHERE tl.site_id IS NOT NULL
      AND public.fn_monitoring_domain_of_metric(tl.metric) IS NOT NULL
  LOOP
    PERFORM public.fn_enable_monitoring_domain(r.site_id, r.dominio);
    v_n := v_n + 1;
  END LOOP;

  -- L'energia ha una tabella "ultimo valore" tutta sua.
  FOR r IN SELECT DISTINCT site_id FROM public.energy_latest WHERE site_id IS NOT NULL
  LOOP
    PERFORM public.fn_enable_monitoring_domain(r.site_id, 'energy');
    v_n := v_n + 1;
  END LOOP;

  RAISE NOTICE 'moduli accesi dalla telemetria: % combinazioni sito/dominio valutate', v_n;
END;
$backfill$;

COMMENT ON COLUMN public.sites.monitoring_types IS
  'Cosa e'' monitorato in questo luogo, come fatto derivato: air_quality, energy_monitor, water_monitor. Un solo vocabolario — e'' quello che traduce la dash mappa (mapDbMonitoringTypeToFrontend) e quello che legge fn_recalculate_site_air. Si accende dalla telemetria che arriva e dalle certification che lo dichiarano; non viene mai spento automaticamente.';

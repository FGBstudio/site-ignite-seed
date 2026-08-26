-- ============================================================================
-- Monitoring · la richiesta nasce dalla certificazione, non dal sito
--
-- Il modello: il sito e' il luogo, la certificazione e' il progetto, e il
-- monitoraggio non e' mai un'entita' a se' — appartiene sempre a una
-- certificazione, e attraverso di essa a un sito. Da qui la regola che questa
-- migration rende vera per costruzione: ogni riga monitor ha una
-- certificazione, e il nome che mostra e' il nome di quella certificazione.
--
-- ── Il difetto strutturale che si chiude ───────────────────────────────────
--
-- L'energia aveva gia' il meccanismo giusto: `sync_ser_from_cert` crea la riga
-- energia quando una certificazione dichiara has_energy_monitoring, con il nome
-- della certificazione, il suo PM e il suo handover.
--
-- L'aria non ce l'aveva. Le sue righe nascevano da `trg_air_on_site_monitoring`,
-- un trigger sul SITO che inserisce una riga con il solo nome del sito e stato
-- 'Upcoming' — senza certificazione e senza PM, perche' guardando il sito non
-- puo' sapere a quale progetto la riga appartenga. Nessuno richiamava il
-- ricalcolo dopo. Il risultato misurato:
--
--     104 righe aria senza certificazione, su 426
--     101 righe aria senza PM — e la regola di sicurezza dell'aria filtra
--         proprio su pm_id, quindi nessun PM le vede
--      93 righe mostrano un nome diverso da quello della loro certificazione
--
-- ── Cosa fa questa migration ───────────────────────────────────────────────
--
--   1. crea `sync_sar_from_cert`, gemella esatta della funzione dell'energia;
--   2. toglie a `trg_air_on_site_monitoring` il compito di INSERIRE righe —
--      resta il sync del nome e la protezione dalla cancellazione;
--   3. estende la propagazione dell'handover all'energia, oggi esclusa;
--   4. estende il sync del PM, che oggi lavora solo per sito;
--   5. smette di rispecchiare ogni sito dentro ops_locations;
--   6. toglie a `sync_site_monitoring_from_certs` la creazione di righe, che
--      ora appartiene alle due funzioni dedicate.
--
-- ── Cosa NON fa, di proposito ──────────────────────────────────────────────
--
-- Non aggancia nessuna delle 104 righe orfane e non ne crea di nuove per le 34
-- certificazioni che dichiarano IAQ senza avere ancora una riga. Quelle
-- associazioni le decide una persona, dalla tendina aggiunta al Monitor Hub:
-- il meccanismo qui sotto vale da adesso in avanti, sulle certificazioni che
-- vengono salvate.
--
-- L'unico allineamento retroattivo e' il NOME delle righe gia' agganciate a una
-- certificazione: quello non e' una scelta, e' una conseguenza.
-- ============================================================================

-- ── 1) L'aria ottiene il meccanismo che l'energia aveva gia' ───────────────
CREATE OR REPLACE FUNCTION public.sync_sar_from_cert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_should_exist boolean;
BEGIN
  IF NEW.site_id IS NULL THEN RETURN NEW; END IF;

  -- Due modi di dire "qui si monitora l'aria", entrambi validi:
  --   • il progetto lo dichiara come componente (has_iaq_monitoring)
  --   • il progetto E' il monitoraggio dell'aria (cert_type = 'Air')
  v_should_exist := COALESCE(NEW.has_iaq_monitoring, false)
                 OR lower(COALESCE(NEW.cert_type, '')) = 'air';

  IF v_should_exist THEN
    -- La riga aria e' unica per SITO, non per certificazione: se esiste gia'
    -- non se ne crea una seconda e non le si strappa la certificazione che ha.
    INSERT INTO public.site_air_records
      (site_id, certification_id, pm_id, project_name, handover_date, status, total_sensors)
    VALUES
      (NEW.site_id, NEW.id, NEW.pm_id, NEW.name, NEW.handover_date, 'Upcoming', 0)
    ON CONFLICT (site_id) DO NOTHING;

    -- Una riga rimasta orfana adotta questa certificazione: e' l'unico caso in
    -- cui l'aggancio avviene da solo, perche' non c'e' nessuna scelta da fare.
    UPDATE public.site_air_records
       SET certification_id = NEW.id, updated_at = now()
     WHERE site_id = NEW.site_id
       AND certification_id IS NULL;
  END IF;

  -- Il nome e il PM seguono SEMPRE la certificazione a cui la riga e'
  -- agganciata — anche quando il flag viene spento, perche' la riga continua a
  -- parlare di quel progetto finche' qualcuno non la riassegna a mano.
  UPDATE public.site_air_records
     SET project_name = NEW.name,
         pm_id        = COALESCE(NEW.pm_id, pm_id),
         updated_at   = now()
   WHERE certification_id = NEW.id
     AND (project_name IS DISTINCT FROM NEW.name
       OR (NEW.pm_id IS NOT NULL AND pm_id IS DISTINCT FROM NEW.pm_id));

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Non si blocca mai il salvataggio di una certificazione per colpa del sync.
  RAISE NOTICE 'sync_sar_from_cert failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.sync_sar_from_cert() IS
  'Gemella di sync_ser_from_cert per l''aria. Crea la riga aria quando una certificazione dichiara has_iaq_monitoring o e'' di tipo Air, e tiene nome e PM allineati alla certificazione agganciata. Non strappa mai a una riga la certificazione che gia'' ha: quella scelta e'' di chi la fa a mano.';

DROP TRIGGER IF EXISTS trg_cert_sync_sar ON public.certifications;
CREATE TRIGGER trg_cert_sync_sar
  AFTER INSERT OR UPDATE OF has_iaq_monitoring, cert_type, site_id, pm_id, name, handover_date
  ON public.certifications
  FOR EACH ROW EXECUTE FUNCTION public.sync_sar_from_cert();

-- ── 2) Il trigger sul sito smette di creare righe monche ───────────────────
CREATE OR REPLACE FUNCTION public.trg_air_on_site_monitoring()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_has_air boolean;
  v_had_air boolean;
BEGIN
  v_has_air := (NEW.monitoring_types IS NOT NULL AND 'air_quality' = ANY(NEW.monitoring_types));
  v_had_air := (TG_OP = 'UPDATE' AND OLD.monitoring_types IS NOT NULL AND 'air_quality' = ANY(OLD.monitoring_types));

  -- Qui prima c'era un INSERT. E' stato tolto: guardando il sito non si puo'
  -- sapere a quale progetto la riga appartenga, e una riga senza certificazione
  -- e senza PM e' invisibile a ogni PM per via della regola di sicurezza.
  -- La creazione appartiene a sync_sar_from_cert, che parte dalla
  -- certificazione e quindi sa sempre di chi sta parlando.

  -- Il monitoraggio aria viene tolto dal sito: la riga sparisce solo se non c'e'
  -- nessun apparecchio ad attestare il contrario. Resta una decisione
  -- esplicita di una persona, non un effetto collaterale.
  IF TG_OP = 'UPDATE' AND v_had_air AND NOT v_has_air THEN
    DELETE FROM public.site_air_records
    WHERE site_id = NEW.id
      AND NOT EXISTS (
        SELECT 1 FROM public.hardwares h
        WHERE h.site_id = NEW.id AND h.category = 'AIR'
      );
  END IF;

  -- Il nome del sito cambia: la riga lo segue SOLO se non ha una
  -- certificazione, perche' altrimenti il nome lo detta quella.
  IF TG_OP = 'UPDATE' AND (OLD.name IS DISTINCT FROM NEW.name) THEN
    UPDATE public.site_air_records
       SET project_name = NEW.name, updated_at = now()
     WHERE site_id = NEW.id
       AND certification_id IS NULL;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.trg_air_on_site_monitoring() IS
  'Reagisce ai cambi sul sito. NON crea piu'' righe aria — quella e'' responsabilita'' di sync_sar_from_cert, che parte dalla certificazione. Qui resta la cancellazione su rimozione esplicita del marcatore e il sync del nome per le sole righe ancora senza certificazione.';

-- ── 3) L'handover si propaga anche all'energia ─────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_monitor_handover_from_cert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.site_air_records
     SET handover_date = NEW.handover_date, updated_at = now()
   WHERE certification_id = NEW.id
     AND handover_date IS DISTINCT FROM NEW.handover_date;

  UPDATE public.site_water_records
     SET handover_date = NEW.handover_date, updated_at = now()
   WHERE certification_id = NEW.id
     AND handover_date IS DISTINCT FROM NEW.handover_date;

  -- L'energia era esclusa: se il progetto slittava, la consegna dei suoi
  -- apparecchi restava alla data vecchia.
  UPDATE public.site_energy_records
     SET handover_date = NEW.handover_date, updated_at = now()
   WHERE certification_id = NEW.id
     AND handover_date IS DISTINCT FROM NEW.handover_date;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'sync_monitor_handover_from_cert failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;

-- ── 4) Il PM segue la certificazione, non solo il sito ─────────────────────
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
     WHERE site_id = v_site_id;
    RETURN OLD;
  END IF;

  IF NEW.pm_id IS NOT NULL THEN
    -- Prima: tutte le righe del sito. Ora la riga agganciata a QUESTA
    -- certificazione prende il suo PM, e le righe ancora orfane lo ereditano
    -- perche' e' meglio di restare invisibili a tutti.
    UPDATE public.site_air_records
       SET pm_id = NEW.pm_id, updated_at = now()
     WHERE (certification_id = NEW.id
            OR (site_id = v_site_id AND certification_id IS NULL))
       AND pm_id IS DISTINCT FROM NEW.pm_id;
  END IF;

  RETURN NEW;
END;
$function$;

-- ── 5) I siti smettono di essere rispecchiati in ops_locations ─────────────
--
-- Il trigger copiava OGNI sito dentro ops_locations con lo stesso id e tipo
-- 'client': su 1.172 righe, 1.106 erano copie di siti e solo 66 location vere.
-- Di quelle copie, 1.016 non sono mai state usate da una spedizione.
--
-- Da adesso la copia si aggiorna se esiste, ma non se ne creano di nuove alla
-- nascita di un sito. Le copie esistenti NON vengono toccate: 120 location sono
-- referenziate da spedizioni vere e cancellare le altre richiede una verifica
-- che merita una decisione a parte.
CREATE OR REPLACE FUNCTION public.sync_site_to_ops_locations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  UPDATE public.ops_locations
     SET name    = NEW.name,
         country = NEW.country,
         region  = NEW.region,
         lat     = NEW.lat,
         lng     = NEW.lng
   WHERE id = NEW.id
     AND (name IS DISTINCT FROM NEW.name
       OR country IS DISTINCT FROM NEW.country
       OR region IS DISTINCT FROM NEW.region
       OR lat IS DISTINCT FROM NEW.lat
       OR lng IS DISTINCT FROM NEW.lng);
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.sync_site_to_ops_locations() IS
  'Tiene allineata la location di spedizione di un sito, se esiste. Non ne crea piu'' una per ogni sito: la destinazione va creata quando serve davvero spedire li''.';

-- ── 6) sync_site_monitoring_from_certs fa una cosa sola ────────────────────
--
-- Faceva tre lavori insieme: accendere i moduli, creare le righe monitor e
-- generare gli alert. La creazione ora appartiene a sync_sar_from_cert e
-- sync_ser_from_cert, che sanno di quale progetto stanno parlando. Qui restano
-- l'accensione dei moduli e gli alert.
CREATE OR REPLACE FUNCTION public.sync_site_monitoring_from_certs(p_site_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_has_iaq boolean; v_has_energy boolean; v_has_water boolean;
  v_cert RECORD;
BEGIN
  IF p_site_id IS NULL THEN RETURN; END IF;

  SELECT bool_or(COALESCE(has_iaq_monitoring,false) OR lower(COALESCE(cert_type,'')) = 'air'),
         bool_or(COALESCE(has_energy_monitoring,false)),
         bool_or(COALESCE(has_water_monitoring,false))
    INTO v_has_iaq, v_has_energy, v_has_water
    FROM public.certifications WHERE site_id = p_site_id;

  v_has_iaq    := COALESCE(v_has_iaq,false);
  v_has_energy := COALESCE(v_has_energy,false);
  v_has_water  := COALESCE(v_has_water,false);

  -- Solo accensioni: has_*_monitoring = false significa "non dichiarato", non
  -- "assente", ed e' false su 1.100 certification su 1.142.
  IF v_has_iaq    THEN PERFORM public.fn_enable_monitoring_domain(p_site_id, 'air');    END IF;
  IF v_has_energy THEN PERFORM public.fn_enable_monitoring_domain(p_site_id, 'energy'); END IF;
  IF v_has_water  THEN PERFORM public.fn_enable_monitoring_domain(p_site_id, 'water');  END IF;

  SELECT id, pm_id, name INTO v_cert
    FROM public.certifications
   WHERE site_id = p_site_id
   ORDER BY created_at DESC LIMIT 1;

  IF v_cert.id IS NULL OR v_cert.pm_id IS NULL THEN RETURN; END IF;

  IF v_has_iaq AND NOT EXISTS (
    SELECT 1 FROM public.task_alerts
     WHERE certification_id = v_cert.id AND alert_type='monitoring_iaq_requested' AND is_resolved=false
  ) THEN
    INSERT INTO public.task_alerts (certification_id, created_by, alert_type, title, description, escalate_to_admin, is_resolved, target_route)
    VALUES (v_cert.id, v_cert.pm_id, 'monitoring_iaq_requested', 'IAQ monitoring requested',
            'IAQ monitoring flagged on certification ' || COALESCE(v_cert.name,''), true, false, '/monitor');
  END IF;

  IF v_has_energy AND NOT EXISTS (
    SELECT 1 FROM public.task_alerts
     WHERE certification_id = v_cert.id AND alert_type='monitoring_energy_requested' AND is_resolved=false
  ) THEN
    INSERT INTO public.task_alerts (certification_id, created_by, alert_type, title, description, escalate_to_admin, is_resolved, target_route)
    VALUES (v_cert.id, v_cert.pm_id, 'monitoring_energy_requested', 'Energy monitoring requested',
            'Energy monitoring flagged on certification ' || COALESCE(v_cert.name,''), true, false, '/monitor');
  END IF;

  IF v_has_water AND NOT EXISTS (
    SELECT 1 FROM public.task_alerts
     WHERE certification_id = v_cert.id AND alert_type='monitoring_water_requested' AND is_resolved=false
  ) THEN
    INSERT INTO public.task_alerts (certification_id, created_by, alert_type, title, description, escalate_to_admin, is_resolved, target_route)
    VALUES (v_cert.id, v_cert.pm_id, 'monitoring_water_requested', 'Water monitoring requested',
            'Water monitoring flagged on certification ' || COALESCE(v_cert.name,''), true, false, '/monitor');
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.sync_site_monitoring_from_certs(uuid) IS
  'Accende sul sito i domini che le sue certification dichiarano e apre gli alert per il PM. NON crea piu'' righe monitor: quella e'' responsabilita'' di sync_sar_from_cert e sync_ser_from_cert, che partono dalla certificazione.';

-- ── 7) Il solo allineamento retroattivo: il nome ───────────────────────────
-- Non e' una scelta, e' una conseguenza: una riga agganciata a una
-- certificazione deve mostrarne il nome. 93 righe oggi ne mostrano un altro.
DO $allinea$
DECLARE v_n integer;
BEGIN
  CREATE TABLE IF NOT EXISTS public._bak_air_project_names AS
    SELECT id, certification_id, project_name, now() AS _bak_at
    FROM public.site_air_records WHERE false;

  INSERT INTO public._bak_air_project_names
    SELECT r.id, r.certification_id, r.project_name, now()
      FROM public.site_air_records r
      JOIN public.certifications c ON c.id = r.certification_id
     WHERE COALESCE(r.project_name,'') IS DISTINCT FROM COALESCE(c.name,'');

  UPDATE public.site_air_records r
     SET project_name = c.name, updated_at = now()
    FROM public.certifications c
   WHERE c.id = r.certification_id
     AND COALESCE(r.project_name,'') IS DISTINCT FROM COALESCE(c.name,'')
     AND COALESCE(btrim(c.name),'') <> '';

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'nomi allineati alla certificazione: %', v_n;
END;
$allinea$;

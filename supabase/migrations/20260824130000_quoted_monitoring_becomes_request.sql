-- ============================================================================
-- Quotazione · le caselle di monitoraggio diventano una richiesta vera
--
-- Chi crea sito e certificazione da una quotazione sa già se servono ClAir IAQ,
-- Greeny Energy o il monitoraggio dell'acqua, perché li ha messi nell'offerta.
-- Spuntare quelle caselle È la richiesta, e vale come se l'avesse fatta il PM:
-- non è una dichiarazione d'intenti da confermare più tardi.
--
-- Con la precisazione che è il cuore della cosa: la quotazione può o non può
-- dire QUANTI.
--
--   • Se dice quanti — all'approvazione dell'offerta il progetto compare in due
--     posti insieme: in Operations, in attesa di assegnazione a un PM, e nella
--     tabella Monitor, già con il numero di dispositivi richiesti.
--
--   • Se non dice quanti — all'approvazione il progetto compare SOLO in
--     Operations. Entra nel Monitor più tardi, quando il PM formula la
--     richiesta con le quantità. È il comportamento che c'è già oggi.
--
-- ── Dove va il numero ──────────────────────────────────────────────────────
--
-- Tre colonne sulla certificazione — è la quotazione ad averle promesse, quindi
-- appartengono al progetto. Restano lì anche dopo, come traccia di cosa era
-- stato venduto: la richiesta vera vive nelle allocazioni, che possono poi
-- essere modificate, ma il numero quotato non cambia.
--
-- ── Perché all'approvazione e non alla quotazione ──────────────────────────
--
-- Un'offerta non ancora accettata non è fabbisogno. Creare le allocazioni alla
-- stesura del preventivo gonfierebbe l'ordine di produzione con dispositivi che
-- nessuno ha ancora comprato. Il momento giusto è la transizione a
-- `quotation_approved`, che è esattamente quando il progetto diventa reale.
--
-- Si materializza tramite trigger sul cambio di stato e non dentro
-- `approve-quotation-v2`, così vale da qualunque strada passi l'approvazione —
-- edge function, form, SQL a mano.
--
-- ── Cosa viene creato ──────────────────────────────────────────────────────
--
-- Un'allocazione per dominio, in stato 'Requested', con `source = 'quotation'`
-- che la distingue da quelle del PM e la rende riconoscibile se un domani
-- l'offerta va rifatta. Per energia e acqua si usa il prodotto-sistema che
-- esiste a catalogo (Greeny, Water Monitoring System); per l'aria no, perché un
-- ClAir generico non esiste — la quotazione dice quanti, non quale modello, e
-- sarà Monitoring a sceglierlo. Per questo l'allocazione aria è un segnaposto.
--
-- La data obiettivo è l'handover meno 15 giorni: la stessa regola che usa il
-- PM quando fa la richiesta a mano.
-- ============================================================================

ALTER TABLE public.certifications
  ADD COLUMN IF NOT EXISTS quoted_iaq_quantity    integer,
  ADD COLUMN IF NOT EXISTS quoted_energy_quantity integer,
  ADD COLUMN IF NOT EXISTS quoted_water_quantity  integer;

COMMENT ON COLUMN public.certifications.quoted_iaq_quantity IS
  'Quanti sensori aria prometteva la quotazione. NULL = l''offerta diceva che servono ma non quanti: in quel caso il progetto entra nel Monitor solo quando il PM formula la richiesta. Il numero resta qui anche dopo l''approvazione, come traccia di ciò che era stato venduto.';
COMMENT ON COLUMN public.certifications.quoted_energy_quantity IS
  'Quanti dispositivi energia prometteva la quotazione. Vedi quoted_iaq_quantity.';
COMMENT ON COLUMN public.certifications.quoted_water_quantity IS
  'Quanti dispositivi acqua prometteva la quotazione. Vedi quoted_iaq_quantity.';

-- ── La materializzazione ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_materialize_quoted_monitoring(p_certification_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cert   record;
  v_target date;
  v_prod   uuid;
  v_creati integer := 0;
BEGIN
  SELECT id, handover_date, quoted_iaq_quantity, quoted_energy_quantity, quoted_water_quantity
    INTO v_cert
    FROM public.certifications
   WHERE id = p_certification_id;

  IF v_cert.id IS NULL THEN RETURN; END IF;

  -- Il materiale deve essere in cantiere prima della consegna del progetto.
  v_target := v_cert.handover_date - 15;

  -- ── ARIA ────────────────────────────────────────────────────────────────
  IF COALESCE(v_cert.quoted_iaq_quantity, 0) > 0
     AND NOT EXISTS (
       SELECT 1 FROM public.project_allocations
        WHERE certification_id = v_cert.id
          AND source = 'quotation'
          AND COALESCE(category,'') ILIKE '%AIR%'
     )
  THEN
    -- Segnaposto: la quotazione dice quanti, non quale ClAir. Il modello lo
    -- sceglie Monitoring al momento dell'assegnazione.
    INSERT INTO public.project_allocations
      (certification_id, product_id, quantity, requested_quantity, status,
       category, source, is_generic_placeholder, target_date)
    VALUES
      (v_cert.id, NULL, v_cert.quoted_iaq_quantity, v_cert.quoted_iaq_quantity,
       'Requested', 'AIR', 'quotation', true, v_target);
    v_creati := v_creati + 1;
  END IF;

  -- ── ENERGIA ─────────────────────────────────────────────────────────────
  IF COALESCE(v_cert.quoted_energy_quantity, 0) > 0
     AND NOT EXISTS (
       SELECT 1 FROM public.project_allocations
        WHERE certification_id = v_cert.id
          AND source = 'quotation'
          AND COALESCE(category,'') ILIKE '%ENERGY%'
     )
  THEN
    SELECT id INTO v_prod FROM public.products
     WHERE name ILIKE '%greeny%' ORDER BY name LIMIT 1;

    INSERT INTO public.project_allocations
      (certification_id, product_id, quantity, requested_quantity, status,
       category, source, is_generic_placeholder, target_date)
    VALUES
      (v_cert.id, v_prod, v_cert.quoted_energy_quantity, v_cert.quoted_energy_quantity,
       'Requested', 'Energy', 'quotation', true, v_target);
    v_creati := v_creati + 1;
  END IF;

  -- ── ACQUA ───────────────────────────────────────────────────────────────
  IF COALESCE(v_cert.quoted_water_quantity, 0) > 0
     AND NOT EXISTS (
       SELECT 1 FROM public.project_allocations
        WHERE certification_id = v_cert.id
          AND source = 'quotation'
          AND COALESCE(category,'') ILIKE '%WATER%'
     )
  THEN
    SELECT id INTO v_prod FROM public.products
     WHERE category ILIKE '%water%' ORDER BY name LIMIT 1;

    INSERT INTO public.project_allocations
      (certification_id, product_id, quantity, requested_quantity, status,
       category, source, is_generic_placeholder, target_date)
    VALUES
      (v_cert.id, v_prod, v_cert.quoted_water_quantity, v_cert.quoted_water_quantity,
       'Requested', 'Water', 'quotation', true, v_target);
    v_creati := v_creati + 1;
  END IF;

  IF v_creati > 0 THEN
    RAISE NOTICE 'Quotazione approvata: % richieste di monitoraggio materializzate', v_creati;
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.fn_materialize_quoted_monitoring(uuid) IS
  'Trasforma le quantità promesse in quotazione in richieste vere (project_allocations con source=quotation). Idempotente: se le richieste della quotazione esistono già non ne crea altre.';

-- ── Il momento: l'approvazione dell'offerta ────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_quotation_approved_materializes_monitoring()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF lower(COALESCE(NEW.status,'')) = 'quotation_approved'
     AND lower(COALESCE(OLD.status,'')) IS DISTINCT FROM 'quotation_approved'
  THEN
    PERFORM public.fn_materialize_quoted_monitoring(NEW.id);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- L'approvazione non deve mai fallire per colpa di questo.
  RAISE NOTICE 'trg_quotation_approved_materializes_monitoring: %', SQLERRM;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_cert_quotation_approved ON public.certifications;
CREATE TRIGGER trg_cert_quotation_approved
  AFTER UPDATE OF status ON public.certifications
  FOR EACH ROW EXECUTE FUNCTION public.trg_quotation_approved_materializes_monitoring();

-- ── La riga Monitor nasce quando c'è qualcosa da dire ──────────────────────
--
-- Prima bastava la dichiarazione has_iaq_monitoring, quindi la riga compariva
-- già alla stesura del preventivo. Ora nasce quando esiste una richiesta con un
-- numero — quotata o del PM — oppure quando ci sono già apparecchi, oppure
-- quando il progetto È il monitoraggio dell'aria (cert_type = 'Air'). Una
-- quotazione ancora aperta non produce nulla.
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

  -- Un preventivo non ancora accettato non è un progetto.
  v_live := lower(COALESCE(NEW.status, '')) NOT IN ('quotation', 'potential');

  -- "Qualcosa da dire": un numero quotato, una richiesta del PM, o apparecchi
  -- già sul posto.
  v_has_number :=
       COALESCE(NEW.quoted_iaq_quantity, 0) > 0
    OR EXISTS (
         SELECT 1 FROM public.project_allocations pa
         LEFT JOIN public.products p ON p.id = pa.product_id
          WHERE pa.certification_id = NEW.id
            AND lower(COALESCE(pa.status,'')) NOT IN ('replaced','canceled','cancelled','rejected')
            AND (pa.category ILIKE '%AIR%' OR pa.category ILIKE '%IAQ%'
              OR p.category ILIKE '%AIR%' OR p.category ILIKE '%IAQ%')
       )
    OR EXISTS (
         SELECT 1 FROM public.hardwares h
          WHERE h.site_id = NEW.site_id AND h.category = 'AIR' AND h.status <> 'In Stock'
       );

  IF v_declared AND v_live AND (v_has_number OR v_is_air_proj) THEN
    INSERT INTO public.site_air_records
      (site_id, certification_id, pm_id, project_name, handover_date, status, total_sensors)
    VALUES
      (NEW.site_id, NEW.id, NEW.pm_id, NEW.name, NEW.handover_date, 'Upcoming', 0)
    ON CONFLICT (site_id) DO NOTHING;

    UPDATE public.site_air_records
       SET certification_id = NEW.id, updated_at = now()
     WHERE site_id = NEW.site_id
       AND certification_id IS NULL;
  END IF;

  -- Nome e PM seguono sempre la certificazione agganciata.
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

DROP TRIGGER IF EXISTS trg_cert_sync_sar ON public.certifications;
CREATE TRIGGER trg_cert_sync_sar
  AFTER INSERT OR UPDATE OF
    has_iaq_monitoring, cert_type, site_id, pm_id, name, handover_date,
    status, quoted_iaq_quantity
  ON public.certifications
  FOR EACH ROW EXECUTE FUNCTION public.sync_sar_from_cert();

-- ── Stessa soglia per l'energia ────────────────────────────────────────────
-- Creava la riga sulla sola dichiarazione, quindi anche per preventivi aperti.
-- Il ramo che aggiorna in place resta intatto: nessuna riga esistente sparisce.
CREATE OR REPLACE FUNCTION public.sync_ser_from_cert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_should_exist boolean;
  v_live boolean;
BEGIN
  v_live := lower(COALESCE(NEW.status, '')) NOT IN ('quotation', 'potential');

  v_should_exist := (COALESCE(NEW.has_energy_monitoring, false)
                     OR COALESCE(NEW.has_hardware_redirection, false)
                     OR lower(COALESCE(NEW.cert_type,'')) = 'energy')
                    AND v_live;

  IF v_should_exist THEN
    INSERT INTO public.site_energy_records
      (certification_id, site_id, pm_id, project_name, handover_date, status, created_at, updated_at)
    VALUES
      (NEW.id, NEW.site_id, NEW.pm_id, NEW.name, NEW.handover_date, 'Active', now(), now())
    ON CONFLICT (certification_id) DO UPDATE
      SET site_id       = EXCLUDED.site_id,
          pm_id         = EXCLUDED.pm_id,
          project_name  = EXCLUDED.project_name,
          handover_date = EXCLUDED.handover_date,
          updated_at    = now();
  ELSE
    UPDATE public.site_energy_records
       SET site_id       = NEW.site_id,
           pm_id         = NEW.pm_id,
           project_name  = NEW.name,
           handover_date = NEW.handover_date,
           updated_at    = now()
     WHERE certification_id = NEW.id
       AND (site_id       IS DISTINCT FROM NEW.site_id
         OR pm_id         IS DISTINCT FROM NEW.pm_id
         OR project_name  IS DISTINCT FROM NEW.name
         OR handover_date IS DISTINCT FROM NEW.handover_date);
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'sync_ser_from_cert failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;

-- ── L'acqua, che finora non aveva nulla ────────────────────────────────────
-- site_water_records ha zero righe: il dominio esiste nello schema ma non è mai
-- stato messo in moto. Gli si dà la stessa funzione degli altri due, così quando
-- una quotazione venderà del monitoraggio idrico il meccanismo sarà già pronto.
CREATE OR REPLACE FUNCTION public.sync_swr_from_cert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_live boolean;
  v_has_number boolean;
BEGIN
  IF NEW.site_id IS NULL THEN RETURN NEW; END IF;

  v_live := lower(COALESCE(NEW.status, '')) NOT IN ('quotation', 'potential');

  v_has_number :=
       COALESCE(NEW.quoted_water_quantity, 0) > 0
    OR EXISTS (
         SELECT 1 FROM public.project_allocations pa
         LEFT JOIN public.products p ON p.id = pa.product_id
          WHERE pa.certification_id = NEW.id
            AND lower(COALESCE(pa.status,'')) NOT IN ('replaced','canceled','cancelled','rejected')
            AND (pa.category ILIKE '%WATER%' OR p.category ILIKE '%WATER%')
       );

  IF COALESCE(NEW.has_water_monitoring, false) AND v_live AND v_has_number THEN
    INSERT INTO public.site_water_records
      (site_id, certification_id, pm_id, project_name, handover_date, status)
    VALUES
      (NEW.site_id, NEW.id, NEW.pm_id, NEW.name, NEW.handover_date, 'Requested')
    ON CONFLICT (site_id) DO NOTHING;

    UPDATE public.site_water_records
       SET certification_id = NEW.id, updated_at = now()
     WHERE site_id = NEW.site_id AND certification_id IS NULL;
  END IF;

  UPDATE public.site_water_records
     SET project_name = NEW.name,
         pm_id        = COALESCE(NEW.pm_id, pm_id),
         updated_at   = now()
   WHERE certification_id = NEW.id
     AND (project_name IS DISTINCT FROM NEW.name
       OR (NEW.pm_id IS NOT NULL AND pm_id IS DISTINCT FROM NEW.pm_id));

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'sync_swr_from_cert failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_cert_sync_swr ON public.certifications;
CREATE TRIGGER trg_cert_sync_swr
  AFTER INSERT OR UPDATE OF
    has_water_monitoring, site_id, pm_id, name, handover_date,
    status, quoted_water_quantity
  ON public.certifications
  FOR EACH ROW EXECUTE FUNCTION public.sync_swr_from_cert();

COMMENT ON FUNCTION public.sync_swr_from_cert() IS
  'Gemella di sync_sar_from_cert per l''acqua. Crea la riga idrica quando il progetto è approvato, dichiara il monitoraggio dell''acqua e c''è un numero — quotato o richiesto dal PM.';

-- ============================================================================
-- Timeline · un solo punto di generazione, nel database
--
-- La scaletta di milestone veniva costruita in cinque punti diversi del
-- frontend, ognuno con la sua copia delle regole. Qui diventa una funzione
-- sola: `fn_materialize_timeline`, che legge cert_timeline_steps attraverso la
-- chiave che il catalogo assegna alla combinazione del progetto.
--
-- Le date non si ricopiano mai a mano quando esistono gia' altrove:
-- l'handover viene dalla certificazione, la spedizione dalla riga monitor.
-- Quelle milestone il PM le vede ma non le digita — `edit_locked_for_pm` — cosi'
-- non nascono due verita' sulla stessa data.
--
-- Le milestone calcolate contano dall'ordine, non dal nome, e si aggiornano a
-- cascata quando l'ancoraggio riceve la sua data reale.
--
-- La materializzazione non riparte se la timeline esiste gia': rigenerarla
-- cancellerebbe il lavoro del PM.
-- ============================================================================

ALTER TABLE public.certification_milestones
  ADD COLUMN IF NOT EXISTS optional     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS anchor_order integer,
  ADD COLUMN IF NOT EXISTS offset_days  integer,
  ADD COLUMN IF NOT EXISTS derived_from text,
  ADD COLUMN IF NOT EXISTS not_applicable boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.certification_milestones.optional IS
  'La milestone puo'' non esserci: il re-test se il primo test e'' andato bene, la spedizione se il progetto non ha sensori.';
COMMENT ON COLUMN public.certification_milestones.not_applicable IS
  'Il PM ha dichiarato che questa milestone opzionale non si fara''. Sparisce dai conteggi senza sparire dalla vista.';

CREATE OR REPLACE FUNCTION public.fn_timeline_key_for_cert(p_certification_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT k.timeline_key
    FROM public.certifications c
    JOIN public.cert_catalog k
      ON k.scheme = c.cert_type
     AND k.rating_system    IS NOT DISTINCT FROM NULLIF(btrim(COALESCE(c.cert_rating,'')), '')
     AND k.typology         IS NOT DISTINCT FROM NULLIF(btrim(COALESCE(c.project_subtype,'')), '')
     AND k.delivery_context IS NOT DISTINCT FROM NULLIF(btrim(COALESCE(c.delivery_context,'')), '')
   WHERE c.id = p_certification_id
   LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.fn_refresh_timeline_dates(p_certification_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cert record;
BEGIN
  SELECT * INTO v_cert FROM public.certifications WHERE id = p_certification_id;
  IF v_cert.id IS NULL THEN RETURN; END IF;

  UPDATE public.certification_milestones m
     SET actual_date = v_cert.handover_date, due_date = v_cert.handover_date
   WHERE m.certification_id = p_certification_id
     AND m.derived_from = 'handover'
     AND m.actual_date IS DISTINCT FROM v_cert.handover_date;

  UPDATE public.certification_milestones m
     SET actual_date = r.latest_shipment_date::date, due_date = r.latest_shipment_date::date
    FROM public.site_air_records r
   WHERE m.certification_id = p_certification_id
     AND m.derived_from = 'air_shipment'
     AND r.certification_id = p_certification_id
     AND m.actual_date IS DISTINCT FROM r.latest_shipment_date::date;

  UPDATE public.certification_milestones m
     SET due_date = COALESCE(a.actual_date, a.due_date) + m.offset_days
    FROM public.certification_milestones a
   WHERE m.certification_id = p_certification_id
     AND a.certification_id = p_certification_id
     AND m.milestone_type = 'timeline' AND a.milestone_type = 'timeline'
     AND m.anchor_order IS NOT NULL
     AND a.order_index = m.anchor_order
     AND COALESCE(a.actual_date, a.due_date) IS NOT NULL
     AND m.due_date IS DISTINCT FROM COALESCE(a.actual_date, a.due_date) + m.offset_days;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_materialize_timeline(p_certification_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_key    text;
  v_cert   record;
  v_count  integer := 0;
  v_air    boolean;
  v_energy boolean;
BEGIN
  SELECT * INTO v_cert FROM public.certifications WHERE id = p_certification_id;
  IF v_cert.id IS NULL THEN RETURN 0; END IF;

  IF EXISTS (SELECT 1 FROM public.certification_milestones
              WHERE certification_id = p_certification_id AND milestone_type = 'timeline') THEN
    RETURN 0;
  END IF;

  v_key := public.fn_timeline_key_for_cert(p_certification_id);
  IF v_key IS NULL THEN RETURN 0; END IF;

  v_air    := COALESCE(v_cert.has_iaq_monitoring, false)    OR lower(COALESCE(v_cert.cert_type,'')) = 'air';
  v_energy := COALESCE(v_cert.has_energy_monitoring, false) OR lower(COALESCE(v_cert.cert_type,'')) = 'energy';

  INSERT INTO public.certification_milestones (
    certification_id, milestone_type, category, requirement, order_index, status,
    optional, anchor_order, offset_days, derived_from, edit_locked_for_pm, not_applicable
  )
  SELECT p_certification_id, 'timeline', 'Timeline', s.requirement, s.order_index, 'pending',
         s.optional, s.anchor_order, s.offset_days, s.derived_from,
         (s.timing_kind = 'derived'),
         CASE WHEN s.derived_from = 'air_shipment'    AND NOT v_air    THEN true
              WHEN s.derived_from = 'energy_shipment' AND NOT v_energy THEN true
              ELSE false END
    FROM public.cert_timeline_steps s
   WHERE s.timeline_key = v_key
   ORDER BY s.order_index;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM public.fn_refresh_timeline_dates(p_certification_id);
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_certifications_materialize_timeline()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF lower(COALESCE(NEW.status,'')) IN ('potential','quotation','canceled','cancelled') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT'
     OR lower(COALESCE(OLD.status,'')) IN ('potential','quotation')
     OR NEW.cert_type       IS DISTINCT FROM OLD.cert_type
     OR NEW.cert_rating     IS DISTINCT FROM OLD.cert_rating
     OR NEW.project_subtype IS DISTINCT FROM OLD.project_subtype THEN
    PERFORM public.fn_materialize_timeline(NEW.id);
  END IF;

  PERFORM public.fn_refresh_timeline_dates(NEW.id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'materialize_timeline: %', SQLERRM;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_certifications_materialize_timeline ON public.certifications;
CREATE TRIGGER trg_certifications_materialize_timeline
  AFTER INSERT OR UPDATE OF status, cert_type, cert_rating, project_subtype, handover_date
  ON public.certifications
  FOR EACH ROW EXECUTE FUNCTION public.trg_certifications_materialize_timeline();

CREATE OR REPLACE FUNCTION public.trg_milestone_cascade_dates()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.milestone_type = 'timeline'
     AND NEW.actual_date IS DISTINCT FROM OLD.actual_date THEN
    PERFORM public.fn_refresh_timeline_dates(NEW.certification_id);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_milestone_cascade_dates ON public.certification_milestones;
CREATE TRIGGER trg_milestone_cascade_dates
  AFTER UPDATE OF actual_date ON public.certification_milestones
  FOR EACH ROW EXECUTE FUNCTION public.trg_milestone_cascade_dates();

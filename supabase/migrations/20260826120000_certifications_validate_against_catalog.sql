-- Il guardiano del vocabolario.
--
-- Un CHECK non basta: non puo' leggere un'altra tabella, non puo' guardare lo
-- stato del progetto e non puo' spiegare perche' ha rifiutato. Serve un trigger.
--
-- La validazione parte da quotation_approved in avanti. Prima — potential e
-- quotation — i campi restano liberi: e' li' che si lavora su un'offerta ancora
-- incerta, e il processo di onboarding non deve cambiare di una virgola.
-- Quotazione, approvazione, assegnazione al PM e compilazione della timeline
-- restano identici a prima. Cambia solo che dopo l'approvazione una
-- combinazione inventata non entra piu'.
--
-- La versione non entra nel controllo: e' un'informazione, non una chiave. Un
-- progetto LEED ID+C Retail resta valido che sia v4.0 o v4.1.

BEGIN;

CREATE OR REPLACE FUNCTION public.trg_certifications_validate_catalog()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_catalog uuid;
  v_label   text;
BEGIN
  -- Finche' l'offerta non e' approvata, nessun obbligo.
  IF lower(COALESCE(NEW.status, '')) IN ('potential', 'quotation', 'canceled', 'cancelled') THEN
    RETURN NEW;
  END IF;

  -- Righe storiche gia' fuori vocabolario: si lasciano stare finche' nessuno
  -- tocca proprio quei campi. Chi le modifica, pero', le deve sistemare.
  IF TG_OP = 'UPDATE'
     AND NEW.cert_type       IS NOT DISTINCT FROM OLD.cert_type
     AND NEW.cert_rating     IS NOT DISTINCT FROM OLD.cert_rating
     AND NEW.project_subtype IS NOT DISTINCT FROM OLD.project_subtype
     AND NEW.cert_level      IS NOT DISTINCT FROM OLD.cert_level
     AND lower(COALESCE(OLD.status,'')) NOT IN ('potential','quotation') THEN
    RETURN NEW;
  END IF;

  SELECT k.id, k.display_label INTO v_catalog, v_label
    FROM public.cert_catalog k
   WHERE k.scheme = NEW.cert_type
     AND k.rating_system    IS NOT DISTINCT FROM NULLIF(btrim(COALESCE(NEW.cert_rating,'')), '')
     AND k.typology         IS NOT DISTINCT FROM NULLIF(btrim(COALESCE(NEW.project_subtype,'')), '')
     AND k.delivery_context IS NOT DISTINCT FROM NULLIF(btrim(COALESCE(NEW.delivery_context,'')), '')
   LIMIT 1;

  IF v_catalog IS NULL THEN
    RAISE EXCEPTION
      'Combinazione non a catalogo: schema "%", rating "%", tipologia "%". Scegliere fra quelle previste per lo schema.',
      COALESCE(NEW.cert_type,'∅'), COALESCE(NEW.cert_rating,'∅'), COALESCE(NEW.project_subtype,'∅');
  END IF;

  IF NULLIF(btrim(COALESCE(NEW.cert_level,'')), '') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.cert_catalog_levels l
                      WHERE l.catalog_id = v_catalog AND l.level = btrim(NEW.cert_level)) THEN
    RAISE EXCEPTION
      'Livello "%" non previsto da %. Livelli ammessi: %.',
      NEW.cert_level, v_label,
      (SELECT string_agg(l.level, ', ' ORDER BY l.order_index)
         FROM public.cert_catalog_levels l WHERE l.catalog_id = v_catalog);
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_certifications_validate_catalog ON public.certifications;
CREATE TRIGGER trg_certifications_validate_catalog
  BEFORE INSERT OR UPDATE ON public.certifications
  FOR EACH ROW EXECUTE FUNCTION public.trg_certifications_validate_catalog();

COMMENT ON FUNCTION public.trg_certifications_validate_catalog() IS
  'Vincola cert_type + cert_rating + project_subtype + cert_level al catalogo, ma solo da quotation_approved in avanti: potential e quotation restano liberi perche'' il flusso di offerta non deve cambiare. Le righe storiche gia'' fuori vocabolario sopravvivono finche'' nessuno tocca quei campi.';

COMMIT;

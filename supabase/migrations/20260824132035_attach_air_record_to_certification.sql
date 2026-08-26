-- ============================================================================
-- Monitoring · agganciare a mano una riga aria alla sua certificazione
--
-- Le 100 righe rimaste senza certificazione le associa una persona, non un
-- automatismo: su un sito con piu' progetti la scelta e' un giudizio, non un
-- calcolo. Questa funzione e' lo strumento di quella scelta, ed esiste perche'
-- la regola "il nome segue la certificazione" deve valere anche quando
-- l'aggancio e' manuale — altrimenti la tendina lascerebbe la riga col nome
-- vecchio.
--
-- Fa una cosa sola e la fa per intero: aggancia, e allinea nome, PM e data di
-- consegna a quelli della certificazione scelta.
--
-- Il vincolo di integrita': la certificazione deve stare sullo STESSO sito
-- della riga. E' cio' che tiene insieme le due porte d'ingresso — la mappa
-- entra dal sito, Operations entra dalla certificazione, e devono trovare lo
-- stesso oggetto.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_attach_air_record_to_certification(
  p_site_id uuid,
  p_certification_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cert record;
BEGIN
  IF p_site_id IS NULL THEN
    RAISE EXCEPTION 'Serve il sito della riga da agganciare.';
  END IF;

  -- Sganciare e' legittimo: si torna a una riga senza progetto.
  IF p_certification_id IS NULL THEN
    UPDATE public.site_air_records
       SET certification_id = NULL, updated_at = now()
     WHERE site_id = p_site_id;
    RETURN;
  END IF;

  SELECT id, name, pm_id, handover_date, site_id
    INTO v_cert
    FROM public.certifications
   WHERE id = p_certification_id;

  IF v_cert.id IS NULL THEN
    RAISE EXCEPTION 'La certificazione % non esiste.', p_certification_id;
  END IF;

  IF v_cert.site_id IS DISTINCT FROM p_site_id THEN
    RAISE EXCEPTION
      'La certificazione appartiene a un altro sito: una riga monitor puo'' essere agganciata solo a un progetto dello stesso luogo.';
  END IF;

  UPDATE public.site_air_records
     SET certification_id = v_cert.id,
         project_name     = v_cert.name,
         pm_id            = COALESCE(v_cert.pm_id, pm_id),
         handover_date    = COALESCE(v_cert.handover_date, handover_date),
         updated_at       = now()
   WHERE site_id = p_site_id;
END;
$function$;

COMMENT ON FUNCTION public.fn_attach_air_record_to_certification(uuid, uuid) IS
  'Aggancia a mano una riga di site_air_records alla sua certificazione e ne allinea nome, PM e handover. La certificazione deve stare sullo stesso sito. Passare NULL sgancia la riga.';

GRANT EXECUTE ON FUNCTION public.fn_attach_air_record_to_certification(uuid, uuid) TO authenticated;

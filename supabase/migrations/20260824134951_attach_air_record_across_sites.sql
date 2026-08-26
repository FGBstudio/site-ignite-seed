-- ============================================================================
-- Monitoring · l'aggancio manuale può attraversare i siti
--
-- La prima versione accettava solo certificazioni dello STESSO sito della riga.
-- Sulla carta è il vincolo giusto — è ciò che tiene allineate le due viste —
-- ma nella pratica lascia senza alternative proprio i casi che vanno sistemati:
-- 63 delle 100 righe orfane stanno su siti che non hanno NESSUNA
-- certificazione, e per loro la tendina era vuota.
--
-- Quindi la scelta si apre a tutte le certificazioni. Il vincolo resta un
-- consiglio, non un divieto: l'interfaccia mette in cima quelle dello stesso
-- sito e segnala le altre, ma chi decide è una persona che sa cosa sta facendo.
--
-- Quando la certificazione scelta sta su un altro sito, la conseguenza va
-- conosciuta: la riga monitor continua a vivere sul PROPRIO sito — è lì che
-- stanno fisicamente gli apparecchi, ed è lì che la mappa la disegna — mentre
-- Operations la mostrerà sotto il progetto scelto. Quasi sempre è il sintomo di
-- due siti che descrivono lo stesso luogo.
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

  -- Sganciare è legittimo: si torna a una riga senza progetto.
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

  -- Nessun controllo sul sito: la scelta è di chi la fa. Si annota soltanto,
  -- perché un aggancio fra siti diversi merita di lasciare traccia nei log.
  IF v_cert.site_id IS DISTINCT FROM p_site_id THEN
    RAISE NOTICE 'Aggancio fra siti diversi: riga del sito %, certificazione del sito %',
      p_site_id, v_cert.site_id;
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
  'Aggancia a mano una riga di site_air_records a una certificazione e ne allinea nome, PM e handover. La certificazione può stare su un altro sito: il vincolo è un consiglio dell''interfaccia, non un divieto, perché 63 righe orfane vivono su siti privi di certificazioni. Passare NULL sgancia la riga.';

GRANT EXECUTE ON FUNCTION public.fn_attach_air_record_to_certification(uuid, uuid) TO authenticated;

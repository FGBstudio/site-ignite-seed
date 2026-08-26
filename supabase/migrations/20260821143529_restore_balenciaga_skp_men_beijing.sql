-- ============================================================================
-- Ripristino · BALENCIAGA SKP Men, BEIJING — cancellato per errore
--
-- La deduplica che ha fatto il danno NON e' in questa cartella, e non ci sara':
-- non era autorizzata ed e' stata annullata per intero (vedi il ripristino
-- successivo). Rimetterla qui vorrebbe dire farla rieseguire a chiunque
-- ricostruisca il database da zero.
--
-- Individuava le coppie per NOME. A Chengdu i due
-- gusci si chiamavano "Balenciaga SKP Men" e "Balenciaga SKP Women", ma un
-- negozio con lo stesso identico nome esiste anche a PECHINO — Shop D1047,
-- 1st Floor, No.87 Jianguo Road, Chaoyang District — e il join lo ha preso
-- insieme agli altri.
--
-- Era un sito legittimo, non un duplicato: citta' diversa, indirizzo diverso,
-- e la sua certification "SKP Men / certificato / LEED" e' un progetto vero.
--
-- Cio' che si e' salvato: le guardie della migration hanno comunque impedito
-- il danno peggiore. Avrebbero fermato tutto se quel sito avesse avuto anche un
-- solo apparecchio, una riga monitor o un'ora di lavoro sulla certification —
-- essendo un guscio, e' passato. Sono spariti quindi soltanto la riga del sito,
-- la sua certification e i derivati meteo, che si rigenerano dal feed.
--
-- Qui si rimettono a posto entrambi, dal backup, con i loro id originali.
-- ============================================================================

DO $restore$
DECLARE
  v_site constant uuid := '4ab9080f-0186-4211-aee6-f467c2c0048a';
  v_cert constant uuid := '9fa73a0a-2366-46b5-8369-b1c41db1ac19';
BEGIN
  IF EXISTS (SELECT 1 FROM public.sites WHERE id = v_site) THEN
    RAISE EXCEPTION 'Il sito % esiste gia'': ripristino annullato per non sovrascriverlo.', v_site;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public._bak_merge_skp_sites WHERE id = v_site) THEN
    RAISE EXCEPTION 'Il sito % non e'' nel backup: ripristino impossibile.', v_site;
  END IF;

  INSERT INTO public.sites SELECT * FROM public._bak_merge_skp_sites WHERE id = v_site;
  INSERT INTO public.certifications SELECT * FROM public._bak_merge_skp_certs WHERE id = v_cert;

  -- Tolti dal backup: restano solo i due gusci di Chengdu, che erano il
  -- bersaglio voluto.
  DELETE FROM public._bak_merge_skp_sites WHERE id = v_site;
  DELETE FROM public._bak_merge_skp_certs WHERE id = v_cert;

  IF NOT EXISTS (SELECT 1 FROM public.sites WHERE id = v_site)
     OR NOT EXISTS (SELECT 1 FROM public.certifications WHERE id = v_cert AND site_id = v_site) THEN
    RAISE EXCEPTION 'Ripristino fallito.';
  END IF;
END;
$restore$;

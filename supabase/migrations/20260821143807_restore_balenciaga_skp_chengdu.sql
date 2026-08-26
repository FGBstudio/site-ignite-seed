-- ============================================================================
-- Ripristino · BALENCIAGA SKP Chengdu — la deduplica non era autorizzata
--
-- Annulla per intero la deduplica SKP Chengdu, applicata direttamente sul
-- database e volutamente non versionata qui: era sbagliata e non deve poter
-- essere rieseguita. I due siti e le due certification tornano com'erano, con
-- i loro id originali:
--
--   b0bb3355  "Balenciaga SKP Women"  CHENGDU  + cert 096ba14f SKP Women
--   73cec839  "Balenciaga SKP Men"    CHENGDU  + cert 81dfc59f SKP Men
--
-- (Il sito di Beijing, preso per errore dallo stesso join, era gia' stato
-- rimesso a posto da 20260821141000.)
--
-- Uomo e Donna sono negozi distinti e vanno tenuti distinti: la deduplica
-- accostava Uomo con Uomo e Donna con Donna, ma la decisione non era stata
-- presa e non andava eseguita.
-- ============================================================================

DO $restore$
DECLARE
  v_n integer;
BEGIN
  IF EXISTS (SELECT 1 FROM public.sites WHERE id IN (SELECT id FROM public._bak_merge_skp_sites)) THEN
    RAISE EXCEPTION 'Uno dei siti da ripristinare esiste gia'': ripristino annullato per non sovrascriverlo.';
  END IF;

  INSERT INTO public.sites SELECT * FROM public._bak_merge_skp_sites;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'siti ripristinati: %', v_n;

  INSERT INTO public.certifications SELECT * FROM public._bak_merge_skp_certs;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'certification ripristinate: %', v_n;

  IF (SELECT count(*) FROM public.sites WHERE id IN (SELECT id FROM public._bak_merge_skp_sites)) <> 2
     OR (SELECT count(*) FROM public.certifications WHERE id IN (SELECT id FROM public._bak_merge_skp_certs)) <> 2 THEN
    RAISE EXCEPTION 'Ripristino incompleto.';
  END IF;
END;
$restore$;

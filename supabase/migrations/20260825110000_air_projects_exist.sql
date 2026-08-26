-- Il monitoraggio venduto da solo e' un progetto.
--
-- Due giorni fa 'Air' e' entrato nelle scelte del form e del wizard di
-- quotazione, ma il vincolo sul database non e' stato allargato: la CHECK
-- certifications_chk_cert_type ammetteva LEED, BREEAM, WELL, ENERGY, ESG,
-- GRESB, ENERGY_AUDIT, TAXONOMY, ESG-TAXONOMY, CSRD. Un progetto Air sarebbe
-- stato rifiutato dal database anche creandolo dall'interfaccia.
--
-- E c'e' la coerenza dell'altra meta': un progetto che E' monitoraggio
-- energetico ovviamente lo comprende, ma tutti e 81 i progetti cert_type=Energy
-- avevano has_energy_monitoring = false. Cosi' una domanda sola — "questo
-- progetto ha monitoraggio X?" — non bastava a rispondere, e il filtro del
-- Demand Planner doveva guardare anche il cert_type per non perderli.
--
-- Infine nascono i primi quattro progetti Air: sedici sensori gia' installati
-- che trasmettono da mesi senza che nessun progetto li reclamasse. Le loro
-- righe monitor esistono gia' — sono nate dall'hardware — e vengono agganciate,
-- non ricreate.

BEGIN;

-- ── 1) Il tipo Air esiste anche per il database ────────────────────────────
ALTER TABLE public.certifications
  DROP CONSTRAINT IF EXISTS certifications_chk_cert_type;

ALTER TABLE public.certifications
  ADD CONSTRAINT certifications_chk_cert_type
  CHECK (upper(cert_type) = ANY (ARRAY[
    'LEED', 'BREEAM', 'WELL', 'AIR', 'ENERGY', 'ESG', 'GRESB',
    'ENERGY_AUDIT', 'TAXONOMY', 'ESG-TAXONOMY', 'CSRD'
  ]));

-- ── 2) Un progetto di monitoraggio comprende il proprio monitoraggio ───────
UPDATE public.certifications
   SET has_energy_monitoring = true, updated_at = now()
 WHERE lower(COALESCE(cert_type, '')) = 'energy'
   AND has_energy_monitoring = false;

UPDATE public.certifications
   SET has_iaq_monitoring = true, updated_at = now()
 WHERE lower(COALESCE(cert_type, '')) = 'air'
   AND has_iaq_monitoring = false;

-- ── 3) I primi quattro progetti Air ────────────────────────────────────────
DO $air$
DECLARE
  v_pm   uuid := '45a85413-f7c8-40ed-b1fe-09ebb8dce32d';  -- monitoring@fgb-studio.com
  v_cert uuid;
  r      record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('33c2d6f9-6be2-4fd9-a217-8038c6b81573'::uuid, 'Bicester Village',  'FENDI',         DATE '2026-04-24', 'Online'),
      ('03d77a31-7bba-4077-84dd-bfd8c93b9c40'::uuid, 'St. Honoré',        'LOEWE',         DATE '2026-02-18', 'Offline'),
      ('4de1a0ac-78fb-4915-a17d-b7d6c5963778'::uuid, 'Westfield Sydney',  'PRADA',         DATE '2025-10-13', 'Online'),
      ('716d34d9-d36f-4d60-ae53-2fd97ab48078'::uuid, 'Avenue Montaigne',  'SAINT LAURENT', DATE '2025-09-26', 'Online')
    ) AS t(site_id, nome, cliente, handover, online)
  LOOP
    INSERT INTO public.certifications (
      site_id, name, client, cert_type, status, region, pm_id,
      handover_date, has_iaq_monitoring, fgb_monitor
    )
    SELECT r.site_id, r.nome, r.cliente, 'Air', 'in_corso',
           COALESCE(s.region, 'Europe'), v_pm, r.handover, true, true
      FROM public.sites s
     WHERE s.id = r.site_id
    RETURNING id INTO v_cert;

    -- sync_sar_from_cert ha appena creato una riga vuota per la nuova
    -- certificazione. Quella buona e' l'altra: e' nata dagli apparecchi e ne
    -- porta il conto, lo stato e lo storico.
    DELETE FROM public.site_air_records
     WHERE site_id = r.site_id AND certification_id = v_cert;

    UPDATE public.site_air_records
       SET certification_id = v_cert,
           project_name     = r.nome,
           pm_id            = v_pm,
           handover_date    = r.handover,
           online_status    = r.online,
           updated_at       = now()
     WHERE site_id = r.site_id AND certification_id IS NULL;

    PERFORM public.fn_recalculate_site_air(r.site_id);
    PERFORM public.fn_sync_air_typology(r.site_id);
  END LOOP;
END;
$air$;

COMMIT;

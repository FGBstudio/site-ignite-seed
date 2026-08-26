-- ============================================================================
-- Certifications · il progetto "Energy" diventa una componente, non un progetto
--
-- All'inizio il monitoraggio energetico veniva creato come progetto a se':
-- una certification con cert_type = 'Energy', accanto alla certificazione vera
-- dello stesso negozio. In Operations lo stesso punto vendita compare quindi
-- due volte — una riga LEED e una riga Energy — con gli stessi apparecchi
-- contati su entrambe, perche' gli apparecchi appartengono al SITO.
--
-- Questa migration converte quei doppioni: il monitoraggio energetico diventa
-- un flag sulla certificazione vera, e la certification Energy sparisce.
--
-- ── Perche' e' sicuro ──────────────────────────────────────────────────────
--
-- Verificato su tutte e 22 le certification Energy interessate: NESSUNA ha
-- lavoro attaccato. Zero allocazioni, zero task, zero fasi WBS, zero milestone,
-- zero milestone di pagamento. Sono gusci che dicono soltanto "qui c'e' anche
-- il monitoraggio dell'energia" — che e' esattamente cio' che il flag
-- has_energy_monitoring esprime meglio.
--
-- Restano fuori 81 certification Energy che sono l'UNICO progetto del loro
-- sito: quelle non sono doppioni, sono progetti veri, e convertirle
-- cancellerebbe il progetto. Non si toccano.
--
-- ── Cosa viene salvato prima di cancellare ─────────────────────────────────
--
--   • Il PM. Tre certificazioni di destinazione non ne hanno uno mentre la
--     loro Energy si': senza travaso quel sito perderebbe il suo responsabile.
--     Dove entrambe ce l'hanno (9 casi, PM diversi) vince la destinazione.
--   • Le note scritte a mano sulla riga monitor. Quattro righe ne hanno, fra
--     cui Prada Oslo che ci tiene i MAC address dei bridge.
--   • La riga di site_energy_records, spostata sulla certificazione di
--     destinazione — MAI cancellata insieme alla cert, perche' la chiave
--     esterna e' ON DELETE CASCADE e la porterebbe via.
--
-- ── I tre casi con due righe energy ────────────────────────────────────────
--
-- London Regent Street, Los Angeles Rodeo Drive e Prada Oslo hanno una riga
-- energy su ENTRAMBE le certification, e l'indice unico su certification_id
-- non permette di spostarla sopra l'altra. Si sceglie quale sopravvive con una
-- regola, non a caso:
--
--   1. vince quella che ha planned_counts, cioe' quella che il ricalcolo
--      automatico sta gia' mantenendo sugli apparecchi reali;
--   2. a parita', vince quella che dichiara piu' sensori;
--   3. le note dell'altra vengono travasate se la superstite non ne ha.
--
-- Applicata ai tre casi: a Regent Street sopravvive la riga della Energy (12
-- sensori, stato Installed) perche' quella della LEED e' un guscio a zero; a
-- Los Angeles e a Oslo sopravvive quella della LEED, che il ricalcolo mantiene
-- allineata agli apparecchi installati, e a Oslo le si travasano le note coi
-- MAC address.
--
-- ── Cosa NON cambia ────────────────────────────────────────────────────────
--
-- Le date. La riga energy conserva il proprio handover anche dopo essere stata
-- spostata: `sync_monitor_handover_from_cert` propaga solo su aria e acqua,
-- mai sull'energia, e comunque il trigger scatta sull'UPDATE della
-- certificazione, non sullo spostamento della riga.
-- ============================================================================

DO $conversione$
DECLARE
  r record;
  v_keeper uuid;
  v_loser uuid;
  v_note_loser text;
  v_note_keeper text;
  v_convertite integer := 0;
BEGIN
  -- ── Backup di tutto cio' che sparisce ────────────────────────────────────
  CREATE TABLE IF NOT EXISTS public._bak_energy_component_certs AS
    SELECT c.*, now() AS _bak_at FROM public.certifications c WHERE false;
  CREATE TABLE IF NOT EXISTS public._bak_energy_component_records AS
    SELECT ser.*, now() AS _bak_at FROM public.site_energy_records ser WHERE false;

  FOR r IN
    SELECT ce.id  AS energy_cert,
           ce.pm_id AS energy_pm,
           cv.id  AS dest_cert,
           cv.pm_id AS dest_pm,
           s.name AS sito
    FROM public.certifications ce
    JOIN public.sites s ON s.id = ce.site_id
    JOIN public.certifications cv
      ON cv.site_id = ce.site_id AND cv.id <> ce.id
     AND cv.cert_type IN ('LEED','WELL','BREEAM','ESG','TAXONOMY','CSRD')
    WHERE ce.cert_type = 'Energy'
  LOOP
    -- Guardia: se nel frattempo qualcuno ci ha attaccato del lavoro, si salta.
    IF (SELECT count(*) FROM public.project_allocations      WHERE certification_id = r.energy_cert)
     + (SELECT count(*) FROM public.cert_tasks               WHERE certification_id = r.energy_cert)
     + (SELECT count(*) FROM public.cert_wbs_phases          WHERE certification_id = r.energy_cert)
     + (SELECT count(*) FROM public.cert_payment_milestones  WHERE certification_id = r.energy_cert)
     + (SELECT count(*) FROM public.certification_milestones WHERE certification_id = r.energy_cert) > 0
    THEN
      RAISE NOTICE 'Saltato %: la certification Energy non e'' piu'' vuota', r.sito;
      CONTINUE;
    END IF;

    INSERT INTO public._bak_energy_component_certs
      SELECT c.*, now() FROM public.certifications c WHERE c.id = r.energy_cert;
    INSERT INTO public._bak_energy_component_records
      SELECT x.*, now() FROM public.site_energy_records x
       WHERE x.certification_id IN (r.energy_cert, r.dest_cert);

    -- ── Il flag: e' questo il "diventare componente" ──────────────────────
    UPDATE public.certifications
       SET has_energy_monitoring = true,
           pm_id = COALESCE(pm_id, r.energy_pm),
           updated_at = now()
     WHERE id = r.dest_cert;

    -- ── La riga monitor ───────────────────────────────────────────────────
    IF EXISTS (SELECT 1 FROM public.site_energy_records WHERE certification_id = r.energy_cert)
       AND EXISTS (SELECT 1 FROM public.site_energy_records WHERE certification_id = r.dest_cert)
    THEN
      -- Due righe: se ne sceglie una e si travasano le note dell'altra.
      SELECT id INTO v_keeper
        FROM public.site_energy_records
       WHERE certification_id IN (r.energy_cert, r.dest_cert)
       ORDER BY (planned_counts IS NOT NULL) DESC,
                COALESCE(total_sensors,0) DESC,
                created_at ASC
       LIMIT 1;

      SELECT id, notes INTO v_loser, v_note_loser
        FROM public.site_energy_records
       WHERE certification_id IN (r.energy_cert, r.dest_cert) AND id <> v_keeper
       LIMIT 1;

      SELECT notes INTO v_note_keeper FROM public.site_energy_records WHERE id = v_keeper;

      IF COALESCE(v_note_loser,'') <> '' AND COALESCE(v_note_keeper,'') = '' THEN
        UPDATE public.site_energy_records SET notes = v_note_loser, updated_at = now()
         WHERE id = v_keeper;
      END IF;

      DELETE FROM public.site_energy_records WHERE id = v_loser;
      UPDATE public.site_energy_records
         SET certification_id = r.dest_cert, updated_at = now()
       WHERE id = v_keeper AND certification_id <> r.dest_cert;

    ELSIF EXISTS (SELECT 1 FROM public.site_energy_records WHERE certification_id = r.energy_cert) THEN
      -- Una riga sola, sulla Energy: si sposta. Deve avvenire PRIMA della
      -- cancellazione, altrimenti il CASCADE se la porta via.
      UPDATE public.site_energy_records
         SET certification_id = r.dest_cert, updated_at = now()
       WHERE certification_id = r.energy_cert;
    END IF;

    -- ── Via il guscio ─────────────────────────────────────────────────────
    DELETE FROM public.certifications WHERE id = r.energy_cert;

    v_convertite := v_convertite + 1;
    RAISE NOTICE 'Convertito: % — energia ora componente della certificazione', r.sito;
  END LOOP;

  RAISE NOTICE 'Certification Energy convertite in componente: %', v_convertite;
END;
$conversione$;

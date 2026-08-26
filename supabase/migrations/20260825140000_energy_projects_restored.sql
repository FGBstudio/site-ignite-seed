-- Il 24 agosto 22 certificazioni cert_type = Energy sono state assorbite nella
-- certificazione dello stesso sito, diventando il flag has_energy_monitoring.
-- La lettura era corretta per alcune, sbagliata per altre: e' una distinzione
-- commerciale — un contratto o una componente di un contratto — e la conosce
-- solo chi ha venduto. Rivista una per una, le 22 si dividono cosi':
--
--   8  restano componenti della certificazione (nessun intervento);
--   11 erano progetti indipendenti e tornano cert_type = Energy;
--   3  erano offerte energia RIFIUTATE: non sono ne' progetti ne' componenti,
--      e non devono comparire da nessuna parte.
--
-- Gli undici che tornano sono tutti Fendi. La loro riga di monitoraggio ha una
-- consegna propria — dieci al 31/12/2025 — diversa da quella della LEED che le
-- aveva assorbite, ed e' il segno che erano forniture a se'.

BEGIN;

-- ── 1) Gli undici progetti Fendi tornano indipendenti ──────────────────────
DO $ripristino$
DECLARE
  r        record;
  v_dest   uuid;
  v_righe  integer;
BEGIN
  FOR r IN
    SELECT k.* FROM public._bak_energy_component_certs k
     WHERE k.id IN (
       '5fdccfed-cbf8-44ae-a8ca-7b90d34ddbdc',  -- Chengdu, IFS
       'ae7d7a98-782f-4b60-a80c-31317bea914d',  -- Chongqing, MixC
       '504273fa-a47f-4733-af53-fccdc4421bbf',  -- Nanjing, IFC
       '1336f65c-d0ad-4a1f-a41f-37b4c21cea8d',  -- Qingdao, Hisense Plaza
       '9d5bab41-46f8-41cc-86dd-5da2f46bf97b',  -- Shanghai, Taikoo Li Qiantan
       '36c3a9ac-781d-4a8d-9be7-b367eae51f0d',  -- Shanghai, Plaza 66 (Men)
       'e436aa89-2aca-4401-9061-f9a973aaf4c3',  -- Shenzhen, Bay MixC
       '8ecfeecb-e23c-4180-9779-c92afd9c3c33',  -- Singapore, Marina Bay Sands
       '82c421ff-0634-4f41-80ba-1e381f8cf645',  -- Sydney, Westfield
       '0f921108-cf7f-46fa-99a5-52a5b673475a',  -- Wuhan, Heartland 66
       'd5c26558-49ec-4d82-be86-a81492d00365'   -- Zhengzhou, David Plaza
     )
  LOOP
    IF EXISTS (SELECT 1 FROM public.certifications WHERE id = r.id) THEN
      RAISE NOTICE 'Gia'' ripristinato: %', r.name;
      CONTINUE;
    END IF;

    SELECT c.id INTO v_dest
      FROM public.certifications c
     WHERE c.site_id = r.site_id
       AND c.has_energy_monitoring
       AND lower(COALESCE(c.status, '')) NOT IN ('canceled', 'cancelled')
     LIMIT 1;

    IF v_dest IS NULL THEN
      RAISE EXCEPTION 'Nessuna certificazione che dichiari l''energia sul sito di %', r.name;
    END IF;

    SELECT COUNT(*) INTO v_righe
      FROM public.site_energy_records WHERE certification_id = v_dest;
    IF v_righe <> 1 THEN
      RAISE EXCEPTION '% righe energia sulla certificazione di destinazione di %: fermarsi.', v_righe, r.name;
    END IF;

    -- La certificazione torna con l'identita' che aveva. Non e' un progetto
    -- nuovo: e' lo stesso id, cosi' qualunque riferimento residuo lo ritrova.
    INSERT INTO public.certifications (
      id, site_id, cert_type, level, score, target_score, status, issued_date,
      expiry_date, categories, created_at, updated_at, pm_id, name, client, region,
      handover_date, cert_rating, project_subtype, is_commissioning, cert_level,
      planned_handover_date, actual_handover_date, sqm, fgb_monitor, services_fees,
      gbci_fees, total_fees, quotation_notes, quotation_sent_date, po_sign_date,
      allocated_hours, has_iaq_monitoring, has_energy_monitoring, has_water_monitoring,
      has_hardware_redirection, baseline_handover_date, quotation_approved_at,
      quotation_approved_by, on_hold, on_hold_reason, on_hold_at, on_hold_by,
      on_hold_previous_status, quotation_group_id
    ) VALUES (
      r.id, r.site_id, r.cert_type, r.level, r.score, r.target_score, r.status, r.issued_date,
      r.expiry_date, r.categories, r.created_at, now(), r.pm_id, r.name, r.client, r.region,
      r.handover_date, r.cert_rating, r.project_subtype, r.is_commissioning, r.cert_level,
      r.planned_handover_date, r.actual_handover_date, r.sqm, r.fgb_monitor, r.services_fees,
      r.gbci_fees, r.total_fees, r.quotation_notes, r.quotation_sent_date, r.po_sign_date,
      r.allocated_hours, r.has_iaq_monitoring,
      true,  -- un progetto che E' monitoraggio energetico lo comprende
      r.has_water_monitoring,
      r.has_hardware_redirection, r.baseline_handover_date, r.quotation_approved_at,
      r.quotation_approved_by, r.on_hold, r.on_hold_reason, r.on_hold_at, r.on_hold_by,
      r.on_hold_previous_status, r.quotation_group_id
    );

    -- sync_ser_from_cert ha appena creato una riga vuota per il progetto
    -- ripristinato. Quella buona e' l'altra, con i suoi apparecchi e la sua data.
    DELETE FROM public.site_energy_records WHERE certification_id = r.id;

    UPDATE public.site_energy_records
       SET certification_id = r.id, updated_at = now()
     WHERE certification_id = v_dest;

    -- La certificazione smette di dichiarare un monitoraggio che non e' suo.
    UPDATE public.certifications
       SET has_energy_monitoring = false, updated_at = now()
     WHERE id = v_dest;

    RAISE NOTICE 'Ripristinato: % — di nuovo progetto Energy', r.name;
  END LOOP;
END;
$ripristino$;

-- ── 2) Le tre offerte rifiutate ────────────────────────────────────────────
-- Un'offerta rifiutata non e' un progetto e non e' una componente: non e' stata
-- venduta. Il flag si spegne e la riga monitor — vuota, zero apparecchi, zero
-- note — sparisce, perche' non c'e' niente da ricordare di una fornitura mai
-- avvenuta.
DELETE FROM public.site_energy_records
 WHERE certification_id IN (
   '197f8ddd-2378-45b4-8a96-7269d04379ba',  -- ARMANI · Via Manzoni
   '41f05863-5173-4701-9895-0b3bf4be1dbf',  -- AUDEMARS PIGUET · Fifth Avenue
   '49499b15-c47c-414b-b7a7-7fc664a28e0c'   -- VAN CLEEF · Madison Avenue
 )
   AND COALESCE(total_bridges, 0) = 0
   AND COALESCE(no_pan10, 0) = 0
   AND COALESCE(no_pan12, 0) = 0
   AND COALESCE(no_pan14, 0) = 0
   AND COALESCE(total_sensors, 0) = 0
   AND COALESCE(btrim(notes), '') = '';

UPDATE public.certifications
   SET has_energy_monitoring = false, updated_at = now()
 WHERE id IN (
   '197f8ddd-2378-45b4-8a96-7269d04379ba',
   '41f05863-5173-4701-9895-0b3bf4be1dbf',
   '49499b15-c47c-414b-b7a7-7fc664a28e0c'
 );

COMMIT;

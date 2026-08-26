-- ============================================================================
-- Certifications · la baseline dell'handover diventa utilizzabile
--
-- Lo scostamento fra la data di consegna promessa e quella attuale e' cio' che
-- dice quanto un progetto sta slittando, e quindi se c'e' da emettere una nuova
-- fattura. Il meccanismo esisteva gia' — `baseline_handover_date` piu' il
-- trigger fn_freeze_baseline_handover — ma era inerte:
--
--   baseline_handover_date valorizzata su      3 progetti su 1.141
--   planned_handover_date  valorizzata su      1 progetto  su 1.141
--
-- Il motivo e' nella condizione di congelamento: la baseline veniva fissata
-- solo nell'istante in cui `po_sign_date` passava da vuoto a valorizzato. Ma
-- po_sign_date e' compilato su 3 certification in tutto, quindi quel momento
-- non arriva quasi mai. Il risultato e' che oggi lo scostamento non e'
-- calcolabile per nessuno.
--
-- ── La nuova regola ─────────────────────────────────────────────────────────
--
-- La baseline si congela la PRIMA volta che il progetto ha una data di
-- consegna, qualunque sia il momento in cui arriva, e da li' non si muove piu'.
-- E' l'unico istante che capita sempre: un progetto senza data di handover non
-- ha ancora nulla da promettere, e appena ne ha una quella e' la promessa.
--
-- Si continua a preferire planned_handover_date quando c'e', perche' quando
-- qualcuno la compila sta dichiarando esattamente la data promessa.
--
-- ── Cosa questo backfill NON pretende di fare ───────────────────────────────
--
-- Non ricostruisce lo storico. La data promessa in origine non e' scritta da
-- nessuna parte: non nelle certification, non in monitor_handover_sync_backup
-- (che ha catturato uno stato del 5 agosto, non l'origine). Congelare oggi
-- l'handover corrente significa che i progetti gia' slittati partono con
-- scostamento zero.
--
-- E' una scelta, e va detta: da domani lo scostamento e' misurato per tutti,
-- ma misura lo slittamento FUTURO. L'alternativa — inventare una data
-- plausibile — darebbe numeri di fatturazione falsi, che e' molto peggio di
-- numeri che partono da zero.
--
-- ── Perche' si spengono due trigger durante il backfill ─────────────────────
--
-- Scrivere la baseline su 1.046 righe farebbe scattare, per ognuna:
--
--   • trg_refresh_air_on_certs → un ricalcolo completo della riga monitor,
--     1.046 volte, per un campo che col monitor non c'entra nulla;
--   • trg_certifications_handover_drift → il controllo di scostamento, che
--     qui darebbe sempre zero perche' baseline e handover coincidono.
--
-- E si spegne anche trg_enforce_cert_not_on_hold, che vieta ogni modifica a un
-- progetto sospeso a chi non e' admin: senza, gli 8 progetti in hold sarebbero
-- gli unici a restare senza baseline, e il primo tentativo fa fallire l'intero
-- backfill (verificato: la prima esecuzione e' morta esattamente li').
--
-- Restano ACCESI, di proposito, trg_cert_sync_monitor_handover (scatta solo su
-- UPDATE OF handover_date, che qui non si tocca) e tutto il resto.
--
-- Le 8 righe monitor la cui data diverge da quella della loro certification
-- NON vengono toccate: in 5 casi la certification ha handover uguale alla
-- propria data di creazione — la firma dell'import massivo del 29 giugno —
-- mentre il monitor porta date coerenti con le spedizioni reali. Li' e' la
-- certification a essere sbagliata, non il monitor, e la correzione richiede
-- una decisione caso per caso.
-- ============================================================================

-- ── 1) La regola di congelamento ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_freeze_baseline_handover()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Prima data di consegna che il progetto abbia mai avuto: da qui in poi e'
  -- la promessa contro cui si misura ogni slittamento. Una volta scritta non
  -- viene piu' toccata, nemmeno se l'handover cambia — e' esattamente il
  -- punto.
  IF NEW.baseline_handover_date IS NULL
     AND COALESCE(NEW.planned_handover_date, NEW.handover_date) IS NOT NULL THEN
    NEW.baseline_handover_date := COALESCE(NEW.planned_handover_date, NEW.handover_date);
  END IF;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_freeze_baseline_handover() IS
  'Congela baseline_handover_date alla prima data di consegna che il progetto riceve, e non la tocca mai piu''. Prima era legata a po_sign_date, compilata su 3 certification su 1.141, quindi non scattava quasi mai.';

-- Il trigger deve valere anche sulle certification nuove, non solo sugli
-- aggiornamenti: un progetto creato gia' con la sua data di consegna deve
-- nascere con la baseline.
DROP TRIGGER IF EXISTS trg_certifications_freeze_baseline ON public.certifications;
CREATE TRIGGER trg_certifications_freeze_baseline
  BEFORE INSERT OR UPDATE ON public.certifications
  FOR EACH ROW EXECUTE FUNCTION public.fn_freeze_baseline_handover();

-- ── 2) Backfill ─────────────────────────────────────────────────────────────
DO $backfill$
DECLARE
  v_n integer;
BEGIN
  CREATE TABLE IF NOT EXISTS public._bak_baseline_handover AS
    SELECT id, handover_date, planned_handover_date, baseline_handover_date, now() AS _bak_at
    FROM public.certifications
    WHERE baseline_handover_date IS NULL
      AND COALESCE(planned_handover_date, handover_date) IS NOT NULL;

  ALTER TABLE public.certifications DISABLE TRIGGER trg_refresh_air_on_certs;
  ALTER TABLE public.certifications DISABLE TRIGGER trg_certifications_handover_drift;
  ALTER TABLE public.certifications DISABLE TRIGGER trg_enforce_cert_not_on_hold;

  UPDATE public.certifications
     SET baseline_handover_date = COALESCE(planned_handover_date, handover_date)
   WHERE baseline_handover_date IS NULL
     AND COALESCE(planned_handover_date, handover_date) IS NOT NULL;

  GET DIAGNOSTICS v_n = ROW_COUNT;

  ALTER TABLE public.certifications ENABLE TRIGGER trg_enforce_cert_not_on_hold;
  ALTER TABLE public.certifications ENABLE TRIGGER trg_certifications_handover_drift;
  ALTER TABLE public.certifications ENABLE TRIGGER trg_refresh_air_on_certs;

  RAISE NOTICE 'baseline_handover_date congelata su % certification', v_n;
END;
$backfill$;

COMMENT ON COLUMN public.certifications.baseline_handover_date IS
  'La data di consegna promessa: congelata alla prima data che il progetto riceve e mai piu'' modificata. Lo scostamento da handover_date e'' quanto il progetto sta slittando. Valorizzata in blocco il 2026-08-21 sull''handover di allora: per i progetti gia'' in corso lo scostamento parte da zero, perche'' la promessa originale non era registrata da nessuna parte.';

COMMENT ON COLUMN public.certifications.handover_date IS
  'Data di consegna corrente del progetto, quella che si sposta quando il progetto slitta. E'' la sorgente: site_air_records.handover_date e site_water_records.handover_date la rispecchiano tramite trg_cert_sync_monitor_handover e non vanno modificate direttamente.';

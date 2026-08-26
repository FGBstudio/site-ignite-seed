-- ============================================================================
-- Certifications · "in hold" detto in un posto solo
--
-- La sospensione di un progetto era scritta in due campi che si
-- contraddicevano:
--
--   certifications.on_hold            booleano, con reason / at / by /
--                                     previous_status accanto — quello che
--                                     scrive HoldToggleButton
--   certifications.status = 'on_hold' un valore di stato, che pero' occupa il
--                                     posto della fase del progetto
--
-- Misurato il 2026-08-21: 6 progetti col flag, 4 con lo status, e solo 2 con
-- entrambi. Quattro erano sospesi secondo il flag ma non secondo lo status,
-- due il contrario. A seconda di quale campo guarda una vista, lo stesso
-- progetto risultava fermo o attivo.
--
-- ── Chi comanda, e perche' ──────────────────────────────────────────────────
--
-- Comanda il FLAG. Sono due informazioni diverse messe nello stesso posto:
-- `status` dice a che punto e' il progetto (potential → quotation →
-- da_configurare → in_corso → certificato), `on_hold` dice se e' fermo. Un
-- progetto sospeso resta a un certo punto del suo percorso: scrivere 'on_hold'
-- dentro `status` cancella proprio l'informazione che serve per farlo
-- ripartire.
--
-- Non a caso esiste `on_hold_previous_status`, che serve a ricordare la fase
-- da ripristinare al rilascio — ed e' inutilizzabile se la fase e' stata
-- sovrascritta. I due progetti che avevano status='on_hold' E il flag avevano
-- infatti previous_status='on_hold': rilasciandoli sarebbero tornati fermi.
--
-- ── Che fase rimettere ──────────────────────────────────────────────────────
--
-- I quattro progetti con status='on_hold' — Arona 15, Mall of the Netherlands,
-- PALAZZO BORGHESE, The Mall at Millenia — sono tutti LEED e non hanno nulla
-- di configurato: zero task, zero fasi WBS, zero milestone, zero milestone di
-- pagamento, zero allocazioni hardware, zero device sul sito. La fase onesta e'
-- quindi 'da_configurare', che e' anche quella dei quattro sospesi "sani".
--
-- Ai due che avevano lo status ma non il flag si accende il flag: qualcuno li
-- aveva fermati, e questo e' l'unico modo di non perdere quell'intenzione. Non
-- avendo data ne' autore, restano NULL — inventarli sarebbe peggio che
-- lasciarli vuoti — e il motivo dice da dove viene la sospensione.
--
-- ── Perche' si spegne un trigger ────────────────────────────────────────────
--
-- `trg_enforce_cert_not_on_hold` vieta qualunque modifica a una certification
-- gia' in hold a chi non e' admin, e questa migration gira come servizio, senza
-- auth.uid(). Senza spegnerlo, i due progetti da riparare sarebbero proprio
-- quelli irraggiungibili. Viene riacceso subito, nella stessa transazione: se
-- qualcosa fallisce il rollback ripristina anche lui.
--
-- ── Il vincolo finale ───────────────────────────────────────────────────────
--
-- Alla fine si aggiunge un CHECK che impedisce a 'on_hold' di rientrare in
-- `status`. Nessun punto dell'applicazione lo scrive piu': useHoldCertification
-- usa il flag, e il valore 'on_hold' che si vede in PortfolioFollowUp e nel
-- planner e' calcolato a schermo dal flag, non letto dalla colonna. Il vincolo
-- serve a impedire che la duplicazione si ricrei da sola.
-- ============================================================================

DO $fix$
DECLARE
  v_fase constant text := 'da_configurare';
  v_n integer;
BEGIN
  ALTER TABLE public.certifications DISABLE TRIGGER trg_enforce_cert_not_on_hold;

  -- Backup di cio' che si sta per riscrivere
  CREATE TABLE IF NOT EXISTS public._bak_on_hold_status AS
    SELECT id, status, on_hold, on_hold_previous_status, on_hold_reason, on_hold_at, on_hold_by, now() AS _bak_at
    FROM public.certifications
    WHERE lower(COALESCE(status, '')) = 'on_hold';

  UPDATE public.certifications
     SET on_hold                 = true,
         on_hold_previous_status = v_fase,
         on_hold_reason          = COALESCE(
             on_hold_reason,
             'Sospeso in Operations tramite status=on_hold, prima che esistesse il flag. Flag ricostruito il 2026-08-21; la fase precedente non era piu'' recuperabile ed e'' stata dedotta dal progetto (nulla di configurato).'),
         status                  = v_fase,
         updated_at              = now()
   WHERE lower(COALESCE(status, '')) = 'on_hold';

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'on_hold: % certification riportate alla loro fase, flag acceso', v_n;

  ALTER TABLE public.certifications ENABLE TRIGGER trg_enforce_cert_not_on_hold;

  -- Nessuno deve piu' poter scrivere la sospensione dentro la fase.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'certifications_status_not_on_hold'
       AND conrelid = 'public.certifications'::regclass
  ) THEN
    ALTER TABLE public.certifications
      ADD CONSTRAINT certifications_status_not_on_hold
      CHECK (lower(COALESCE(status, '')) <> 'on_hold');
  END IF;
END;
$fix$;

COMMENT ON COLUMN public.certifications.on_hold IS
  'Unica verita'' sulla sospensione di un progetto. `status` dice a che punto e'' il progetto e non deve mai valere ''on_hold'' (vincolo certifications_status_not_on_hold): la fase da ripristinare al rilascio vive in on_hold_previous_status.';

COMMENT ON COLUMN public.certifications.status IS
  'Fase del progetto: potential, quotation, quotation_approved, da_configurare, in_corso, completato, certificato, canceled. Mai ''on_hold'': la sospensione e'' il flag on_hold, che e'' ortogonale alla fase.';

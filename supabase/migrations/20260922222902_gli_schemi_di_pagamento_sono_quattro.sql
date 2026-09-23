-- ═══════════════════════════════════════════════════════════════════════════
-- Gli schemi di pagamento sono quattro, non due.
--
-- La specifica ne elenca quattro; a database ne esistevano due piu' il SAL
-- libero. Mancavano proprio i due che coprono i casi estremi: la fornitura di
-- hardware, che si paga tutta alla firma, e l'O+M, che non ha una fase di
-- costruzione e quindi non puo' agganciarsi alla sua fine.
--
-- «submission» entra fra gli eventi ammessi: e' il momento in cui il progetto
-- viene sottomesso all'ente, e per un O+M e' l'unico traguardo che conti dopo
-- l'avvio.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.cert_payment_milestones drop constraint if exists cert_payment_milestones_trigger_event_chk;
alter table public.cert_payment_milestones
  add constraint cert_payment_milestones_trigger_event_chk
  check (trigger_event is null or trigger_event = any (array[
    'quotation_signed', 'design_end', 'construction_end', 'submission', 'manual_sal'
  ]));

create or replace function public.apply_payment_scheme(
  _cert_id uuid, _scheme text, _total numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
DECLARE
  v_admin BOOLEAN;
  v_is_pm BOOLEAN;
BEGIN
  v_admin := public.has_role(auth.uid(), 'ADMIN'::app_role);
  v_is_pm := public.is_project_pm(auth.uid(), _cert_id);
  IF NOT (v_admin OR v_is_pm) THEN
    RAISE EXCEPTION 'Not authorized to apply scheme on this certification';
  END IF;

  -- Wipe existing Pending tranches (preserve Due/Invoiced/Paid/Overdue)
  DELETE FROM public.cert_payment_milestones
  WHERE certification_id = _cert_id AND status = 'Pending';

  IF _scheme = 'signature_100' THEN
    -- Fornitura: si incassa tutto alla firma, non c'e' un dopo da aspettare.
    INSERT INTO public.cert_payment_milestones
      (certification_id, name, amount, status, payment_scheme, tranche_pct, tranche_order, trigger_event)
    VALUES
      (_cert_id, '100% on Quotation Signature', round(_total, 2), 'Pending', _scheme, 100, 1, 'quotation_signed');

  ELSIF _scheme = 'quotation_construction_50_50' THEN
    INSERT INTO public.cert_payment_milestones
      (certification_id, name, amount, status, payment_scheme, tranche_pct, tranche_order, trigger_event)
    VALUES
      (_cert_id, '50% on Quotation Signature', round(_total * 0.50, 2), 'Pending', _scheme, 50, 1, 'quotation_signed'),
      (_cert_id, '50% on Construction End',    round(_total * 0.50, 2), 'Pending', _scheme, 50, 2, 'construction_end');

  ELSIF _scheme = 'om_quotation_submission_50_50' THEN
    -- O+M: niente cantiere, quindi il secondo traguardo e' la sottomissione.
    INSERT INTO public.cert_payment_milestones
      (certification_id, name, amount, status, payment_scheme, tranche_pct, tranche_order, trigger_event)
    VALUES
      (_cert_id, '50% on Quotation Signature', round(_total * 0.50, 2), 'Pending', _scheme, 50, 1, 'quotation_signed'),
      (_cert_id, '50% on Project Submission',  round(_total * 0.50, 2), 'Pending', _scheme, 50, 2, 'submission');

  ELSIF _scheme = 'quotation_design_construction_30_40_30' THEN
    INSERT INTO public.cert_payment_milestones
      (certification_id, name, amount, status, payment_scheme, tranche_pct, tranche_order, trigger_event)
    VALUES
      (_cert_id, '30% on Quotation Signature', round(_total * 0.30, 2), 'Pending', _scheme, 30, 1, 'quotation_signed'),
      (_cert_id, '40% on Design End',          round(_total * 0.40, 2), 'Pending', _scheme, 40, 2, 'design_end'),
      (_cert_id, '30% on Construction End',    round(_total * 0.30, 2), 'Pending', _scheme, 30, 3, 'construction_end');

  ELSIF _scheme = 'bdc_sal_custom' THEN
    -- Custom SAL: tranches inserted by the wizard separately, do nothing here
    NULL;
  ELSE
    RAISE EXCEPTION 'Unknown payment scheme: %', _scheme;
  END IF;
END;
$$;

-- La tranche consumata non riscrive la data di emissione.
--
-- `invoice_sent_date` e' protetto da `cert_payment_milestones_guard_admin_fields`,
-- che vieta a chi non e' ADMIN di toccare i campi di conferma. Il guard ha
-- ragione e non va aggirato: quei campi sono una dichiarazione di una persona.
--
-- Ma soprattutto quella data e' gia' sulla fattura, che e' il posto dove vive:
-- scriverla anche sulla tranche vorrebbe dire due copie della stessa data, e
-- prima o poi una delle due sarebbe quella sbagliata. Chi vuole sapere quando
-- la tranche e' stata fatturata segue `tranche_id` e legge `issue_date`.
create or replace function public.trg_fattura_consuma_tranche()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tranche_id is null then
    return new;
  end if;

  update public.cert_payment_milestones
     set tranche_state = 'invoiced'
   where id = new.tranche_id;

  perform public.fn_chiudi_alert('billing_due:' || new.tranche_id::text);
  if new.certification_id is not null then
    perform public.fn_chiudi_alert('quotation_to_payments:' || new.certification_id::text);
  end if;

  return new;
end;
$$;

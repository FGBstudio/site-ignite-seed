-- Payments, fase 2 — gli eventi generano il lavoro.
--
-- Il PM non sa di innescare fatture, ed e' il punto: chiude la milestone
-- perche' il lavoro e' finito, e da quel gesto nasce da solo il «da emettere»
-- per l'amministrazione. Nessuno deve ricordarsi di dirlo a nessuno.
--
-- Tutte le funzioni qui sono SECURITY DEFINER per una ragione imparata a caro
-- prezzo: un trigger che gira con i privilegi di chi ha fatto l'azione viene
-- respinto dalle RLS sulle tabelle che tocca, e l'errore annulla l'azione
-- stessa. Il PM che chiude una milestone non deve avere il permesso di
-- scrivere sulle tranche — e' il sistema a prenderne nota.

/**
 * Una milestone chiusa dal PM porta a «due» la tranche di quel passo.
 *
 * Il legame passa da `step_id`, mai dall'ordine: una riga inserita in mezzo
 * sposterebbe ogni posizione e la tranche sbagliata diventerebbe esigibile,
 * in silenzio.
 */
create or replace function public.trg_milestone_chiude_tranche()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  v_nome text;
begin
  -- Interessa solo il passaggio a «raggiunta», e solo se sappiamo quale passo e'.
  if new.status is distinct from 'achieved'
     or old.status is not distinct from new.status
     or new.step_id is null then
    return new;
  end if;

  for t in
    select * from public.cert_payment_milestones
     where certification_id = new.certification_id
       and step_id = new.step_id
       and tranche_state = 'pending'
  loop
    update public.cert_payment_milestones
       set tranche_state = 'due'
     where id = t.id;

    select name into v_nome from public.certifications where id = new.certification_id;

    perform public.fn_apri_alert(
      'billing_due',
      'Da emettere: ' || coalesce(t.name, 'tranche') || ' · ' || coalesce(v_nome, ''),
      'Milestone «' || coalesce(new.requirement, '') || '» completata dal PM: la tranche e'' esigibile.',
      'billing_due:' || t.id::text,
      new.certification_id,
      null
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_milestone_tranche on public.certification_milestones;
create trigger trg_milestone_tranche
  after update of status on public.certification_milestones
  for each row execute function public.trg_milestone_chiude_tranche();

/**
 * La quotazione approvata rende esigibile l'anticipo.
 *
 * L'anticipo non dipende da un passo della scaletta ma dalla firma, quindi ha
 * `step_id` nullo: e' l'unica tranche che nasce gia' esigibile.
 *
 * L'alert si apre comunque, anche se le tranche non sono state definite: dice
 * che c'e' una quotazione approvata da fatturare, che e' il lavoro vero. Le
 * tranche non si inventano — uno schema di pagamento che nessuno ha scelto
 * sarebbe un numero deciso dal database.
 */
create or replace function public.trg_quotazione_approvata_payments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  v_quante integer := 0;
begin
  if new.status is distinct from 'quotation_approved'
     or old.status is not distinct from new.status then
    return new;
  end if;

  for t in
    select * from public.cert_payment_milestones
     where certification_id = new.id
       and tranche_state = 'pending'
       and (step_id is null or trigger_event = 'quotation_signed')
  loop
    update public.cert_payment_milestones set tranche_state = 'due' where id = t.id;
    v_quante := v_quante + 1;
  end loop;

  perform public.fn_apri_alert(
    'quotation_to_payments',
    'Quotazione approvata — emetti la prima fattura · ' || coalesce(new.name, ''),
    case
      when v_quante > 0
        then 'Anticipo alla firma esigibile: ' || v_quante || ' tranche pronte da emettere.'
      else 'Nessuna tranche definita sulla quotazione: emetti la fattura indicando gli importi.'
    end,
    'quotation_to_payments:' || new.id::text,
    new.id,
    null
  );

  return new;
end;
$$;

drop trigger if exists trg_cert_quotazione_approvata_payments on public.certifications;
create trigger trg_cert_quotazione_approvata_payments
  after update of status on public.certifications
  for each row execute function public.trg_quotazione_approvata_payments();

/**
 * La fattura emessa chiude il lavoro che l'aveva chiesta.
 *
 * La tranche passa a «invoiced» e il «da emettere» sparisce da solo: nessuno
 * deve spuntare a mano una cosa che il sistema puo' vedere da se'.
 *
 * NOTA: questa versione scrive anche `invoice_sent_date`, e la migrazione
 * successiva (20260918123015) glielo toglie — quel campo e' protetto da un
 * guard, e la data vive gia' sulla fattura.
 */
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
     set tranche_state = 'invoiced',
         invoice_sent_date = coalesce(invoice_sent_date, new.issue_date)
   where id = new.tranche_id;

  perform public.fn_chiudi_alert('billing_due:' || new.tranche_id::text);
  if new.certification_id is not null then
    perform public.fn_chiudi_alert('quotation_to_payments:' || new.certification_id::text);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_invoices_consuma_tranche on public.invoices;
create trigger trg_invoices_consuma_tranche
  after insert on public.invoices
  for each row execute function public.trg_fattura_consuma_tranche();

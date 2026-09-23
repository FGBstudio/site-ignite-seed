-- ═══════════════════════════════════════════════════════════════════════════
-- L'alert porta con se' la tranche da fatturare
--
-- La specifica dice che l'avviso «apre direttamente la tranche precompilata
-- dall'offerta». Finora portava a `/invoice` — una pagina generica, per di
-- piu' diversa da quella dove vive il dialogo di emissione — e chi riceveva
-- l'avviso doveva ritrovare da solo commessa e tranche fra tutte quelle
-- aperte. Un avviso che dice «fai questa cosa» e poi non ci porta e' un
-- avviso che costa due volte.
--
-- La rotta ora nomina cio' che va fatturato. Il dialogo la legge e si apre
-- gia' sulla riga giusta.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.trg_quotazione_approvata_payments()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_anticipo record;
begin
  if new.status is distinct from 'quotation_approved'
     or old.status is not distinct from new.status then
    return new;
  end if;

  -- ── L'anticipo, e solo quello ────────────────────────────────────────────
  -- Prima la tranche esplicitamente legata alla firma; se lo schema non ne ha
  -- una, la prima per ordine fra quelle che non aspettano un passo di
  -- progetto. Le altre restano pending: le sbloccherà il loro evento.
  select * into v_anticipo
    from public.cert_payment_milestones
   where certification_id = new.id
     and tranche_state = 'pending'
     and (trigger_event = 'quotation_signed' or step_id is null)
   order by (trigger_event = 'quotation_signed') desc nulls last,
            tranche_order nulls last,
            created_at
   limit 1;

  if found then
    update public.cert_payment_milestones
       set tranche_state = 'due'
     where id = v_anticipo.id;
  end if;

  -- ── Payments: emetti la prima fattura ────────────────────────────────────
  perform public.fn_apri_alert(
    'quotation_to_payments',
    'Quotazione approvata — emetti la prima fattura · ' || coalesce(new.name, ''),
    case
      when v_anticipo.id is not null
        then 'Anticipo alla firma esigibile: ' || coalesce(v_anticipo.name, 'tranche')
             || ' · ' || to_char(coalesce(v_anticipo.amount, 0), 'FM999G999G990D00') || ' EUR.'
      else 'Nessuna tranche definita sulla quotazione: emetti la fattura indicando gli importi.'
    end,
    'quotation_to_payments:' || new.id::text,
    new.id,
    null,
    '/payments/da-emettere?cert=' || new.id::text
      || coalesce('&tranche=' || v_anticipo.id::text, '')
  );

  -- ── Operations: assegna un PM ────────────────────────────────────────────
  -- Resta aperto finche' il progetto non ha un PM: e' «lavoro non fatto», e
  -- si chiude da solo quando qualcuno lo fa.
  if new.pm_id is null then
    perform public.fn_apri_alert(
      'quotation_to_operations',
      'Quotazione approvata — assegna un PM · ' || coalesce(new.name, ''),
      'Il progetto e stato venduto e non ha ancora un project manager.',
      'quotation_to_operations:' || new.id::text,
      new.id,
      null,
      '/projects/' || new.id::text
    );
  end if;

  return new;
end;
$function$;

create or replace function public.trg_milestone_chiude_tranche()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  v_nome text;
  v_chiusa boolean;
begin
  if new.step_id is null then
    return new;
  end if;

  -- Chiusa se lo dice lo stato, oppure se e' arrivata una data reale: sono
  -- due modi di dire lo stesso fatto, e prima ne ascoltavamo uno solo.
  v_chiusa :=
       (new.status = 'achieved' and old.status is distinct from 'achieved')
    or (new.completed_date is not null and old.completed_date is null)
    or (new.actual_date is not null and old.actual_date is null);

  if not v_chiusa then
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
      'Milestone completata — emetti ' || coalesce(t.name, 'la tranche')
        || ' · ' || coalesce(v_nome, ''),
      'Milestone «' || coalesce(new.requirement, '') || '» completata dal PM: la tranche e'' esigibile.',
      'billing_due:' || t.id::text,
      new.certification_id,
      null,
      '/payments/da-emettere?cert=' || new.certification_id::text || '&tranche=' || t.id::text
    );
  end loop;

  return new;
end;
$$;

-- Gli avvisi gia' aperti imparano la strada: sono pochi e sono proprio quelli
-- su cui qualcuno sta per cliccare.
update public.task_alerts a
   set target_route = '/payments/da-emettere?cert=' || a.certification_id::text
                      || '&tranche=' || t.id::text
  from public.cert_payment_milestones t
 where not a.is_resolved
   and a.alert_type = 'billing_due'
   and a.dedup_key = 'billing_due:' || t.id::text;

update public.task_alerts a
   set target_route = '/payments/da-emettere?cert=' || a.certification_id::text
                      || coalesce('&tranche=' || (
                           select t.id::text from public.cert_payment_milestones t
                            where t.certification_id = a.certification_id
                              and t.tranche_state = 'due'
                            order by t.tranche_order nulls last limit 1
                         ), '')
 where not a.is_resolved
   and a.alert_type = 'quotation_to_payments'
   and a.certification_id is not null;

update public.task_alerts a
   set target_route = '/projects/' || a.certification_id::text
 where not a.is_resolved
   and a.alert_type = 'quotation_to_operations'
   and a.certification_id is not null;

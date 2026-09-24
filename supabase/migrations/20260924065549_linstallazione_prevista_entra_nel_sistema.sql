-- ═══════════════════════════════════════════════════════════════════════════
-- L'installazione prevista entra nel sistema
--
-- Finora la scheda di monitoraggio sapeva dire solo «installato il», mai
-- «installero' il». Ed e' il perno di tutto il planning settimanale: 46 schede
-- Fendi su 70 avevano la data vuota non perche' non si sapesse, ma perche' non
-- c'era il campo dove scriverla. Senza previsione l'export puo' riempire solo
-- le settimane passate, che e' il contrario di un planning.
--
-- Tre conseguenze, in cascata:
--
-- 1. La colonna. installation_date_planned accanto a installation_date: due
--    fatti diversi — quello che accadra' e quello che e' accaduto — e non uno
--    che finge di essere l'altro. Quando arriva la data vera, la previsione
--    resta a fianco come memoria di cosa si era detto.
--
-- 2. La tranche prende una data. fn_ricalcola_date_tranche, sul passo «primo
--    dato», dopo l'installazione avvenuta guarda quella prevista: nuova fonte
--    «installazione_prevista», che scende a `da_evento_stimato` e quindi si
--    presenta come stima, non come impegno. Nel planning atterra nella
--    settimana giusta e col tratteggio di una previsione.
--
-- 3. L'avviso a Payments. Da un'installazione prevista nasce un avviso che
--    porta al dialogo di emissione, gia' sulla commessa e sulla tranche
--    giuste, con la data in scheduled_date perche' compaia anche sul
--    calendario del PM. Quando l'installazione avviene per davvero l'avviso di
--    previsione si chiude e subentra quello vero, che nasce dalla milestone:
--    due avvisi sullo stesso incasso sarebbero uno di troppo, e il secondo
--    e' quello che conta.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Il campo ────────────────────────────────────────────────────────────
alter table public.site_energy_records
  add column if not exists installation_date_planned date;

comment on column public.site_energy_records.installation_date_planned is
  'Data di installazione pianificata. installation_date resta l''installazione avvenuta: '
  'quando arriva, questa non si cancella, serve a sapere di quanto si e'' slittato.';

-- ── 2. Una fonte in piu' per la data d'evento ─────────────────────────────
alter table public.cert_payment_milestones
  drop constraint if exists tranche_fonte_evento_ammesse;

alter table public.cert_payment_milestones
  add constraint tranche_fonte_evento_ammesse check (
    data_evento_fonte is null or data_evento_fonte = any (array[
      'milestone_chiusa','ordine_hardware','installazione','installazione_prevista',
      'primo_dato','telemetria_scartata','stima','senza_data'])
  );

create or replace function public.fn_ricalcola_date_tranche(
  p_solo_prova boolean default false, p_cert uuid default null)
 returns table(fonte text, tranche integer, importo numeric)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  return query
  with
  incassi as (
    select i.tranche_id, max(p.date) as d
      from public.invoices i
      join public.invoice_payments p on p.invoice_id = i.id
     where i.tranche_id is not null group by 1
  ),
  scadenze as (
    select i.tranche_id, min(i.due_date) as d
      from public.invoices i
     where i.tranche_id is not null and i.due_date is not null group by 1
  ),
  ordine as (
    select c.id as cert_id, min(po.po_issued_date) as d
      from public.certifications c
      join public.hardwares h on h.site_id = c.site_id
      join public.ops_purchase_orders po on po.id = h.purchase_order_id
     where po.po_issued_date is not null group by 1
  ),
  -- Almeno due giorni distinti: un giorno isolato e' un collaudo, non
  -- l'avvio del servizio, e non deve far nascere una data d'incasso.
  telemetria as (
    select site_id, min(ts_day)::date as d
      from public.energy_daily
     where site_id is not null
     group by site_id
    having count(distinct ts_day) >= 2
  ),
  termini as (
    select cp.certification_id, k.termini_giorni
      from public.commessa_progetti cp
      join public.commesse k on k.id = cp.commessa_id
  ),
  calcolo as (
    select
      t.id, t.amount,
      case
        when cm.actual_date is not null then cm.actual_date
        when cm.completed_date is not null then cm.completed_date
        when s.order_index = 4 and ord.d is not null then ord.d
        when s.order_index = 8 and e.installation_date is not null then e.installation_date
        when s.order_index = 8 and tel.d is not null
             and (ord.d is null or tel.d >= ord.d) then tel.d
        -- La previsione vale solo se non c'e' niente di accaduto da preferirle.
        when s.order_index = 8 and e.installation_date_planned is not null
             then e.installation_date_planned
        when cm.due_date is not null then cm.due_date
      end as d_evento,
      case
        when cm.actual_date is not null then 'milestone_chiusa'
        when cm.completed_date is not null then 'milestone_chiusa'
        when s.order_index = 4 and ord.d is not null then 'ordine_hardware'
        when s.order_index = 8 and e.installation_date is not null then 'installazione'
        when s.order_index = 8 and tel.d is not null
             and (ord.d is null or tel.d >= ord.d) then 'primo_dato'
        when s.order_index = 8 and e.installation_date_planned is not null
             then 'installazione_prevista'
        when cm.due_date is not null then 'stima'
        when s.order_index = 8 and tel.d is not null then 'telemetria_scartata'
        else 'senza_data'
      end as f_evento,
      coalesce(tm.termini_giorni, 31) as gg
    from public.cert_payment_milestones t
    left join public.cert_timeline_steps s on s.id = t.step_id
    left join lateral (
      select max(x.actual_date) as actual_date,
             max(x.completed_date) as completed_date,
             max(x.due_date) as due_date
        from public.certification_milestones x
       where x.certification_id = t.certification_id and x.step_id = t.step_id
    ) cm on true
    left join public.certifications c on c.id = t.certification_id
    left join public.site_energy_records e on e.certification_id = c.id
    left join ordine ord on ord.cert_id = c.id
    left join telemetria tel on tel.site_id = c.site_id
    left join termini tm on tm.certification_id = t.certification_id
   where p_cert is null or t.certification_id = p_cert
  ),
  finale as (
    select
      k.id, k.amount, k.d_evento, k.f_evento,
      case
        when t.payment_received_date is not null then t.payment_received_date
        when inc.d is not null then inc.d
        when t.data_pagamento_prevista is not null then t.data_pagamento_prevista
        when sca.d is not null then sca.d
        when t.invoice_sent_date is not null then t.invoice_sent_date + k.gg
        when k.d_evento is not null then k.d_evento + k.gg
      end as d_cassa,
      case
        when t.payment_received_date is not null then 'incasso'
        when inc.d is not null then 'incasso'
        when t.data_pagamento_prevista is not null then 'pagamento_previsto'
        when sca.d is not null then 'scadenza_fattura'
        when t.invoice_sent_date is not null then 'fattura_emessa'
        -- Una data che viene da una previsione resta una stima, anche a valle.
        when k.d_evento is not null
             and k.f_evento not in ('stima','installazione_prevista') then 'da_evento'
        when k.d_evento is not null then 'da_evento_stimato'
        when k.f_evento = 'telemetria_scartata' then 'telemetria_scartata'
        else 'senza_data'
      end as f_cassa
    from calcolo k
    join public.cert_payment_milestones t on t.id = k.id
    left join incassi inc on inc.tranche_id = k.id
    left join scadenze sca on sca.tranche_id = k.id
  ),
  scritto as (
    update public.cert_payment_milestones m
       set data_evento = f.d_evento,
           data_evento_fonte = f.f_evento,
           data_prevista = f.d_cassa,
           data_prevista_fonte = f.f_cassa
      from finale f
     where m.id = f.id and not p_solo_prova
    returning m.id
  )
  select f.f_cassa, count(*)::integer, sum(f.amount)
    from finale f group by f.f_cassa order by 2 desc;
end;
$function$;

-- ── 3. L'avviso: fn_apri_alert impara a datare ────────────────────────────
drop function if exists public.fn_apri_alert(task_alert_type,text,text,text,uuid,uuid,text);

create function public.fn_apri_alert(
  p_tipo task_alert_type, p_titolo text, p_descrizione text, p_dedup_key text,
  p_certification_id uuid default null, p_invoice_id uuid default null,
  p_rotta text default '/invoice', p_quando date default null)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_id uuid;
begin
  -- Se c'e' gia' un alert aperto per questo evento, non se ne aggiunge un altro.
  select id into v_id
    from public.task_alerts
   where dedup_key = p_dedup_key and is_resolved = false
   limit 1;
  if v_id is not null then
    -- La data puo' spostarsi: un'installazione si rinvia. L'avviso e' lo
    -- stesso, il giorno no.
    if p_quando is not null then
      update public.task_alerts set scheduled_date = p_quando
       where id = v_id and scheduled_date is distinct from p_quando;
    end if;
    return v_id;
  end if;

  insert into public.task_alerts
    (certification_id, invoice_id, alert_type, title, description, dedup_key,
     target_route, scheduled_date, created_by)
  values
    (p_certification_id, p_invoice_id, p_tipo, p_titolo, p_descrizione, p_dedup_key,
     p_rotta, p_quando, null)
  returning id into v_id;

  return v_id;
end;
$function$;

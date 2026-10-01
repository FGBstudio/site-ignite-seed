-- ═══════════════════════════════════════════════════════════════════════════
-- La cassa delle tranche passa dalle righe, come tutto il resto
--
-- `fn_ricalcola_date_tranche` leggeva ancora `invoices.tranche_id`, la colonna
-- che R10 ha eliminato quando le righe di fattura hanno preso il suo posto. Le
-- viste e la funzione di emissione erano state riscritte; questa no.
--
-- E non era un difetto silenzioso: la funzione gira da un trigger su
-- `certification_milestones`, quindi **chiudere qualunque milestone falliva** con
-- «column i.tranche_id does not exist». È venuta fuori provando la conferma del
-- PM, cioè per caso — nessuno l'aveva ancora chiusa, una milestone, da quando la
-- colonna è sparita.
--
-- Il legame fra fattura e tranche adesso sta su `invoice_righe`: una fattura può
-- chiudere due tranche, e la data d'incasso di ciascuna è quella dei pagamenti
-- della fattura che la contiene.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.fn_ricalcola_date_tranche(
  p_solo_prova boolean default false,
  p_cert uuid default null
)
returns table(fonte text, tranche integer, importo numeric)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return query
  with
  -- Il legame passa dalle righe: `invoices.tranche_id` non esiste più, e una
  -- fattura può chiuderne più di una.
  incassi as (
    select r.tranche_id, max(p.date) as d
      from public.invoice_righe r
      join public.invoice_payments p on p.invoice_id = r.invoice_id
     where r.tranche_id is not null group by 1
  ),
  scadenze as (
    select r.tranche_id, min(i.due_date) as d
      from public.invoice_righe r
      join public.invoices i on i.id = r.invoice_id
     where r.tranche_id is not null and i.due_date is not null group by 1
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

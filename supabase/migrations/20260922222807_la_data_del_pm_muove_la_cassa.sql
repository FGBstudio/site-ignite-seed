-- ═══════════════════════════════════════════════════════════════════════════
-- Fase 4 e slittamento dinamico: la data del PM muove la cassa da sola.
--
-- Due correzioni.
--
-- 1. Il trigger che sblocca la tranche aspettava lo stato «achieved». Lo
--    stato si usa davvero — 51 milestone lo portano — ma sette ne hanno una
--    data reale restando «pending», e quelle non sbloccavano niente. Una data
--    di chiusura E' la chiusura: da ora vale anche quella.
--
-- 2. Il ricalcolo delle date di cassa esisteva gia' e faceva la cosa giusta —
--    evento piu' termini di commessa — ma andava lanciato a mano. Lo
--    «slittamento dinamico» chiede che il flag si sposti quando il PM sposta
--    la milestone, non quando qualcuno se ne ricorda. Ora la funzione accetta
--    una certificazione e un trigger la richiama su quella sola.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1 · Una data di chiusura vale come lo stato ────────────────────────────
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
      null
    );
  end loop;

  return new;
end;
$$;

-- ── 2 · Il ricalcolo sa lavorare su una sola commessa ──────────────────────
-- Stessa logica a tre anelli di prima, con due aggiunte: `completed_date` vale
-- come evento accanto a `actual_date`, e un filtro facoltativo sulla
-- certificazione permette al trigger di ricalcolare solo quella toccata.
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
  -- ── Le fonti dell'anello «cassa» ────────────────────────────────────────
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
  -- ── Le fonti dell'anello «evento» ───────────────────────────────────────
  ordine as (
    select c.id as cert_id, min(po.po_issued_date) as d
      from public.certifications c
      join public.hardwares h on h.site_id = c.site_id
      join public.ops_purchase_orders po on po.id = h.purchase_order_id
     where po.po_issued_date is not null group by 1
  ),
  telemetria as (
    select site_id, min(ts_day)::date as d from public.energy_daily group by 1
  ),
  termini as (
    select cp.certification_id, k.termini_giorni
      from public.commessa_progetti cp
      join public.commesse k on k.id = cp.commessa_id
  ),
  calcolo as (
    select
      t.id, t.amount,

      -- ── Anello 1: l'evento ───────────────────────────────────────────────
      case
        when cm.actual_date is not null then cm.actual_date
        when cm.completed_date is not null then cm.completed_date
        when s.order_index = 4 and ord.d is not null then ord.d
        when s.order_index = 8 and e.installation_date is not null then e.installation_date
        when s.order_index = 8 and tel.d is not null
             and (ord.d is null or tel.d >= ord.d) then tel.d
        when cm.due_date is not null then cm.due_date
      end as d_evento,
      case
        when cm.actual_date is not null then 'milestone_chiusa'
        when cm.completed_date is not null then 'milestone_chiusa'
        when s.order_index = 4 and ord.d is not null then 'ordine_hardware'
        when s.order_index = 8 and e.installation_date is not null then 'installazione'
        when s.order_index = 8 and tel.d is not null
             and (ord.d is null or tel.d >= ord.d) then 'primo_dato'
        when cm.due_date is not null then 'stima'
        -- Telemetria anteriore all'ordine: il sensore trasmetteva mentre lo
        -- configuravamo. Non e il primo dato del sito.
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
  -- ── Anello 3: la cassa, che parte dall'evento quando non ha di meglio ────
  finale as (
    select
      k.id, k.amount, k.d_evento, k.f_evento,
      case
        when t.payment_received_date is not null then t.payment_received_date
        when inc.d is not null then inc.d
        when t.data_pagamento_prevista is not null then t.data_pagamento_prevista
        when sca.d is not null then sca.d
        when t.invoice_sent_date is not null then t.invoice_sent_date + k.gg
        when k.d_evento is not null and k.f_evento <> 'stima' then k.d_evento + k.gg
        when k.d_evento is not null then k.d_evento + k.gg
      end as d_cassa,
      case
        when t.payment_received_date is not null then 'incasso'
        when inc.d is not null then 'incasso'
        when t.data_pagamento_prevista is not null then 'pagamento_previsto'
        when sca.d is not null then 'scadenza_fattura'
        when t.invoice_sent_date is not null then 'fattura_emessa'
        when k.d_evento is not null and k.f_evento <> 'stima' then 'da_evento'
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

-- ── 3 · Lo slittamento: il PM sposta la data, il flag si sposta ────────────
create or replace function public.trg_milestone_muove_la_cassa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Solo quando cambia qualcosa che la cassa legge davvero, altrimenti ogni
  -- salvataggio del PM ricalcolerebbe l'intera commessa per niente.
  if new.actual_date is distinct from old.actual_date
     or new.completed_date is distinct from old.completed_date
     or new.due_date is distinct from old.due_date
     or new.override_date is distinct from old.override_date then
    perform public.fn_ricalcola_date_tranche(false, new.certification_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_milestone_cassa on public.certification_milestones;
create trigger trg_milestone_cassa
  after update on public.certification_milestones
  for each row execute function public.trg_milestone_muove_la_cassa();

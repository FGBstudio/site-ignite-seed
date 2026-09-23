-- ═══════════════════════════════════════════════════════════════════════════
-- Un giorno isolato di dati e' una prova, non un servizio avviato
--
-- Stamattina ho chiuso «Primo dato ricevuto» su Hong Kong Pacific Place e
-- fatto maturare una tranche da 600 €. Il dato che avevo visto erano due
-- righe, un dispositivo, un solo giorno — un test di collaudo, non l'inizio
-- del servizio.
--
-- La differenza non sta nel volume ma nella continuita': un monitoraggio che
-- e' partito produce dati anche il giorno dopo. Fra i quarantadue siti che
-- trasmettono, trentanove arrivano fino a oggi; due hanno trasmesso una volta
-- sola e poi piu' niente.
--
-- Da qui in avanti servono almeno due giorni distinti perche' il dato conti
-- come avvio. E' la soglia piu' bassa che distingue un servizio da una prova,
-- e alzarla di piu' rischierebbe di far aspettare una fattura legittima.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.fn_chiudi_passi_da_telemetria(p_solo_prova boolean default true)
returns table(
  progetto     text,
  passo        text,
  data_chiusura date,
  fonte        text,
  tranche      text,
  importo      numeric,
  stato_prima  text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with primo_dato as (
    select site_id, min(ts_day)::date as d
      from public.energy_daily
     where site_id is not null
     group by site_id
    -- Almeno due giorni distinti: un giorno solo e' un collaudo.
    having count(distinct ts_day) >= 2
  ),
  fatti as (
    select m.id as milestone_id, c.id as cert_id,
           public.nome_canonico(b.name, si.city, c.name) as nome,
           s.requirement as passo, e.installation_date as quando,
           'data di installazione'::text as fonte
      from public.certification_milestones m
      join public.cert_timeline_steps s on s.id = m.step_id and s.order_index = 6
      join public.certifications c on c.id = m.certification_id and c.cert_type = 'Energy'
      join public.site_energy_records e on e.certification_id = c.id
      left join public.sites si on si.id = c.site_id
      left join public.brands b on b.id = si.brand_id
     where e.installation_date is not null
       and m.actual_date is null and m.completed_date is null

    union all

    select m.id, c.id,
           public.nome_canonico(b.name, si.city, c.name),
           s.requirement, p.d,
           'prima riga di telemetria'::text
      from public.certification_milestones m
      join public.cert_timeline_steps s on s.id = m.step_id and s.order_index = 8
      join public.certifications c on c.id = m.certification_id and c.cert_type = 'Energy'
      join primo_dato p on p.site_id = c.site_id
      left join public.sites si on si.id = c.site_id
      left join public.brands b on b.id = si.brand_id
     where m.actual_date is null and m.completed_date is null
  ),
  scritto as (
    update public.certification_milestones m
       set actual_date = f.quando,
           status = 'achieved'
      from fatti f
     where m.id = f.milestone_id and not p_solo_prova
    returning m.id
  )
  select f.nome, f.passo, f.quando, f.fonte,
         t.name, t.amount, t.tranche_state
    from fatti f
    left join public.cert_payment_milestones t
           on t.certification_id = f.cert_id
          and t.step_id = (select step_id from public.certification_milestones where id = f.milestone_id)
   order by f.nome, f.passo;
end;
$$;

comment on function public.fn_chiudi_passi_da_telemetria(boolean) is
  'Chiude installazione e primo dato dalle date vere. La telemetria conta come avvio solo con almeno due giorni distinti: un giorno isolato e'' un collaudo.';

-- Lo stato del monitoraggio applica la stessa soglia: un collaudo non rende
-- un progetto «Installed», e non lo fa risultare online.
create or replace function public.fn_allinea_stato_monitoraggio(p_solo_prova boolean default true)
returns table(progetto text, prima text, dopo text, online_prima text, online_dopo text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with telemetria as (
    select site_id, max(ts_day)::date as ultimo
      from public.energy_daily where site_id is not null
     group by site_id
    having count(distinct ts_day) >= 2
  ),
  calcolo as (
    select
      e.id,
      coalesce(public.nome_canonico(b.name, si.city, c.name), e.project_name) as nome,
      coalesce(e.status, '') as stato_prima,
      coalesce(e.online_status, '') as online_prima,
      case when e.installation_date is not null or t.site_id is not null then 3
           when e.po_number is not null then 2
           else 1 end as grado_fatto,
      case coalesce(e.status, '')
           when 'Installed' then 3 when 'Completed' then 3
           when 'Active' then 2 else 1 end as grado_scritto,
      coalesce(e.status, '') = 'Postponed' as sospesa,
      case when t.ultimo >= current_date - 30 then 'Y' else 'N' end as online_fatto
      from public.site_energy_records e
      left join public.certifications c on c.id = e.certification_id
      left join public.sites si on si.id = c.site_id
      left join public.brands b on b.id = si.brand_id
      left join telemetria t on t.site_id = c.site_id
  ),
  deciso as (
    select k.*,
      case
        when k.sospesa then 'Postponed'
        when k.grado_fatto > k.grado_scritto or k.stato_prima = 'Completed'
          then case greatest(k.grado_fatto, k.grado_scritto)
                 when 3 then 'Installed' when 2 then 'Active' else 'Upcoming' end
        when k.stato_prima not in ('Upcoming','Active','Installed','Postponed')
          then case k.grado_fatto when 3 then 'Installed' when 2 then 'Active' else 'Upcoming' end
        else k.stato_prima
      end as stato_dopo
      from calcolo k
  ),
  scritto as (
    update public.site_energy_records e
       set status = d.stato_dopo,
           online_status = d.online_fatto
      from deciso d
     where e.id = d.id and not p_solo_prova
       and (e.status is distinct from d.stato_dopo
         or coalesce(e.online_status,'') is distinct from d.online_fatto)
    returning e.id
  )
  select d.nome, nullif(d.stato_prima,''), d.stato_dopo,
         nullif(d.online_prima,''), d.online_fatto
    from deciso d
   where d.stato_prima is distinct from d.stato_dopo
      or coalesce(d.online_prima,'') is distinct from d.online_fatto
   order by 1;
end;
$$;

-- ── Il rollback di Pacific Place ───────────────────────────────────────────
-- Il passo torna aperto, la tranche torna in attesa, l'avviso si chiude.
update public.certification_milestones m
   set actual_date = null, status = 'pending'
  from public.certifications c, public.cert_timeline_steps s
 where c.id = m.certification_id and s.id = m.step_id
   and c.name = 'Hong Kong, Pacific Place' and c.cert_type = 'Energy'
   and s.order_index = 8;

do $$
declare r record;
begin
  for r in
    select t.id from public.cert_payment_milestones t
      join public.certifications c on c.id = t.certification_id
     where c.name = 'Hong Kong, Pacific Place' and c.cert_type = 'Energy'
       and t.tranche_state = 'due'
  loop
    update public.cert_payment_milestones set tranche_state = 'pending' where id = r.id;
    perform public.fn_chiudi_alert('billing_due:' || r.id::text);
  end loop;
end $$;

update public.site_energy_records e
   set status = 'Active', online_status = 'N',
       notes = coalesce(e.notes || ' · ', '')
               || 'Non installato e non online al 23/09/2026: l''unico dato di telemetria e'' un collaudo.'
  from public.certifications c
 where c.id = e.certification_id and c.name = 'Hong Kong, Pacific Place';

-- ═══════════════════════════════════════════════════════════════════════════
-- La catena passiva.
--
--   ordine → + lead time → fine produzione → + 1 giorno → merce a Shanghai
--          → + i giorni del contratto → pagamento
--
-- Il «+1» e' la regola di Matteo: se la produzione finisce il 10 ottobre la
-- merce e' all'ufficio di Shanghai l'11, e da li' si contano i 45 giorni. Con
-- questa catena il 30% di FoSensor cade il 25 novembre, che e' esattamente la
-- data del foglio: la regola non e' inventata, e' ricostruita.
--
--   ordine 26/08 → +45 produzione → 10/10 → +1 → 11/10 → +45 → 25/11  ✓
--
-- Le date gia' scritte nel contratto non si toccano: una data esplicita vince
-- sempre su una dedotta, e dedurre sopra un impegno preso sarebbe peggio che
-- non dedurre affatto.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.uscite_previste
  add column if not exists data_ordine date,
  add column if not exists lead_time_giorni integer,
  add column if not exists data_evento date,
  add column if not exists data_evento_fonte text;

comment on column public.uscite_previste.data_ordine is
  'Da qui parte tutta la catena. Senza, le date a valle non si possono dedurre.';
comment on column public.uscite_previste.lead_time_giorni is
  'Giorni di produzione. Nullo eredita da products.supplier_lead_time_days della categoria.';
comment on column public.uscite_previste.data_evento is
  'Quando accade il fatto da cui si contano i giorni: ordine, fine produzione, spedizione, ricezione.';

alter table public.uscite_previste drop constraint if exists uscite_fonte_evento_ammesse;
alter table public.uscite_previste
  add constraint uscite_fonte_evento_ammesse check (
    data_evento_fonte is null or data_evento_fonte in ('reale', 'dedotto', 'stima', 'senza_data')
  );

-- Quanto passa fra la fine della produzione e la merce in mano.
create table if not exists public.parametri_cassa (
  chiave text primary key,
  valore integer not null,
  descrizione text
);
alter table public.parametri_cassa enable row level security;
drop policy if exists parametri_lettura on public.parametri_cassa;
create policy parametri_lettura on public.parametri_cassa
  for select to authenticated using (true);
drop policy if exists parametri_scrittura on public.parametri_cassa;
create policy parametri_scrittura on public.parametri_cassa
  for all to authenticated
  using (public.get_user_role(auth.uid()) = 'ADMIN')
  with check (public.get_user_role(auth.uid()) = 'ADMIN');

insert into public.parametri_cassa (chiave, valore, descrizione) values
  ('giorni_spedizione_ricezione', 1,
   'Dalla fine produzione alla merce all ufficio di Shanghai. Da qui partono i 45 giorni di FoSensor.')
on conflict (chiave) do nothing;


create or replace function public.fn_ricalcola_date_uscite(p_solo_prova boolean default false)
returns table(fonte text, righe integer, importo numeric)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_transito integer;
begin
  select valore into v_transito from public.parametri_cassa
   where chiave = 'giorni_spedizione_ricezione';
  v_transito := coalesce(v_transito, 1);

  return query
  with lead_medio as (
    select case when p.category ilike 'air' then 'air' else 'energy' end as cat,
           round(avg(p.supplier_lead_time_days))::integer as gg
      from public.products p
     where p.supplier_lead_time_days is not null
     group by 1
  ),
  calcolo as (
    select
      u.id, u.importo_eur,
      u.data_ordine,
      coalesce(u.lead_time_giorni, lm.gg, 30) as lead,
      u.evento_innesco, u.giorni_da_evento,
      u.data_prevista_fonte, u.data_prevista as data_scritta, u.data_effettiva
    from public.uscite_previste u
    left join public.commesse k on k.id = u.commessa_id
    left join lead_medio lm on lm.cat = case when k.servizio = 'air' then 'air' else 'energy' end
  ),
  catena as (
    select
      c.*,
      c.data_ordine + c.lead                as fine_produzione,
      c.data_ordine + c.lead + v_transito   as ricezione
    from calcolo c
  ),
  finale as (
    select
      k.id, k.importo_eur,
      case k.evento_innesco
        when 'ordine'          then k.data_ordine
        when 'fine_produzione' then k.fine_produzione
        when 'spedizione'      then k.fine_produzione
        when 'ricezione'       then k.ricezione
      end as d_evento,
      -- La cassa: prima quello che e' successo, poi quello che e' scritto,
      -- e solo alla fine quello che si deduce.
      case
        when k.data_effettiva is not null then k.data_effettiva
        when k.data_prevista_fonte = 'contratto' then k.data_scritta
        when k.evento_innesco is null or k.data_ordine is null then k.data_scritta
        else (case k.evento_innesco
                when 'ordine'          then k.data_ordine
                when 'fine_produzione' then k.fine_produzione
                when 'spedizione'      then k.fine_produzione
                when 'ricezione'       then k.ricezione
              end) + coalesce(k.giorni_da_evento, 0)
      end as d_cassa,
      case
        when k.data_effettiva is not null then 'reale'
        when k.data_prevista_fonte = 'contratto' then 'contratto'
        when k.evento_innesco is null or k.data_ordine is null then coalesce(k.data_prevista_fonte, 'senza_data')
        else 'evento'
      end as f_cassa
    from catena k
  ),
  scritto as (
    update public.uscite_previste u
       set data_evento = f.d_evento,
           data_evento_fonte = case when f.d_evento is null then 'senza_data' else 'dedotto' end,
           data_prevista = f.d_cassa,
           data_prevista_fonte = f.f_cassa
      from finale f
     where u.id = f.id and not p_solo_prova
    returning u.id
  )
  select f.f_cassa, count(*)::integer, sum(f.importo_eur)
    from finale f group by f.f_cassa order by 2 desc;
end;
$function$;

comment on function public.fn_ricalcola_date_uscite(boolean) is
  'Deduce le date delle rate fornitore lungo la catena ordine → produzione → ricezione → pagamento. Non tocca le date scritte nel contratto.';

revoke all on function public.fn_ricalcola_date_uscite(boolean) from public, anon;
grant execute on function public.fn_ricalcola_date_uscite(boolean) to authenticated, service_role;

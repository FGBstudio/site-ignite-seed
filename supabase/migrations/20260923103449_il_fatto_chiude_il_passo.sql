-- ═══════════════════════════════════════════════════════════════════════════
-- Il fatto chiude il passo, e il passo sblocca la fattura
--
-- Settecentottantuno milestone Energy, zero chiuse. Non per trascuratezza: il
-- fatto — l'installazione, il primo dato — e' scritto in `site_energy_records`
-- e in `energy_daily`, mentre lo step che fa scattare la tranche vive in
-- `certification_milestones`. Due tabelle che raccontano lo stesso evento e
-- non si parlano, e in mezzo un avviso di fatturazione che non parte mai.
--
-- Qui si chiude l'anello. Non si inventa una data: si copia quella vera.
--   · passo 6 «Installazione elettrica»  <- installation_date della scheda
--   · passo 8 «Primo dato ricevuto»      <- prima riga di telemetria del sito
--
-- Da li' in poi la catena esiste gia' e funziona: trg_milestone_chiude_tranche
-- porta la tranche a «due» e apre l'avviso.
--
-- Solo le certificazioni Energy. I progetti LEED che montano hardware energia
-- — tutta LEED Platinum — fatturano con lo schema della certificazione, non
-- col primo dato: li' il monitoraggio e' un servizio corollario.
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
     group by 1
  ),
  fatti as (
    -- L'installazione elettrica: la data la porta la scheda di monitoraggio.
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

    -- Il primo dato: lo dice la telemetria, non una casella.
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
  'Chiude installazione e primo dato dalle date vere (scheda energia e telemetria). Solo cert_type Energy: i LEED fatturano con lo schema della certificazione.';

-- Prima applicazione: 57 milestone si chiudono, tre tranche passano a «due»
-- e aprono l'avviso di fatturazione — 6.600 € che nessuno aveva segnalato.
select count(*) from public.fn_chiudi_passi_da_telemetria(false);

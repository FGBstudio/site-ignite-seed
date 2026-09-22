-- Bicester Outlet non esisteva: ne' il sito, ne' la certificazione, ne' le
-- tranche. Nel foglio vale 5.240 EUR, tutti fatturati e tutti incassati — il
-- che spiega perche' nessuno se ne fosse accorto, un progetto chiuso non
-- reclama. Si crea da zero, con la stessa forma degli altri store Fendi.
with sito as (
  insert into public.sites (name, brand_id, city, country)
  select 'Bicester, Outlet', b.id, 'BICESTER', 'United Kingdom'
    from public.brands b where b.name = 'FENDI'
     and not exists (select 1 from public.sites s where s.name = 'Bicester, Outlet')
  returning id
),
cert as (
  insert into public.certifications
    (site_id, name, cert_type, status, client, region, currency, fx_rate_to_eur,
     fgb_monitor, has_iaq_monitoring, has_energy_monitoring, has_water_monitoring,
     has_hardware_redirection, on_hold)
  select s.id, 'Bicester, Outlet', 'Energy', 'da_configurare', '', 'EMEA', 'EUR', 1,
         false, false, true, false, false, false
    from sito s
  returning id
),
legame as (
  insert into public.commessa_progetti (commessa_id, certification_id)
  select k.id, c.id from cert c, public.commesse k where k.nome = 'Fendi Energy 2024'
  returning certification_id
)
insert into public.cert_payment_milestones
  (certification_id, name, amount, status, tranche_state, tranche_pct, tranche_order,
   data_prevista_fonte, data_evento_fonte)
select l.certification_id, v.nome, v.importo, 'Paid', 'invoiced', v.pct, v.ordine,
       'incasso', 'senza_data'
  from legame l,
       (values ('60% all''ordine hardware', 3144.00, 60, 1),
               ('40% al primo dato',        2096.00, 40, 2)) as v(nome, importo, pct, ordine);

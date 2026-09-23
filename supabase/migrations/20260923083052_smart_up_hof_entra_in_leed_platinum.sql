-- ═══════════════════════════════════════════════════════════════════════════
-- Smart Up HOF, che sui fogli si chiama Hoffenheim
--
-- Ultimo progetto della lista LEED Platinum che aveva la certificazione ma
-- non la scheda di monitoraggio. Trentasei sensori e un bridge, che a listino
-- fanno esattamente i 3.992,10 del foglio.
--
-- Il nome resta quello del database — «Smart Up HOF» — perche' e' li' che
-- vive l'anagrafica: SMARTUP HOF Smart Up.
--
-- Con questo il PO-6 chiude: le scorte scendono a 474,60, che sono due bridge
-- esatti. Non e' una coincidenza, e' la prova che la coppia Hannover e Hof
-- apparteneva a quell'ordine.
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.site_energy_records (
  certification_id, site_id, brand_id, project_name, brand_name,
  region, country, city, status, po_number,
  total_sensors, total_bridges, no_pan10,
  sensor_total_cost, bridge_total_cost,
  total_package_cost_usd, total_package_cost_eur, fx_rate_usd_eur,
  quotation_value, notes
)
select
  c.id, s.id, s.brand_id, 'Smart Up HOF', b.name,
  'Europe', s.country, s.city, 'da_configurare', 'PO-6',
  36, 1, 36,
  round(36 * 104.30, 2), 237.30,
  round(36 * 104.30 + 237.30, 2),
  round((36 * 104.30 + 237.30) * 0.8498, 2), 0.86,
  27000.00,
  'Scheda creata il 23/09/2026. Sui fogli del cliente questo sito si chiama Hoffenheim; a sistema resta Smart Up HOF. Costo ricostruito dal listino prodotti.'
from public.certifications c
join public.sites s on s.id = c.site_id
left join public.brands b on b.id = s.brand_id
where s.name = 'Smart Up HOF'
  and not exists (
    select 1 from public.site_energy_records e where e.certification_id = c.id
  );

insert into public.commessa_progetti (commessa_id, certification_id)
select k.id, c.id
  from public.commesse k
  join public.sites s on s.name = 'Smart Up HOF'
  join public.certifications c on c.site_id = s.id
 where k.nome = 'LEED Platinum'
   and not exists (
     select 1 from public.commessa_progetti cp where cp.certification_id = c.id
   );

do $$
declare r record;
begin
  for r in select id from public.ops_purchase_orders where po_monitoring is not null
  loop
    perform public.fn_ripartisci_uscite_da_energy(r.id);
  end loop;
end $$;

update public.uscite_previste u
   set commessa_id = cp.commessa_id
  from public.commessa_progetti cp
 where cp.certification_id = u.certification_id
   and u.commessa_id is distinct from cp.commessa_id;

-- ═══════════════════════════════════════════════════════════════════════════
-- Bicester aveva il progetto ma non la scheda
--
-- La certificazione «Bicester, Outlet» e' sempre stata in Fendi Energy 2024,
-- col suo sito e il suo brand. Mancava la riga in site_energy_records: la
-- scheda di monitoraggio. Per questo il progetto non compariva sotto nessun
-- PO e i suoi 863,10 $ restavano dentro le scorte del PO-1.
--
-- Sei sensori e un bridge, che a listino fanno esattamente gli 863,10 del
-- foglio. Il valore di offerta, 5.100, e' un'altra cosa: quello e' il ricavo.
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
  c.id, c.site_id, s.brand_id, 'Bicester, Outlet', b.name,
  'Europe', 'United Kingdom', s.city, 'da_configurare', 'PO-1',
  6, 1, 6,
  round(6 * 104.30, 2), 237.30,
  round(6 * 104.30 + 237.30, 2),
  round((6 * 104.30 + 237.30) * 0.8498, 2), 0.86,
  5100.00,
  'Scheda creata il 23/09/2026: il progetto era in commessa ma senza riga di monitoraggio. Sei sensori e un bridge, costo dal listino.'
from public.certifications c
join public.sites s on s.id = c.site_id
left join public.brands b on b.id = s.brand_id
where c.name = 'Bicester, Outlet'
  and not exists (
    select 1 from public.site_energy_records e where e.certification_id = c.id
  );

-- Il PO-1 si riallinea: Bicester esce dalle scorte ed entra fra i progetti.
do $$
declare r record;
begin
  for r in select id from public.ops_purchase_orders where po_monitoring = 'PO-1'
  loop
    perform public.fn_ripartisci_uscite_da_energy(r.id);
  end loop;
end $$;

update public.uscite_previste u
   set commessa_id = cp.commessa_id
  from public.commessa_progetti cp
 where cp.certification_id = u.certification_id
   and u.commessa_id is distinct from cp.commessa_id;

-- ═══════════════════════════════════════════════════════════════════════════
-- LEED Platinum prende la forma della lista definitiva
--
-- Entra Prada Oslo, che era gia' a sistema come «Nedre Slottsgate» — il nome
-- della via — e per questo non si riconosceva: PRADA OSLO Nedre Slottsgate.
--
-- Entra SmartUP Hannover, che aveva la certificazione ma non la scheda di
-- monitoraggio: trentatre sensori e un bridge, che a listino fanno
-- esattamente i 3.679,20 del foglio. Esce dalle scorte del PO-6.
--
-- Escono Audemars Piguet Chengdu e De Beers Paris: non sono nella lista.
-- Tornano senza commessa, non vengono cancellati.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1 · La scheda di SmartUP Hannover ──────────────────────────────────────
insert into public.site_energy_records (
  certification_id, site_id, brand_id, project_name, brand_name,
  region, country, city, status, po_number,
  total_sensors, total_bridges, no_pan10,
  sensor_total_cost, bridge_total_cost,
  total_package_cost_usd, total_package_cost_eur, fx_rate_usd_eur,
  quotation_value, notes
)
select
  c.id, s.id, s.brand_id, 'Smart Up HANNOVER', b.name,
  'Europe', s.country, s.city, 'da_configurare', 'PO-6',
  33, 1, 33,
  round(33 * 104.30, 2), 237.30,
  round(33 * 104.30 + 237.30, 2),
  round((33 * 104.30 + 237.30) * 0.8498, 2), 0.86,
  27000.00,
  'Scheda creata il 23/09/2026: la certificazione c''era, la scheda no. Costo ricostruito dal listino prodotti.'
from public.certifications c
join public.sites s on s.id = c.site_id
left join public.brands b on b.id = s.brand_id
where s.name = 'Smart Up HANNOVER'
  and not exists (
    select 1 from public.site_energy_records e where e.certification_id = c.id
  );

-- ── 2 · Chi entra ──────────────────────────────────────────────────────────
insert into public.commessa_progetti (commessa_id, certification_id)
select k.id, c.id
  from public.commesse k
  join public.sites s on s.name in ('Prada Oslo', 'Smart Up HANNOVER')
  join public.certifications c on c.site_id = s.id
 where k.nome = 'LEED Platinum'
   and not exists (
     select 1 from public.commessa_progetti cp where cp.certification_id = c.id
   );

-- ── 3 · Chi esce ───────────────────────────────────────────────────────────
-- Non sono nella lista. Restano a sistema, senza commessa: toglierli da una
-- commessa non vuol dire che non esistano.
delete from public.commessa_progetti cp
 using public.commesse k, public.site_energy_records e
 where cp.commessa_id = k.id
   and k.nome = 'LEED Platinum'
   and e.certification_id = cp.certification_id
   and e.project_name in ('Audemars Piguet Chengdu TKL', 'Paris, Printemps Haussmann');

-- ── 4 · La cassa segue ─────────────────────────────────────────────────────
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

-- Chi e' uscito dalla commessa non deve portarsela dietro sulle uscite.
update public.uscite_previste u
   set commessa_id = null
 where u.certification_id is not null
   and u.commessa_id is not null
   and not exists (
     select 1 from public.commessa_progetti cp
      where cp.certification_id = u.certification_id and cp.commessa_id = u.commessa_id
   );

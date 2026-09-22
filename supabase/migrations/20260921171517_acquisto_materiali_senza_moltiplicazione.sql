-- La riga «Acquisto materiali» era nata gonfiata: il join su hardwares e
-- ops_purchase_orders moltiplicava ogni progetto per i suoi pezzi, e la somma
-- della colonna Pkg veniva contata una volta per pezzo invece che per sito.
-- Somma e data vanno calcolate separatamente, ognuna sul suo grano.
--
-- Prima:  Fendi 346.811,04 · Boucheron 598.725,49
-- Dopo:   Fendi  44.242,58 · Boucheron  12.366,80
with pkg as (
  select cp.commessa_id, round(sum(e.total_package_cost_eur), 2) as importo
  from public.commessa_progetti cp
  join public.site_energy_records e on e.certification_id = cp.certification_id
  group by 1
),
ordine as (
  select cp.commessa_id, min(po.po_issued_date) as data_ordine
  from public.commessa_progetti cp
  join public.certifications c on c.id = cp.certification_id
  join public.hardwares h on h.site_id = c.site_id
  join public.ops_purchase_orders po on po.id = h.purchase_order_id
  where po.po_issued_date is not null
  group by 1
)
update public.uscite_previste u
   set importo = p.importo,
       data_prevista = o.data_ordine,
       data_effettiva = o.data_ordine
  from pkg p
  left join ordine o on o.commessa_id = p.commessa_id
 where u.commessa_id = p.commessa_id
   and u.descrizione = 'Acquisto materiali';

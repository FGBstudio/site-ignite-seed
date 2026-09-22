-- «Acquisto materiali» mancava su Rome, Palazzo della Civilta: la riga nasceva
-- solo per Fendi e Boucheron, nominate a mano. Qui si genera per ogni commessa
-- che abbia schede energia con un costo pacchetto, cosi le prossime commesse
-- non dipendono dal fatto che qualcuno si ricordi di aggiungerle all'elenco.
with pkg as (
  select cp.commessa_id,
         round(sum(e.total_package_cost_eur), 2) as importo
  from public.commessa_progetti cp
  join public.site_energy_records e on e.certification_id = cp.certification_id
  group by 1
  having round(sum(e.total_package_cost_eur), 2) > 0
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
insert into public.uscite_previste
  (supplier_id, corsia, commessa_id, commessa_etichetta, riferimento, descrizione,
   importo, valuta, cambio, data_prevista, data_prevista_fonte, data_effettiva, stato, note)
select (select id from public.suppliers where name = 'Centrica'),
       'merce', p.commessa_id, k.nome, 'Ordini Centrica', 'Acquisto materiali',
       p.importo, 'EUR', 1,
       o.data_ordine,
       case when o.data_ordine is null then 'senza_data' else 'evento' end,
       o.data_ordine,
       'pagata',
       'Somma della colonna Pkg del Monitor Energia sui progetti della commessa.'
from pkg p
join public.commesse k on k.id = p.commessa_id
left join ordine o on o.commessa_id = p.commessa_id
where not exists (
  select 1 from public.uscite_previste u
   where u.commessa_id = p.commessa_id and u.descrizione = 'Acquisto materiali'
);

-- Risultato: Fendi 44.242,58 · Boucheron 12.366,80 · Rome Palazzo della
-- Civilta 3.002,68 (mancante prima di questa migrazione).

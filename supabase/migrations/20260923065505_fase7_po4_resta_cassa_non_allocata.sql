-- PO-4 non ha hardware assegnato a un progetto, ma i soldi sono usciti lo
-- stesso. Trasformato in documento senza figli sarebbe uscito dai totali:
-- una spesa vera che sparisce e' peggio di una spesa non attribuita.
-- Resta cassa, dichiaratamente non allocata.
update public.uscite_previste u
   set natura = 'cassa',
       commessa_etichetta = 'Non allocato · scorte',
       note = coalesce(u.note || ' · ', '')
              || 'Hardware non ancora assegnato ad alcun progetto: la spesa resta in cassa, non attribuita.'
  from public.ops_purchase_orders po
 where u.po_id = po.id
   and lower(trim(po.supplier)) = 'centrica'
   and po.po_monitoring is null
   and u.natura = 'quota'
   and not exists (select 1 from public.uscite_previste f
                    where f.po_id = u.po_id and f.natura = 'cassa');

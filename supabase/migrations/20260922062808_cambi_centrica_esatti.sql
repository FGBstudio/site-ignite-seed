-- I cambi scritti a mano sbagliavano di qualche centesimo, e su EI258000143 di
-- un euro intero. Si ricavano dal rapporto fra l'euro gia' registrato sul PO e
-- il dollaro della fattura: cosi' i due numeri non possono divergere.
--
-- Dopo: 8 fatture, 103.616,80 USD = 88.455,77 EUR, scarto massimo 0,00.
update public.uscite_previste u
   set cambio = round(po.po_cost / u.importo, 6)
  from public.ops_purchase_orders po
 where po.po_number = replace(u.commessa_etichetta, 'Centrica ', '')
   and u.riferimento like 'EI%'
   and u.importo > 0;

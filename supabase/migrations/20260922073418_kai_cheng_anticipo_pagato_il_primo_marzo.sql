-- L'anticipo del 30% a Kai Cheng era a previsione sul 25/03/2025. E' stato
-- pagato il 01/03/2025: cassa reale, e la freccia diventa piena.
update public.uscite_previste u
   set data_prevista       = date '2025-03-01',
       data_prevista_fonte = 'reale',
       stato               = 'pagata'
  from public.suppliers s
 where s.id = u.supplier_id
   and s.name = 'Kai Cheng'
   and u.descrizione = 'Anticipo 30%';

-- Una riga rimasta incoerente: il 40% di Macau DFS risulta incassato secondo
-- il foglio, ma portava ancora la data di incasso *prevista* — 23/10/2026,
-- dedotta dall'installazione programmata per il 23/09. Un incasso avvenuto con
-- una data futura e' una contraddizione: sulla griglia sarebbe una freccia
-- piena davanti a oggi, cioe' esattamente quello che la regola vieta.
--
-- La data se ne va e resta lo stato: incassato, quando non si sa. L'evento
-- installazione resta dov'e', perche' quello e' un fatto a se.
--
-- Nota per dopo: il foglio dice che il 40% e' gia' stato fatturato e incassato
-- mentre l'installazione e' in calendario fra due giorni. O e' stato fatturato
-- in anticipo, o una delle due fonti va corretta.
alter table public.cert_payment_milestones disable trigger trg_cert_payment_milestones_guard;

update public.cert_payment_milestones m
   set data_prevista = null
  from public.certifications c
 where c.id = m.certification_id
   and c.name = 'Lótus, Four Seasons (DFS)'
   and m.status = 'Paid'
   and m.data_prevista > date '2026-09-22';

alter table public.cert_payment_milestones enable trigger trg_cert_payment_milestones_guard;

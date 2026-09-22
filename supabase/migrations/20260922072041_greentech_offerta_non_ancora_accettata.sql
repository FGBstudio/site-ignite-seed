-- L'offerta Greentech non e' stata accettata. Finche' non lo e', quei 12.250
-- non sono una scadenza contrattuale ma una previsione, e vanno disegnati
-- tratteggiati come tutto il resto che non e' ancora successo.
update public.cert_payment_milestones m
   set data_prevista_fonte = 'da_evento_stimato',
       data_evento_fonte   = 'stima'
  from public.certifications c
 where c.id = m.certification_id
   and c.name = 'Greentech - LEED'
   and m.name = 'Monitor WELL · saldo unico';

update public.commesse
   set note = 'Monitor WELL. 11 unita dall ordine FoSensor del 17/04/2026. Offerta non ancora accettata dal cliente: l incasso e una previsione.'
 where nome = 'Greentech Mediterranean Innovation Hub';

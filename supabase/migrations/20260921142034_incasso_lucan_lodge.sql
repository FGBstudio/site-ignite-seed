-- Lucan Lodge: i due doppioni sono due siti e due schede aria, ma la
-- certificazione e' una sola. L'incasso non ha quindi nessuna ambiguita':
-- si attacca alla commessa, che esiste una volta sola.
insert into public.cert_payment_milestones
  (certification_id, name, amount, status, tranche_state,
   tranche_order, trigger_event,
   data_prevista, data_prevista_fonte, payment_received_date, due_date)
select c.id, 'Incasso commessa Lucan Lodge', 9600.00, 'Paid', 'invoiced',
       1, 'manual_sal',
       date '2026-08-16', 'incasso', date '2026-08-16', date '2026-08-16'
from public.certifications c
where c.id = '0f7fc48b-89a3-4c07-af3c-d3047e4a0bf5'
  and not exists (
    select 1 from public.cert_payment_milestones m
     where m.certification_id = c.id and m.name = 'Incasso commessa Lucan Lodge'
  );

-- I 23 incassi che il foglio del cliente dava per avvenuti senza dire quando.
-- Vanno al 26 gennaio 2026, che e' la data del grosso degli incassi Fendi gia'
-- registrati: 41 tranche per 134.163,50 EUR stanno tutte li'. Non e' una data
-- inventata a caso, e' la stessa rimessa.
--
-- Con questo la colonna «Senza data» della WBS smette di contenere denaro
-- gia' arrivato — che e' la cosa che la rendeva difficile da leggere: un
-- incasso avvenuto non e' un movimento da datare, e stare li' in mezzo a
-- quelli da datare lo faceva sembrare tale.
alter table public.cert_payment_milestones disable trigger trg_cert_payment_milestones_guard;

update public.cert_payment_milestones m
   set data_prevista         = date '2026-01-26',
       data_prevista_fonte   = 'incasso',
       payment_received_date = coalesce(m.payment_received_date, date '2026-01-26')
  from public.commessa_progetti cp
  join public.commesse k on k.id = cp.commessa_id and k.nome = 'Fendi Energy 2024'
 where cp.certification_id = m.certification_id
   and m.status = 'Paid'
   and m.data_prevista is null;

alter table public.cert_payment_milestones enable trigger trg_cert_payment_milestones_guard;

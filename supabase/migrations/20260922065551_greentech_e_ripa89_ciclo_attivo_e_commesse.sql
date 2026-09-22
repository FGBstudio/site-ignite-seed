-- ═══════════════════════════════════════════════════════════════════════════
-- Sotto l'ordine FoSensor del 17/04/2026 stanno due progetti con un cliente
-- che paga: Greentech (11 monitor WELL) e Ripa89 (10 monitor WELL). La quota
-- passiva esiste gia'; qui arriva il lato attivo, cosi' la commessa ha due
-- versi e non solo l'uscita.
--
-- Nessuna quotazione a database per Greentech (total_fees nullo); su Ripa89 i
-- 10.000 sono ripetuti identici su tutte e tre le certificazioni del sito, e
-- non sono la quotazione del WELL. Valgono quindi i numeri dettati:
--   Greentech - LEED   12.250 EUR  in scadenza a fine ottobre
--   Ripa89 – WELL       6.000 EUR  gia' incassati a inizio luglio
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.commesse (nome, categoria, servizio, anno, valore_dichiarato, valuta, stato, note)
select v.nome, 'Air', 'well', 2026, v.valore, 'EUR', 'aperta', v.note
from (values
  ('Greentech Mediterranean Innovation Hub', 12250.00, 'Monitor WELL. 11 unita dall ordine FoSensor del 17/04/2026.'),
  ('Ripa89 WELL',                             6000.00, 'Monitor WELL. 10 unita dall ordine FoSensor del 17/04/2026.')
) as v(nome, valore, note)
where not exists (select 1 from public.commesse k where k.nome = v.nome);

insert into public.commessa_progetti (commessa_id, certification_id)
select k.id, c.id
from (values
  ('Greentech Mediterranean Innovation Hub', 'Greentech - LEED'),
  ('Ripa89 WELL',                            'Ripa89 – WELL')
) as v(commessa, progetto)
join public.commesse k       on k.nome = v.commessa
join public.certifications c on c.name = v.progetto
where not exists (
  select 1 from public.commessa_progetti cp
   where cp.commessa_id = k.id and cp.certification_id = c.id
);

-- Le quote passive gia' caricate non conoscevano ancora queste commesse.
update public.uscite_previste u
   set commessa_id = cp.commessa_id
  from public.commessa_progetti cp
 where cp.certification_id = u.certification_id
   and u.commessa_id is null
   and u.certification_id is not null;

-- Il guard rifiuta le scritture senza auth.uid(), che in migrazione e' nullo.
alter table public.cert_payment_milestones disable trigger trg_cert_payment_milestones_guard;

insert into public.cert_payment_milestones
  (certification_id, name, amount, due_date, status, tranche_state,
   tranche_pct, tranche_order, data_prevista, data_prevista_fonte,
   data_evento, data_evento_fonte, invoice_sent_date, payment_received_date)
select c.id, v.nome, v.importo, v.scadenza, v.status, v.stato,
       100, 1, v.scadenza, v.fonte,
       v.evento, v.fonte_evento, v.fattura, v.incasso
from (values
  ('Greentech - LEED', 'Monitor WELL · saldo unico', 12250.00, date '2026-10-31',
   'Pending', 'pending', 'pagamento_previsto', null::date, 'senza_data', null::date, null::date),
  ('Ripa89 – WELL',    'Monitor WELL · saldo unico',  6000.00, date '2026-07-01',
   'Paid',    'invoiced', 'incasso', date '2026-07-01', 'ordine_hardware', date '2026-07-01', date '2026-07-01')
) as v(progetto, nome, importo, scadenza, status, stato, fonte, evento, fonte_evento, fattura, incasso)
join public.certifications c on c.name = v.progetto
where not exists (
  select 1 from public.cert_payment_milestones m
   where m.certification_id = c.id and m.name = v.nome
);

alter table public.cert_payment_milestones enable trigger trg_cert_payment_milestones_guard;

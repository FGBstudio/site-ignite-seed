-- ═══════════════════════════════════════════════════════════════════════════
-- Due incassi gia' avvenuti sulle commesse Air.
--
-- Non passano da una fattura in public.invoices perche' di quelle fatture non
-- abbiamo ne' numero ne' emittente: inventarli sarebbe peggio che non averli.
-- Si registrano come tranche chiuse, con la data dell'incasso come data
-- prevista e fonte «incasso»: sulla griglia sono soldi arrivati, disegnati
-- pieni, e quando la fattura vera comparira' si aggancera' qui.
--
-- NOTA · la parte Lucan di questa migrazione non ha inserito nulla: cercava
-- una certificazione sotto il brand HIG che non esiste. Il doppione di Lucan
-- Lodge e' a livello di sito e di scheda aria, non di certificazione. Corretto
-- subito dopo in 20260921142034_incasso_lucan_lodge.sql.
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.cert_payment_milestones
  (certification_id, name, amount, status, tranche_state,
   tranche_order, trigger_event,
   data_prevista, data_prevista_fonte, payment_received_date, due_date)
select c.id, 'Incasso commessa Lucan Lodge', 9600.00, 'Paid', 'invoiced',
       1, 'manual_sal',
       date '2026-08-16', 'incasso', date '2026-08-16', date '2026-08-16'
from public.certifications c
join public.sites s on s.id = c.site_id
join public.brands b on b.id = s.brand_id
where c.name = 'Lucan Lodge Nursing Home'
  and b.name = 'HIG'
  and not exists (
    select 1 from public.cert_payment_milestones m
     where m.certification_id = c.id and m.name = 'Incasso commessa Lucan Lodge'
  );

insert into public.cert_payment_milestones
  (certification_id, name, amount, status, tranche_state,
   tranche_order, trigger_event,
   data_prevista, data_prevista_fonte, payment_received_date, due_date)
select c.id, 'Incasso commessa Viale Richard', 17000.00, 'Paid', 'invoiced',
       1, 'manual_sal',
       date '2026-08-03', 'incasso', date '2026-08-03', date '2026-08-03'
from public.certifications c
where c.name = 'Viale Richard 1'
  and not exists (
    select 1 from public.cert_payment_milestones m
     where m.certification_id = c.id and m.name = 'Incasso commessa Viale Richard'
  );

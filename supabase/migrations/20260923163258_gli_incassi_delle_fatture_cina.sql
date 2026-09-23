-- ═══════════════════════════════════════════════════════════════════════════
-- Gli incassi delle fatture cinesi
--
-- Senza questi, trentadue fatture scadute l'08/09/2025 resterebbero «emesse»
-- e finirebbero tutte in Recall e Insoluti: trentadue allarmi falsi su denaro
-- che e' arrivato. L'informazione c'e' gia', sulle tranche — data e importo
-- incassati — e qui la si porta anche sul documento che quelle tranche
-- fatturava.
--
-- L'importo e' quello davvero entrato, non quello fatturato. Dove il bonifico
-- e' arrivato al netto di una trattenuta bancaria — Beijing China World, 56,50
-- su 2.520 — la differenza resta scoperta sulla fattura, perche' quei soldi
-- non sono mai arrivati e la fattura non e' saldata.
-- ═══════════════════════════════════════════════════════════════════════════

-- Le ventitre agganciate a una tranche: incasso e data sono i suoi.
insert into public.invoice_payments (invoice_id, date, amount, method, bank_ref)
select f.id, t.payment_received_date, t.amount, 'bonifico',
       'Ricostruito dalla tranche · ' || coalesce(t.name, '')
  from public.invoices f
  join public.cert_payment_milestones t on t.id = f.tranche_id
 where f.number ~ '^2\.[0-9]{3}$'
   and t.status = 'Paid'
   and t.payment_received_date is not null
   and not exists (select 1 from public.invoice_payments p where p.invoice_id = f.id);

-- Le nove che coprono l'intero progetto: l'incasso e' la somma delle tranche
-- saldate, alla data dell'ultima.
insert into public.invoice_payments (invoice_id, date, amount, method, bank_ref)
select f.id, x.quando, x.quanto, 'bonifico', 'Ricostruito dalle tranche del progetto'
  from public.invoices f
  join lateral (
    select max(t.payment_received_date) as quando, sum(t.amount) as quanto
      from public.cert_payment_milestones t
     where t.certification_id = f.certification_id and t.status = 'Paid'
  ) x on true
 where f.number ~ '^2\.[0-9]{3}$'
   and f.tranche_id is null
   and x.quando is not null
   and x.quanto > 0
   and not exists (select 1 from public.invoice_payments p where p.invoice_id = f.id);

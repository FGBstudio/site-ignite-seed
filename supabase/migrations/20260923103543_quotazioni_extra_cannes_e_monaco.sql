-- ═══════════════════════════════════════════════════════════════════════════
-- Le quotazioni extra di Cannes e Monaco
--
-- Lavoro in piu' emerso in installazione, fatturato lo stesso giorno in cui i
-- sensori sono andati in rete: 3.000 € su Cannes, 1.500 € su Monaco.
--
-- Nascono gia' «invoiced» perche' la fattura e' partita davvero il 09/09, ma
-- `status` resta Pending: emettere e incassare sono due fatti, e qui e'
-- successo solo il primo. La data d'incasso non la scrivo — la calcola il
-- motore dai termini di commessa, come per tutte le altre.
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.cert_payment_milestones
  (certification_id, name, amount, status, tranche_state, tranche_order,
   trigger_event, payment_scheme, invoice_sent_date)
select c.id, v.nome, v.importo, 'Pending', 'invoiced',
       (select coalesce(max(t.tranche_order), 0) + 1
          from public.cert_payment_milestones t where t.certification_id = c.id),
       'manual_sal', 'bdc_sal_custom', date '2026-09-09'
  from (values
    ('Cannes, La Croisette', 'Quotazione extra in installazione', 3000.00),
    ('Monaco One',           'Quotazione extra in installazione', 1500.00)
  ) as v(cert, nome, importo)
  join public.certifications c on c.name = v.cert and c.cert_type = 'Energy'
 where not exists (
   select 1 from public.cert_payment_milestones t
    where t.certification_id = c.id and t.name = v.nome
 );

-- Le date si ricalcolano dove serve, non ovunque.
do $$
declare r record;
begin
  for r in select c.id from public.certifications c
            where c.name in ('Cannes, La Croisette','Monaco One') and c.cert_type='Energy'
  loop
    perform public.fn_ricalcola_date_tranche(false, r.id);
  end loop;
end $$;

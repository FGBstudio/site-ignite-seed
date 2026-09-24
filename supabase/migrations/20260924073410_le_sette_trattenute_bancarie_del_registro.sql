-- ═══════════════════════════════════════════════════════════════════════════
-- Le sette trattenute bancarie del registro
--
-- Duecento euro e cinquanta su sette fatture, dalla colonna «Decurtazioni
-- spese bancarie/tasse» della contabilita'. La data e' quella del bonifico:
-- la commissione e' trattenuta nel momento in cui il denaro viaggia, non dopo.
--
-- Chiudendole, Insoluti smette di mettere una commissione da 19,50 accanto a
-- 5.775 di Taipei che nessuno ha pagato. Il cruscotto serve a decidere chi
-- sollecitare: sette righe che non si possono sollecitare lo rendono meno
-- utile, non piu' completo.
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.invoice_decurtazioni (invoice_id, date, amount, causale, note)
select f.id, d.quando, d.importo, 'spese_bancarie',
       'Commissione trattenuta dalla banca del cliente sul bonifico. Dal registro fatture.'
  from (values
    ('2.740', 19.50, date '2026-03-05'),
    ('2.741', 56.50, date '2026-01-26'),
    ('2.748', 46.50, date '2025-12-19'),
    ('2.764', 19.50, date '2025-10-28'),
    ('2.765', 19.50, date '2026-02-12'),
    ('2.769', 19.50, date '2025-12-12'),
    ('2.791', 19.50, date '2025-10-28')
  ) as d(numero, importo, quando)
  join public.invoices f on f.number = d.numero
 where not exists (
   select 1 from public.invoice_decurtazioni x where x.invoice_id = f.id
 );

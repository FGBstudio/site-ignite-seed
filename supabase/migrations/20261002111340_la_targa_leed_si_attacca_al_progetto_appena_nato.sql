-- ═══════════════════════════════════════════════════════════════════════════
-- La targa LEED si attacca al progetto appena nato
--
-- La migrazione precedente faceva nascere il progetto e spostava la fattura nella
-- stessa istruzione, con l'INSERT in una CTE. Non funziona: una CTE che scrive non
-- è visibile al resto dell'istruzione, che legge lo snapshot di prima. La
-- sottoquery non ha trovato il progetto e ha scritto NULL — la 3.000 è rimasta
-- senza progetto invece di finire su quello giusto.
--
-- Qui il progetto esiste già, quindi è un UPDATE e basta.
-- ═══════════════════════════════════════════════════════════════════════════

update public.invoices f
   set certification_id = c.id
  from public.certifications c
  join public.sites s on s.id = c.site_id
  join public.brands b on b.id = s.brand_id
 where f.number = '3.000'
   and lower(s.name) = lower('Scandicci, Office')
   and b.name = 'JIMMY CHOO'
   and c.cert_type = 'LEED';

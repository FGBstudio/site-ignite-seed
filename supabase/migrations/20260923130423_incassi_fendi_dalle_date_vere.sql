-- ═══════════════════════════════════════════════════════════════════════════
-- Le date di incasso tornano quelle vere, e la trattenuta torna al suo posto
--
-- Due correzioni, tutte e due mie.
--
-- 1. Sessantaquattro tranche su settantuno portavano la stessa data, il
--    26/01/2026: l'avevo applicata in blocco caricando gli incassi. Non e' una
--    data di banca, e finche' resta li' ogni lettura per periodo — incassato
--    del trimestre, DSO, stagionalita' — e' sbagliata. Le date vere stanno nel
--    foglio dell'amministrazione e vanno da settembre 2025 a marzo 2026.
--
-- 2. Sui cinque progetti con la trattenuta bancaria di 19,50 € avevo tolto la
--    trattenuta dalla SECONDA tranche e marcato entrambe incassate. La verita'
--    e' che e' stata incassata solo la prima, al netto della trattenuta, e la
--    seconda e' ancora da incassare. Il database dichiarava 13.200 € di
--    incassi che non sono mai arrivati.
--
-- Su Bangkok il database diceva pure che la seconda tranche era entrata il
-- 26/01 e la prima il 05/03: la seconda prima della prima. Era il segno.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.cert_payment_milestones disable trigger trg_cert_payment_milestones_guard;

-- ── 1 · La trattenuta torna sulla prima tranche, la seconda torna da incassare
update public.cert_payment_milestones t
   set amount = t.amount - 19.50,
       name = t.name || ' · al netto della trattenuta'
  from public.certifications c
 where c.id = t.certification_id
   and t.tranche_order = 1
   and c.name in ('Bangkok, Emporium', 'Kuala Lumpur, Pavilion', 'Makati, Greenbelt 3',
                  'Singapore, Marina Bay Sands', 'Lótus, Four Seasons (DFS)')
   and t.name not like '%trattenuta%';

update public.cert_payment_milestones t
   set amount = t.amount + 19.50,
       status = 'Pending',
       payment_received_date = null
  from public.certifications c
 where c.id = t.certification_id
   and t.tranche_order = 2
   and c.name in ('Bangkok, Emporium', 'Kuala Lumpur, Pavilion', 'Makati, Greenbelt 3',
                  'Singapore, Marina Bay Sands', 'Lótus, Four Seasons (DFS)');

-- La riga della trattenuta ora appartiene alla prima tranche, non alla seconda.
update public.cert_payment_milestones t
   set name = 'Trattenuta su bonifico prima tranche'
  from public.certifications c
 where c.id = t.certification_id
   and t.name like '%trattenuta su bonifico'
   and c.name in ('Bangkok, Emporium', 'Kuala Lumpur, Pavilion', 'Makati, Greenbelt 3',
                  'Singapore, Marina Bay Sands', 'Lótus, Four Seasons (DFS)');

-- ── 2 · Le date, dal foglio ────────────────────────────────────────────────
update public.cert_payment_milestones t
   set payment_received_date = v.quando
  from public.certifications c,
       (values
         ('Bangkok, Emporium',                    date '2026-03-05'),
         ('Bicester, Outlet',                     date '2025-10-09'),
         ('Brisbane, Queens Plaza',               date '2025-10-14'),
         ('Daejeon, Shinsegae',                   date '2025-12-19'),
         ('Hong Kong, Canton Road',               date '2026-01-15'),
         ('Hong Kong, Elements',                  date '2026-01-15'),
         ('Hong Kong, Elements (Men)',            date '2026-01-15'),
         ('Hong Kong, Landmark',                  date '2026-01-15'),
         ('Hong Kong, Pacific Place',             date '2026-01-15'),
         ('Kuala Lumpur, Pavilion',               date '2025-10-28'),
         ('Lótus, Four Seasons (DFS)',            date '2026-02-12'),
         ('Taipa, Galaxy',                        date '2026-02-12'),
         ('Sé, One Central',                      date '2026-02-12'),
         ('Makati, Greenbelt 3',                  date '2025-12-12'),
         ('Melbourne, Collins Street',            date '2025-10-14'),
         ('Milan, Galleria',                      date '2025-12-12'),
         ('Singapore, Marina Bay Sands',          date '2025-10-28'),
         ('Singapore, Ngee Ann City',             date '2025-10-28'),
         ('Sydney, Westfield',                    date '2025-10-14')
       ) as v(cert, quando)
 where c.id = t.certification_id
   and c.name = v.cert
   and t.status = 'Paid';

-- Madrid e Puerto Banus hanno due incassi distinti, uno per tranche: il foglio
-- li elenca come due righe, e sono due bonifici veri.
update public.cert_payment_milestones t
   set payment_received_date = case t.tranche_order
         when 1 then date '2025-09-12'
         else date '2025-12-23' end
  from public.certifications c
 where c.id = t.certification_id
   and c.name in ('Madrid, El Corte Inglés', 'Puerto Banús, Calle Rivera')
   and t.status = 'Paid';

alter table public.cert_payment_milestones enable trigger trg_cert_payment_milestones_guard;

-- Le date di cassa si ricalcolano da sole dalle nuove date di incasso.
select public.fn_ricalcola_date_tranche(false, null);

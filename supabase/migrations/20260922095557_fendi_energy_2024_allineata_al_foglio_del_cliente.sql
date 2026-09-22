-- ═══════════════════════════════════════════════════════════════════════════
-- Fendi Energy 2024 allineata al foglio del cliente.
--
-- Il confronto riga per riga ha trovato 33 divergenze su 66 progetti, e in
-- tutte il foglio era piu' avanti del database: incassi mai registrati,
-- fatture emesse mai segnate, e sei progetti Taiwan con un valore piu' alto.
-- Vince il foglio ovunque, tranne su Hangzhou MixC — lavorata ieri e non
-- ancora riportata la'.
--
-- Nota sulle date: il foglio porta stati, non date. Quello che qui diventa
-- incassato o fatturato resta quindi senza data e finisce nella colonna
-- «Senza data» della WBS. E' corretto: sappiamo che e' successo, non quando.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.cert_payment_milestones disable trigger trg_cert_payment_milestones_guard;

-- ── 1. Taiwan: un quarto in piu', identico su tutti e sei ──────────────────
-- 9.250/7.400, 9.625/7.700, 5.250/4.200: il rapporto e' 1,2500 esatto ovunque.
-- Non e' un refuso, e' una maggiorazione che a database non era mai entrata.
update public.cert_payment_milestones m
   set amount = round(m.amount * 1.25, 2),
       due_date = m.due_date
  from public.certifications c
 where c.id = m.certification_id
   and c.name in ('Kaohsiung, Hanshin Main', 'Kaohsiung, Hanshin Downtown',
                  'Taipei, Taipei 101', 'Taipei, Breeze Center Xinyi',
                  'Taipei, Breeze Center Xinyi (Men)', 'Diamond Towers');

-- ── 2. Le trattenute sul bonifico ──────────────────────────────────────────
-- Il cliente ha pagato al netto delle spese bancarie. La tranche si spezza in
-- due righe: quanto e' arrivato e quanto resta scoperto. Il totale non cambia,
-- e ogni riga torna a essere o incassata o no — che e' l'invariante su cui si
-- regge il pieno/tratteggiato della griglia.
with trattenute(progetto, ordine, residuo) as (values
  ('Kuala Lumpur, Pavilion',          2, 19.50),
  ('Makati, Greenbelt 3',             2, 19.50),
  ('Singapore, Marina Bay Sands',     2, 19.50),
  ('Bangkok, Emporium',               2, 19.50),
  ('Lótus, Four Seasons (DFS)',       2, 19.50),
  ('Daejeon, Shinsegae',              1, 46.50),
  ('Beijing, China World Mall Mall',  1, 56.50)
),
tagliate as (
  update public.cert_payment_milestones m
     set amount = m.amount - t.residuo
    from trattenute t, public.certifications c
   where c.id = m.certification_id and c.name = t.progetto and m.tranche_order = t.ordine
  returning m.certification_id, m.tranche_order, m.name, m.payment_received_date
)
insert into public.cert_payment_milestones
  (certification_id, name, amount, status, tranche_state, tranche_order,
   data_prevista_fonte, data_evento_fonte)
select g.certification_id,
       g.name || ' · trattenuta su bonifico',
       t.residuo,
       'Pending', 'invoiced',
       t.ordine + 10,
       'fattura_emessa', 'senza_data'
  from tagliate g
  join public.certifications c on c.id = g.certification_id
  join trattenute t on t.progetto = c.name and t.ordine = g.tranche_order;

-- ── 3. Quello che e' stato incassato ───────────────────────────────────────
with incassate(progetto, ordine) as (values
  ('Hong Kong, Pacific Place', 1), ('Hong Kong, Elements', 1),
  ('Hong Kong, Elements (Men)', 1), ('Hong Kong, Landmark', 1),
  ('Taipa, Galaxy', 1), ('Sé, One Central', 1), ('Lótus, Four Seasons (DFS)', 1),
  ('Lótus, Four Seasons (DFS)', 2),
  ('Brisbane, Queens Plaza', 1), ('Sydney, Westfield', 1),
  ('Puerto Banús, Calle Rivera', 1), ('Milan, Galleria', 1),
  ('Daejeon, Shinsegae', 1),
  ('Kuala Lumpur, Pavilion', 1), ('Kuala Lumpur, Pavilion', 2),
  ('Makati, Greenbelt 3', 1), ('Makati, Greenbelt 3', 2),
  ('Singapore, Marina Bay Sands', 1), ('Singapore, Marina Bay Sands', 2),
  ('Singapore, Ngee Ann City', 1), ('Bangkok, Emporium', 2)
)
update public.cert_payment_milestones m
   set status = 'Paid',
       tranche_state = 'invoiced',
       data_prevista_fonte = 'incasso'
  from incassate i, public.certifications c
 where c.id = m.certification_id and c.name = i.progetto and m.tranche_order = i.ordine;

-- ── 4. Quello che e' stato fatturato e non ancora incassato ────────────────
-- Il Giappone e Taiwan: 60% emesso, niente arrivato. E' scaduto, e finora non
-- compariva da nessuna parte.
with fatturate(progetto, ordine) as (values
  ('Gotemba, Premium Outlets', 1), ('Osaka, Hankyu (Men)', 1),
  ('Osaka, Hankyu Umeda', 1), ('Sapporo, Daimaru', 1),
  ('Tokyo, Matsuya Ginza', 1), ('Tokyo, Isetan Shinjuku (Men)', 1),
  ('Osaka, Shinsaibashi', 1),
  ('Kaohsiung, Hanshin Main', 1), ('Kaohsiung, Hanshin Downtown', 1),
  ('Taipei, Taipei 101', 1), ('Taipei, Breeze Center Xinyi', 1),
  ('Taipei, Breeze Center Xinyi (Men)', 1), ('Diamond Towers', 1)
)
update public.cert_payment_milestones m
   set tranche_state = 'invoiced',
       data_prevista_fonte = 'fattura_emessa'
  from fatturate f, public.certifications c
 where c.id = m.certification_id and c.name = f.progetto and m.tranche_order = f.ordine
   and m.status <> 'Paid';

alter table public.cert_payment_milestones enable trigger trg_cert_payment_milestones_guard;

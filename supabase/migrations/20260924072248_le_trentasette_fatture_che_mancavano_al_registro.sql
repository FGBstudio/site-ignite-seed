-- ═══════════════════════════════════════════════════════════════════════════
-- Le trentasette fatture che mancavano al registro
--
-- Il registro della contabilita' ne conta 69, il database ne aveva 32. Non e'
-- un disallineamento: e' che le 32 le avevo lette dai PDF nella cartella
-- «Fatture China», e quella cartella contiene solo la Cina. Thailandia,
-- Giappone, Taiwan, Hong Kong, Corea, Australia, Singapore, Malesia,
-- Filippine, Spagna, Italia e Regno Unito non c'erano, quindi non sono
-- entrate.
--
-- Il costo di quell'assenza non e' contabile, e' operativo: DICIANNOVE DI
-- QUELLE FATTURE SONO SCOPERTE, PER 46.029 EURO, e nessuna compariva in
-- Insoluti. Due paesi da soli ne fanno 45.885:
--
--   Giappone  19.560  Gotemba, Osaka (×3), Sapporo, Tokyo (×2) — mai un euro
--   Taiwan    26.325  Kaohsiung (×2), Taipei (×4)              — mai un euro
--
-- Il resto sono sei trattenute bancarie da 19,50 e 46,50 su fatture per il
-- resto saldate.
--
-- ── IL MODELLO DEL REGISTRO ────────────────────────────────────────────────
-- Nel foglio della contabilita' «Totale Paid» e' quanto e' arrivato e «Not
-- Paid» quanto manca: l'importo della fattura e' la loro somma. Cosi' la
-- 2.740 sono 4.420,50 incassati piu' 19,50 scoperti, cioe' una fattura da
-- 4.440 — il 60% di 7.400. Tutte e sessantanove tornano con questa regola.
--
-- ── LA DATA DI EMISSIONE ERA SBAGLIATA DI UN GIORNO ───────────────────────
-- Sulle 32 avevo dedotto il 09/08/2025 da «scadenza 08/09 meno trenta
-- giorni». I termini non erano trenta ma trentuno — la contabilita' conta
-- «stesso giorno del mese dopo» — quindi l'emissione e' il 08/08/2025. La
-- scadenza non si muove; si muove il presupposto. Il trigger che rende
-- immutabile una fattura emessa va disattivato per correggerlo, ed e' giusto
-- che serva un gesto esplicito: e' esattamente il campo che non si cambia per
-- distrazione.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Le societa' Fendi che fatturano dal mondo ──────────────────────────────
insert into public.contacts (kind, company_name, country, brand_id, notes)
select 'client', d.nome, d.paese,
       (select id from public.brands where name = 'FENDI'),
       'Societa fatturabile Fendi. Creata dal registro fatture della contabilita.'
  from (values
    ('FENDI s.r.l. - Socio Unico',              'Italy'),
    ('FENDI UK Ltd.',                           'United Kingdom'),
    ('FENDI (THAILAND) CO., LTD',               'Thailand'),
    ('Fendi Australia Pty Ltd.',                'Australia'),
    ('Fendi Korea Ltd.',                        'South Korea'),
    ('Fendi Japan K.K.',                        'Japan'),
    ('Fendi Hong Kong Limited',                 'Hong Kong'),
    ('Taiwan Fendi Co. Ltd',                    'Taiwan'),
    ('Fendi Fashion (Malaysia) Sdn. Bhd.',      'Malaysia'),
    ('Fendi Retail Spain S.L.',                 'Spain'),
    ('Fendi Philippines Corp.',                 'Philippines'),
    ('Fendi (Singapore) Pte. Ltd.',             'Singapore'),
    ('Fendi Italia S.r.l.',                     'Italy')
  ) as d(nome, paese)
 where not exists (select 1 from public.contacts c where c.company_name = d.nome);

-- ── La correzione di un giorno sulle 32 ───────────────────────────────────
alter table public.invoices disable trigger trg_invoices_immutabile;

update public.invoices
   set issue_date = date '2025-08-08', payment_terms_days = 31
 where number ~ '^2\.[0-9]{3}$' and issue_date = date '2025-08-09';

alter table public.invoices enable trigger trg_invoices_immutabile;

-- ── Le trentasette ────────────────────────────────────────────────────────
-- `incassato` null vuol dire «mai arrivato niente»: la fattura resta aperta e
-- va in Insoluti, che e' il punto di tutto questo.
with dati(numero, cliente, progetto, totale, incassato, quando, emessa, giorni, ordine) as (values
  ('2.539','FENDI s.r.l. - Socio Unico',         'Rome, Palazzo della Civiltà',        18500.00, 18500.00, date '2025-05-16', date '2025-03-07', 30, null::int),
  ('2.674','FENDI UK Ltd.',                      'Bicester, Outlet',                    6550.00,  6550.00, date '2025-10-09', date '2025-07-18', 31, null),
  ('2.740','FENDI (THAILAND) CO., LTD',          'Bangkok, Emporium',                   4440.00,  4420.50, date '2026-03-05', date '2025-08-08', 31, 1),
  ('2.745','Fendi Australia Pty Ltd.',           'Brisbane, Queens Plaza',              2520.00,  2520.00, date '2025-10-14', date '2025-08-08', 31, 1),
  ('2.748','Fendi Korea Ltd.',                   'Daejeon, Shinsegae',                  2520.00,  2473.50, date '2025-12-19', date '2025-08-08', 31, 1),
  ('2.750','Fendi Japan K.K.',                   'Gotemba, Premium Outlets',            2520.00,     null, null,             date '2025-08-08', 31, 1),
  ('2.757','Fendi Hong Kong Limited',            'Hong Kong, Canton Road',              4440.00,  4440.00, date '2026-01-15', date '2025-08-08', 31, 1),
  ('2.758','Fendi Hong Kong Limited',            'Hong Kong, Elements',                  900.00,   900.00, date '2026-01-15', date '2025-08-08', 31, 1),
  ('2.759','Fendi Hong Kong Limited',            'Hong Kong, Elements (Men)',            900.00,   900.00, date '2026-01-15', date '2025-08-08', 31, 1),
  ('2.760','Fendi Hong Kong Limited',            'Hong Kong, Landmark',                  900.00,   900.00, date '2026-01-15', date '2025-08-08', 31, 1),
  ('2.761','Fendi Hong Kong Limited',            'Hong Kong, Pacific Place',             900.00,   900.00, date '2026-01-15', date '2025-08-08', 31, 1),
  ('2.762','Taiwan Fendi Co. Ltd',               'Kaohsiung, Hanshin Downtown',         3150.00,     null, null,             date '2025-08-08', 31, 1),
  ('2.763','Taiwan Fendi Co. Ltd',               'Kaohsiung, Hanshin Main',             5550.00,     null, null,             date '2025-08-08', 31, 1),
  ('2.764','Fendi Fashion (Malaysia) Sdn. Bhd.', 'Kuala Lumpur, Pavilion',              4980.00,  4960.50, date '2025-10-28', date '2025-08-08', 31, 1),
  ('2.765','Fendi (Shanghai) Commercial Co., Ltd.','Lótus, Four Seasons (DFS)',           900.00,   880.50, date '2026-02-12', date '2025-08-08', 31, 1),
  ('2.766','Fendi (Shanghai) Commercial Co., Ltd.','Taipa, Galaxy',                       900.00,   900.00, date '2026-02-12', date '2025-08-08', 31, 1),
  ('2.767','Fendi (Shanghai) Commercial Co., Ltd.','Sé, One Central',                     900.00,   900.00, date '2026-02-12', date '2025-08-08', 31, 1),
  ('2.768','Fendi Retail Spain S.L.',            'Madrid, El Corte Inglés',             2520.00,  2520.00, date '2025-09-12', date '2025-08-08', 31, 1),
  ('2.769','Fendi Philippines Corp.',            'Makati, Greenbelt 3',                 4440.00,  4420.50, date '2025-12-12', date '2025-08-08', 31, 1),
  ('2.770','Fendi Australia Pty Ltd.',           'Melbourne, Collins Street',           2520.00,  2520.00, date '2025-10-14', date '2025-08-08', 31, 1),
  ('2.773','Fendi Japan K.K.',                   'Osaka, Hankyu (Men)',                 2520.00,     null, null,             date '2025-08-08', 31, 1),
  ('2.774','Fendi Japan K.K.',                   'Osaka, Hankyu Umeda',                 2520.00,     null, null,             date '2025-08-08', 31, 1),
  ('2.775','Fendi Japan K.K.',                   'Osaka, Shinsaibashi',                 4440.00,     null, null,             date '2025-08-08', 31, 1),
  ('2.776','Fendi Retail Spain S.L.',            'Puerto Banús, Calle Rivera',          2520.00,  2520.00, date '2025-09-12', date '2025-08-08', 31, 1),
  ('2.778','Fendi Japan K.K.',                   'Sapporo, Daimaru',                    2520.00,     null, null,             date '2025-08-08', 31, 1),
  ('2.791','Fendi (Singapore) Pte. Ltd.',        'Singapore, Marina Bay Sands',         5040.00,  5020.50, date '2025-10-28', date '2025-08-08', 31, 1),
  ('2.792','Fendi (Singapore) Pte. Ltd.',        'Singapore, Ngee Ann City',            4440.00,  4440.00, date '2025-10-28', date '2025-08-08', 31, 1),
  ('2.793','Fendi Australia Pty Ltd.',           'Sydney, Westfield',                   2520.00,  2520.00, date '2025-10-14', date '2025-08-08', 31, 1),
  ('2.794','Taiwan Fendi Co. Ltd',               'Taipei, Taipei 101',                  5775.00,     null, null,             date '2025-08-08', 31, 1),
  ('2.795','Taiwan Fendi Co. Ltd',               'Taipei, Breeze Center Xinyi',         3150.00,     null, null,             date '2025-08-08', 31, 1),
  ('2.796','Taiwan Fendi Co. Ltd',               'Diamond Towers',                      3150.00,     null, null,             date '2025-08-08', 31, 1),
  ('2.797','Taiwan Fendi Co. Ltd',               'Taipei, Breeze Center Xinyi (Men)',   5550.00,     null, null,             date '2025-08-08', 31, 1),
  ('2.798','Fendi Japan K.K.',                   'Tokyo, Matsuya Ginza',                2520.00,     null, null,             date '2025-08-08', 31, 1),
  ('2.799','Fendi Japan K.K.',                   'Tokyo, Isetan Shinjuku (Men)',        2520.00,     null, null,             date '2025-08-08', 31, 1),
  ('2.815','Fendi Italia S.r.l.',                'Milan, Galleria',                     7100.00,  7100.00, date '2025-12-12', date '2025-09-26', 30, null),
  ('2.896','Fendi Retail Spain S.L.',            'Puerto Banús, Calle Rivera',          1680.00,  1680.00, date '2025-12-23', date '2025-12-12', 31, 2),
  ('2.897','Fendi Retail Spain S.L.',            'Madrid, El Corte Inglés',             1680.00,  1680.00, date '2025-12-23', date '2025-12-12', 31, 2)
)
insert into public.invoices
  (number, issuer_contact_id, client_contact_id, certification_id, tranche_id,
   currency, exch_rate, total, vat_amount, issue_date, payment_terms_days,
   lifecycle_state, notes)
select
  d.numero,
  (select id from public.contacts where company_name = 'FGB studio * Zmyrna Limited'),
  (select id from public.contacts where company_name = d.cliente order by created_at limit 1),
  c.id,
  case when d.ordine is null then null else (
    select t.id from public.cert_payment_milestones t
     where t.certification_id = c.id and t.tranche_order = d.ordine
  ) end,
  'EUR', 1, d.totale,
  case when d.numero = '2.674' then 1310.00 else 0 end,
  d.emessa, d.giorni,
  'issued',
  'FGB studio Invoice n. ' || d.numero || ' · dal registro fatture della contabilita'
    || case when d.ordine is null then ' · copre l''intero progetto' else '' end
    || case when d.incassato is null then ' · MAI INCASSATA' else '' end
from dati d
join public.certifications c on c.name = d.progetto and c.cert_type = 'Energy'
where not exists (select 1 from public.invoices f where f.number = d.numero);

-- ── Gli incassi, con la data vera del registro ────────────────────────────
with dati(numero, incassato, quando) as (values
  ('2.539', 18500.00, date '2025-05-16'), ('2.674',  6550.00, date '2025-10-09'),
  ('2.740',  4420.50, date '2026-03-05'), ('2.745',  2520.00, date '2025-10-14'),
  ('2.748',  2473.50, date '2025-12-19'), ('2.757',  4440.00, date '2026-01-15'),
  ('2.758',   900.00, date '2026-01-15'), ('2.759',   900.00, date '2026-01-15'),
  ('2.760',   900.00, date '2026-01-15'), ('2.761',   900.00, date '2026-01-15'),
  ('2.764',  4960.50, date '2025-10-28'), ('2.765',   880.50, date '2026-02-12'),
  ('2.766',   900.00, date '2026-02-12'), ('2.767',   900.00, date '2026-02-12'),
  ('2.768',  2520.00, date '2025-09-12'), ('2.769',  4420.50, date '2025-12-12'),
  ('2.770',  2520.00, date '2025-10-14'), ('2.776',  2520.00, date '2025-09-12'),
  ('2.791',  5020.50, date '2025-10-28'), ('2.792',  4440.00, date '2025-10-28'),
  ('2.793',  2520.00, date '2025-10-14'), ('2.815',  7100.00, date '2025-12-12'),
  ('2.896',  1680.00, date '2025-12-23'), ('2.897',  1680.00, date '2025-12-23')
)
insert into public.invoice_payments (invoice_id, date, amount, method, bank_ref)
select f.id, d.quando, d.incassato, 'bonifico', 'Registro fatture contabilita'
  from dati d
  join public.invoices f on f.number = d.numero
 where not exists (select 1 from public.invoice_payments p where p.invoice_id = f.id);

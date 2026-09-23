-- ═══════════════════════════════════════════════════════════════════════════
-- Le trentadue fatture cinesi di Fendi entrano nel registro
--
-- Documenti veri, letti dai PDF originali: numeri dal 2.741 al 2.803, emessi
-- da FGB studio * Zmyrna a Fendi (Shanghai) Commercial Co., Ltd., tutti con
-- termini a trenta giorni e scadenza 08/09/2025 — quindi emessi il 09/08.
--
-- Il numero resta quello scritto sul documento. Assegnarne uno nuovo col
-- progressivo interno vorrebbe dire dare due numeri alla stessa fattura, e
-- quello che il cliente ha in mano sarebbe il secondo.
--
-- Ventitre coprono la prima tranche («60% at the order confirmation») e si
-- agganciano a quella. Nove coprono l'intero progetto: per quelle la tranche
-- resta vuota, perche' indicarne una sola sarebbe falso — la fattura le
-- comprende entrambe — e il legame col progetto basta a ritrovarle.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Il cliente, che non c'era ──────────────────────────────────────────────
insert into public.contacts (kind, company_name, address, city, country, brand_id, notes)
select 'client', 'Fendi (Shanghai) Commercial Co., Ltd.',
       'Unit 3007B, 3308, 3309, 3310 Plaza 66, 1266 Nanjing Road West',
       'Shanghai', 'China', 'a269156e-18ce-4b17-bc8e-60863b8905e0',
       'Societa fatturabile dei progetti Fendi in Cina. Creata dalle fatture 2.741-2.803.'
 where not exists (
   select 1 from public.contacts where company_name = 'Fendi (Shanghai) Commercial Co., Ltd.'
 );

-- ── Le fatture ─────────────────────────────────────────────────────────────
with dati(numero, progetto, importo, tutto) as (values
  ('2.741','Beijing, China World Mall Mall',      2520.00, false),
  ('2.742','Beijing, Sanlitun',                   5580.00, false),
  ('2.743','Beijing, Shin Kong Place (Men)',      2520.00, false),
  ('2.744','Beijing, SKP (Women)',                5160.00, false),
  ('2.746','Chengdu, IFS - Energy',                900.00, false),
  ('2.747','Chongqing, MixC - Energy',            4440.00, false),
  ('2.749','Dalian, Olympia 66',                  5580.00, false),
  ('2.751','Guangzhou, Taikoo Hui',               4440.00, false),
  ('2.752','Guangzhou, Taikoo Hui (Men)',         4440.00, false),
  ('2.753','Hangzhou, MixC',                       900.00, false),
  ('2.754','Hangzhou, Hangzhou Tower (Men)',      4200.00, true),
  ('2.755','Hangzhou, Hangzhou Tower (Women)',    7400.00, true),
  ('2.756','Harbin, Charter (Women)',             2520.00, false),
  ('2.771','Nanjing, Deji Plaza',                 4440.00, false),
  ('2.772','Nanjing, IFC - Energy',                900.00, false),
  ('2.777','Qingdao, Hisense Plaza',              5040.00, false),
  ('2.779','Shanghai, Florentia Village (Outlet)',4200.00, true),
  ('2.780','Shanghai, Grand Gateway',             5500.00, true),
  ('2.781','Shanghai, IAPM Mall',                 7400.00, true),
  ('2.782','Shanghai, IFC (Kids)',                4200.00, true),
  ('2.783','Shanghai, IFC (Women)',               3660.00, false),
  ('2.784','Shanghai, Plaza 66 (Kids)',           1500.00, true),
  ('2.785','Shanghai, Plaza 66 (Women)',          2520.00, false),
  ('2.786','Shanghai, Taikoo Li Qiantan',         8300.00, true),
  ('2.787','Shenyang, MixC',                      4980.00, false),
  ('2.788','Shenzhen, Bay MixC (Kids)',           2520.00, false),
  ('2.789','Shenzhen, Bay MixC - Energy',         4620.00, false),
  ('2.790','Shenzhen, MixC',                      4440.00, false),
  ('2.800','Wuhan, Heartland 66 - Energy',        4440.00, false),
  ('2.801','Xi''an, Shin Kong Place (Men)',       2520.00, false),
  ('2.802','Xiamen, MixC',                        7400.00, true),
  ('2.803','Zhengzhou, David Plaza - Energy',     5040.00, false)
)
insert into public.invoices
  (number, issuer_contact_id, client_contact_id, certification_id, tranche_id,
   currency, exch_rate, total, vat_amount, issue_date, payment_terms_days,
   lifecycle_state, notes)
select
  d.numero,
  (select id from public.contacts where company_name = 'FGB studio * Zmyrna Limited'),
  (select id from public.contacts where company_name = 'Fendi (Shanghai) Commercial Co., Ltd.'),
  c.id,
  case when d.tutto then null else (
    select t.id from public.cert_payment_milestones t
     where t.certification_id = c.id and t.tranche_order = 1
  ) end,
  'EUR', 1, d.importo, 0,
  date '2025-08-09', 30,
  'issued',
  'FGB studio Invoice n. ' || d.numero
    || case when d.tutto then ' · copre l''intero progetto, entrambe le tranche' else '' end
from dati d
join public.certifications c on c.name = d.progetto and c.cert_type = 'Energy'
where not exists (select 1 from public.invoices f where f.number = d.numero);

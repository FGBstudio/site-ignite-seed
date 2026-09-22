-- ═══════════════════════════════════════════════════════════════════════════
-- Gli incassi realmente avvenuti, dal foglio Fendi Energy 2024.
--
-- Finora queste tranche erano datate 4 marzo 2025, cioe' la data dell'ordine
-- fornitore: il ripiego di quando non sapevamo altro. Il foglio dice che i
-- soldi sono arrivati undici mesi dopo. payment_received_date e' il gradino
-- piu' alto della scala, quindi scrivere li' basta: il ricalcolo fa il resto.
--
-- trg_cert_payment_milestones_guard vieta di toccare le date di incasso a chi
-- non e' ADMIN, e fa bene: in una migrazione auth.uid() e' nullo, quindi il
-- controllo scatta anche qui. Lo si sospende per questa transazione soltanto,
-- e lo si rimette prima di uscire.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.cert_payment_milestones disable trigger trg_cert_payment_milestones_guard;

-- ── Prima tranche incassata il 26 gennaio 2026 ─────────────────────────────
with foglio(nome) as (values
  ('Beijing - China World'), ('Beijing - Shin Kong Place - Men'),
  ('Chongqing - Mix City'), ('Dalian - Olympia 66'),
  ('Guangzhou - Taikoo Hui'), ('Guangzhou - Taikoo Hui - Men'),
  ('Hangzhou - Tower - Men'), ('Hangzhou - Tower - Women'),
  ('Harbin - Charter - Women'), ('Nanjing Deji Plaza'),
  ('Qingdao - Hisense Plaza'), ('Shanghai - Florentia - Outlet'),
  ('Shanghai - Grand Gateway'), ('Shanghai - ICC - IAPM'),
  ('Shanghai - IFC - Kids'), ('Shanghai - IFC - Women'),
  ('Shanghai - Taikoo Li Qiantan'), ('Shenyang - MixCity'),
  ('Shenzhen - Bay MixC'), ('Shenzhen - MixC'),
  ('Shenzhen Bay Mix City Kids'), ('Wuhan - Heartland 66'),
  ('Xiamen - Mix City'), ('Xi''an - Shin Kong Place - Men'),
  ('ZHENGZHOU DAVID PLAZA'), ('Beijing Skp Women'),
  ('Beijing Sanlitun'), ('Shanghai Plaza 66 Woman'),
  ('Red Shanghai Plaza 66 kids'), ('Red Chengdu - IFS'),
  ('Red Hangzhou - MixCity'), ('Red Nanjing IFC')
),
norm as (select nome, trim(regexp_replace(regexp_replace(lower(nome),
  '\y(fendi|red|energy|the)\y',' ','g'), '[^a-z0-9]+',' ','g')) n from foglio),
db as (
  select c.id as cert_id, trim(regexp_replace(regexp_replace(
    lower(c.name||' '||coalesce(si.city,'')), '\y(fendi|red|energy|the)\y',' ','g'),
    '[^a-z0-9]+',' ','g')) n
  from certifications c
  join sites si on si.id = c.site_id
  join brands b on b.id = si.brand_id
  where b.name = 'FENDI' and c.cert_type = 'Energy'
),
abbinati as (
  select m.cert_id from norm f
  join lateral (select d.cert_id, similarity(d.n,f.n) sim
                  from db d order by similarity(d.n,f.n) desc limit 1) m
    on m.sim >= 0.55
)
update public.cert_payment_milestones m
   set payment_received_date = date '2026-01-26',
       status = 'Paid',
       tranche_state = 'invoiced'
  from abbinati a
 where m.certification_id = a.cert_id
   and m.tranche_order = 1;

-- ── Seconda tranche, dove il foglio dice commessa saldata al 100% ──────────
with foglio(nome) as (values
  ('Hangzhou - Tower - Men'), ('Hangzhou - Tower - Women'),
  ('Shanghai - Florentia - Outlet'), ('Shanghai - Grand Gateway'),
  ('Shanghai - ICC - IAPM'), ('Shanghai - IFC - Kids'),
  ('Shanghai - Taikoo Li Qiantan'), ('Xiamen - Mix City'),
  ('Red Shanghai Plaza 66 kids')
),
norm as (select nome, trim(regexp_replace(regexp_replace(lower(nome),
  '\y(fendi|red|energy|the)\y',' ','g'), '[^a-z0-9]+',' ','g')) n from foglio),
db as (
  select c.id as cert_id, trim(regexp_replace(regexp_replace(
    lower(c.name||' '||coalesce(si.city,'')), '\y(fendi|red|energy|the)\y',' ','g'),
    '[^a-z0-9]+',' ','g')) n
  from certifications c
  join sites si on si.id = c.site_id
  join brands b on b.id = si.brand_id
  where b.name = 'FENDI' and c.cert_type = 'Energy'
),
abbinati as (
  select m.cert_id from norm f
  join lateral (select d.cert_id, similarity(d.n,f.n) sim
                  from db d order by similarity(d.n,f.n) desc limit 1) m
    on m.sim >= 0.55
)
update public.cert_payment_milestones m
   set payment_received_date = date '2026-01-26',
       status = 'Paid',
       tranche_state = 'invoiced'
  from abbinati a
 where m.certification_id = a.cert_id
   and m.tranche_order = 2;

-- ── I tre fuori gruppo ─────────────────────────────────────────────────────
-- Bangkok ha incassato 4.420,50 invece di 4.440: la differenza sono spese
-- bancarie, e resta un residuo di 19,50 che il foglio si porta dietro.
update public.cert_payment_milestones m
   set payment_received_date = date '2026-03-05', status = 'Paid', tranche_state = 'invoiced'
  from public.certifications c
 where c.id = m.certification_id
   and c.name ilike 'Bangkok%' and c.cert_type = 'Energy'
   and m.tranche_order = 1;

update public.cert_payment_milestones m
   set payment_received_date = date '2026-01-12', status = 'Paid', tranche_state = 'invoiced'
  from public.certifications c
 where c.id = m.certification_id
   and c.cert_type = 'Energy'
   and (c.name ilike 'Madrid%' or c.name ilike 'Puerto Ban%')
   and m.tranche_order = 2;

alter table public.cert_payment_milestones enable trigger trg_cert_payment_milestones_guard;

-- Ricalcolo dopo questa migrazione:
--   senza_data           69 · 165.960 €
--   incasso              46 · 168.620 €
--   pagamento_previsto   11 ·  30.400 €
--   primo_dato            8 ·  18.640 €
--   ordine_hardware       7 ·  35.030 €
--   telemetria_scartata   1 ·   8.450 €

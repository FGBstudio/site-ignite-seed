-- L'anello del documento non era registrato da nessuna parte: invoice_sent_date
-- esisteva ed era vuota su tutte e 141 le righe, mentre il foglio ce l'ha.
-- Sono le date da cui partono i trentun giorni.
alter table public.cert_payment_milestones disable trigger trg_cert_payment_milestones_guard;

with foglio(nome, data_fattura) as (values
  ('Nanjing Deji Plaza',             date '2026-09-03'),
  ('Shanghai - IFC - Women',         date '2026-09-07'),
  ('Wuhan - Heartland 66',           date '2026-09-07'),
  ('Shenzhen - Bay MixC',            date '2026-09-10'),
  ('Shenzhen - MixC',                date '2026-09-10'),
  ('Shenzhen Bay Mix City Kids',     date '2026-09-10'),
  ('Guangzhou - Taikoo Hui',         date '2026-09-11'),
  ('Chongqing - Mix City',           date '2026-09-11'),
  ('Xi''an - Shin Kong Place - Men', date '2026-09-14'),
  ('ZHENGZHOU DAVID PLAZA',          date '2026-09-14'),
  ('Qingdao - Hisense Plaza',        date '2026-09-16'),
  ('Red Chengdu - IFS',              date '2026-09-14'),
  ('Red Hangzhou - MixCity',         date '2026-09-21'),
  ('Red Nanjing IFC',                date '2026-09-03')
),
norm as (
  select nome, data_fattura,
         trim(regexp_replace(regexp_replace(lower(nome),
           '\y(fendi|red|energy|the)\y',' ','g'), '[^a-z0-9]+',' ','g')) as n
  from foglio
),
db as (
  select c.id as cert_id,
         trim(regexp_replace(regexp_replace(lower(c.name||' '||coalesce(si.city,'')),
           '\y(fendi|red|energy|the)\y',' ','g'), '[^a-z0-9]+',' ','g')) as n
  from certifications c
  join sites si on si.id = c.site_id
  join brands b on b.id = si.brand_id
  where b.name = 'FENDI' and c.cert_type = 'Energy'
),
abbinati as (
  select f.data_fattura, m.cert_id
  from norm f
  join lateral (
    select d.cert_id, similarity(d.n, f.n) as sim
      from db d order by similarity(d.n, f.n) desc limit 1
  ) m on m.sim >= 0.55
)
update public.cert_payment_milestones m
   set invoice_sent_date = a.data_fattura
  from abbinati a
 where m.certification_id = a.cert_id
   and m.tranche_order = 2;

alter table public.cert_payment_milestones enable trigger trg_cert_payment_milestones_guard;

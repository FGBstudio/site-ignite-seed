-- ═══════════════════════════════════════════════════════════════════════════
-- Le date di installazione della commessa Fendi Energy 2024.
--
-- Vengono dal foglio di Matteo del 21/09/2026. Si scrivono solo dove il nome
-- del foglio e quello in database si somigliano almeno al 55% dopo aver tolto
-- «Fendi», «Red» ed «Energy»: sotto quella soglia si preferisce non scrivere.
-- Bicester e fuori apposta: in database non esiste un progetto corrispondente.
-- ═══════════════════════════════════════════════════════════════════════════

with foglio(nome, data_inst) as (values
  ('Chongqing - Mix City',            date '2026-09-11'),
  ('Guangzhou - Taikoo Hui',          date '2026-09-10'),
  ('Hangzhou - Tower - Men',          date '2025-03-19'),
  ('Hangzhou - Tower - Women',        date '2025-03-19'),
  ('Nanjing Deji Plaza',              date '2026-09-03'),
  ('Qingdao - Hisense Plaza',         date '2026-09-16'),
  ('Shanghai - Florentia - Outlet',   date '2025-03-18'),
  ('Shanghai - Grand Gateway',        date '2025-03-17'),
  ('Shanghai - ICC - IAPM',           date '2025-03-17'),
  ('Shanghai - IFC - Kids',           date '2025-03-18'),
  ('Shanghai - IFC - Women',          date '2026-09-05'),
  ('Shanghai - Taikoo Li Qiantan',    date '2025-03-18'),
  ('Shenzhen - Bay MixC',             date '2026-09-09'),
  ('Shenzhen - MixC',                 date '2026-09-09'),
  ('Shenzhen Bay Mix City Kids',      date '2026-09-09'),
  ('Wuhan - Heartland 66',            date '2026-09-07'),
  ('Xiamen - Mix City',               date '2025-03-24'),
  ('Xi''an - Shin Kong Place - Men',  date '2026-09-13'),
  ('ZHENGZHOU DAVID PLAZA',           date '2026-09-14'),
  ('Milano Galleria',                 date '2025-03-11'),
  ('Shanghai Plaza 66 kids',          date '2025-06-04'),
  ('Chengdu - IFS',                   date '2026-09-12'),
  ('Hangzhou - MixCity',              date '2026-09-20')
),
norm as (
  select nome, data_inst,
         trim(regexp_replace(regexp_replace(lower(nome),
           '\y(fendi|red|energy|the)\y',' ','g'), '[^a-z0-9]+',' ','g')) as n
  from foglio
),
db as (
  select e.id as rec_id, c.id as cert_id,
         trim(regexp_replace(regexp_replace(lower(c.name||' '||coalesce(si.city,'')),
           '\y(fendi|red|energy|the)\y',' ','g'), '[^a-z0-9]+',' ','g')) as n
  from certifications c
  join sites si on si.id = c.site_id
  join brands b on b.id = si.brand_id
  join site_energy_records e on e.certification_id = c.id
  where b.name = 'FENDI' and c.cert_type = 'Energy'
),
abbinati as (
  select f.nome, f.data_inst, m.rec_id, m.sim
  from norm f
  join lateral (
    select d.rec_id, similarity(d.n, f.n) as sim
      from db d
     order by similarity(d.n, f.n) desc
     limit 1
  ) m on m.sim >= 0.55
)
update public.site_energy_records e
   set installation_date = a.data_inst,
       updated_at = now()
  from abbinati a
 where e.id = a.rec_id
   and e.installation_date is distinct from a.data_inst;

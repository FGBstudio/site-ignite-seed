-- ═══════════════════════════════════════════════════════════════════════════
-- Sarca 336: il sito che mancava, con i suoi due certificati
--
-- Nel file degli abbinamenti, su questa riga, Matteo ha scritto: «sito e progetti
-- da creare, entrambi già completati e certificati nel 2024». Il marchio SAVILLS
-- in anagrafica c'è già.
--
-- Nascono **certificati**, non «da configurare»: il lavoro è finito nel 2024, e
-- crearli da configurare metterebbe due progetti chiusi nella coda di quelli da
-- impostare — dove qualcuno andrebbe a cercarli per capire cosa manca.
--
-- **La tipologia è una mia scelta, e va controllata.** Il catalogo non accetta una
-- combinazione incompleta, e di questi due progetti so lo schema e l'anno, non la
-- tipologia: ho preso quella standard di un immobile a reddito gestito — LEED
-- BD+C Core & Shell e WELL Core. Sta scritto nelle note del progetto, perché una
-- scelta fatta per far passare un vincolo non deve sembrare un dato.
--
-- La data di rilascio non la invento: so l'anno, e l'anno sta nel nome.
-- ═══════════════════════════════════════════════════════════════════════════

with sito as (
  insert into public.sites (brand_id, name, currency, status, city, country)
  select '593da0c8-3c88-4420-b9b9-06fc49738a8e', 'MILANO, Sarca 336', 'EUR', 'active', 'Milano', 'Italy'
   where not exists (
     select 1 from public.sites where lower(name) = lower('MILANO, Sarca 336')
   )
  returning id
),
quale as (
  select id from sito
  union all
  select id from public.sites where lower(name) = lower('MILANO, Sarca 336')
)
insert into public.certifications (
  site_id, cert_type, cert_rating, project_subtype, name, client, status, region, quotation_notes
)
select q.id, v.tipo, v.rating, v.tipologia, v.nome,
       'Savills Investment Management SGR SPA', 'certificato', 'Europe',
       'Sito e progetto creati dall''import dell''archivio ENTRATE su indicazione di Matteo: completati e certificati nel 2024. Tipologia e rating scelti dall''import (il catalogo non accetta una combinazione incompleta): da controllare.'
  from (select id from quale limit 1) q
  cross join (values
    ('LEED', 'BD+C', 'Core & Shell', 'Sarca 336 — LEED (certificato 2024)'),
    ('WELL', null,   'Core',         'Sarca 336 — WELL (certificato 2024)')
  ) as v(tipo, rating, tipologia, nome)
 where not exists (
   select 1 from public.certifications c
    join public.sites s on s.id = c.site_id
   where lower(s.name) = lower('MILANO, Sarca 336') and c.cert_type = v.tipo
 );

select s.name as sito, b.name as marchio,
       (select string_agg(c.cert_type || '/' || coalesce(c.project_subtype,'—') || ' · ' || c.status, ' | ')
          from public.certifications c where c.site_id = s.id) as progetti
  from public.sites s left join public.brands b on b.id = s.brand_id
 where lower(s.name) = lower('MILANO, Sarca 336');

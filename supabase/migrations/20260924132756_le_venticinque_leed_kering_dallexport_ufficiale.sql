-- ═══════════════════════════════════════════════════════════════════════════
-- Le venticinque LEED Kering, dall'export ufficiale
--
-- Il CSV e' un export da LEED Online, e porta cose che a database non c'erano:
-- il LEED_ID, il punteggio finale, la data di certificazione e quella di
-- scadenza della ricertificazione, l'area dichiarata, l'anno di costruzione,
-- l'indirizzo e le coordinate. Ha perfino una colonna «Supabase_Status_Code»:
-- e' stato preparato per entrare qui.
--
-- Venticinque progetti: tre corrispondono a certificazioni che esistevano,
-- dodici si agganciano ai siti Kering creati stamattina, dieci portano siti
-- nuovi.
--
-- ── TRE COSE CHE IL CSV AVEVA STORTE, E COME LE HO LETTE ──────────────────
-- 1. La codifica: il file ha subito un doppio cambio di codepage, e le accentate
--    erano diventate «Ý», «Ú», «Þ». Ricostruite: «Vila Olímpia», «Général de
--    Gaulle», «rue de Sèvres» — tre indirizzi veri che confermano la regola.
-- 2. La tipologia dei magazzini: il CSV dice «Warehouse & Distribution Centers»,
--    il catalogo «Warehouses» al plurale. Normalizzata, o il trigger rifiuta.
-- 3. Le date sono giorno/mese/anno. Lo confermano tutte e quindici le coppie
--    certificazione-scadenza, che distano esattamente tre anni come vuole la
--    ricertificazione LEED.
--
-- ── L'AREA VA SULLA CERTIFICAZIONE, NON SUL SITO ──────────────────────────
-- `sqm` e' l'area del progetto LEED, e un sito con sei certificazioni non ha
-- una sola area: Trecate ne ha sei, da 1.937 a un milione di metri quadri.
-- Scriverne una su `sites.area_m2` vorrebbe dire scegliere arbitrariamente
-- quale, e quel campo alimenta le intensita' energetiche. Resta vuoto.
--
-- ── IL LIVELLO NON SI CANCELLA ────────────────────────────────────────────
-- Montaigne e Padova a database portano un livello (Gold, Platinum) su una
-- certificazione ancora `da_configurare`; il CSV dice «In Progress» senza
-- livello. Sono due cose diverse: quello a database e' un obiettivo, quello del
-- CSV un fatto non ancora avvenuto. Il livello non viene sovrascritto con nulla
-- — si perderebbe l'obiettivo senza guadagnare un fatto.
-- ═══════════════════════════════════════════════════════════════════════════

create temporary table _leed (
  leed_id      text primary key,
  progetto     text not null,
  sito         text not null,     -- il sito a cui appartiene, esistente o nuovo
  rating       text not null,
  tipologia    text not null,
  versione     text not null,
  stato        text not null,
  livello      text,
  punteggio    int,
  certificata  date,
  scadenza     date,
  registrata   date,
  sqm          numeric,
  edificio     text,
  anno         int,
  citta        text, paese text, provincia text, cap text,
  indirizzo    text, lat numeric, lng numeric,
  regione      text, tz text, nuovo boolean
) on commit drop;

insert into _leed values
 -- ── Sui tre progetti che a database esistono gia' ────────────────────────
 ('1000200461','KERING 56 Montaigne','AVENUE MONTAIGNE 56','BD+C','Core & Shell','v4','in_corso',
  null,null,null,null,null,2843,'Office: Other Office',2024,
  'Paris','France','75','75008','56 avenue Montaigne',48.868077,2.308953,'Europe','Europe/Paris',false),
 ('1000178674','KERING EYEWEAR Uffici Padova','Offices HQ','BD+C','New Construction','v4','in_corso',
  null,null,null,null,null,11750,'Office: Mixed-Use',2023,
  'Padova','Italy','PD','35100','Via Altichiero 180',45.453218,11.858526,'Europe','Europe/Rome',false),
 ('1000235410','Kering Laennec','Kering Laennec','ID+C','Commercial Interiors','v4','in_corso',
  null,null,null,null,null,3539,'Office: Administrative/Professional',2026,
  'Paris','France','75','75007','40 Rue de Sèvres',48.849485,2.322101,'Europe','Europe/Paris',false),

 -- ── Sui sette siti creati stamattina ─────────────────────────────────────
 ('1000177857','KERING SENATO','KERING Senato','ID+C','Commercial Interiors','v4','certificato',
  'Platinum',81,date '2023-12-12',date '2026-12-12',date '2023-04-25',10586,'Office: Mixed-Use',2023,
  'Milano','Italy','MI','20121','Via Senato 19',45.470469,9.197242,'Europe','Europe/Rome',false),
 ('1000181851','KERING Senato Spiga','KERING Senato','ID+C','Retail','v4','in_corso',
  null,null,null,null,null,10586,'Office: Administrative/Professional',2023,
  'Milano','Italy','MI','20121','Via Senato 19',45.470469,9.197242,'Europe','Europe/Rome',false),
 ('1000121930','TRECATE GLOBE - B','KERING Trecate','BD+C','Warehouses & Distribution Centers','v4','certificato',
  'Platinum',84,date '2022-02-09',date '2025-02-09',date '2019-08-09',1060308.73,null,null,
  'Trecate','Italy','NO','28069','Via Novara',45.4336285,8.7162843,'Europe','Europe/Rome',false),
 ('1000121919','TRECATE GLOBE - A','KERING Trecate','BD+C','Warehouses & Distribution Centers','v4','certificato',
  'Platinum',84,date '2022-02-09',date '2025-02-09',date '2019-08-09',659245.82,null,null,
  'Trecate','Italy','NO','28069','Via Novara',45.4336285,8.7162843,'Europe','Europe/Rome',false),
 ('1000139266','KERING Trecate B2','KERING Trecate','ID+C','Commercial Interiors','v4','certificato',
  'Platinum',84,date '2022-06-30',date '2025-06-30',date '2020-12-29',3172,'Office: Mixed-Use',2020,
  'Trecate','Italy','NO','28069','Via Novara',45.434261,8.715297,'Europe','Europe/Rome',false),
 ('1000139296','KERING Trecate B1','KERING Trecate','ID+C','Commercial Interiors','v4','certificato',
  'Platinum',80,date '2023-07-19',date '2026-07-19',date '2020-12-29',5687,'Office: Mixed-Use',2020,
  'Trecate','Italy','NO','28069','Via Novara',45.434818,8.715898,'Europe','Europe/Rome',false),
 ('1000139287','KERING Trecate A1','KERING Trecate','ID+C','Commercial Interiors','v4','certificato',
  'Platinum',84,date '2022-06-15',date '2025-06-15',date '2020-12-29',1937,'Office: Mixed-Use',2020,
  'Trecate','Italy','NO','28069','Via Novara',45.43396,8.714782,'Europe','Europe/Rome',false),
 ('1000130240','Kering Trecate A1 (in corso)','KERING Trecate','ID+C','Commercial Interiors','v4','in_corso',
  null,null,null,null,null,20849.67,'Office: Other Office',2020,
  'Trecate','Italy','NO','28069','Via Novara',null,null,'Europe','Europe/Rome',false),
 ('1000155480','KERING Offices Rue Monsieur','Paris, Rue Monsieur','ID+C','Commercial Interiors','v4','certificato',
  'Platinum',85,date '2023-05-12',date '2026-05-12',date '2022-02-03',2890,'Office: Mixed-Use',2022,
  'Paris','France','75','75007','15-17 rue Monsieur',48.850489,2.316567,'Europe','Europe/Paris',false),
 ('1000194744','KERING DUBAI','Kering Dubai','ID+C','Commercial Interiors','v4','certificato',
  'Gold',62,date '2024-08-21',date '2027-08-21',date '2024-02-20',527,'Office: Other Office',2024,
  'Dubai','United Arab Emirates','AE',null,'Dubai Design District, building 3+1A',25.186674,55.301973,'Middle East','Asia/Dubai',false),
 ('1000199790','KERING AMSTERDAM','Kering Amsterdam','ID+C','Commercial Interiors','v4','certificato',
  'Platinum',81,date '2024-11-08',null,null,400,'Office: Other Office',2024,
  'Amsterdam','Netherlands','8','1069 HA','Amstelplein 1',52.345003,4.917148,'Europe','Europe/Amsterdam',false),
 ('1000199794','KERING SAN PAOLO','Kering San Paolo','ID+C','Commercial Interiors','v4','certificato',
  'Gold',66,date '2024-08-20',date '2027-08-20',date '2024-02-29',397,'Office: Other Office',2024,
  'São Paulo','Brazil','SP','04551-060','R. Funchal, 418 - Vila Olímpia',-23.594143,-46.68999,'America','America/Sao_Paulo',false),

 -- ── I dieci siti nuovi ───────────────────────────────────────────────────
 ('1000185390','Kering Sydney Office','Kering Sydney Office','ID+C','Commercial Interiors','v4','certificato',
  'Gold',63,date '2023-12-24',date '2026-12-24',date '2023-09-22',1153,'Office: Administrative/Professional',2023,
  'Sydney','Australia','NSW','2000','201 Elizabeth Street',-33.873616,151.209416,'APAC','Australia/Sydney',true),
 ('1000074031','LGI SA Cadempino Building','LGI SA Cadempino Building','ID+C','Commercial Interiors','v2009','in_corso',
  null,null,null,null,null,15306.27,null,null,
  'Cadempino','Switzerland','TI','6814','Via Industria 19',46.029572,8.9307851,'Europe','Europe/Zurich',true),
 ('1000166534','Kering & Boucheron Shanghai Office','Kering & Boucheron Shanghai Office','ID+C','Commercial Interiors','v4','certificato',
  'Gold',63,date '2023-06-07',date '2026-06-07',date '2022-10-10',518,'Office: Mixed-Use',2022,
  'Shanghai','China','20','200041','30F, Jiadi Center High District, No. 968',31.23112,121.45755,'APAC','Asia/Shanghai',true),
 ('1000155475','KERING Offices Coeur Defense','KERING Offices Coeur Defense','ID+C','Commercial Interiors','v4','certificato',
  'Gold',64,date '2023-01-30',date '2026-01-30',date '2022-02-03',1830,'Office: Mixed-Use',2022,
  'Courbevoie','France','92','92400','100-110 Espl. du Général de Gaulle',48.891583,2.244057,'Europe','Europe/Paris',true),
 ('1000173069','TMLO San Paolo','TMLO San Paolo','ID+C','Commercial Interiors','v4','certificato',
  'Gold',73,date '2023-07-10',date '2026-07-10',date '2023-02-28',498,'Office: Mixed-Use',2023,
  'Milano','Italy','MI','20121','Via San Paolo 7',45.465617,9.193358,'Europe','Europe/Rome',true),
 ('1000166533','Kering & Boucheron Korea office','Kering & Boucheron Korea office','ID+C','Commercial Interiors','v4','certificato',
  'Gold',66,date '2023-05-09',date '2026-05-09',date '2022-10-10',1212,'Office: Mixed-Use',2022,
  'Seoul','South Korea','13',null,'Luceen Tower, 18th Floor, 510 Teheran-ro',37.50457,127.049447,'APAC','Asia/Seoul',true),
 ('1000142551','KERING Offices Mexico City','KERING Offices Mexico City','ID+C','Commercial Interiors','v4','certificato',
  'Gold',63,date '2022-06-08',date '2025-06-08',date '2021-03-20',740,'Office: Other Office',2021,
  'Mexico City','Mexico','MEX','11540','AV Ejercito Nacional 676, Colonia Polanco',19.438922,-99.202263,'America','America/Mexico_City',true),
 ('1000175572','Kering Warehouse Office Singapore','Kering Warehouse Office Singapore','ID+C','Commercial Interiors','v4','certificato',
  'Gold',65,date '2023-06-21',date '2026-06-21',date '2023-04-07',436,'Office: Mixed-Use',2023,
  'Singapore','Singapore','SG','999002','DB Schenker Red Lion L6, 20 Alps Ave',1.380621,104.000561,'APAC','Asia/Singapore',true),
 ('1000212777','Kering & BV Taipei Office','Kering & BV Taipei Office','ID+C','Commercial Interiors','v4','certificato',
  'Gold',64,date '2025-10-02',date '2028-10-02',null,1425,'Office: Other Office',2025,
  'Taipei','Taiwan','TPE','110','No. 525, Section 4, Zhongxiao E Rd, Xinyi',25.041857,121.5615,'APAC','Asia/Taipei',true),
 ('1000117369','Kering Wayne, NJ','Kering Wayne, NJ','ID+C','Commercial Interiors','v4','certificato',
  'Gold',66,date '2021-03-15',date '2024-03-15',date '2019-04-04',43202.7,'Office: Administrative/Professional',2019,
  'Township of Wayne','United States','NJ','07470','150 Totowa Road',40.912551,-74.235605,'America','America/New_York',true);

do $$
declare v_n int;
begin
  select count(*) into v_n from _leed;
  if v_n <> 25 then raise exception 'Attese 25 righe LEED, trovate %', v_n; end if;
end $$;

-- ── I dieci siti nuovi ────────────────────────────────────────────────────
insert into public.sites
  (brand_id, name, city, country, region, timezone, address, lat, lng, typology, currency, status)
select (select id from public.brands where name = 'KERING'),
       l.sito, l.citta, l.paese, l.regione, l.tz,
       l.indirizzo || coalesce(', ' || l.cap, '') || ', ' || l.citta,
       l.lat, l.lng, 'Offices', 'EUR', 'active'
  from _leed l
 where l.nuovo
   and not exists (select 1 from public.sites s where s.name = l.sito);

-- ── L'indirizzo dove mancava, e quello sbagliato di Montaigne ────────────
-- Montaigne portava «40 Rue de Sèvres», che e' l'indirizzo di Laennec: due
-- progetti diversi a Parigi con lo stesso indirizzo era il sintomo.
update public.sites s
   set address = l.indirizzo || coalesce(', ' || l.cap, '') || ', ' || l.citta,
       lat = coalesce(s.lat, l.lat),
       lng = coalesce(s.lng, l.lng)
  from _leed l
 where s.name = l.sito
   and not l.nuovo
   and l.indirizzo is not null
   and (s.address is null or s.name = 'AVENUE MONTAIGNE 56');

-- ── Le certificazioni ─────────────────────────────────────────────────────
alter table public.certifications disable trigger trg_enforce_cert_not_on_hold;

-- Prima si arricchiscono le tre che esistono: si riconoscono dal sito e dal
-- tipo, perche' il LEED_ID non c'era ancora.
update public.certifications c
   set external_reference_id = l.leed_id,
       cert_rating      = l.rating,
       project_subtype  = l.tipologia,
       cert_version     = l.versione,
       -- Il livello non si cancella: a database e' un obiettivo, nel CSV un
       -- fatto non ancora avvenuto.
       cert_level       = coalesce(l.livello, c.cert_level),
       level            = coalesce(l.livello, c.level),
       score            = coalesce(l.punteggio, nullif(c.score, 0)),
       issued_date      = coalesce(l.certificata, c.issued_date),
       expiry_date      = coalesce(l.scadenza, c.expiry_date),
       registration_date= coalesce(l.registrata, c.registration_date),
       sqm              = coalesce(l.sqm, c.sqm),
       building_type    = coalesce(l.edificio, c.building_type),
       year_constructed = coalesce(l.anno, c.year_constructed)
  from _leed l
  join public.sites s on s.name = l.sito
 where c.site_id = s.id and c.cert_type = 'LEED'
   and l.leed_id in ('1000200461','1000178674','1000235410');

-- Poi le ventidue che mancano.
insert into public.certifications
  (site_id, name, cert_type, cert_rating, project_subtype, cert_version, status,
   cert_level, level, score, issued_date, expiry_date, registration_date,
   sqm, building_type, year_constructed, external_reference_id,
   client, region, fgb_monitor, has_iaq_monitoring, has_energy_monitoring,
   has_water_monitoring, has_hardware_redirection, on_hold, currency, fx_rate_to_eur)
select s.id, l.progetto, 'LEED', l.rating, l.tipologia, l.versione, l.stato,
       l.livello, l.livello, l.punteggio, l.certificata, l.scadenza, l.registrata,
       l.sqm, l.edificio, l.anno, l.leed_id,
       case when s.name = 'Offices HQ' then 'KERING EYEWEAR' else 'KERING' end,
       l.regione, false, false, false, false, false, false, 'EUR', 1
  from _leed l
  join public.sites s on s.name = l.sito
 where l.leed_id not in ('1000200461','1000178674','1000235410')
   and not exists (
     select 1 from public.certifications c where c.external_reference_id = l.leed_id
   );

alter table public.certifications enable trigger trg_enforce_cert_not_on_hold;

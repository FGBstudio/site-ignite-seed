-- ═══════════════════════════════════════════════════════════════════════════
-- I sette siti Kering del monitoraggio aria
--
-- Sono progetti gia' certificati con monitoraggio dentro una WELL, e finora non
-- esistevano a database. I loro monitor invece si: trentadue arrivano dal broker
-- e si erano accumulati su «FGB Milan Office», il sito di parcheggio di chi non
-- ha un posto dove andare. Con la telemetria che entra ogni minuto, ogni minuto
-- di attesa era CO2 di Kering attribuita all'ufficio di Milano.
--
-- Qui nasce la destinazione: sette siti, sette certificazioni WELL certificate,
-- sette commesse indipendenti col nome del progetto, sette schede aria. Il
-- reindirizzamento dei monitor sta nella migrazione successiva, perche' sono due
-- fatti diversi: questo dice che il posto esiste, quella che i monitor ci vanno.
--
-- ── LA TIPOLOGIA WELL ─────────────────────────────────────────────────────
-- Il catalogo ne ammette cinque e il trigger le pretende: «Existing Building» e'
-- l'unica che descrive questi sette. Core e Core and Shell riguardano chi
-- sviluppa il guscio, New Construction il nuovo, HSR e' un prodotto diverso e
-- piu' leggero. Questi sono uffici e hub esistenti, occupati, gia' certificati.
--
-- ── ONLINE_STATUS RESTA VUOTO, E NON PER PIGRIZIA ─────────────────────────
-- Il foglio ha due colonne, «Check Transmission» e «Connected», e righe con una
-- sola Y: non si sa quale delle due. Ma la domanda e' mal posta, perche' la
-- risposta non sta in un foglio — sta nella telemetria, che per questi monitor
-- arriva ADESSO. Senato L.4.2 ha una Y sola e le note dicono che piano 4
-- trasmette; Amsterdam ha due Y e dice «Not in the Platform». Il foglio
-- contraddice se stesso, il dato no.
--
-- Quindi online_status si derivera' da telemetry_latest, come sull'Energy lo
-- stato si deriva dal primo dato ricevuto. Importare la Y vorrebbe dire
-- scrivere una volta sola un numero che il tempo cambia: l'errore che su Pacific
-- Place e' costato una fattura.
--
-- ── LE COORDINATE ─────────────────────────────────────────────────────────
-- Trecate ne aveva tre nel foglio: vale la prima, per decisione. La riga
-- Senato375 portava quelle di Scandicci, trascinate per sbaglio: riportata a
-- Senato come le altre nove. Rue Monsieur ne ha due a un centesimo di grado di
-- distanza: vale quella delle sette righe su otto.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── I sette siti ──────────────────────────────────────────────────────────
insert into public.sites
  (brand_id, name, city, country, region, timezone, lat, lng,
   monitoring_types, module_air_enabled, typology, currency, status)
select (select id from public.brands where name = 'KERING'),
       d.nome, d.citta, d.paese, d.regione, d.tz, d.lat, d.lng,
       array['air_quality'], true, 'Offices', 'EUR', 'active'
  from (values
    ('KERING Senato',       'Milano',    'Italy',                'Europe',      'Europe/Rome',       45.4703764,   9.1971066),
    ('Kering Scandicci',    'Scandicci', 'Italy',                'Europe',      'Europe/Rome',       43.7631935,  11.1684635),
    ('KERING Trecate',      'Trecate',   'Italy',                'Europe',      'Europe/Rome',       45.4339647,   8.7141206),
    ('Paris, Rue Monsieur', 'Paris',     'France',               'Europe',      'Europe/Paris',      48.8507928,   2.316870472),
    ('Kering Dubai',        'Dubai',     'United Arab Emirates', 'Middle East', 'Asia/Dubai',        25.11813696, 55.20091353),
    ('Kering Amsterdam',    'Amsterdam', 'Netherlands',          'Europe',      'Europe/Amsterdam',  52.34516529,  4.917939943),
    ('Kering San Paolo',    'São Paulo', 'Brazil',               'America',     'America/Sao_Paulo', -23.56794845,-46.68869373)
  ) as d(nome, citta, paese, regione, tz, lat, lng)
 where not exists (select 1 from public.sites x where x.name = d.nome);

-- ── Le certificazioni WELL, certificate ───────────────────────────────────
alter table public.certifications disable trigger trg_enforce_cert_not_on_hold;

insert into public.certifications
  (site_id, name, cert_type, project_subtype, status, client, region, fgb_monitor,
   has_iaq_monitoring, has_energy_monitoring, has_water_monitoring,
   has_hardware_redirection, on_hold, currency, fx_rate_to_eur)
select s.id, s.name, 'WELL', 'Existing Building', 'certificato', 'KERING', s.region, true,
       true, false, false, false, false, 'EUR', 1
  from public.sites s
 where s.name in ('KERING Senato','Kering Scandicci','KERING Trecate','Paris, Rue Monsieur',
                  'Kering Dubai','Kering Amsterdam','Kering San Paolo')
   and not exists (
     select 1 from public.certifications c
      where c.site_id = s.id and c.cert_type = 'WELL'
   );

alter table public.certifications enable trigger trg_enforce_cert_not_on_hold;

-- ── Sette commesse indipendenti, col nome del progetto ────────────────────
insert into public.commesse (nome, servizio, valore_dichiarato, valuta, stato, categoria, termini_giorni, note)
select s.name, 'air', null, 'EUR', 'aperta', 'Air', 31,
       'Monitoraggio aria dentro una WELL, progetto gia certificato. Commessa indipendente: '
    || 'nome commessa = nome progetto.'
  from public.sites s
 where s.name in ('KERING Senato','Kering Scandicci','KERING Trecate','Paris, Rue Monsieur',
                  'Kering Dubai','Kering Amsterdam','Kering San Paolo')
   and not exists (select 1 from public.commesse k where k.nome = s.name);

insert into public.commessa_progetti (commessa_id, certification_id)
select k.id, c.id
  from public.sites s
  join public.certifications c on c.site_id = s.id and c.cert_type = 'WELL'
  join public.commesse k on k.nome = s.name
 where s.name in ('KERING Senato','Kering Scandicci','KERING Trecate','Paris, Rue Monsieur',
                  'Kering Dubai','Kering Amsterdam','Kering San Paolo')
   and not exists (
     select 1 from public.commessa_progetti cp
      where cp.commessa_id = k.id and cp.certification_id = c.id
   );

-- ── Le schede aria ────────────────────────────────────────────────────────
-- `status` segue la convenzione delle Air esistenti: «N delivered». N e' il
-- numero di monitor che il foglio assegna al sito, non quelli arrivati: sono
-- consegnati tutti, arrivati no, e la differenza la dira' la telemetria.
insert into public.site_air_records
  (site_id, certification_id, project_name, status, online_status, total_sensors, notes)
select s.id, c.id, s.name, d.quanti || ' delivered', null, d.quanti, d.nota
  from (values
    ('KERING Senato',       10, 'Only «piano 4 & 6» are transmitting. Others are not loading.'),
    ('Kering Scandicci',    10, 'All ok.'),
    ('KERING Trecate',      34, 'Solo Corpo A piano 0 e 1, corpo B1 piano 0 e 3, corpo B2 piano 1 e 2 '
                             || 'trasmettono in piattaforma. Nove monitor sono Kaiterra su Building A, '
                             || 'identificati da un id a otto caratteri e non da un MAC.'),
    ('Paris, Rue Monsieur',  8, 'Non caricano in piattaforma. Alcuni non hanno mai funzionato dopo il '
                             || 'reboot; su un MAC Kering segnala che funziona ma non e collegato a un '
                             || 'apparato gestito da loro, quindi non possono assegnargli la VLAN giusta.'),
    ('Kering Dubai',         1, 'No picture.'),
    ('Kering Amsterdam',     1, 'Non in piattaforma, per il resto ok.'),
    ('Kering San Paolo',     1, 'Spedito con DHL 3482392852, ricevuto e installato. Segnalano luce '
                             || 'rossa lampeggiante: trasmissione da verificare.')
  ) as d(nome, quanti, nota)
  join public.sites s on s.name = d.nome
  join public.certifications c on c.site_id = s.id and c.cert_type = 'WELL'
 where not exists (
   select 1 from public.site_air_records a where a.certification_id = c.id
 );

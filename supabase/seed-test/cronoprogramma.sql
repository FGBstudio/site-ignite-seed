-- ============================================================================
-- Dati di prova per il cronoprogramma
--
-- NON e' una migrazione: sta fuori da supabase/migrations/ apposta, perche' i
-- dati di prova non devono ripresentarsi su un ambiente nuovo. Si esegue a
-- mano, e si annulla con supabase/seed-test/cronoprogramma_pulizia.sql.
--
-- Tutto pende dalla holding "ZZ TEST — Cronoprogramma": ordina in fondo a ogni
-- elenco, e' inconfondibile, e la pulizia e' una cancellazione sola.
--
-- ── Cosa c'e' dentro ──────────────────────────────────────────────────────
--
--   ZZ TEST — Palazzo Aurora        nuova costruzione, Milano
--     LEED BD+C          Matteo      \
--     WELL NC            pmtest       > tre certificazioni, un solo cantiere
--     LEED GC Support    Matteo      /   (la serie mensile dei report)
--
--   ZZ TEST — Torre Levante         edificio esistente, Milano
--     WELL Existing Building  pmtest     nessun cronoprogramma, e non serve
--
--   ZZ TEST — Uffici Corso Re       Torino
--     Greeny                             appeso al solo sito: niente
--                                        certificazione, niente cantiere
--
-- ── Il cronoprogramma NON e' precompilato ─────────────────────────────────
--
-- Apposta. Lo scenario (a) e' proprio quello: aprire la certificazione e
-- trovare il gate. Il cronoprogramma lo compili tu, ed e' il passaggio che
-- sblocca lo scenario (b). In fondo al file c'e' il blocco per riempirlo in un
-- colpo solo, se vuoi saltare avanti.
-- ============================================================================

begin;

-- Idempotente: si puo' rieseguire.
delete from public.certifications where client = 'ZZ TEST';
delete from public.site_energy_records where site_id in (
  select s.id from public.sites s join public.brands b on b.id = s.brand_id
   where b.holding_id = 'aaaa0000-0000-4000-8000-000000000001');
delete from public.sites  where brand_id   = 'aaaa0000-0000-4000-8000-000000000002';
delete from public.brands where holding_id = 'aaaa0000-0000-4000-8000-000000000001';
delete from public.cronoprogrammi where site_id in (
  select id from public.sites where brand_id = 'aaaa0000-0000-4000-8000-000000000002');
delete from public.holdings where id = 'aaaa0000-0000-4000-8000-000000000001';

-- ── Anagrafica ────────────────────────────────────────────────────────────
insert into public.holdings (id, name) values
  ('aaaa0000-0000-4000-8000-000000000001', 'ZZ TEST — Cronoprogramma');

insert into public.brands (id, holding_id, name) values
  ('aaaa0000-0000-4000-8000-000000000002', 'aaaa0000-0000-4000-8000-000000000001', 'ZZ TEST — Fondo Ambra');

insert into public.sites (id, brand_id, name, city, country, region, currency, status, typology) values
  ('aaaa0000-0000-4000-8000-000000000010', 'aaaa0000-0000-4000-8000-000000000002',
   'ZZ TEST — Palazzo Aurora',  'Milano', 'Italy', 'Europe', 'EUR', 'active', 'Office'),
  ('aaaa0000-0000-4000-8000-000000000011', 'aaaa0000-0000-4000-8000-000000000002',
   'ZZ TEST — Torre Levante',   'Milano', 'Italy', 'Europe', 'EUR', 'active', 'Office'),
  ('aaaa0000-0000-4000-8000-000000000012', 'aaaa0000-0000-4000-8000-000000000002',
   'ZZ TEST — Uffici Corso Re', 'Torino', 'Italy', 'Europe', 'EUR', 'active', 'Office');

-- ── Palazzo Aurora: tre certificazioni, due PM ────────────────────────────
--
-- Handover contrattuale 15 mar 2027, scadenza contratto 30 set 2027. La
-- baseline si congela da sola all'inserimento (fn_freeze_baseline_handover) e
-- da li' in avanti non si sposta piu': e' la data su cui si chiede la proroga.
insert into public.certifications
  (id, site_id, cert_type, cert_rating, project_subtype, cert_level, name, client,
   region, pm_id, status, handover_date, contract_end_date, allocated_hours, currency)
values
  ('aaaa0000-0000-4000-8000-000000000020', 'aaaa0000-0000-4000-8000-000000000010',
   'LEED', 'BD+C', 'New Construction', 'Gold', 'Palazzo Aurora — LEED BD+C', 'ZZ TEST',
   'Europe', '737a3f23-a954-455f-a4ef-b0b301ee79a1', 'in_corso',
   '2027-03-15', '2027-09-30', 340, 'EUR'),

  ('aaaa0000-0000-4000-8000-000000000021', 'aaaa0000-0000-4000-8000-000000000010',
   'WELL', null, 'New Construction', 'Gold', 'Palazzo Aurora — WELL NC', 'ZZ TEST',
   'Europe', '4aace920-76bb-4ea4-a8b0-1ba11e092799', 'in_corso',
   '2027-03-15', '2027-09-30', 220, 'EUR'),

  ('aaaa0000-0000-4000-8000-000000000022', 'aaaa0000-0000-4000-8000-000000000010',
   'LEED_GC_Support', null, null, null, 'Palazzo Aurora — LEED GC Support', 'ZZ TEST',
   'Europe', '737a3f23-a954-455f-a4ef-b0b301ee79a1', 'in_corso',
   '2027-03-15', '2027-09-30', 180, 'EUR');

-- ── Torre Levante: l'edificio esistente ───────────────────────────────────
--
-- Non ha cronoprogramma e non deve averlo. Non e' un progetto a cui manca il
-- cantiere: e' una casistica sua, con un asse fatto di performance period e
-- scadenza di ricertificazione. La sua timeline si materializza subito, perche'
-- il gate non la riguarda.
insert into public.certifications
  (id, site_id, cert_type, cert_rating, project_subtype, cert_level, name, client,
   region, pm_id, status, handover_date, contract_end_date, allocated_hours, currency)
values
  ('aaaa0000-0000-4000-8000-000000000023', 'aaaa0000-0000-4000-8000-000000000011',
   'WELL', null, 'Existing Building', 'Silver', 'Torre Levante — WELL EB', 'ZZ TEST',
   'Europe', '4aace920-76bb-4ea4-a8b0-1ba11e092799', 'in_corso',
   '2026-11-30', '2027-06-30', 120, 'EUR');

-- ── Uffici Corso Re: il servizio venduto da solo ──────────────────────────
--
-- Nessuna certificazione, nessun cantiere: solo i monitor. E' il caso delle 66
-- righe orfane — con la differenza che ora la riga puo' dichiararlo, invece di
-- essere orfana per mancanza di un posto dove appendersi.
insert into public.site_energy_records
  (id, site_id, certification_id, project_name, pm_id, status)
values
  ('aaaa0000-0000-4000-8000-000000000030', 'aaaa0000-0000-4000-8000-000000000012',
   null, 'Uffici Corso Re — Greeny', '737a3f23-a954-455f-a4ef-b0b301ee79a1', 'Upcoming');

commit;

-- ============================================================================
-- Scorciatoia: riempire il cronoprogramma senza passare dall'interfaccia
--
-- Serve solo se vuoi saltare direttamente agli scenari (d), (e), (f). Le date
-- sono quelle della demo approvata.
-- ============================================================================
--
-- begin;
-- insert into public.cronoprogrammi (id, site_id, nome, created_by) values
--   ('aaaa0000-0000-4000-8000-000000000040', 'aaaa0000-0000-4000-8000-000000000010',
--    'Palazzo Aurora — nuova costruzione', '737a3f23-a954-455f-a4ef-b0b301ee79a1');
--
-- insert into public.cronoprogramma_eventi
--   (cronoprogramma_id, ancora, nome, ordine, data_pianificata, fonte, stato) values
--   ('aaaa0000-0000-4000-8000-000000000040','lancio_gara','Lancio gara d''appalto',1,'2025-11-10','Manuale · DL','inserita'),
--   ('aaaa0000-0000-4000-8000-000000000040','aggiudicazione_gc','Aggiudicazione GC',2,'2026-01-19','Manuale · DL','inserita'),
--   ('aaaa0000-0000-4000-8000-000000000040','progetto_definitivo','Progetto definitivo consegnato',3,null,null,'da_confermare'),
--   ('aaaa0000-0000-4000-8000-000000000040','construction_start','Construction start',4,'2026-02-02','Gantt GC rev. 3','confermata'),
--   ('aaaa0000-0000-4000-8000-000000000040','impianti_pronti','Impianti pronti per test',5,'2026-11-20','Gantt GC rev. 3','da_confermare'),
--   ('aaaa0000-0000-4000-8000-000000000040','involucro_chiuso','Involucro chiuso',6,null,null,'da_confermare'),
--   ('aaaa0000-0000-4000-8000-000000000040','sito_pronto_test','Sito pronto per test di performance',7,null,null,'da_confermare'),
--   ('aaaa0000-0000-4000-8000-000000000040','handover','Handover (fine cantiere)',8,'2027-03-15','Quotazione (contrattuale)','inserita');
--
-- update public.certifications set cronoprogramma_id = 'aaaa0000-0000-4000-8000-000000000040'
--  where id in ('aaaa0000-0000-4000-8000-000000000020',
--               'aaaa0000-0000-4000-8000-000000000021',
--               'aaaa0000-0000-4000-8000-000000000022');
-- commit;

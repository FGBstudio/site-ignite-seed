-- ============================================================================
-- Rimuove i dati di prova del cronoprogramma
--
-- Tutto pende dalla holding "ZZ TEST — Cronoprogramma", quindi la pulizia e'
-- una cancellazione sola. Non tocca nulla di reale: il filtro e' l'identita'
-- della holding e il valore 'ZZ TEST' su `client`, che nessun progetto vero
-- usa.
--
-- Dopo questo file il database torna esattamente com'era prima del seed. Le
-- migrazioni dello schema restano: quelle si annullano con
-- cronoprogramma_annulla_schema.sql, che e' un'altra cosa.
-- ============================================================================

begin;

delete from public.cronoprogramma_registro where cronoprogramma_id in (
  select k.id from public.cronoprogrammi k
    join public.sites s on s.id = k.site_id
   where s.brand_id = 'aaaa0000-0000-4000-8000-000000000002');

delete from public.certification_milestones where certification_id in (
  select id from public.certifications where client = 'ZZ TEST');

delete from public.certifications where client = 'ZZ TEST';

delete from public.site_energy_records where site_id in (
  select id from public.sites where brand_id = 'aaaa0000-0000-4000-8000-000000000002');
delete from public.site_air_records where site_id in (
  select id from public.sites where brand_id = 'aaaa0000-0000-4000-8000-000000000002');

delete from public.cronoprogrammi where site_id in (
  select id from public.sites where brand_id = 'aaaa0000-0000-4000-8000-000000000002');

delete from public.sites  where brand_id   = 'aaaa0000-0000-4000-8000-000000000002';
delete from public.brands where holding_id = 'aaaa0000-0000-4000-8000-000000000001';
delete from public.holdings where id = 'aaaa0000-0000-4000-8000-000000000001';

commit;

-- Controllo: devono essere tutti zero.
select
  (select count(*) from public.certifications where client = 'ZZ TEST')                    as certificazioni,
  (select count(*) from public.holdings where id = 'aaaa0000-0000-4000-8000-000000000001') as holding,
  (select count(*) from public.sites where brand_id = 'aaaa0000-0000-4000-8000-000000000002') as siti;

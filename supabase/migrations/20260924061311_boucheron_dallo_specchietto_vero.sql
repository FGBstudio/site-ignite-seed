-- ═══════════════════════════════════════════════════════════════════════════
-- Boucheron, dallo specchietto vero
--
-- Lo specchietto dell'amministrazione chiude tre questioni aperte insieme.
--
-- 1. VENDOME NON ERA 8.450 + 8.450. Era 8.000 + 8.900: il contratto base vale
--    16.000, l'acconto ne e' la meta' esatta, e nella seconda fattura e'
--    entrata anche una quotazione extra da 900. Totale 16.900, che e' il
--    numero che avevamo, con dentro una ripartizione sbagliata. Ed e' pagata,
--    seconda fattura compresa: il dubbio sul credito da 8.450 non esisteva,
--    esisteva un 8.450 che non era mai stato ne' 8.450 ne' incerto.
--
-- 2. LE DATE DEGLI ACCONTI SONO TUTTE IL 15/12/2024, Geneva compresa. A
--    database c'era 19/04/2025 su tre progetti e niente su Geneva: quel
--    19/04 era una scrittura in blocco, non quattro bonifici. Ora Geneva ha
--    il suo acconto incassato e la commessa perde il finto scoperto.
--
-- 3. LE SCADENZE NON LE SCRIVO. Basta la data di emissione della fattura:
--    i termini della commessa sono 31 giorni, e 09/09/2026 + 31 fa 10/10/2026,
--    12/01/2025 + 31 fa 12/02/2025 — esattamente le scadenze dello
--    specchietto. Scritte a mano sarebbero due verita' da tenere d'accordo;
--    derivate, restano una.
--
-- Il saldo e' esigibile per intero all'installazione, non solo in parte: le
-- righe «residuo di contratto» nate senza data si fondono nella quotazione
-- extra, che e' l'unica voce oltre le due tranche, ed ereditano la data della
-- fattura. Cannes 6.000, Monaco 2.500, Geneva 1.300 — che su Geneva resta
-- senza data perche' Geneva non e' ancora installata.
--
-- Sull'installazione: Vendome e' del 12/01/2025, non del 22/05/2025. La data
-- sbagliata era mia, derivata all'incontrario dalla scadenza.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.cert_payment_milestones disable trigger trg_cert_payment_milestones_guard;

-- ── Vendome: la ripartizione vera ─────────────────────────────────────────
update public.cert_payment_milestones t
   set amount = 8000.00,
       payment_received_date = date '2024-12-15',
       status = 'Paid', tranche_state = 'invoiced'
 where t.certification_id = (select id from public.certifications
                              where name = 'Vendome, Place Vendome' and cert_type = 'Energy')
   and t.tranche_order = 1;

update public.cert_payment_milestones t
   set amount = 8900.00,
       name = 'Saldo 50% + quotazione extra 900',
       invoice_sent_date = date '2025-01-12',
       payment_received_date = date '2025-02-12',
       status = 'Paid', tranche_state = 'invoiced'
 where t.certification_id = (select id from public.certifications
                              where name = 'Vendome, Place Vendome' and cert_type = 'Energy')
   and t.tranche_order = 2;

update public.site_energy_records r
   set installation_date = date '2025-01-12'
 where r.certification_id = (select id from public.certifications
                              where name = 'Vendome, Place Vendome' and cert_type = 'Energy');

-- ── Gli acconti: 15/12/2024 su tutte e quattro ────────────────────────────
update public.cert_payment_milestones t
   set payment_received_date = date '2024-12-15',
       status = 'Paid', tranche_state = 'invoiced'
 where t.tranche_order = 1
   and t.certification_id in (
     select id from public.certifications
      where name in ('Cannes, La Croisette','Monaco One','Geneva, Rue du Rhône')
        and cert_type = 'Energy');

-- ── Cannes e Monaco: fattura emessa il giorno dell'installazione ──────────
update public.cert_payment_milestones t
   set invoice_sent_date = date '2026-09-09',
       tranche_state = 'invoiced'
 where t.tranche_order = 2
   and t.certification_id in (
     select id from public.certifications
      where name in ('Cannes, La Croisette','Monaco One') and cert_type = 'Energy');

-- ── Una sola voce extra per progetto ──────────────────────────────────────
-- Il «residuo di contratto» era una riga d'attesa: serviva a non far sparire
-- una differenza di cui non sapevamo la scadenza. Ora la scadenza c'e', e due
-- righe per la stessa cosa sono una in piu'.
update public.cert_payment_milestones t
   set amount = d.extra,
       name = 'Quotazione extra',
       invoice_sent_date = d.emessa,
       tranche_state = case when d.emessa is null then 'pending' else 'invoiced' end
  from (values
         ('Cannes, La Croisette', 6000.00, date '2026-09-09'),
         ('Monaco One',           2500.00, date '2026-09-09'),
         ('Geneva, Rue du Rhône', 1300.00, null::date)
       ) as d(progetto, extra, emessa)
 where t.certification_id = (select id from public.certifications
                              where name = d.progetto and cert_type = 'Energy')
   and t.tranche_order = 3;

delete from public.cert_payment_milestones t
 where t.name = 'Residuo di contratto · da pianificare'
   and t.certification_id in (
     select id from public.certifications
      where name in ('Cannes, La Croisette','Monaco One') and cert_type = 'Energy');

-- ── Le date si ricalcolano da sole ────────────────────────────────────────
do $$
declare r record;
begin
  for r in select c.id from public.certifications c
            where c.cert_type = 'Energy'
              and c.name in ('Vendome, Place Vendome','Cannes, La Croisette',
                             'Monaco One','Geneva, Rue du Rhône')
  loop
    perform public.fn_ricalcola_date_tranche(false, r.id);
  end loop;
end $$;

alter table public.cert_payment_milestones enable trigger trg_cert_payment_milestones_guard;

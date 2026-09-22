-- ═══════════════════════════════════════════════════════════════════════════
-- Le fatture FoSensor dell'aria, con la ripartizione per progetto.
--
-- A differenza di Centrica, qui le note dicono di chi e' ogni fetta. Quindi
-- ogni fattura entra due volte: una riga di cassa con l'importo pieno, e una
-- quota per ciascun progetto servito. Solo la cassa entra nelle somme.
--
-- Gli ordini tornano tutti sul 30/40/30 (due sul 50/50):
--   28/08/2024  218.260 CNY  +115.000 di R&D e stampi
--   24/03/2025   93.350
--   07/07/2025   22.500  (50/50)
--   01/09/2025  118.658
--   17/04/2026   56.250
--   260901       58.325  +5.000 di R&D CO2-CO
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.uscite_previste
  add column if not exists certification_id uuid references public.certifications(id);

comment on column public.uscite_previste.certification_id is
  'Il progetto a cui compete la riga. Le quote lo hanno sempre; la cassa quasi mai, perche una fattura serve piu progetti.';

update public.suppliers
   set default_currency = 'CNY',
       default_terms_days = 45,
       notes = 'Hardware aria. 30% deposito + 40% prima della spedizione + 30% a 45 giorni dalla ricezione a Shanghai. Due ordini minori a 50/50, uno a 100% anticipato.'
 where name = 'FoSensor';

-- Le sei righe caricate prima erano solo il previsionale, senza allocazioni e
-- con i numeri di fattura accorpati sotto 260901FS01. Il foglio le rifa' tutte.
delete from public.uscite_previste
 where supplier_id = (select id from public.suppliers where name = 'FoSensor');

-- ── la cassa ───────────────────────────────────────────────────────────────
with f(rif, quota_desc, ordine, emissione, cassa, fonte, innesco, giorni, cny, stato, nota) as (values
 ('241021FS01','R&D e stampi',                    date '2024-08-28', date '2024-10-21', date '2024-10-21','contratto','ordine',     0,  115000.00,'prevista','Data di pagamento non fornita dal foglio: collocata all emissione.'),
 ('241021FS01','30% deposito',                    date '2024-08-28', date '2024-10-21', date '2024-10-21','reale',    'ordine',     0,   65478.00,'pagata',  null),
 ('250109FS01','40% prima della spedizione',      date '2024-08-28', date '2025-01-09', date '2025-01-09','reale',    'spedizione', 0,   87304.00,'pagata',  null),
 ('250430FS01','30% a 45 gg dalla ricezione',     date '2024-08-28', date '2025-04-30', date '2025-06-14','reale',    'ricezione', 45,   65478.00,'pagata',  null),
 ('250324FS01','30% deposito',                    date '2025-03-24', date '2025-03-24', date '2025-03-24','reale',    'ordine',     0,   28005.00,'pagata',  null),
 ('250410FS01','40% prima della spedizione',      date '2025-03-24', date '2025-04-10', date '2025-04-10','reale',    'spedizione', 0,   37340.00,'pagata',  null),
 ('250731FS01','30% a 45 gg dalla ricezione',     date '2025-03-24', date '2025-07-31', date '2025-09-14','reale',    'ricezione', 45,   28005.00,'pagata',  null),
 ('250707FS01','50% deposito',                    date '2025-07-07', date '2025-07-07', date '2025-07-07','reale',    'ordine',     0,   11250.00,'pagata',  null),
 ('250826FS01','50% prima della spedizione',      date '2025-07-07', date '2025-08-26', date '2025-08-26','reale',    'spedizione', 0,   11250.00,'pagata',  null),
 ('250902FS01','30% deposito',                    date '2025-09-01', date '2025-09-02', date '2025-09-02','reale',    'ordine',     0,   35597.40,'pagata',  null),
 ('250924FS01','40% prima della spedizione',      date '2025-09-01', date '2025-09-24', date '2025-09-24','reale',    'spedizione', 0,   47463.20,'pagata',  null),
 ('260105FS01','30% a 45 gg dalla ricezione',     date '2025-09-01', date '2026-01-05', date '2026-02-19','reale',    'ricezione', 45,   35597.40,'pagata',  'Spedizione effettiva 23/12/2025.'),
 ('260417FS01','30% deposito',                    date '2026-04-17', date '2026-04-17', date '2026-04-17','reale',    'ordine',     0,   16875.00,'pagata',  null),
 ('260417FS01','40% prima della spedizione',      date '2026-04-17', null,              date '2026-09-30','stima',    'spedizione', 0,   22500.00,'prevista','Spedizione prevista 30/09/2026.'),
 ('260417FS01','30% a 45 gg dalla ricezione',     date '2026-04-17', null,              date '2026-11-15','stima',    'ricezione', 45,   16875.00,'prevista','Ricezione prevista 15/11/2026.'),
 ('260901FS01','R&D CO2-CO',                      null,              date '2026-09-01', date '2026-09-01','reale',    'ordine',     0,    5000.00,'pagata',  'Sviluppo CO2-CO in 3 settimane.'),
 ('260901FS01','30% deposito',                    null,              date '2026-09-01', date '2026-09-01','reale',    'ordine',     0,   17497.50,'pagata',  null),
 ('260901FS02','40% prima della spedizione',      null,              null,              date '2026-10-10','stima',    'spedizione', 0,   23330.00,'prevista','Spedizione prevista 10/10/2026.'),
 ('260901FS03','30% a 45 gg dalla ricezione',     null,              null,              date '2026-11-25','stima',    'ricezione', 45,   17497.50,'prevista','Ricezione prevista 25/11/2026.'),
 ('260911FS01','100% anticipato',                 date '2026-09-11', date '2026-09-11', date '2026-09-11','reale',    'ordine',     0,     600.00,'pagata',  'Casing per campioni. 100% TT in advance.')
)
insert into public.uscite_previste
  (supplier_id, corsia, natura, commessa_etichetta, riferimento, descrizione,
   importo, valuta, cambio, data_ordine,
   data_evento, data_evento_fonte,
   data_prevista, data_prevista_fonte, evento_innesco, giorni_da_evento,
   stato, note)
select
  (select id from public.suppliers where name = 'FoSensor'),
  'merce', 'cassa',
  'FoSensor ordine ' || coalesce(to_char(f.ordine,'DD/MM/YYYY'), 'N.D.'),
  f.rif,
  'Fattura ' || f.rif || ' · ' || f.quota_desc,
  f.cny, 'CNY', 0.129,
  f.ordine,
  f.emissione, case when f.emissione is null then 'senza_data' else 'reale' end,
  f.cassa, f.fonte, f.innesco, f.giorni,
  f.stato,
  'Cambio CNY/EUR fissato a 0,129 in mancanza del cambio di giornata. '
    || coalesce(f.nota, '')
from f;

-- ── le quote: quanto di ogni fattura compete a ciascun progetto ────────────
with a(rif, quota_desc, cassa, fonte, stato, chi, cny, nota) as (values
 ('241021FS01','30% deposito',               date '2024-10-21','reale','pagata','Luxottica',              24618.00, null),
 ('241021FS01','30% deposito',               date '2024-10-21','reale','pagata','Tolstoj',                40860.00, null),
 ('250109FS01','40% prima della spedizione', date '2025-01-09','reale','pagata','Luxottica',              32824.00, null),
 ('250109FS01','40% prima della spedizione', date '2025-01-09','reale','pagata','Tolstoj',                54480.00, null),
 ('250430FS01','30% a 45 gg dalla ricezione',date '2025-06-14','reale','pagata','Luxottica',              24618.00, null),
 ('250430FS01','30% a 45 gg dalla ricezione',date '2025-06-14','reale','pagata','Tolstoj',                40860.00, null),
 ('250324FS01','30% deposito',               date '2025-03-24','reale','pagata','Luxottica',              22380.00, null),
 ('250324FS01','30% deposito',               date '2025-03-24','reale','pagata','Vari progetti LEED',      5625.00, null),
 ('250410FS01','40% prima della spedizione', date '2025-04-10','reale','pagata','Luxottica',              29840.00, null),
 ('250410FS01','40% prima della spedizione', date '2025-04-10','reale','pagata','Vari progetti LEED',      7500.00, null),
 ('250731FS01','30% a 45 gg dalla ricezione',date '2025-09-14','reale','pagata','Luxottica',              22380.00, null),
 ('250731FS01','30% a 45 gg dalla ricezione',date '2025-09-14','reale','pagata','Vari progetti LEED',      5625.00, null),
 ('250707FS01','50% deposito',               date '2025-07-07','reale','pagata','Vari progetti LEED',     11250.00, null),
 ('250826FS01','50% prima della spedizione', date '2025-08-26','reale','pagata','Vari progetti LEED',     11250.00, null),
 ('250902FS01','30% deposito',               date '2025-09-02','reale','pagata','Ballygunner Nursing Home',8853.00, null),
 ('250902FS01','30% deposito',               date '2025-09-02','reale','pagata','Cappagh Ratoath Road',   17297.40, null),
 ('250902FS01','30% deposito',               date '2025-09-02','reale','pagata','Insediamento DiMar Group',2909.40, null),
 ('250902FS01','30% deposito',               date '2025-09-02','reale','pagata','Viale Richard 1',         6537.60, '48 CO2.'),
 ('250924FS01','40% prima della spedizione', date '2025-09-24','reale','pagata','Ballygunner Nursing Home',11804.00, null),
 ('250924FS01','40% prima della spedizione', date '2025-09-24','reale','pagata','Cappagh Ratoath Road',   23063.20, null),
 ('250924FS01','40% prima della spedizione', date '2025-09-24','reale','pagata','Insediamento DiMar Group',3879.20, null),
 ('250924FS01','40% prima della spedizione', date '2025-09-24','reale','pagata','Viale Richard 1',         8716.80, '48 CO2.'),
 ('260105FS01','30% a 45 gg dalla ricezione',date '2026-02-19','reale','pagata','Ballygunner Nursing Home',8853.00, 'Non nominata nella nota, ma i 26.744,40 allocati lasciano scoperti esattamente gli 8.853,00 di Ballygunner delle altre due tranche dello stesso ordine. Da confermare.'),
 ('260105FS01','30% a 45 gg dalla ricezione',date '2026-02-19','reale','pagata','Cappagh Ratoath Road',   17297.40, null),
 ('260105FS01','30% a 45 gg dalla ricezione',date '2026-02-19','reale','pagata','Insediamento DiMar Group',2909.40, null),
 ('260105FS01','30% a 45 gg dalla ricezione',date '2026-02-19','reale','pagata','Viale Richard 1',         6537.60, '48 CO2.'),
 ('260417FS01','30% deposito',               date '2026-04-17','reale','pagata','Greentech - LEED',        1237.50, '11 monitor WELL a 375 CNY.'),
 ('260417FS01','30% deposito',               date '2026-04-17','reale','pagata','Ripa89 – WELL',           1125.00, '10 monitor WELL a 375 CNY.'),
 ('260417FS01','30% deposito',               date '2026-04-17','reale','pagata','Non allocato',           14512.50, '129 sensori senza progetto.'),
 ('260417FS01','40% prima della spedizione', date '2026-09-30','stima','prevista','Greentech - LEED',      1650.00, null),
 ('260417FS01','40% prima della spedizione', date '2026-09-30','stima','prevista','Ripa89 – WELL',         1500.00, null),
 ('260417FS01','40% prima della spedizione', date '2026-09-30','stima','prevista','Non allocato',         19350.00, '129 sensori senza progetto.'),
 ('260417FS01','30% a 45 gg dalla ricezione',date '2026-11-15','stima','prevista','Greentech - LEED',      1237.50, null),
 ('260417FS01','30% a 45 gg dalla ricezione',date '2026-11-15','stima','prevista','Ripa89 – WELL',         1125.00, null),
 ('260417FS01','30% a 45 gg dalla ricezione',date '2026-11-15','stima','prevista','Non allocato',         14512.50, '129 sensori senza progetto.'),
 ('260901FS01','30% deposito',               date '2026-09-01','reale','pagata','Viale Richard 1',         9325.50, null),
 ('260901FS01','30% deposito',               date '2026-09-01','reale','pagata','Lucan Lodge',             8172.00, '60 CO2 a 454 CNY.'),
 ('260901FS02','40% prima della spedizione', date '2026-10-10','stima','prevista','Viale Richard 1',      12434.00, 'La nota riporta 9.325,50, che e la quota del 30%. Sul 40% la quota proporzionale e 12.434,00, e con i 10.896,00 di Lucan chiude esattamente i 23.330,00 della fattura.'),
 ('260901FS02','40% prima della spedizione', date '2026-10-10','stima','prevista','Lucan Lodge',          10896.00, null),
 ('260901FS03','30% a 45 gg dalla ricezione',date '2026-11-25','stima','prevista','Viale Richard 1',       9325.50, null),
 ('260901FS03','30% a 45 gg dalla ricezione',date '2026-11-25','stima','prevista','Lucan Lodge',           8172.00, '60 CO2 a 454 CNY.')
),
risolti as (
  select a.*,
         case a.chi
           when 'Viale Richard 1' then (select cp.certification_id from public.commessa_progetti cp
                                          join public.commesse k on k.id = cp.commessa_id
                                         where k.nome = 'Viale Richard 1' limit 1)
           when 'Lucan Lodge'     then (select cp.certification_id from public.commessa_progetti cp
                                          join public.commesse k on k.id = cp.commessa_id
                                         where k.nome = 'Lucan Lodge' limit 1)
           else (select c.id from public.certifications c where c.name = a.chi limit 1)
         end as cert_id
    from a
)
insert into public.uscite_previste
  (supplier_id, corsia, natura, commessa_etichetta, certification_id, commessa_id,
   riferimento, descrizione, importo, valuta, cambio,
   data_prevista, data_prevista_fonte, stato, note)
select
  (select id from public.suppliers where name = 'FoSensor'),
  'merce', 'quota',
  r.chi,
  r.cert_id,
  (select cp.commessa_id from public.commessa_progetti cp where cp.certification_id = r.cert_id limit 1),
  r.rif,
  'Quota ' || r.rif || ' · ' || r.quota_desc,
  r.cny, 'CNY', 0.129,
  r.cassa, r.fonte, r.stato,
  'Quanto di quella fattura compete a questo progetto. Si vede, non si somma: la cassa la fa la fattura. '
    || coalesce(r.nota, '')
from risolti r;

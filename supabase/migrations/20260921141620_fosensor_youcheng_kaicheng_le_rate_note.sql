-- ═══════════════════════════════════════════════════════════════════════════
-- Le rate fornitore note al 21 settembre 2026.
--
-- I cambi sono quelli di ogni singola fattura, non un cambio medio: il foglio
-- di Matteo usa 0,128530 su 260417FS01 e 0,129000 su 260901FS01, e gli euro
-- devono tornare uguali a quelli, non a un arrotondamento nostro.
-- ═══════════════════════════════════════════════════════════════════════════

-- Un credito fornitore e un'uscita negativa: lo storno della fee R&D Youcheng
-- rientra da qui. Il vincolo originale lo impediva.
alter table public.uscite_previste drop constraint if exists uscite_previste_importo_check;
comment on column public.uscite_previste.importo is
  'Positivo per un esborso, negativo per un credito o storno riconosciuto dal fornitore.';

insert into public.suppliers (name, default_currency, default_terms_days, notes)
values
  ('FoSensor', 'CNY', 0,
   'Monitor aria. Schema tipico 30% deposito avvio produzione, 40% prima della spedizione, 30% a 45 giorni dalla ricezione.'),
  ('Keye Youcheng', 'USD', 30,
   'Sensori energia. Contratto non ancora firmato al 21/09/2026: le rate sono previsioni, non impegni.'),
  ('Kai Cheng', 'CNY', 0,
   'Installatore. Paga a lotti di installazione: 30% anticipo, 30% a meta installazioni, 40% a conclusione.')
on conflict do nothing;

with f as (select id from public.suppliers where name = 'FoSensor')
insert into public.uscite_previste
  (supplier_id, corsia, commessa_etichetta, riferimento, descrizione,
   importo, valuta, cambio, data_prevista, data_prevista_fonte, stato, note)
select f.id, 'merce', v.commessa, v.rif, v.descr,
       v.importo, 'CNY', v.cambio, v.data, v.fonte, v.stato, v.nota
from f, (values
  ('LEED/WELL',          '260417FS01', '40% prima della spedizione',
   22500.00, 0.128530, date '2026-09-30', 'contratto', 'prevista',
   'Fattura del 17/04/2026. Attesa entro fine settembre.'),
  ('LEED/WELL',          '260417FS01', '30% a 45 giorni dalla ricezione',
   16875.00, 0.128530, date '2026-11-15', 'contratto', 'congelata',
   'Trattenuta fino al superamento del controllo qualita.'),
  ('Richard/Lucan Lodge','260901FS01', '30% deposito per inizio produzione',
   17497.50, 0.129000, date '2026-09-30', 'contratto', 'prevista',
   'Fattura del 01/09/2026. Da saldare all avvio confermato della produzione.'),
  ('Richard/Lucan Lodge','260901FS01', '40% prima della spedizione',
   23330.00, 0.129000, date '2026-09-10', 'contratto', 'prevista',
   'Da saldare solo a merce pronta per il carico.'),
  ('Richard/Lucan Lodge','260901FS01', '30% a 45 giorni dalla ricezione',
   17497.50, 0.129000, date '2026-11-25', 'contratto', 'congelata',
   'Trattenuta fino al superamento del controllo qualita.'),
  ('KEYE',               '260911FS01', '100% pagamento anticipato',
   600.00, 0.128533, date '2026-09-30', 'contratto', 'prevista',
   'Fattura del 11/09/2026. Da pagare subito per sbloccare la spedizione.')
) as v(commessa, rif, descr, importo, cambio, data, fonte, stato, nota);

with y as (select id from public.suppliers where name = 'Keye Youcheng')
insert into public.uscite_previste
  (supplier_id, corsia, commessa_etichetta, riferimento, descrizione,
   importo, valuta, cambio, data_prevista, data_prevista_fonte, stato, note)
select y.id, 'merce', 'Energy monitor', 'Contratto Youcheng', v.descr,
       v.importo, 'USD', 0.904000, v.data, v.fonte, 'prevista', v.nota
from y, (values
  ('Firma contratto: 50% stampi + 100% R&D',
   11799.00, date '2026-10-10', 'contratto',
   'Stampi 8.834 + R&D 2.965. In cambio: proprieta condivisa degli stampi e royalty del 5%.'),
  ('Emissione PO: anticipo 50% sull ordine',
   1350.00, null::date, 'senza_data',
   'Su un valore ordine di 2.700 USD per 50 unita da 8mm. Data da definire.'),
  ('Consegna a Shanghai + 30 giorni: saldo 50%',
   1350.00, null::date, 'senza_data',
   'Merce in nostro possesso e validata dal controllo qualita. Data da definire.'),
  ('Raggiungimento 300 unita: storno fee R&D',
   -2965.00, null::date, 'senza_data',
   'Credito, non esborso: rientro dell investimento R&D iniziale. Condizionato al volume.')
) as v(descr, importo, data, fonte, nota);

with k as (select id from public.suppliers where name = 'Kai Cheng')
insert into public.uscite_previste
  (supplier_id, corsia, commessa_etichetta, riferimento, descrizione,
   importo, valuta, cambio, data_prevista, data_prevista_fonte, stato, note)
select k.id, 'installazione', v.commessa, 'Installazioni Fendi', v.descr,
       v.importo, 'CNY', 0.129000, v.data, 'contratto', 'prevista', v.nota
from k, (values
  ('Fendi Energy 2024', 'Anticipo 30%',
   45324.00, date '2025-03-25',
   'Data gia passata: stato del pagamento da confermare. Base implicita 151.080 RMB.'),
  ('Fendi Energy 2025', 'Raggiungimento meta installazioni 30%',
   34513.05, date '2026-09-30',
   'Base implicita 115.043 RMB: lotto diverso dal 2024.'),
  ('Fendi Energy 2026', 'Saldo a conclusione installazioni 40%',
   53224.70, date '2026-10-20',
   'Base implicita 133.062 RMB: lotto diverso dai due precedenti.')
) as v(commessa, descr, importo, data, nota);

-- ═══════════════════════════════════════════════════════════════════════════
-- Le otto fatture Centrica dell'energia.
--
-- Corrispondono una a una ai PO gia' in ops_purchase_orders: gli importi in
-- euro che ci sono la' dentro sono esattamente questi dollari al cambio dello
-- 0,8535-0,8538. Non e' una somiglianza, e' la stessa cifra — per questo i
-- cambi sono quelli di ogni singola fattura e non una media. (Quelli scritti
-- qui sotto a mano sbagliavano di qualche centesimo: corretti subito dopo in
-- 20260922062808_cambi_centrica_esatti.)
--
--   EI258000034 → PO-1B    EI258000035 → PO-1A
--   EI258000166 → PO-2A    EI258000168 → PO-2B
--   EI258000052 → PO-3     EI258000069 → PO-4
--   EI258000095 → PO-5     EI258000143 → PO-6
--
-- Nessuna e' attribuita a una commessa, e non e' una dimenticanza: ogni PO
-- serve piu' commesse e una fetta di siti che non sta in nessuna. PO-2B e'
-- Fendi all'84%, PO-1A e' fuori commessa per meta'. Attribuirne una intera a
-- una commessa sola sarebbe un numero comodo e falso.
-- ═══════════════════════════════════════════════════════════════════════════

-- Una riga puo' essere cassa vera oppure una ripartizione che si vede e non si
-- somma. Finora lo dicevamo solo del lato attivo.
alter table public.uscite_previste
  add column if not exists natura text not null default 'cassa';

alter table public.uscite_previste drop constraint if exists uscite_natura_ammessa;
alter table public.uscite_previste
  add constraint uscite_natura_ammessa check (natura in ('cassa', 'quota'));

comment on column public.uscite_previste.natura is
  'cassa = soldi che escono davvero. quota = quanto di quella spesa compete a questa commessa: si mostra, non si somma, altrimenti si conta due volte.';

insert into public.suppliers (name, default_currency, default_terms_days, notes)
select 'Centrica', 'USD', 30, 'Hardware energia. Net 30 days: scadenza a fine mese piu 30 giorni.'
where not exists (select 1 from public.suppliers where name = 'Centrica');

update public.suppliers
   set default_currency = 'USD',
       notes = 'Hardware energia. Net 30 days: scadenza a fine mese piu 30 giorni. Le fatture 2025 sono tutte saldate.'
 where name = 'Centrica';

with f(riferimento, po_fgb, emissione, scadenza, usd, cambio, ordine) as (values
  ('EI258000034', 'PO-1B', date '2025-03-19', date '2025-04-30', 12158.80, 0.853505, 'Your Order: 1'),
  ('EI258000035', 'PO-1A', date '2025-03-19', date '2025-04-30', 11264.40, 0.853505, 'Your Order: 1'),
  ('EI258000166', 'PO-2A', date '2025-08-27', date '2025-09-30', 22055.10, 0.853597, null),
  ('EI258000168', 'PO-2B', date '2025-08-27', date '2025-09-30', 18774.00, 0.853782, null),
  ('EI258000052', 'PO-3',  date '2025-03-31', date '2025-04-30',  4779.30, 0.853700, 'Ordine 3 e 4 · 03.2025 HW'),
  ('EI258000069', 'PO-4',  date '2025-04-27', date '2025-05-31',   351.00, 0.853504, 'Your Order: 5'),
  ('EI258000095', 'PO-5',  date '2025-06-03', date '2025-07-31', 12925.50, 0.853798, 'PPO2545806747 · Order 5'),
  ('EI258000143', 'PO-6',  date '2025-07-29', date '2025-08-31', 21308.70, 0.853847, 'PP02545863426 · PO#6')
)
insert into public.uscite_previste
  (supplier_id, corsia, natura, commessa_etichetta, riferimento, descrizione,
   importo, valuta, cambio, data_ordine,
   data_evento, data_evento_fonte,
   data_prevista, data_prevista_fonte, evento_innesco, giorni_da_evento,
   stato, note)
select
  (select id from public.suppliers where name = 'Centrica'),
  'merce', 'cassa',
  'Centrica ' || f.po_fgb,
  f.riferimento,
  'Fattura ' || f.riferimento || ' · ' || f.po_fgb,
  f.usd, 'USD', f.cambio,
  f.emissione,
  f.emissione, 'reale',
  f.scadenza, 'contratto', 'ordine', (f.scadenza - f.emissione),
  'pagata',
  'Net 30 days, fine mese piu 30 giorni. '
    || coalesce('Riferimento cliente: ' || f.ordine || '. ', '')
    || 'Serve piu commesse: non attribuita a una sola.'
from f
where not exists (
  select 1 from public.uscite_previste u where u.riferimento = f.riferimento
);

-- Il costo per commessa resta, ma smette di essere cassa: quella la fanno le
-- fatture qui sopra. Sommare tutti e due vorrebbe dire pagare due volte lo
-- stesso hardware.
update public.uscite_previste
   set natura = 'quota',
       note = 'Quanto di quell hardware compete a questa commessa, dalla colonna Pkg del Monitor Energia. Si vede, non si somma: la cassa la fanno le fatture Centrica.'
 where descrizione = 'Acquisto materiali';

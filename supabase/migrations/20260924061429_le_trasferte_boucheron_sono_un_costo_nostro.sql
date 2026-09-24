-- ═══════════════════════════════════════════════════════════════════════════
-- Le trasferte Boucheron sono un costo nostro
--
-- I 4.690 di «installation cost» non sono la fattura di un installatore:
-- Vendome, Cannes e Monaco le abbiamo installate noi, e quella cifra sono
-- viaggi. Vendome 3.890 (gennaio 2025), Cannes 400 e Monaco 400 (la stessa
-- trasferta del 09/09/2026, due boutique in un viaggio), Geneva zero perche'
-- non e' ancora installata.
--
-- Il modello delle uscite pretende un fornitore: supplier_id e' obbligatorio
-- e la vista fa join stretto. Per un costo interno non c'e' un terzo a cui
-- intestarlo, e mettercene uno finto — «FoSensor», «varie» — significa che
-- prima o poi qualcuno cerchera' la fattura che non esiste. Quindi il
-- fornitore esiste ma dice cosa e': «FGB studio · trasferte e cantiere».
-- Nessuna fattura passiva da abbinare, nessun pay-when-paid: sono spese
-- sostenute, non un impegno verso qualcuno.
--
-- Corsia «installazione», che la vista mostra come Installatori: e' la riga
-- Installatore del planning, che infatti porta 3.890 prima del periodo e 800
-- in settimana 37.
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.suppliers (name, default_currency, default_terms_days, notes)
select 'FGB studio · trasferte e cantiere', 'EUR', 0,
       'Non e un fornitore: e la controparte convenzionale dei costi sostenuti da noi '
    || '(viaggi, trasferte di installazione). Non aspettarti fatture passive su questo nome.'
 where not exists (
   select 1 from public.suppliers where name = 'FGB studio · trasferte e cantiere'
 );

insert into public.uscite_previste
  (supplier_id, corsia, commessa_id, certification_id, riferimento, descrizione,
   importo, valuta, cambio,
   data_prevista, data_prevista_fonte, data_effettiva, stato, natura,
   data_evento, data_evento_fonte, note)
select (select id from public.suppliers where name = 'FGB studio · trasferte e cantiere'),
       'installazione',
       (select id from public.commesse where nome = 'Boucheron Energy 2025'),
       c.id,
       'Trasferte Boucheron',
       d.descrizione,
       d.importo, 'EUR', 1,
       d.quando, 'reale', d.quando, 'pagata', 'cassa',
       d.quando, 'reale',
       'Costo sostenuto da noi, non ordine a fornitore.'
  from (values
         ('Vendome, Place Vendome', 'Trasferta installazione Vendome',      3890.00, date '2025-01-12'),
         ('Cannes, La Croisette',   'Trasferta installazione Cannes',        400.00, date '2026-09-09'),
         ('Monaco One',             'Trasferta installazione Monaco',        400.00, date '2026-09-09')
       ) as d(progetto, descrizione, importo, quando)
  join public.certifications c on c.name = d.progetto and c.cert_type = 'Energy'
 where not exists (
   select 1 from public.uscite_previste u
    where u.certification_id = c.id and u.riferimento = 'Trasferte Boucheron'
 );

-- ═══════════════════════════════════════════════════════════════════════════
-- Previsto e avvenuto: la catena a tre anelli.
--
-- Un movimento non ha una data, ne ha tre: l'evento operativo che lo fa
-- maturare, l'emissione del documento, la cassa. Finora se ne teneva una sola
-- e si sceglieva di volta in volta quale, col risultato che quindici incassi
-- stavano in griglia trentun giorni troppo presto.
--
-- Ogni anello si deduce dal precedente finche' non accade davvero. Quando
-- accade si fissa, e tutti quelli a valle si ricalcolano da li'.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.commesse
  add column if not exists termini_giorni integer not null default 31;

comment on column public.commesse.termini_giorni is
  'Giorni fra emissione fattura e incasso atteso. 31 e contrattuale con Fendi e Boucheron, verificato su 22 date del foglio del 21/09/2026. Per le altre commesse e un default, non un fatto.';

update public.commesse set termini_giorni = 31
 where nome in ('Fendi Energy 2024', 'Boucheron Energy 2025');

alter table public.cert_payment_milestones
  add column if not exists data_evento date,
  add column if not exists data_evento_fonte text;

comment on column public.cert_payment_milestones.data_evento is
  'Quando accade il fatto che fa maturare la tranche: ordine emesso, installazione, primo dato. Non e la data di cassa.';
comment on column public.cert_payment_milestones.data_evento_fonte is
  'Da dove viene la data evento. Decide se l anello si disegna pieno o tratteggiato.';

-- Il vocabolario cambia: le fonti vecchie parlavano di eventi mentre la
-- colonna adesso vuole dire cassa. Si azzerano, e il ricalcolo subito dopo le
-- riscrive tutte — lasciarle sarebbe tenersi dei valori che mentono.
alter table public.cert_payment_milestones drop constraint if exists tranche_fonte_data_ammesse;
update public.cert_payment_milestones
   set data_prevista = null, data_prevista_fonte = null;

alter table public.cert_payment_milestones
  add constraint tranche_fonte_data_ammesse check (
    data_prevista_fonte is null or data_prevista_fonte in (
      'incasso',
      'scadenza_fattura',
      'pagamento_previsto',
      'fattura_emessa',
      'da_evento',
      'da_evento_stimato',
      'telemetria_scartata',
      'senza_data'
    )
  );

alter table public.cert_payment_milestones drop constraint if exists tranche_fonte_evento_ammesse;
alter table public.cert_payment_milestones
  add constraint tranche_fonte_evento_ammesse check (
    data_evento_fonte is null or data_evento_fonte in (
      'milestone_chiusa',
      'ordine_hardware',
      'installazione',
      'primo_dato',
      'telemetria_scartata',
      'stima',
      'senza_data'
    )
  );

alter table public.uscite_previste
  add column if not exists evento_innesco text,
  add column if not exists giorni_da_evento integer;

comment on column public.uscite_previste.evento_innesco is
  'L evento da cui si contano i giorni: ordine, fine_produzione, spedizione, ricezione, installazione. Finora stava scritto nelle note, in italiano.';
comment on column public.uscite_previste.giorni_da_evento is
  'Quanti giorni dopo l innesco. Es. 45 per il 30% a 45 giorni dalla ricezione.';

update public.uscite_previste set evento_innesco = 'ordine', giorni_da_evento = 0
 where descrizione ilike '%deposito%' or descrizione ilike '%anticipo%' or descrizione ilike '%all ordine%';
update public.uscite_previste set evento_innesco = 'spedizione', giorni_da_evento = 0
 where descrizione ilike '%prima della spedizione%';
update public.uscite_previste set evento_innesco = 'ricezione', giorni_da_evento = 45
 where descrizione ilike '%45 giorni%';
update public.uscite_previste set evento_innesco = 'ricezione', giorni_da_evento = 30
 where descrizione ilike '%30 giorni%' and descrizione not ilike '%45 giorni%';

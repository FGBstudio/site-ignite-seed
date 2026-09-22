-- Le uscite non avevano un progetto: prima non poteva esserci, ora le quote
-- FoSensor lo hanno. Senza questo la ripartizione per progetto non arriva
-- alla WBS.
drop view if exists public.v_cash_events;

create view public.v_cash_events as

select
  t.id,
  'entrata'::text                                  as verso,
  'cliente'::text                                  as corsia,
  'Ciclo attivo'::text                             as gruppo,
  t.data_prevista                                  as data,
  date_trunc('week', t.data_prevista)::date        as settimana,
  t.data_evento                                    as data_evento,
  t.invoice_sent_date                              as data_documento,
  t.amount                                         as importo_eur,
  case t.data_prevista_fonte
    when 'incasso'            then 'reale'
    when 'scadenza_fattura'   then 'contrattuale'
    when 'pagamento_previsto' then 'contrattuale'
    when 'fattura_emessa'     then 'contrattuale'
    when 'da_evento'          then 'prevista'
    when 'da_evento_stimato'  then 'stimata'
  end                                              as certezza,
  t.data_prevista_fonte                            as fonte,
  t.data_evento_fonte                              as fonte_evento,
  'cassa'::text                                    as natura,
  coalesce(k.categoria, 'Non attribuite')          as categoria,
  k.id                                             as commessa_id,
  coalesce(k.nome, c.name)                         as commessa,
  c.id                                             as certification_id,
  c.name                                           as progetto,
  b.name                                           as brand,
  si.city                                          as citta,
  t.name                                           as etichetta,
  t.tranche_state                                  as stato,
  t.tranche_order                                  as ordine_tranche,
  'tranche'::text                                  as origine
from public.cert_payment_milestones t
join public.certifications c on c.id = t.certification_id
left join public.sites  si on si.id = c.site_id
left join public.brands b  on b.id = si.brand_id
left join public.commessa_progetti cp on cp.certification_id = c.id
left join public.commesse k on k.id = cp.commessa_id

union all

select
  u.id,
  'uscita'::text,
  case u.corsia when 'installazione' then 'installatore' else 'fornitore' end,
  case u.corsia
    when 'installazione' then 'Installatori'
    when 'servizi'       then 'Servizi'
    else 'Acquisto materiali'
  end,
  u.data_prevista,
  date_trunc('week', u.data_prevista)::date,
  u.data_evento,
  null::date,
  -u.importo_eur,
  case
    when u.stato = 'pagata' then 'reale'
    when u.data_prevista_fonte = 'contratto' then 'contrattuale'
    when u.data_prevista_fonte = 'evento'    then 'prevista'
    when u.data_prevista_fonte = 'stima'     then 'stimata'
  end,
  u.data_prevista_fonte,
  u.evento_innesco,
  u.natura,
  coalesce(k.categoria, 'Non attribuite'),
  u.commessa_id,
  coalesce(k.nome, uc.name, 'Non attribuite · ' || coalesce(u.commessa_etichetta, 'varie')),
  u.certification_id,
  uc.name,
  coalesce(ub.name, s.name),
  usi.city,
  s.name || ' · ' || u.descrizione,
  u.stato,
  null::integer,
  'uscita'::text
from public.uscite_previste u
join public.suppliers s on s.id = u.supplier_id
left join public.commesse k on k.id = u.commessa_id
left join public.certifications uc on uc.id = u.certification_id
left join public.sites  usi on usi.id = uc.site_id
left join public.brands ub  on ub.id = usi.brand_id;

comment on view public.v_cash_events is
  'Ogni movimento, entrate e uscite, nella stessa forma. Porta tre date — evento, documento, cassa — la natura (solo cassa entra nelle somme) e, dove si sa, il progetto a cui compete.';

grant select on public.v_cash_events to authenticated;

-- v_cash_events ora aggancia la commessa vera invece di dedurla dal brand.
-- Le uscite che servono piu commesse restano senza: il totale settimanale
-- resta esatto, e nel breakdown compaiono sotto «Non attribuite».
-- Le colonne cambiano, quindi la vista si rifa da zero invece di sostituirla.
drop view if exists public.v_cash_events;

create view public.v_cash_events as

select
  t.id,
  'entrata'::text                                  as verso,
  'cliente'::text                                  as corsia,
  t.data_prevista                                  as data,
  date_trunc('week', t.data_prevista)::date        as settimana,
  t.amount                                         as importo_eur,
  case t.data_prevista_fonte
    when 'incasso'            then 'reale'
    when 'scadenza_fattura'   then 'contrattuale'
    when 'pagamento_previsto' then 'contrattuale'
    when 'evento_effettivo'   then 'prevista'
    when 'ordine_hardware'    then 'prevista'
    when 'primo_dato'         then 'prevista'
    when 'evento_previsto'    then 'stimata'
  end                                              as certezza,
  t.data_prevista_fonte                            as fonte,
  'cassa'::text                                    as natura,
  k.id                                             as commessa_id,
  coalesce(k.nome, c.name)                         as commessa,
  c.id                                             as certification_id,
  c.name                                           as progetto,
  b.name                                           as brand,
  si.city                                          as citta,
  t.name                                           as etichetta,
  t.tranche_state                                  as stato,
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
  u.data_prevista,
  date_trunc('week', u.data_prevista)::date,
  -u.importo_eur,
  case u.data_prevista_fonte
    when 'contratto' then 'contrattuale'
    when 'evento'    then 'prevista'
    when 'stima'     then 'stimata'
  end,
  u.data_prevista_fonte,
  'cassa'::text,
  u.commessa_id,
  coalesce(k.nome, 'Non attribuite · ' || coalesce(u.commessa_etichetta, 'varie')),
  null::uuid,
  null::text,
  s.name,
  null::text,
  s.name || ' · ' || u.descrizione,
  u.stato,
  'uscita'::text
from public.uscite_previste u
join public.suppliers s on s.id = u.supplier_id
left join public.commesse k on k.id = u.commessa_id;

comment on view public.v_cash_events is
  'Ogni movimento di cassa, entrate e uscite, nella stessa forma. La riga senza data non sparisce: finisce nella colonna in fondo alla griglia, che e anche la lista di cosa manca.';

grant select on public.v_cash_events to authenticated;

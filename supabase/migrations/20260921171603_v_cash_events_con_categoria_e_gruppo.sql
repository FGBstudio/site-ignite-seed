-- La vista porta ora anche la macro-categoria e il gruppo dentro la commessa.
-- Sono due cose che la griglia userebbe comunque per raggruppare: calcolarle
-- qui una volta e' meglio che rifarle in TypeScript a ogni render.
drop view if exists public.v_cash_events;

create view public.v_cash_events as

select
  t.id,
  'entrata'::text                                  as verso,
  'cliente'::text                                  as corsia,
  'Ciclo attivo'::text                             as gruppo,
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
  -u.importo_eur,
  case u.data_prevista_fonte
    when 'contratto' then 'contrattuale'
    when 'evento'    then 'prevista'
    when 'stima'     then 'stimata'
  end,
  u.data_prevista_fonte,
  'cassa'::text,
  coalesce(k.categoria, 'Non attribuite'),
  u.commessa_id,
  coalesce(k.nome, 'Non attribuite · ' || coalesce(u.commessa_etichetta, 'varie')),
  null::uuid,
  null::text,
  s.name,
  null::text,
  s.name || ' · ' || u.descrizione,
  u.stato,
  null::integer,
  'uscita'::text
from public.uscite_previste u
join public.suppliers s on s.id = u.supplier_id
left join public.commesse k on k.id = u.commessa_id;

comment on view public.v_cash_events is
  'Ogni movimento di cassa, entrate e uscite, nella stessa forma. La riga senza data non sparisce: finisce nella colonna in fondo alla griglia, che e anche la lista di cosa manca.';

grant select on public.v_cash_events to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- v_progetti_tempi · quanto dura un progetto
--
-- Non e cassa: e la striscia di tempo che il progetto occupa, dall'acquisto
-- dei materiali all'installazione fino all'ultimo incasso. Serve a rispondere
-- a «quanto ci mettiamo a rientrare», che e una domanda diversa da «quando
-- esce un euro» e merita una riga sua.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace view public.v_progetti_tempi as
select
  c.id                              as certification_id,
  cp.commessa_id,
  c.name                            as progetto,
  si.city                           as citta,
  mat.data_materiali,
  coalesce(e.installation_date, a.handover_date)  as data_installazione,
  pag.primo_incasso,
  pag.ultimo_incasso,
  pag.tranche_totali,
  pag.tranche_incassate
from public.certifications c
join public.commessa_progetti cp on cp.certification_id = c.id
left join public.sites si on si.id = c.site_id
left join public.site_energy_records e on e.certification_id = c.id
left join public.site_air_records a on a.certification_id = c.id
left join lateral (
  select min(po.po_issued_date) as data_materiali
    from public.hardwares h
    join public.ops_purchase_orders po on po.id = h.purchase_order_id
   where h.site_id = c.site_id and po.po_issued_date is not null
) mat on true
left join lateral (
  select min(m.data_prevista) as primo_incasso,
         max(m.data_prevista) as ultimo_incasso,
         count(*)             as tranche_totali,
         count(m.payment_received_date) as tranche_incassate
    from public.cert_payment_milestones m
   where m.certification_id = c.id
) pag on true;

comment on view public.v_progetti_tempi is
  'La durata di un progetto: materiali, installazione, incassi. Alimenta la barra sulla riga di progetto, non i totali di cassa.';

grant select on public.v_progetti_tempi to authenticated;

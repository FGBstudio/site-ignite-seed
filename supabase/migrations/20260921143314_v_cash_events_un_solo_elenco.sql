-- ═══════════════════════════════════════════════════════════════════════════
-- v_cash_events · l'elenco unico che la griglia legge.
--
-- Due alimentatori distinti, una forma sola. La griglia non deve sapere che
-- un incasso vive in cert_payment_milestones e un'uscita in uscite_previste:
-- deve sapere che in settimana X entrano o escono N euro, con che grado di
-- certezza, e sotto quale commessa.
--
-- L'etichetta di commessa e' ancora testo, e lato entrate si deduce dal brand:
-- finche' la tabella commesse non esiste, e' l'unico aggancio onesto fra i due
-- lati. Si sostituisce con una chiave vera alla fase 2.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.v_cash_events as

-- ── Entrate: le tranche cliente ────────────────────────────────────────────
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
  case b.name
    when 'FENDI'     then 'Fendi Energy 2024'
    when 'BOUCHERON' then 'Boucheron Energy 2025'
    else c.name
  end                                              as commessa_etichetta,
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

union all

-- ── Uscite: le rate fornitore ──────────────────────────────────────────────
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
  u.commessa_etichetta,
  null::uuid,
  null::text,
  s.name,
  null::text,
  s.name || ' · ' || u.descrizione,
  u.stato,
  'uscita'::text
from public.uscite_previste u
join public.suppliers s on s.id = u.supplier_id;

comment on view public.v_cash_events is
  'Ogni movimento di cassa, entrate e uscite, nella stessa forma. La riga senza data non sparisce: finisce nella colonna in fondo alla griglia, che e anche la lista di cosa manca.';

grant select on public.v_cash_events to authenticated;

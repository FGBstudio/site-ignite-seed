-- ═══════════════════════════════════════════════════════════════════════════
-- Fase 7 · Azione B — Il previsionale nasce dall'ordine, non dalla mano
--
-- Finora ogni uscita era scritta a mano. Da qui in avanti le condizioni
-- negoziate sull'ordine generano le righe di cassa: una riga «quota» per
-- rata (la futura fattura del fornitore) e una riga «cassa» per ciascun
-- progetto servito. Tratteggiate, perche' non e' ancora successo niente.
--
-- E il mantra: pay when paid. Se una rata al fornitore cade prima
-- dell'incasso che la finanzia, il sistema lo dice.
--
-- NOTA · fn_genera_uscite_da_po e' stata poi corretta due volte:
--   20260923062025 (rate non ripartibili) e 20260923062523 (nomi ambigui
--   nei parametri di ritorno). La versione valida e' quella.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 0 · Due appigli mancanti ───────────────────────────────────────────────
-- La data dell'ordine e' un fatto diverso dalla data del documento: su PO-1
-- l'ordine e' del 28/08/2024 e la prima fattura del 21/10. La catena degli
-- eventi conta dall'ordine.
alter table public.ops_purchase_orders
  add column if not exists data_ordine date;

alter table public.uscite_previste
  add column if not exists po_allocazione_id uuid references public.po_allocazioni(id) on delete set null;

comment on column public.ops_purchase_orders.data_ordine is
  'Data in cui l''ordine e'' partito. Origine della catena ordine -> produzione -> spedizione -> ricezione.';

-- ── 1 · Da condizioni e allocazioni alle righe di cassa ────────────────────
create or replace function public.fn_genera_uscite_da_po(p_po uuid)
returns table(righe integer, importo numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_po      record;
  v_costo   numeric;
  v_n       integer := 0;
  v_tot     numeric := 0;
  v_alloc   integer;
begin
  select * into v_po from public.ops_purchase_orders where id = p_po;
  if v_po.id is null then
    raise exception 'Ordine % inesistente', p_po;
  end if;
  if v_po.supplier_id is null then
    raise exception 'L''ordine % non ha un fornitore: la riga di cassa non saprebbe a chi va', coalesce(v_po.po_number, p_po::text);
  end if;

  v_costo := coalesce(v_po.po_cost, 0);
  select count(*) into v_alloc from public.po_allocazioni where po_id = p_po;

  -- Si rigenera solo cio' che e' ancora previsione. Una rata gia' pagata, o
  -- gia' agganciata a una fattura ricevuta, e' un fatto: non si riscrive.
  delete from public.uscite_previste u
   where u.po_id = p_po
     and u.stato = 'prevista'
     and u.passive_invoice_id is null;

  with cond as (
    select c.id, c.ordine, c.nome, c.evento, c.giorni,
           coalesce(c.importo, round(v_costo * c.pct / 100.0, 2)) as importo
      from public.po_condizioni c
     where c.po_id = p_po
       -- salta le rate le cui righe sono sopravvissute alla delete: sono storia
       and not exists (
         select 1 from public.uscite_previste u
          where u.po_condizione_id = c.id
       )
  ),
  alloc as (
    select a.id, a.certification_id, a.etichetta,
           coalesce(a.pct / 100.0,
                    case when v_costo <> 0 then a.importo / v_costo end, 0) as fetta
      from public.po_allocazioni a
     where a.po_id = p_po
  ),
  -- La riga «quota»: la rata come la vedra' il fornitore, fuori dalle somme.
  intestazioni as (
    select c.id as cond_id, null::uuid as all_id, null::uuid as cert,
           null::text as etichetta, c.importo as imp,
           'quota'::text as natura, c.ordine, c.nome, c.evento, c.giorni
      from cond c
     where v_alloc > 0
  ),
  -- Le righe «cassa»: una per progetto servito. Se nessuno ha ripartito
  -- l'ordine, la rata pesa intera sulla testata.
  ripartite as (
    select c.id as cond_id, a.id as all_id, a.certification_id as cert,
           a.etichetta,
           round(c.importo * a.fetta, 2)
             + case when row_number() over (partition by c.id order by a.fetta desc, a.id) = 1
                    then c.importo - sum(round(c.importo * a.fetta, 2)) over (partition by c.id)
                    else 0 end as imp,
           'cassa'::text as natura, c.ordine, c.nome, c.evento, c.giorni
      from cond c join alloc a on true
    union all
    select c.id, null, v_po.certification_id, null, c.importo,
           'cassa', c.ordine, c.nome, c.evento, c.giorni
      from cond c
     where v_alloc = 0
  ),
  tutte as (
    select * from intestazioni union all select * from ripartite
  ),
  scritte as (
    insert into public.uscite_previste (
      supplier_id, corsia, commessa_id, certification_id, commessa_etichetta,
      riferimento, descrizione, importo, valuta, cambio, natura, stato,
      data_ordine, lead_time_giorni, evento_innesco, giorni_da_evento,
      data_prevista_fonte, po_id, po_condizione_id, po_allocazione_id, note
    )
    select
      v_po.supplier_id,
      coalesce(v_po.corsia, 'merce'),
      v_po.commessa_id,
      t.cert,
      coalesce(t.etichetta,
               case when t.natura = 'quota'
                    then coalesce(v_po.po_number, 'Ordine') || ' · rata ' || t.ordine end),
      coalesce(v_po.po_number, 'Ordine') || ' · rata ' || t.ordine,
      case when t.natura = 'quota' then 'Rata ' else 'Quota ' end || t.nome,
      t.imp,
      coalesce(v_po.currency, 'EUR'),
      coalesce(v_po.cambio, 1),
      t.natura,
      'prevista',
      coalesce(v_po.data_ordine, v_po.po_issued_date),
      v_po.lead_time_giorni,
      t.evento,
      t.giorni,
      'evento',
      p_po, t.cond_id, t.all_id,
      'Generata dalle condizioni di ' || coalesce(v_po.po_number, 'ordine')
    from tutte t
    where t.imp is not null and t.imp <> 0
    returning id, importo, natura
  )
  select count(*)::integer, coalesce(sum(case when natura = 'cassa' then importo end), 0)
    into v_n, v_tot
    from scritte;

  -- Un solo punto di calcolo: le date le mette la funzione che le mette a tutti.
  perform public.fn_ricalcola_date_uscite(false);

  return query select v_n, v_tot;
end;
$$;

comment on function public.fn_genera_uscite_da_po(uuid) is
  'Azione B: dalle condizioni negoziate dell''ordine alle uscite previste, tratteggiate. Non tocca cio'' che e'' gia'' pagato o fatturato.';

-- ── 2 · Pay when paid ──────────────────────────────────────────────────────
-- Due domande diverse, una funzione sola.
--   · la rata al fornitore cade prima del primo incasso della commessa?
--   · a quella data la commessa ha gia' incassato abbastanza da pagarla?
create or replace function public.fn_verifica_pay_when_paid(p_po uuid)
returns table(
  uscita_id     uuid,
  descrizione   text,
  data_uscita   date,
  importo_eur   numeric,
  primo_incasso date,
  incassato_a_quella_data numeric,
  uscito_a_quella_data    numeric,
  saldo         numeric,
  esito         text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_commessa uuid;
begin
  select coalesce(u.commessa_id, po.commessa_id) into v_commessa
    from public.ops_purchase_orders po
    left join public.uscite_previste u on u.po_id = po.id and u.commessa_id is not null
   where po.id = p_po
   limit 1;

  if v_commessa is null then
    return;  -- ordine senza commessa: non c'e' un incasso con cui confrontarlo
  end if;

  return query
  with incassi as (
    select e.data, e.importo_eur
      from public.v_cash_events e
     where e.commessa_id = v_commessa and e.natura = 'cassa'
       and e.importo_eur > 0 and e.data is not null
  ),
  uscite as (
    select e.data, e.importo_eur
      from public.v_cash_events e
     where e.commessa_id = v_commessa and e.natura = 'cassa'
       and e.importo_eur < 0 and e.data is not null
  ),
  primo as (select min(data) as d from incassi),
  rate as (
    select u.id, u.descrizione, u.data_prevista, u.importo_eur
      from public.uscite_previste u
     where u.po_id = p_po and u.natura = 'cassa' and u.data_prevista is not null
  )
  select
    r.id,
    r.descrizione,
    r.data_prevista,
    r.importo_eur,
    p.d,
    coalesce((select sum(i.importo_eur) from incassi i where i.data <= r.data_prevista), 0),
    coalesce((select -sum(o.importo_eur) from uscite o where o.data <= r.data_prevista), 0),
    coalesce((select sum(i.importo_eur) from incassi i where i.data <= r.data_prevista), 0)
      - coalesce((select -sum(o.importo_eur) from uscite o where o.data <= r.data_prevista), 0),
    case
      when p.d is null then 'nessun incasso atteso'
      when r.data_prevista < p.d then 'paghiamo prima di incassare'
      when coalesce((select sum(i.importo_eur) from incassi i where i.data <= r.data_prevista), 0)
         < coalesce((select -sum(o.importo_eur) from uscite o where o.data <= r.data_prevista), 0)
        then 'cassa in rosso a quella data'
      else 'ok'
    end
  from rate r cross join primo p
  order by r.data_prevista;
end;
$$;

comment on function public.fn_verifica_pay_when_paid(uuid) is
  'La regola d''oro: nessuna rata al fornitore prima dell''incasso che la finanzia. Restituisce una riga per rata con l''esito.';

-- ── 3 · L'incongruenza diventa un allarme ──────────────────────────────────
create or replace function public.fn_allarma_pay_when_paid(p_po uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_po     record;
  v_prima  record;
  v_rosso  record;
  v_n      integer := 0;
begin
  select * into v_po from public.ops_purchase_orders where id = p_po;
  if v_po.id is null then return 0; end if;

  select * into v_prima from public.fn_verifica_pay_when_paid(p_po)
   where esito = 'paghiamo prima di incassare' order by data_uscita limit 1;

  select * into v_rosso from public.fn_verifica_pay_when_paid(p_po)
   where esito = 'cassa in rosso a quella data' order by data_uscita limit 1;

  if v_prima.uscita_id is not null then
    perform public.fn_apri_alert(
      'po_pay_when_paid'::task_alert_type,
      'Pay when paid — ' || coalesce(v_po.po_number, 'ordine') || ' paga prima di incassare',
      'La rata «' || coalesce(v_prima.descrizione, '') || '» e'' prevista il '
        || to_char(v_prima.data_uscita, 'DD/MM/YYYY')
        || ', mentre il primo incasso della commessa e'' atteso il '
        || to_char(v_prima.primo_incasso, 'DD/MM/YYYY') || '.',
      'po_pay_when_paid:' || p_po::text,
      v_po.certification_id, null, '/payments/wbs'
    );
    v_n := v_n + 1;
  else
    perform public.fn_chiudi_alert('po_pay_when_paid:' || p_po::text);
  end if;

  if v_rosso.uscita_id is not null then
    perform public.fn_apri_alert(
      'cash_bleed'::task_alert_type,
      'Cassa in rosso — ' || coalesce(v_po.po_number, 'ordine'),
      'Al ' || to_char(v_rosso.data_uscita, 'DD/MM/YYYY')
        || ' la commessa avra'' incassato ' || round(v_rosso.incassato_a_quella_data)
        || ' € a fronte di ' || round(v_rosso.uscito_a_quella_data)
        || ' € di uscite: saldo ' || round(v_rosso.saldo) || ' €.',
      'cash_bleed:' || p_po::text,
      v_po.certification_id, null, '/payments/wbs'
    );
    v_n := v_n + 1;
  else
    perform public.fn_chiudi_alert('cash_bleed:' || p_po::text);
  end if;

  return v_n;
end;
$$;

-- ── 4 · Approvare l'ordine accende i flag ──────────────────────────────────
create or replace function public.trg_po_genera_uscite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stato_richiesta = 'approvata'
     and old.stato_richiesta is distinct from 'approvata' then
    perform public.fn_genera_uscite_da_po(new.id);
    perform public.fn_allarma_pay_when_paid(new.id);
  elsif new.stato_richiesta = 'approvata'
     and (new.data_ordine is distinct from old.data_ordine
       or new.lead_time_giorni is distinct from old.lead_time_giorni
       or new.po_cost is distinct from old.po_cost
       or new.cambio is distinct from old.cambio) then
    perform public.fn_genera_uscite_da_po(new.id);
    perform public.fn_allarma_pay_when_paid(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_po_genera_uscite on public.ops_purchase_orders;
create trigger trg_po_genera_uscite
  after update on public.ops_purchase_orders
  for each row execute function public.trg_po_genera_uscite();

-- Cambiare una condizione o una ripartizione su un ordine gia' approvato
-- rifa' il previsionale: il flag segue la trattativa.
create or replace function public.trg_po_righe_rigenerano()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_po uuid := coalesce(new.po_id, old.po_id);
  v_stato text;
begin
  select stato_richiesta into v_stato from public.ops_purchase_orders where id = v_po;
  if v_stato = 'approvata' then
    perform public.fn_genera_uscite_da_po(v_po);
    perform public.fn_allarma_pay_when_paid(v_po);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_condizioni_rigenerano on public.po_condizioni;
create trigger trg_condizioni_rigenerano
  after insert or update or delete on public.po_condizioni
  for each row execute function public.trg_po_righe_rigenerano();

drop trigger if exists trg_allocazioni_rigenerano on public.po_allocazioni;
create trigger trg_allocazioni_rigenerano
  after insert or update or delete on public.po_allocazioni
  for each row execute function public.trg_po_righe_rigenerano();

-- ═══════════════════════════════════════════════════════════════════════════
-- Fase 7 · Azioni C e D — La fattura del fornitore, e il bonifico
--
-- C · La fattura arriva, si riconosce il fornitore, si abbina all'ordine.
--     L'amministrazione verifica la congruenza e approva: la rata smette di
--     essere una previsione e diventa un debito con una scadenza esatta.
-- D · Si registra il bonifico: la riga diventa un fatto, linea piena, e il
--     saldo della commessa si aggiorna da solo.
--
-- NOTA · fn_approva_fattura_passiva e' stata corretta in 20260923062608:
--   `passive_invoices.due_date` e' generata e non si puo' scrivere.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 0 · Il controvalore in euro non si scrive piu' a mano ──────────────────
-- Le 80 righe esistenti coincidono con importo x cambio al centesimo: qui si
-- fissa la regola, non si cambia un numero.
create or replace function public.trg_uscita_importo_eur()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.importo_eur := round(coalesce(new.importo, 0) * coalesce(new.cambio, 1), 2);
  return new;
end;
$$;

drop trigger if exists trg_uscita_eur on public.uscite_previste;
create trigger trg_uscita_eur
  before insert or update on public.uscite_previste
  for each row execute function public.trg_uscita_importo_eur();

-- ── 1 · La fattura passiva sa da quale ordine viene ────────────────────────
alter table public.passive_invoices
  add column if not exists po_id            uuid references public.ops_purchase_orders(id),
  add column if not exists po_condizione_id uuid references public.po_condizioni(id),
  add column if not exists commessa_id      uuid references public.commesse(id),
  add column if not exists certification_id uuid references public.certifications(id),
  add column if not exists cambio           numeric not null default 1,
  add column if not exists descrizione      text,
  add column if not exists stato_verifica   text not null default 'da_verificare',
  add column if not exists verificata_da    uuid references auth.users(id),
  add column if not exists verificata_il    timestamptz,
  add column if not exists note_verifica    text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'passive_invoices_verifica_ck') then
    alter table public.passive_invoices add constraint passive_invoices_verifica_ck
      check (stato_verifica in ('da_verificare','verificata','contestata'));
  end if;
end $$;

comment on column public.passive_invoices.stato_verifica is
  'Azione C: da_verificare -> verificata (l''amministrazione conferma la congruenza con l''ordine) oppure contestata.';

-- Il PM deve poter vedere le fatture dei propri ordini; approvarle resta
-- dell'amministrazione, e lo garantisce la funzione, non la policy.
drop policy if exists passive_invoices_lettura_pm on public.passive_invoices;
create policy passive_invoices_lettura_pm on public.passive_invoices for select to authenticated
  using (public.get_user_role(auth.uid()) = any (array['ADMIN'::app_role,'PM'::app_role]));

-- ── 2 · Riconoscere l'ordine dalla fattura ─────────────────────────────────
-- Quello che l'OCR non puo' fare: dire a quale rata di quale ordine
-- corrisponde un importo. Si propone, ordinando per vicinanza dell'importo
-- e poi per anzianita' della rata ancora scoperta.
create or replace function public.fn_proponi_po_per_fattura(
  p_supplier uuid,
  p_importo  numeric,
  p_valuta   text default null
)
returns table(
  po_id        uuid,
  po_number    text,
  condizione_id uuid,
  rata         text,
  atteso       numeric,
  valuta       text,
  scarto       numeric,
  gia_coperta  boolean,
  confidenza   text
)
language sql
security definer
set search_path = public
as $$
  with rate as (
    select po.id as po_id, po.po_number, c.id as cond_id, c.ordine, c.nome,
           coalesce(c.importo, round(coalesce(po.po_cost,0) * c.pct / 100.0, 2)) as atteso,
           coalesce(po.currency, 'EUR') as valuta,
           exists (select 1 from public.passive_invoices f
                    where f.po_condizione_id = c.id and f.stato_verifica <> 'contestata') as coperta
      from public.ops_purchase_orders po
      join public.po_condizioni c on c.po_id = po.id
     where po.supplier_id = p_supplier
  )
  select r.po_id, r.po_number, r.cond_id,
         'Rata ' || r.ordine || ' · ' || r.nome,
         r.atteso, r.valuta,
         round(p_importo - r.atteso, 2),
         r.coperta,
         case
           when r.coperta then 'rata gia fatturata'
           when abs(p_importo - r.atteso) < 0.01 then 'importo esatto'
           when r.atteso <> 0 and abs(p_importo - r.atteso) / abs(r.atteso) < 0.02 then 'scarto sotto il 2%'
           else 'solo il fornitore'
         end
    from rate r
   where p_valuta is null or r.valuta = p_valuta
   order by r.coperta, abs(p_importo - r.atteso), r.ordine;
$$;

comment on function public.fn_proponi_po_per_fattura(uuid, numeric, text) is
  'Azione C: proposta di abbinamento fattura -> rata d''ordine, ordinata per vicinanza dell''importo.';

-- ── 3 · Verifica di congruenza ─────────────────────────────────────────────
create or replace function public.fn_verifica_fattura_po(p_invoice uuid)
returns table(controllo text, esito text, dettaglio text)
language plpgsql
security definer
set search_path = public
as $$
declare
  f record;
  c record;
  po record;
  v_atteso numeric;
begin
  select * into f from public.passive_invoices where id = p_invoice;
  if f.id is null then raise exception 'Fattura % inesistente', p_invoice; end if;

  select * into c from public.po_condizioni where id = f.po_condizione_id;
  select * into po from public.ops_purchase_orders where id = coalesce(f.po_id, c.po_id);

  if po.id is null then
    return query select 'ordine', 'assente', 'La fattura non e'' abbinata a nessun ordine.';
    return;
  end if;

  return query select 'ordine', 'ok',
    'Abbinata a ' || coalesce(po.po_number, po.id::text);

  return query select 'fornitore',
    case when po.supplier_id = f.supplier_id then 'ok' else 'discorde' end,
    case when po.supplier_id = f.supplier_id then 'Stesso fornitore dell''ordine.'
         else 'Il fornitore della fattura non e'' quello dell''ordine.' end;

  return query select 'valuta',
    case when coalesce(po.currency,'EUR') = coalesce(f.currency,'EUR') then 'ok' else 'discorde' end,
    coalesce(f.currency,'EUR') || ' sulla fattura, ' || coalesce(po.currency,'EUR') || ' sull''ordine.';

  if c.id is not null then
    v_atteso := coalesce(c.importo, round(coalesce(po.po_cost,0) * c.pct / 100.0, 2));
    return query select 'importo',
      case when abs(coalesce(f.total,0) - v_atteso) < 0.01 then 'ok'
           when v_atteso <> 0 and abs(coalesce(f.total,0) - v_atteso) / abs(v_atteso) < 0.02 then 'tollerato'
           else 'discorde' end,
      'Fattura ' || coalesce(f.total,0) || ' contro ' || v_atteso || ' attesi sulla rata ' || c.ordine || '.';
  else
    return query select 'rata', 'assente', 'Nessuna rata dell''ordine indicata: la scadenza non si puo'' dedurre.';
  end if;

  return query select 'scadenza',
    case when f.due_date is not null then 'ok' else 'assente' end,
    case when f.due_date is not null then 'Scadenza al ' || to_char(f.due_date, 'DD/MM/YYYY') || '.'
         else 'Senza scadenza: si usera'' la data della ricezione piu'' i termini del fornitore.' end;
end;
$$;

-- ── 4 · Approvare la fattura: da previsione a «Da Pagare» ──────────────────
create or replace function public.fn_approva_fattura_passiva(
  p_invoice  uuid,
  p_scadenza date default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  f        record;
  po       record;
  v_scad   date;
  v_termini integer;
  v_n      integer;
begin
  if auth.uid() is not null and not coalesce(public.is_admin(auth.uid()), false) then
    raise exception 'Solo un ADMIN puo approvare una fattura passiva';
  end if;

  select * into f from public.passive_invoices where id = p_invoice;
  if f.id is null then raise exception 'Fattura % inesistente', p_invoice; end if;
  if f.po_condizione_id is null then
    raise exception 'La fattura % non e abbinata a nessuna rata d''ordine', coalesce(f.number, p_invoice::text);
  end if;

  select po.* into po
    from public.ops_purchase_orders po
    join public.po_condizioni c on c.po_id = po.id
   where c.id = f.po_condizione_id;

  select default_terms_days into v_termini from public.suppliers where id = f.supplier_id;

  -- La scadenza: quella scritta sulla fattura, quella imposta a mano, o la
  -- ricezione piu' i termini del fornitore. Mai una data inventata.
  v_scad := coalesce(p_scadenza, f.due_date, f.received_date + coalesce(v_termini, 60));

  update public.passive_invoices
     set stato_verifica = 'verificata',
         verificata_da  = coalesce(verificata_da, auth.uid()),
         verificata_il  = coalesce(verificata_il, now()),
         due_date       = v_scad,
         po_id          = coalesce(po_id, po.id)
   where id = p_invoice;

  -- Le righe di cassa della rata prendono il documento e la sua scadenza.
  -- «contratto» dice al motore delle date di non ricalcolarle piu': ora la
  -- data e' un impegno, non una deduzione.
  update public.uscite_previste u
     set passive_invoice_id = p_invoice,
         riferimento        = coalesce(f.number, u.riferimento),
         data_documento     = coalesce(f.issue_date, f.received_date),
         data_prevista      = v_scad,
         data_prevista_fonte = 'contratto',
         stato              = 'approvata'
   where u.po_condizione_id = f.po_condizione_id
     and u.stato in ('prevista','approvata');

  get diagnostics v_n = row_count;

  if po.id is not null then
    perform public.fn_allarma_pay_when_paid(po.id);
  end if;

  return v_n;
end;
$$;

comment on function public.fn_approva_fattura_passiva(uuid, date) is
  'Azione C: verificata la congruenza, la rata passa da previsione a debito con scadenza esatta. Resta tratteggiata finche'' non e'' pagata.';

-- ── 5 · Il bonifico ────────────────────────────────────────────────────────
create or replace function public.fn_registra_pagamento_passivo(
  p_invoice uuid,
  p_data    date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
  v_po uuid;
begin
  if auth.uid() is not null and not coalesce(public.is_admin(auth.uid()), false) then
    raise exception 'Solo un ADMIN puo registrare un pagamento';
  end if;

  update public.passive_invoices
     set state = 'paid', paid_date = p_data
   where id = p_invoice
  returning po_id into v_po;

  update public.uscite_previste
     set stato = 'pagata',
         data_effettiva = p_data,
         data_prevista = p_data,
         data_prevista_fonte = 'reale'
   where passive_invoice_id = p_invoice
     and stato <> 'annullata';

  get diagnostics v_n = row_count;

  if v_po is not null then
    perform public.fn_allarma_pay_when_paid(v_po);
  end if;

  return v_n;
end;
$$;

comment on function public.fn_registra_pagamento_passivo(uuid, date) is
  'Azione D: registrato il bonifico, la riga diventa un fatto e passa a linea piena.';

-- ── 6 · Il saldo netto della commessa ──────────────────────────────────────
-- Quello che la Fase 7 chiede di aggiornare «in automatico»: non una colonna
-- da tenere allineata, ma una lettura che non puo' essere in ritardo.
create or replace view public.v_saldo_commessa as
select
  k.id as commessa_id,
  k.nome,
  k.categoria,
  sum(e.importo_eur) filter (where e.importo_eur > 0)                          as incassi_attesi,
  sum(e.importo_eur) filter (where e.importo_eur > 0 and e.stato = 'paid')     as incassati,
  -sum(e.importo_eur) filter (where e.importo_eur < 0)                         as uscite_attese,
  -sum(e.importo_eur) filter (where e.importo_eur < 0 and e.stato = 'pagata')  as pagate,
  sum(e.importo_eur)                                                            as saldo_netto,
  sum(e.importo_eur) filter (where e.data <= current_date)                      as saldo_a_oggi
from public.commesse k
left join public.v_cash_events e
       on e.commessa_id = k.id and e.natura = 'cassa'
group by k.id, k.nome, k.categoria;

comment on view public.v_saldo_commessa is
  'Saldo netto di commessa: atteso, incassato, pagato. Legge la cassa, non una colonna da mantenere.';

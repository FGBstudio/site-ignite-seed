-- ═══════════════════════════════════════════════════════════════════════════
-- Fase 7 · Azione A — La Richiesta di Fornitura
--
-- L'ordine a fornitore esiste gia' (12 righe) ma non sa a quale commessa
-- serve, chi lo ha chiesto, ne' a quali condizioni e' stato negoziato. Le
-- uscite di cassa che ne discendono sono scritte a mano, una per una.
--
-- Qui l'ordine diventa la Richiesta di Fornitura: appesa alla commessa,
-- firmata da chi la chiede e da chi la approva, e con le condizioni di
-- pagamento negoziate scritte come righe, non come nota libera. Le uscite
-- restano dove sono: da qui in avanti discenderanno da queste righe.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1 · L'ordine sa a chi serve e chi lo ha chiesto ────────────────────────
alter table public.ops_purchase_orders
  add column if not exists supplier_id      uuid references public.suppliers(id),
  add column if not exists commessa_id      uuid references public.commesse(id),
  add column if not exists certification_id uuid references public.certifications(id),
  add column if not exists corsia           text not null default 'merce',
  add column if not exists descrizione      text,
  add column if not exists consegna_prevista date,
  add column if not exists lead_time_giorni integer,
  add column if not exists stato_richiesta  text not null default 'bozza',
  add column if not exists richiesta_da     uuid references auth.users(id),
  add column if not exists richiesta_il     timestamptz,
  add column if not exists approvata_da     uuid references auth.users(id),
  add column if not exists approvata_il     timestamptz,
  add column if not exists preventivo_path  text,
  add column if not exists cambio           numeric not null default 1,
  add column if not exists note_condizioni  text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ops_po_corsia_ck') then
    alter table public.ops_purchase_orders add constraint ops_po_corsia_ck
      check (corsia in ('merce','installazione','servizi'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ops_po_stato_richiesta_ck') then
    alter table public.ops_purchase_orders add constraint ops_po_stato_richiesta_ck
      check (stato_richiesta in ('bozza','inviata','approvata','rifiutata'));
  end if;
end $$;

-- Il controvalore in euro non si scrive a mano: e' il costo per il cambio.
alter table public.ops_purchase_orders
  drop column if exists importo_eur;
alter table public.ops_purchase_orders
  add column importo_eur numeric
  generated always as (round(coalesce(po_cost,0) * coalesce(cambio,1), 2)) stored;

comment on column public.ops_purchase_orders.corsia is
  'Corsia di cassa della spesa: merce, installazione o servizi. Segue il vocabolario di uscite_previste.';
comment on column public.ops_purchase_orders.stato_richiesta is
  'Ciclo della richiesta: bozza -> inviata -> approvata (o rifiutata). Distinto da status, che e'' la logistica.';
comment on column public.ops_purchase_orders.consegna_prevista is
  'Consegna attesa dal PM. Se assente si deduce da po_issued_date + lead_time_giorni.';

-- ── 2 · Le condizioni di pagamento negoziate ───────────────────────────────
-- Una riga per rata: «30% all'ordine», «40% prima della spedizione»,
-- «30% a 45 giorni dalla ricezione». L'evento e i giorni sono gli stessi
-- che fn_ricalcola_date_uscite sa gia' leggere, cosi' la catena e' una sola.
create table if not exists public.po_condizioni (
  id          uuid primary key default gen_random_uuid(),
  po_id       uuid not null references public.ops_purchase_orders(id) on delete cascade,
  ordine      integer not null,
  nome        text not null,
  pct         numeric,
  importo     numeric,
  evento      text not null default 'ordine',
  giorni      integer not null default 0,
  note        text,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id),
  constraint po_condizioni_ordine_uq unique (po_id, ordine),
  constraint po_condizioni_evento_ck check (
    evento in ('ordine','fine_produzione','spedizione','ricezione','installazione','collaudo','manuale')),
  constraint po_condizioni_quanto_ck check (pct is not null or importo is not null),
  constraint po_condizioni_pct_ck check (pct is null or (pct > 0 and pct <= 100))
);

comment on table public.po_condizioni is
  'Condizioni di pagamento negoziate con il fornitore, una riga per rata. Sorgente dei flag Outflow previsionali.';

-- ── 3 · A quali progetti va imputato l'ordine ──────────────────────────────
-- Un ordine serve spesso piu' progetti (FoSensor: un PO, dieci siti). La
-- ripartizione sta qui; se manca, l'ordine pesa tutto sulla certificazione
-- indicata sulla testata.
create table if not exists public.po_allocazioni (
  id               uuid primary key default gen_random_uuid(),
  po_id            uuid not null references public.ops_purchase_orders(id) on delete cascade,
  certification_id uuid references public.certifications(id),
  etichetta        text,
  pct              numeric,
  importo          numeric,
  note             text,
  created_at       timestamptz not null default now(),
  constraint po_allocazioni_quanto_ck check (pct is not null or importo is not null),
  constraint po_allocazioni_chi_ck check (certification_id is not null or etichetta is not null)
);

create index if not exists po_allocazioni_po_idx on public.po_allocazioni(po_id);
create index if not exists po_condizioni_po_idx on public.po_condizioni(po_id);

comment on table public.po_allocazioni is
  'Ripartizione di un ordine fra i progetti che serve. Assente = tutto sulla certificazione di testata.';

-- ── 4 · L'uscita ricorda da quale ordine e da quale rata e' nata ───────────
alter table public.uscite_previste
  add column if not exists po_id           uuid references public.ops_purchase_orders(id) on delete set null,
  add column if not exists po_condizione_id uuid references public.po_condizioni(id) on delete set null;

create index if not exists uscite_po_idx on public.uscite_previste(po_id);

-- ── 5 · Due allarmi nuovi ──────────────────────────────────────────────────
-- Aggiunti qui perche' un valore di enum non si puo' usare nella stessa
-- transazione in cui nasce: le funzioni che li aprono arrivano dopo.
do $$
begin
  if not exists (select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid
                  where t.typname='task_alert_type' and e.enumlabel='po_pay_when_paid') then
    alter type public.task_alert_type add value 'po_pay_when_paid';
  end if;
  if not exists (select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid
                  where t.typname='task_alert_type' and e.enumlabel='cash_bleed') then
    alter type public.task_alert_type add value 'cash_bleed';
  end if;
end $$;

-- ── 6 · Chi legge e chi scrive ─────────────────────────────────────────────
-- Il PM compila e invia la richiesta; approvarla resta un gesto da ADMIN,
-- garantito dal trigger piu' sotto e non dalla policy, perche' la riga la
-- tocca la stessa mano in entrambi i casi.
alter table public.po_condizioni  enable row level security;
alter table public.po_allocazioni enable row level security;

drop policy if exists po_condizioni_lettura on public.po_condizioni;
create policy po_condizioni_lettura on public.po_condizioni for select to authenticated
  using (public.get_user_role(auth.uid()) = any (array['ADMIN'::app_role,'PM'::app_role]));
drop policy if exists po_condizioni_scrittura on public.po_condizioni;
create policy po_condizioni_scrittura on public.po_condizioni for all to authenticated
  using (public.get_user_role(auth.uid()) = any (array['ADMIN'::app_role,'PM'::app_role]))
  with check (public.get_user_role(auth.uid()) = any (array['ADMIN'::app_role,'PM'::app_role]));

drop policy if exists po_allocazioni_lettura on public.po_allocazioni;
create policy po_allocazioni_lettura on public.po_allocazioni for select to authenticated
  using (public.get_user_role(auth.uid()) = any (array['ADMIN'::app_role,'PM'::app_role]));
drop policy if exists po_allocazioni_scrittura on public.po_allocazioni;
create policy po_allocazioni_scrittura on public.po_allocazioni for all to authenticated
  using (public.get_user_role(auth.uid()) = any (array['ADMIN'::app_role,'PM'::app_role]))
  with check (public.get_user_role(auth.uid()) = any (array['ADMIN'::app_role,'PM'::app_role]));

-- L'unica policy sugli ordini era quella della casella monitoring: il PM che
-- deve compilare la richiesta non vedeva nemmeno i propri ordini.
drop policy if exists po_lettura_ruoli on public.ops_purchase_orders;
create policy po_lettura_ruoli on public.ops_purchase_orders for select to authenticated
  using (public.get_user_role(auth.uid()) = any (array['ADMIN'::app_role,'PM'::app_role]));
drop policy if exists po_scrittura_ruoli on public.ops_purchase_orders;
create policy po_scrittura_ruoli on public.ops_purchase_orders for all to authenticated
  using (public.get_user_role(auth.uid()) = any (array['ADMIN'::app_role,'PM'::app_role]))
  with check (public.get_user_role(auth.uid()) = any (array['ADMIN'::app_role,'PM'::app_role]));

-- ── 7 · Approvare e' un gesto da ADMIN ─────────────────────────────────────
create or replace function public.trg_po_approvazione()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stato_richiesta = 'approvata'
     and old.stato_richiesta is distinct from 'approvata' then
    -- auth.uid() e' nullo dentro le migrazioni: li' il gesto e' nostro.
    if auth.uid() is not null and not coalesce(public.is_admin(auth.uid()), false) then
      raise exception 'Solo un ADMIN puo approvare una richiesta di fornitura';
    end if;
    new.approvata_da := coalesce(new.approvata_da, auth.uid());
    new.approvata_il := coalesce(new.approvata_il, now());
  end if;

  if new.stato_richiesta = 'inviata'
     and old.stato_richiesta is distinct from 'inviata' then
    new.richiesta_da := coalesce(new.richiesta_da, auth.uid());
    new.richiesta_il := coalesce(new.richiesta_il, now());
  end if;

  return new;
end;
$$;

drop trigger if exists trg_po_approvazione on public.ops_purchase_orders;
create trigger trg_po_approvazione
  before update on public.ops_purchase_orders
  for each row execute function public.trg_po_approvazione();

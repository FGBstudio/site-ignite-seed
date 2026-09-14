-- ============================================================================
-- Le sedi, le persone che ci lavorano, e chi puo' leggere il calendario
--
-- Primo blocco della specifica HR. Tre cose che stanno insieme: senza le sedi
-- non c'e' dove appendere le persone, e senza le persone la riservatezza non
-- ha un perimetro.
--
-- ── Perche' una tabella nuova e non ops_locations ─────────────────────────
--
-- `ops_locations` sembra l'anagrafica delle sedi ma non lo e': dentro ci sono
-- 1.153 negozi dei clienti, 12 magazzini e 3 uffici interni. E' la rubrica
-- delle spedizioni hardware, non l'elenco dei posti dove lavoriamo. Mettere
-- le sedi HR li' dentro significherebbe cercare cinque righe fra milleduecento
-- e legare il calendario delle presenze al ciclo di vita di un indirizzo di
-- consegna.
--
-- Restano pero' la stessa cosa nel mondo reale: l'"Italy Office" a cui si
-- spediscono i sensori e' l'ufficio di Milano dove le persone timbrano. Il
-- ponte e' `ops_locations.hr_office_id`, cosi' le due liste non possono
-- divergere senza che si veda.
--
-- ── Perche' il fuso orario ────────────────────────────────────────────────
--
-- Il consuntivo chiude "a mezzanotte", e la mezzanotte di Shanghai non e'
-- quella di Los Angeles. Se la chiusura girasse su un fuso solo, a Shanghai
-- chiuderebbe a meta' pomeriggio e a Los Angeles con un giorno di ritardo.
-- La colonna serve al blocco che verra' dopo, ma va messa adesso: aggiungerla
-- quando i giorni sono gia' chiusi vorrebbe dire riaprirli.
-- ============================================================================

-- ── Le sedi ───────────────────────────────────────────────────────────────
create table if not exists public.hr_offices (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  country    text not null,
  timezone   text not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.hr_offices IS
  'Le sedi in cui lavorano le nostre persone. Distinta da ops_locations, che e'' la rubrica delle spedizioni.';
comment on column public.hr_offices.timezone IS
  'Nome IANA. Decide quando scatta la mezzanotte che chiude la giornata di chi lavora qui.';

insert into public.hr_offices (name, country, timezone) values
  ('Loano',       'Italy',         'Europe/Rome'),
  ('Los Angeles', 'United States', 'America/Los_Angeles'),
  ('Milano',      'Italy',         'Europe/Rome'),
  ('Montecarlo',  'Monaco',        'Europe/Monaco'),
  ('Shanghai',    'China',         'Asia/Shanghai')
on conflict (name) do nothing;

alter table public.hr_offices enable row level security;

drop policy if exists hr_offices_select_auth on public.hr_offices;
create policy hr_offices_select_auth on public.hr_offices
  for select to authenticated using (true);

drop policy if exists hr_offices_write_admin on public.hr_offices;
create policy hr_offices_write_admin on public.hr_offices
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ── La persona sta in una sede ────────────────────────────────────────────
alter table public.profiles
  add column if not exists office_id uuid references public.hr_offices(id) on delete set null;

create index if not exists profiles_office_idx on public.profiles (office_id)
  where office_id is not null;

comment on column public.profiles.office_id IS
  'La sede di lavoro. NULL per i profili dei clienti, che non hanno una nostra sede.';

-- ── Il ponte con la rubrica delle spedizioni ──────────────────────────────
alter table public.ops_locations
  add column if not exists hr_office_id uuid references public.hr_offices(id) on delete set null;

comment on column public.ops_locations.hr_office_id IS
  'Quando questa destinazione di spedizione e'' una nostra sede, qui c''e'' quale. Evita che le due liste divergano.';

update public.ops_locations o
   set hr_office_id = f.id
  from public.hr_offices f
 where o.type = 'internal_office'
   and o.hr_office_id is null
   and f.name = case o.name
                  when 'Italy Office' then 'Milano'
                  when 'China Office' then 'Shanghai'
                  when 'USA Office'   then 'Los Angeles'
                end;

-- ============================================================================
-- La riservatezza del calendario
--
-- `hr_availability_select_all_auth` diceva `using (true)`: chiunque fosse
-- autenticato poteva leggere il calendario completo di chiunque altro, causali
-- comprese — quindi anche le malattie. Le altre tre tabelle HR erano gia'
-- chiuse a "il proprio o l'amministratore"; questa era rimasta aperta.
--
-- Non basta nasconderla nell'interfaccia: la riga si legge interrogando i dati
-- direttamente. E non basta nemmeno chiudere e basta, perche' due letture
-- fra colleghi sono legittime:
--
--   1. sapere se una collega e' disponibile questo mese  -> senza il perche'
--   2. la Saturation Matrix, per non pianificare chi e' via -> senza il perche'
--
-- RLS lavora sulle righe, non sulle colonne, e qui il problema e' una colonna:
-- la causale. Per questo la tabella si chiude del tutto e le due letture
-- passano da due funzioni che restituiscono solo quello che serve.
-- ============================================================================

drop policy if exists hr_availability_select_all_auth on public.hr_availability;

drop policy if exists hr_availability_select_own_or_admin on public.hr_availability;
create policy hr_availability_select_own_or_admin on public.hr_availability
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid()));

-- Cosa vuol dire "disponibile" per chi guarda da fuori. Un permesso di due ore
-- non rende la persona irreperibile per la giornata: resta disponibile.
create or replace function public.fn_hr_is_available(p_status public.hr_availability_status)
returns boolean
language sql
immutable
as $function$
  select p_status in ('office', 'smart_working', 'travel', 'permit');
$function$;

-- ── Finestra 1 · il calendario ────────────────────────────────────────────
--
-- Su sé stessi e per un amministratore: la riga intera.
-- Su un collega: solo il mese di calendario corrente, e solo disponibile o no.
create or replace function public.fn_hr_availability_window(p_from date, p_to date)
returns table (
  id            uuid,
  user_id       uuid,
  date          date,
  status        text,
  hours_planned numeric,
  note          text,
  is_self       boolean,
  masked        boolean
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with me as (select auth.uid() as uid, public.is_admin(auth.uid()) as admin),
       month as (
         select date_trunc('month', current_date)::date as m_from,
                (date_trunc('month', current_date) + interval '1 month - 1 day')::date as m_to
       )
  select
    case when f.full_access then a.id end,
    a.user_id,
    a.date,
    case when f.full_access then a.status::text
         when public.fn_hr_is_available(a.status) then 'available'
         else 'unavailable' end,
    case when f.full_access then a.hours_planned end,
    case when f.full_access then a.note end,
    a.user_id = me.uid,
    not f.full_access
  from public.hr_availability a
  cross join me
  cross join month
  cross join lateral (select (a.user_id = me.uid or me.admin) as full_access) f
  where a.date between p_from and p_to
    and (f.full_access or a.date between month.m_from and month.m_to);
$function$;

comment on function public.fn_hr_availability_window(date, date) IS
  'Il calendario come lo puo'' vedere chi chiama. Di un collega si vede solo il mese corrente, e solo se e'' disponibile.';

revoke all on function public.fn_hr_availability_window(date, date) from public;
grant execute on function public.fn_hr_availability_window(date, date) to authenticated;

-- ── Finestra 2 · i giorni non pianificabili ───────────────────────────────
--
-- Serve alla Saturation Matrix, che oggi legge le causali di tutto il team e
-- non le mostra mai: le usa solo per sapere che quel giorno non si pianifica.
-- Qui restituisce il fatto e basta.
create or replace function public.fn_hr_off_days(p_from date, p_to date, p_user_ids uuid[] default null)
returns table (user_id uuid, date date)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select a.user_id, a.date
    from public.hr_availability a
   where a.date between p_from and p_to
     and not public.fn_hr_is_available(a.status)
     and (p_user_ids is null or a.user_id = any(p_user_ids));
$function$;

comment on function public.fn_hr_off_days(date, date, uuid[]) IS
  'I giorni in cui una persona non e'' pianificabile. Il fatto, non il motivo.';

revoke all on function public.fn_hr_off_days(date, date, uuid[]) from public;
grant execute on function public.fn_hr_off_days(date, date, uuid[]) to authenticated;

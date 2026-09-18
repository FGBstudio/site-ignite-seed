-- Payments, fase 1 — numerazione progressiva e ciclo passivo.

-- ── La numerazione ───────────────────────────────────────────────────────────
-- Il numero si assegna a database, mai dal client: due browser che emettono
-- nello stesso momento leggerebbero lo stesso «ultimo numero» e produrrebbero
-- due fatture con lo stesso progressivo. Qui l'incremento e' atomico.
--
-- Il numero del gestionale del commercialista, quando c'e', vive accanto in
-- `invoices.external_number` e non interferisce con questa serie.
create table if not exists public.invoice_counters (
  entity_code text not null check (entity_code in ('uk','it','cn')),
  year integer not null,
  last_number integer not null default 0,
  primary key (entity_code, year)
);

alter table public.invoice_counters enable row level security;
create policy invoice_counters_admin on public.invoice_counters
  for all to authenticated
  using (coalesce(public.is_admin(auth.uid()), false))
  with check (coalesce(public.is_admin(auth.uid()), false));

/**
 * Il prossimo numero per una societa' emittente e un anno.
 *
 * SECURITY DEFINER perche' il contatore e' infrastruttura: chi emette la
 * fattura ha il diritto di ottenere un numero, non quello di riscrivere il
 * contatore.
 *
 * `INSERT … ON CONFLICT DO UPDATE` prende il lock sulla riga e lo tiene fino a
 * fine transazione: due emissioni simultanee si mettono in fila invece di
 * leggere lo stesso valore.
 */
create or replace function public.fn_nuovo_numero_fattura(p_issuer_contact_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codice text;
  v_anno integer := extract(year from current_date)::int;
  v_prog integer;
begin
  select entity_code into v_codice
    from public.contacts
   where id = p_issuer_contact_id and kind = 'issuer';

  if v_codice is null then
    raise exception 'La societa'' emittente non ha un codice entita'' (uk/it/cn)';
  end if;

  insert into public.invoice_counters (entity_code, year, last_number)
  values (v_codice, v_anno, 1)
  on conflict (entity_code, year)
  do update set last_number = public.invoice_counters.last_number + 1
  returning last_number into v_prog;

  -- FT-IT-2026-0182
  return 'FT-' || upper(v_codice) || '-' || v_anno || '-' || lpad(v_prog::text, 4, '0');
end;
$$;

-- ── I fornitori ──────────────────────────────────────────────────────────────
-- I termini si impostano una volta sola per fornitore: 60 giorni salvo che con
-- quel fornitore si sia concordato altro.
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  default_currency text not null default 'EUR'
    check (default_currency in ('EUR','GBP','CNY','USD')),
  default_terms_days integer not null default 60 check (default_terms_days >= 0),
  vat_number text,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create unique index if not exists suppliers_nome_unico on public.suppliers (lower(name));

-- ── Le fatture passive ───────────────────────────────────────────────────────
create table if not exists public.passive_invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,

  -- La scadenza passiva parte dalla RICEZIONE, non dall'emissione: e' la data
  -- in cui la fattura e' entrata in casa che fa decorrere i termini.
  received_date date not null,
  issue_date date,
  terms_days integer not null default 60 check (terms_days >= 0),
  due_date date generated always as (received_date + terms_days) stored,

  taxable numeric(14,2) not null default 0,
  tax numeric(14,2) not null default 0,
  total numeric(14,2) not null check (total >= 0),
  currency text not null default 'EUR'
    check (currency in ('EUR','GBP','CNY','USD')),

  state text not null default 'to_pay' check (state in ('to_pay','paid','overdue')),
  paid_date date,

  -- Il PDF manca spesso al momento della registrazione: si segnala in rosso, ma
  -- non si impedisce di registrare — bloccare qui vorrebbe dire non registrare
  -- la fattura, che e' peggio che registrarla senza allegato.
  pdf_path text,

  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create unique index if not exists passive_invoices_numero_per_fornitore
  on public.passive_invoices (supplier_id, lower(number));
create index if not exists passive_invoices_per_scadenza on public.passive_invoices (due_date);

alter table public.suppliers enable row level security;
alter table public.passive_invoices enable row level security;

create policy suppliers_admin on public.suppliers
  for all to authenticated
  using (coalesce(public.is_admin(auth.uid()), false))
  with check (coalesce(public.is_admin(auth.uid()), false));

create policy passive_invoices_admin on public.passive_invoices
  for all to authenticated
  using (coalesce(public.is_admin(auth.uid()), false))
  with check (coalesce(public.is_admin(auth.uid()), false));

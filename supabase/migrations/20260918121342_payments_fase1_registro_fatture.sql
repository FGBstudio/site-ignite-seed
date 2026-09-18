-- Payments, fase 1 — il registro unico delle fatture.
--
-- Oggi la sezione Payments non tocca il database: sei liste vivono nel
-- localStorage del browser di chi le compila. Questo e' il registro vero, e il
-- principio e' uno solo: UNA tabella `invoices`, e le viste (Registro, Recall,
-- Insoluti...) sono query filtrate sui suoi stati. Nessun dato reinserito
-- passando da una scheda all'altra.

-- ── Chi emette, in forma di codice ───────────────────────────────────────────
-- Le societa' emittenti stanno gia' in `contacts` (kind='issuer'). Il filtro
-- entita' pero' deve essere secco e uguale ovunque, quindi ogni emittente porta
-- un codice breve. Il legame delle fatture resta per identita'
-- (`issuer_contact_id`), mai per codice: il codice serve a filtrare, non a
-- identificare.
alter table public.contacts
  add column if not exists entity_code text
    check (entity_code is null or entity_code in ('uk', 'it', 'cn'));

comment on column public.contacts.entity_code is
  'Codice breve della societa'' emittente (uk/it/cn). Solo per kind=''issuer''.';

create unique index if not exists contacts_entity_code_unico
  on public.contacts (entity_code) where entity_code is not null;

update public.contacts set entity_code = 'uk'
 where kind = 'issuer' and vat_number = 'GB 215421643' and entity_code is null;
update public.contacts set entity_code = 'it'
 where kind = 'issuer' and vat_number = '12634970961' and entity_code is null;

-- ── Il registro ──────────────────────────────────────────────────────────────
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),

  -- Il numero lo assegna il sistema, progressivo per entita' e anno.
  number text not null,
  -- Il numero che la fattura porta nel gestionale del commercialista, quando
  -- c'e'. Due numerazioni indipendenti divergerebbero al primo scarto: questo
  -- campo le tiene affiancate invece di farle competere.
  external_number text,

  issuer_contact_id uuid not null references public.contacts(id) on delete restrict,
  client_contact_id uuid references public.contacts(id) on delete restrict,
  certification_id uuid references public.certifications(id) on delete set null,
  -- La tranche da cui nasce. NULL e' ammesso: una fattura emessa a mano da
  -- «+ Nuova fattura» entra nel registro e segue lo stesso ciclo delle altre.
  tranche_id uuid references public.cert_payment_milestones(id) on delete set null,

  currency text not null default 'EUR' check (currency in ('EUR','GBP','CNY','USD')),
  -- Il tasso e' quello registrato sulla fattura, non uno vivo: un consolidato
  -- che cambia ogni volta che lo si guarda non e' un consolidato.
  exch_rate numeric(12,6) not null default 1,

  total numeric(14,2) not null check (total >= 0),
  vat_amount numeric(14,2) not null default 0 check (vat_amount >= 0),

  issue_date date not null,
  payment_terms_days integer not null default 30 check (payment_terms_days >= 0),
  -- La scadenza si calcola dall'emissione reale, mai dall'approvazione della
  -- quotazione. Generata: non esiste modo di scriverla diversa dalla regola.
  due_date date generated always as (issue_date + payment_terms_days) stored,

  -- Stato di CICLO. Lo stato di PAGAMENTO e' un'altra dimensione e si calcola:
  -- una fattura puo' essere in recall e parzialmente pagata insieme, e un enum
  -- unico costringerebbe a scegliere quale delle due verita' raccontare.
  lifecycle_state text not null default 'issued'
    check (lifecycle_state in ('issued','in_recall','blocked','insoluto','closed')),

  -- Il recall vive qui perche' e' una proprieta' della fattura, non una lista a
  -- parte. Il giallo e' «bonifico disposto»: dura 30 giorni, poi un job lo
  -- riporta rosso.
  recall_status text check (recall_status is null or recall_status in ('red','yellow')),
  yellow_until date,
  reminders_count integer not null default 0 check (reminders_count >= 0),
  last_reminder_date date,
  next_reminder_date date,

  -- Quando una fattura finisce a recupero: in gestione, legale, o write-off.
  -- La write-off chiude la fattura e la toglie dai crediti, ma resta tracciata.
  recovery_state text check (recovery_state is null
    or recovery_state in ('in_gestione','legale','write_off')),

  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),

  -- Una sola proroga gialla attiva per fattura: una nuova nota su una fattura
  -- gia' gialla estende la scadenza, non aggiunge una seconda riga.
  constraint invoices_giallo_ha_scadenza
    check (recall_status is distinct from 'yellow' or yellow_until is not null)
);

create unique index if not exists invoices_numero_unico_per_entita
  on public.invoices (issuer_contact_id, number);

create index if not exists invoices_per_scadenza on public.invoices (due_date);
create index if not exists invoices_per_stato on public.invoices (lifecycle_state);
create index if not exists invoices_per_commessa on public.invoices (certification_id);
create index if not exists invoices_per_cliente on public.invoices (client_contact_id);

comment on table public.invoices is
  'Registro unico delle fatture attive. Le viste della sezione Payments sono query su questa tabella.';

-- ── Gli incassi ──────────────────────────────────────────────────────────────
-- Figli della fattura: N incassi, la cui somma e' l'incassato. Non esiste un
-- campo «incassato» da scrivere a mano — sarebbe la prima cosa a divergere.
create table if not exists public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  date date not null,
  amount numeric(14,2) not null check (amount > 0),
  method text,
  bank_ref text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create index if not exists invoice_payments_per_fattura on public.invoice_payments (invoice_id);

-- ── Le note di credito ───────────────────────────────────────────────────────
create table if not exists public.credit_notes (
  id uuid primary key default gen_random_uuid(),
  number text not null,
  -- Obbligatorio: una NC corregge sempre una fattura precisa. Niente NC orfane.
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  date date not null,
  amount numeric(14,2) not null check (amount > 0),
  kind text not null check (kind in ('total','partial')),
  reason text,
  -- Una bozza non tocca nessun aggregato: esiste, ma non e' ancora successo.
  state text not null default 'draft' check (state in ('draft','issued')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create index if not exists credit_notes_per_fattura on public.credit_notes (invoice_id);

-- ── I solleciti ──────────────────────────────────────────────────────────────
-- Ogni sollecito e' un'azione registrata sulla fattura, non una riga in una
-- lista separata: e' la differenza fra sapere «quanti solleciti ha avuto questa
-- fattura» e doverlo ricostruire a memoria.
create table if not exists public.invoice_reminders (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  date date not null default current_date,
  channel text not null check (channel in ('email','pec','phone')),
  note text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create index if not exists invoice_reminders_per_fattura on public.invoice_reminders (invoice_id);

-- ── Chi puo' guardare ────────────────────────────────────────────────────────
-- Payments e' dell'amministrazione: il PM non la vede. Le RLS lo impongono nel
-- posto giusto, il database, invece di affidarlo al fatto che la voce di menu
-- non compaia.
alter table public.invoices enable row level security;
alter table public.invoice_payments enable row level security;
alter table public.credit_notes enable row level security;
alter table public.invoice_reminders enable row level security;

create policy invoices_admin on public.invoices
  for all to authenticated
  using (coalesce(public.is_admin(auth.uid()), false))
  with check (coalesce(public.is_admin(auth.uid()), false));

create policy invoice_payments_admin on public.invoice_payments
  for all to authenticated
  using (coalesce(public.is_admin(auth.uid()), false))
  with check (coalesce(public.is_admin(auth.uid()), false));

create policy credit_notes_admin on public.credit_notes
  for all to authenticated
  using (coalesce(public.is_admin(auth.uid()), false))
  with check (coalesce(public.is_admin(auth.uid()), false));

create policy invoice_reminders_admin on public.invoice_reminders
  for all to authenticated
  using (coalesce(public.is_admin(auth.uid()), false))
  with check (coalesce(public.is_admin(auth.uid()), false));

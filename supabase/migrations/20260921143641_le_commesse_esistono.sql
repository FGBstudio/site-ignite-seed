-- ═══════════════════════════════════════════════════════════════════════════
-- Fase 2 · La commessa
--
-- Un ordine del cliente con dentro i progetti che lo compongono. Da 1 a 66:
-- la taglia non conta, conta che sia una cosa sola che il cliente ha comprato.
--
-- Il valore e' DICHIARATO, non sommato dai progetti. Sembra una sfumatura ed
-- e' la differenza fra un sistema che regge la realta' e uno che si rompe alla
-- prima riga sporca: Lucan Lodge esiste in due copie, e a sommare i progetti
-- varrebbe 27.600 invece di 13.800. Lo scarto fra dichiarato e somma diventa
-- un segnale visibile invece di un errore silenzioso dentro il saldo.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.commesse (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,

  brand_id uuid references public.brands(id) on delete set null,
  cliente_contact_id uuid references public.contacts(id) on delete set null,

  servizio text check (servizio in ('energy','air','water','leed','well','misto')),
  anno integer,

  valore_dichiarato numeric(14,2),
  valuta text not null default 'EUR' check (valuta in ('EUR','GBP','CNY','USD')),
  cambio_budget numeric(14,6) not null default 1,

  contratto_cliente text,
  data_ordine_prevista date,

  stato text not null default 'aperta' check (stato in ('aperta','chiusa','on_hold')),
  note text,
  created_at timestamptz not null default now(),
  created_by uuid
);

comment on table public.commesse is
  'Un ordine del cliente. I progetti sotto sono una scomposizione del suo valore, non i suoi addendi.';
comment on column public.commesse.valore_dichiarato is
  'Quanto il cliente ha comprato, scritto una volta. Non si ricava sommando i progetti: lo scarto fra i due e un controllo, non un errore da nascondere.';
comment on column public.commesse.cambio_budget is
  'Il cambio con cui si fanno le previsioni di questa commessa. I documenti reali usano il proprio, e la differenza resta leggibile come differenza cambio.';

create table if not exists public.commessa_progetti (
  commessa_id uuid not null references public.commesse(id) on delete cascade,
  certification_id uuid not null references public.certifications(id) on delete cascade,
  primary key (commessa_id, certification_id)
);

comment on table public.commessa_progetti is
  'Quali progetti stanno dentro una commessa. Una certificazione puo stare in una commessa sola.';

create unique index if not exists idx_un_progetto_una_commessa
  on public.commessa_progetti (certification_id);

-- Le uscite si agganciano alla commessa quando ne servono una sola. Quando un
-- ordine fornitore serve piu' commesse resta nullo: il totale settimanale e'
-- comunque esatto, e attribuire a caso sarebbe peggio che non attribuire.
alter table public.uscite_previste
  add column if not exists commessa_id uuid references public.commesse(id) on delete set null;

comment on column public.uscite_previste.commessa_id is
  'Nullo quando l uscita serve piu commesse o nessuna: R&D, stampi, scorte. Pesa comunque sulla cassa settimanale.';

alter table public.commesse enable row level security;
alter table public.commessa_progetti enable row level security;

drop policy if exists commesse_lettura on public.commesse;
create policy commesse_lettura on public.commesse
  for select to authenticated
  using (public.get_user_role(auth.uid()) in ('ADMIN','PM'));

drop policy if exists commesse_scrittura on public.commesse;
create policy commesse_scrittura on public.commesse
  for all to authenticated
  using (public.get_user_role(auth.uid()) = 'ADMIN')
  with check (public.get_user_role(auth.uid()) = 'ADMIN');

drop policy if exists commessa_progetti_lettura on public.commessa_progetti;
create policy commessa_progetti_lettura on public.commessa_progetti
  for select to authenticated
  using (public.get_user_role(auth.uid()) in ('ADMIN','PM'));

drop policy if exists commessa_progetti_scrittura on public.commessa_progetti;
create policy commessa_progetti_scrittura on public.commessa_progetti
  for all to authenticated
  using (public.get_user_role(auth.uid()) = 'ADMIN')
  with check (public.get_user_role(auth.uid()) = 'ADMIN');

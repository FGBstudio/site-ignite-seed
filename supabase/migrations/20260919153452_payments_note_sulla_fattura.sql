-- Cosa ha detto il cliente, e quando.
--
-- «Il bonifico parte lunedi'», «hanno cambiato il responsabile acquisti», «ci
-- richiamano a fine mese»: aggiornamenti che oggi finiscono in una mail o in
-- testa a qualcuno, e che servono proprio quando quella persona e' in ferie.
--
-- Non sono solleciti — un sollecito e' un'azione nostra, questi sono fatti
-- riferiti — quindi non entrano in `invoice_reminders`: gonfiare il contatore
-- dei solleciti con le note significherebbe non poter piu' rispondere a
-- «quante volte abbiamo scritto a questo cliente».
--
-- Sono datate e impilate, non un campo unico da sovrascrivere: l'ultima notizia
-- non cancella la precedente, e due promesse mancate raccontano una storia che
-- una promessa sola non racconta.
create table if not exists public.invoice_notes (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  date date not null default current_date,
  text text not null check (length(trim(text)) > 0),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index if not exists invoice_notes_per_fattura
  on public.invoice_notes (invoice_id, date desc);

alter table public.invoice_notes enable row level security;

create policy invoice_notes_admin on public.invoice_notes
  for all to authenticated
  using (coalesce(public.is_admin(auth.uid()), false))
  with check (coalesce(public.is_admin(auth.uid()), false));

comment on table public.invoice_notes is
  'Aggiornamenti riferiti dal cliente su una fattura. Datati e impilati: l''ultimo non cancella i precedenti.';

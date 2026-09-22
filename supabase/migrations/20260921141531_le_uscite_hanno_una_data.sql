-- ═══════════════════════════════════════════════════════════════════════════
-- Fase 3 (prima parte) · Le uscite previste
--
-- Il gemello passivo di cert_payment_milestones. Una riga per rata fornitore,
-- con la data in cui i soldi escono. ops_purchase_orders sa solo dire «pagato
-- si/no» sull'intero ordine: qui la rata e un oggetto con una sua scadenza,
-- che e l'unica forma in cui un'uscita puo stare su una griglia settimanale.
--
-- La commessa e ancora un'etichetta di testo: la tabella commesse arriva con
-- la fase 2. Meglio un'etichetta onesta adesso che una chiave finta.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.uscite_previste (
  id uuid primary key default gen_random_uuid(),

  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  corsia text not null check (corsia in ('merce','installazione','servizi')),

  commessa_etichetta text,
  riferimento text,
  descrizione text not null,

  importo numeric(14,2) not null check (importo >= 0),
  valuta text not null default 'EUR' check (valuta in ('EUR','GBP','CNY','USD')),
  cambio numeric(14,6) not null default 1,
  importo_eur numeric(14,2) generated always as (round(importo * cambio, 2)) stored,

  data_prevista date,
  data_prevista_fonte text check (data_prevista_fonte is null or data_prevista_fonte in (
    'contratto',
    'evento',
    'stima',
    'senza_data'
  )),
  data_effettiva date,

  stato text not null default 'prevista'
    check (stato in ('prevista','approvata','pagata','congelata','annullata')),

  passive_invoice_id uuid references public.passive_invoices(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid
);

comment on table public.uscite_previste is
  'Una rata da pagare a un fornitore, con la sua data. Permette di sapere quanto esce in una settimana, che ops_purchase_orders non sa dire.';
comment on column public.uscite_previste.stato is
  'congelata = maturata ma trattenuta apposta. Tipico del 30% a 45 giorni, che si paga solo se il controllo qualita passa.';
comment on column public.uscite_previste.importo_eur is
  'Calcolato, non scritto: importo per il cambio della riga. Il saldo settimanale somma solo questo.';
comment on column public.uscite_previste.commessa_etichetta is
  'Etichetta provvisoria. Diventa una chiave verso commesse quando quella tabella esiste.';

create index if not exists idx_uscite_data on public.uscite_previste (data_prevista);
create index if not exists idx_uscite_fornitore on public.uscite_previste (supplier_id);

alter table public.uscite_previste enable row level security;

drop policy if exists uscite_lettura on public.uscite_previste;
create policy uscite_lettura on public.uscite_previste
  for select to authenticated
  using (public.get_user_role(auth.uid()) in ('ADMIN','PM'));

drop policy if exists uscite_scrittura on public.uscite_previste;
create policy uscite_scrittura on public.uscite_previste
  for all to authenticated
  using (public.get_user_role(auth.uid()) = 'ADMIN')
  with check (public.get_user_role(auth.uid()) = 'ADMIN');

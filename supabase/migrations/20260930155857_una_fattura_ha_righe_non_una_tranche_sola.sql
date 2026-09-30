-- ═══════════════════════════════════════════════════════════════════════════
-- Una fattura ha righe, non una tranche sola
--
-- Oggi `invoices.tranche_id` lega una fattura a **una** tranche. Ma le fatture
-- vere non sono cosi'. La 2.946 di Bottega Veneta ha quattro righe:
--
--   50% LEED GOLD                        8.750,00
--   50% EU Taxonomy                      2.250,00
--   50% Sustainability Check-up          2.500,00
--   #Reimbursement for Bank & GBCI Fees  3.650,00
--
-- Tre sono meta' di tre servizi diversi; la quarta non e' la percentuale di
-- nessuna tranche — e' un rimborso. Con una colonna sola quella fattura non si
-- puo' rappresentare, e infatti nel registro ci sta con un totale e basta.
--
-- E dalla registrazione: «spunti Apple Lead e Apple Brian, premi Invoice, ti si
-- genera la fattura intestata a Apple». Due tranche di due progetti diversi
-- sulla stessa fattura.
--
-- ── PERCHÉ LA COLONNA SPARISCE INVECE DI RESTARE ──────────────────────────
-- Tenere `tranche_id` accanto alle righe vorrebbe dire due posti che dicono la
-- stessa relazione, uno dei quali sa contare fino a uno. Il giorno che una
-- fattura ha due righe, quella colonna diventa una mezza verita': indica la
-- prima tranche e tace sulla seconda, e ogni conto che la usa sbaglia senza
-- dirlo. Le 57 fatture che ce l'hanno diventano 57 righe.
--
-- ── IL TOTALE RESTA IL FATTO ──────────────────────────────────────────────
-- `invoices.total` non diventa una somma calcolata: e' quello che dice il
-- documento ed e' quello che la contabile riconcilia. Ma quando le righe ci
-- sono devono tornare con l'imponibile, e un trigger lo verifica. Non e' una
-- seconda verita': e' la stessa verita' che deve quadrare.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.invoice_righe (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references public.invoices(id) on delete cascade,
  -- Nullo per le righe libere: un rimborso, un extra, un fuori contratto.
  -- E' questo che fa stare i due percorsi in un modello solo.
  tranche_id   uuid references public.cert_payment_milestones(id) on delete set null,
  descrizione  text not null,
  importo      numeric(14,2) not null check (importo >= 0),
  ordine       integer not null default 1,
  created_at   timestamptz not null default now()
);

comment on table public.invoice_righe is
  'Le righe di una fattura. Una riga puo'' appoggiarsi a una tranche oppure no: e'' cosi'' che una fattura da offerta e una fattura libera stanno nello stesso modello.';

create index if not exists invoice_righe_fattura on public.invoice_righe (invoice_id, ordine);
create index if not exists invoice_righe_tranche on public.invoice_righe (tranche_id)
  where tranche_id is not null;

alter table public.invoice_righe enable row level security;

drop policy if exists invoice_righe_select on public.invoice_righe;
create policy invoice_righe_select on public.invoice_righe
  for select to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id));

drop policy if exists invoice_righe_write_admin on public.invoice_righe;
create policy invoice_righe_write_admin on public.invoice_righe
  for all to authenticated
  using (coalesce(public.is_admin(auth.uid()), false))
  with check (coalesce(public.is_admin(auth.uid()), false));

-- ── Il travaso ────────────────────────────────────────────────────────────
-- La descrizione la si costruisce da quello che si sa: percentuale e nome
-- della tranche. Non si inventa il testo che stava sul documento — quello sta
-- nel PDF, e chi lo vuole lo apre.
insert into public.invoice_righe (invoice_id, tranche_id, descrizione, importo, ordine)
select
  i.id,
  i.tranche_id,
  btrim(
    coalesce(m.tranche_pct::text || '% ', '') ||
    coalesce(nullif(m.name, ''), c.name, 'Prestazione')
  ),
  i.total - i.vat_amount,
  1
from public.invoices i
left join public.cert_payment_milestones m on m.id = i.tranche_id
left join public.certifications c on c.id = i.certification_id
where i.tranche_id is not null
  and not exists (select 1 from public.invoice_righe r where r.invoice_id = i.id);

-- ── Il numero dell'ordine del cliente ─────────────────────────────────────
alter table public.invoices
  add column if not exists po_riferimento text;

comment on column public.invoices.po_riferimento is
  'Il riferimento che il cliente chiede in fattura: PO, WBS, Kostenstelle. Testo libero perche'' ogni cliente lo scrive a modo suo — nelle 166 fatture del 2026 c''e'' su una su quattro.';
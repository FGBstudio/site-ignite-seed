-- Payments, fase 1 — estensioni alle tabelle che gia' esistono.
--
-- Qui non si creano tabelle nuove dove ce n'e' gia' una che fa quel mestiere:
-- `cert_payment_milestones` e' vuota ma ha gia' schema, percentuali ed evento
-- scatenante; `task_alerts` ha gia' meta' dei tipi che servono. Aggiungere
-- `payment_tranches` e `alerts` accanto avrebbe creato esattamente le liste
-- parallele che questo lavoro serve a togliere.

-- ── Il passo, per identita' ──────────────────────────────────────────────────
-- Il ritorno «milestone completata → tranche da fatturare» oggi non e'
-- possibile: fra la milestone di una commessa e il passo della scaletta non
-- esiste nessun legame, se non l'ordine in cui compaiono. L'ordine cambia
-- appena qualcuno inserisce una riga, e il legame si romperebbe in silenzio.
alter table public.certification_milestones
  add column if not exists step_id uuid references public.cert_timeline_steps(id) on delete set null;

alter table public.cert_payment_milestones
  add column if not exists step_id uuid references public.cert_timeline_steps(id) on delete set null;

comment on column public.certification_milestones.step_id is
  'Il passo del catalogo da cui questa milestone nasce. Scritto alla materializzazione: e'' il prerequisito dei trigger di fatturazione.';
comment on column public.cert_payment_milestones.step_id is
  'Il passo che fa scattare questa tranche. NULL per l''anticipo, che dipende dalla firma e non da un passo.';

create index if not exists cert_milestones_per_passo
  on public.certification_milestones (certification_id, step_id);
create index if not exists tranche_per_passo
  on public.cert_payment_milestones (certification_id, step_id);

-- ── Lo stato della tranche ───────────────────────────────────────────────────
-- pending: prevista dall'offerta, l'evento non e' ancora successo.
-- due:     l'evento e' successo, l'amministrazione deve emettere.
-- invoiced: la fattura esiste, la tranche ha finito il suo mestiere.
-- La tabella e' vuota, quindi il vincolo si puo' imporre senza bonifiche.
alter table public.cert_payment_milestones
  add column if not exists tranche_state text not null default 'pending';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tranche_state_ammessi') then
    alter table public.cert_payment_milestones
      add constraint tranche_state_ammessi
      check (tranche_state in ('pending','due','invoiced'));
  end if;
end $$;

-- ── Perche' un progetto e' fermo ─────────────────────────────────────────────
-- Il blocco per insoluto NON e' uno stato separato: e' `on_hold`, come deciso.
-- I campi per reggerlo ci sono gia' tutti — motivo, autore, data e stato
-- precedente da ripristinare.
--
-- Manca solo distinguere la causa. Senza un campo strutturato non si puo'
-- rispondere a «quanti progetti sono fermi per mancato pagamento», e il motivo
-- in testo libero non e' una risposta: e' un testo da leggere a uno a uno.
alter table public.certifications
  add column if not exists on_hold_cause text
    check (on_hold_cause is null or on_hold_cause in ('operational','unpaid'));

comment on column public.certifications.on_hold_cause is
  'Perche'' il progetto e'' fermo: operativo oppure mancato pagamento. Lo stato resta uno solo (on_hold).';

-- ── Gli alert ────────────────────────────────────────────────────────────────
-- `task_alerts` ha gia' `quotation_to_payments`, `extra_canone`, `billing_due`
-- e `project_on_hold`. Ne mancano due, e due riferimenti.
alter table public.task_alerts
  add column if not exists invoice_id uuid references public.invoices(id) on delete cascade;
alter table public.task_alerts
  add column if not exists resolved_by uuid references auth.users(id);
-- Un alert chiuso dal sistema non e' come uno spuntato da una persona: il primo
-- dice «l'azione risulta compiuta», il secondo «qualcuno se ne e' fatto carico».
alter table public.task_alerts
  add column if not exists resolved_kind text
    check (resolved_kind is null or resolved_kind in ('user','system'));

alter type public.task_alert_type add value if not exists 'invoice_paid';
alter type public.task_alert_type add value if not exists 'recall_yellow_expired';

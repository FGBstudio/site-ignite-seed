-- ═══════════════════════════════════════════════════════════════════════════
-- Le decurtazioni chiudono ciò che non arriverà
--
-- Sul registro della contabilita' c'e' una colonna che il sistema non aveva:
-- «Decurtazioni spese bancarie/tasse». Sette fatture sono scoperte per 19,50,
-- 46,50 o 56,50 — duecento euro in tutto — che non sono un credito: sono la
-- commissione trattenuta dalla banca del cliente sul bonifico. Soldi che non
-- arriveranno mai, perche' nessuno li ha.
--
-- Con due soli strumenti quelle sette fatture non si chiudono. L'incasso
-- direbbe che il denaro e' arrivato, e non e' vero. La nota di credito e' un
-- documento che si manda al cliente, e non si emette una nota di credito per
-- una commissione della *sua* banca: significherebbe rinunciare a un credito
-- che invece abbiamo incassato per intero — a trattenerne un pezzo e' stato un
-- terzo. Il risultato era duecento euro di rumore accanto ai 45.885 del
-- Giappone e di Taiwan, che sono crediti veri da inseguire.
--
-- Serve quindi un terzo fatto, che dice esattamente quello che e' successo:
-- il cliente ha pagato tutto, di mezzo c'e' stata una trattenuta, e su questa
-- fattura non resta niente da chiedere a nessuno.
--
-- ── PERCHÉ UNA TABELLA SUA ────────────────────────────────────────────────
-- La tentazione e' aggiungere una riga a invoice_payments con una spunta
-- «non e' un incasso». Sarebbe sbagliato: `paid_amount` alimenta tutto cio'
-- che risponde alla domanda «quanto e' entrato in banca», e una decurtazione
-- non e' entrata. Due grandezze diverse vogliono due colonne, o prima o poi
-- una finisce sommata all'altra.
--
-- ── NESSUN TETTO, MA UNA CAUSALE OBBLIGATA ────────────────────────────────
-- Non metto un limite all'importo: in alcuni paesi la ritenuta fiscale e'
-- il quindici o il venti per cento, e sarebbe un limite che rifiuta il caso
-- legittimo piu' grosso. Metto invece una causale scelta da un elenco: una
-- decurtazione senza il suo perche' e' indistinguibile da un credito cancellato
-- per stanchezza, e questa e' la porta da cui si esce dal recall.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.invoice_decurtazioni (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references public.invoices(id) on delete cascade,
  date         date not null,
  amount       numeric(14,2) not null check (amount > 0),
  causale      text not null check (causale in (
                 'spese_bancarie', 'ritenuta_fiscale', 'differenza_cambio',
                 'arrotondamento', 'altro')),
  note         text,
  created_at   timestamptz not null default now(),
  created_by   uuid,
  -- «altro» senza una spiegazione non e' una causale, e' l'assenza di una.
  constraint decurtazione_altro_va_spiegato
    check (causale <> 'altro' or (note is not null and length(btrim(note)) > 2))
);

create index if not exists idx_invoice_decurtazioni_fattura
  on public.invoice_decurtazioni (invoice_id);

comment on table public.invoice_decurtazioni is
  'Quanto, su una fattura incassata, non e'' mai arrivato e non arrivera'': commissioni '
  'bancarie, ritenute, differenze cambio. Chiude il residuo senza dire che il denaro e'' '
  'entrato (sarebbe invoice_payments) ne'' che il credito e'' stato rinunciato (credit_notes).';

alter table public.invoice_decurtazioni enable row level security;

create policy invoice_decurtazioni_admin on public.invoice_decurtazioni
  for all using (coalesce(public.is_admin(auth.uid()), false))
  with check (coalesce(public.is_admin(auth.uid()), false));

-- ── Il residuo tiene conto anche di queste ────────────────────────────────
create or replace view public.v_invoices as
 select i.id,
    i.number,
    i.external_number,
    i.issuer_contact_id,
    em.entity_code,
    em.company_name as issuer_name,
    i.client_contact_id,
    cl.company_name as client_name,
    i.certification_id,
    c.name as project_name,
    i.tranche_id,
    i.currency,
    i.exch_rate,
    i.total,
    i.vat_amount,
    i.issue_date,
    i.payment_terms_days,
    i.due_date,
    i.lifecycle_state,
    i.recall_status,
    i.yellow_until,
    i.reminders_count,
    i.last_reminder_date,
    i.next_reminder_date,
    i.recovery_state,
    i.notes,
    i.created_at,
    coalesce(p.paid_amount, 0::numeric)::numeric(14,2) as paid_amount,
    coalesce(n.credited_amount, 0::numeric)::numeric(14,2) as credited_amount,
    (i.total - coalesce(p.paid_amount, 0::numeric) - coalesce(n.credited_amount, 0::numeric)
             - coalesce(d.decurtato_amount, 0::numeric))::numeric(14,2) as residual,
        case
            when (i.total - coalesce(p.paid_amount, 0::numeric) - coalesce(n.credited_amount, 0::numeric) - coalesce(d.decurtato_amount, 0::numeric)) <= 0::numeric and coalesce(p.paid_amount, 0::numeric) = 0::numeric and coalesce(n.credited_amount, 0::numeric) > 0::numeric then 'credited'::text
            when (i.total - coalesce(p.paid_amount, 0::numeric) - coalesce(n.credited_amount, 0::numeric) - coalesce(d.decurtato_amount, 0::numeric)) <= 0::numeric and coalesce(p.paid_amount, 0::numeric) > 0::numeric then 'paid'::text
            when coalesce(p.paid_amount, 0::numeric) > 0::numeric then 'partial'::text
            else 'unpaid'::text
        end as payment_status,
        case
            when (i.total - coalesce(p.paid_amount, 0::numeric) - coalesce(n.credited_amount, 0::numeric) - coalesce(d.decurtato_amount, 0::numeric)) > 0::numeric and current_date > i.due_date then current_date - i.due_date
            else 0
        end as days_late,
    (i.total * i.exch_rate)::numeric(14,2) as total_eur,
    ((i.total - coalesce(p.paid_amount, 0::numeric) - coalesce(n.credited_amount, 0::numeric) - coalesce(d.decurtato_amount, 0::numeric)) * i.exch_rate)::numeric(14,2) as residual_eur,
    -- In coda perche' CREATE OR REPLACE VIEW non sa infilare una colonna in mezzo.
    coalesce(d.decurtato_amount, 0::numeric)::numeric(14,2) as decurtato_amount
   from invoices i
     left join contacts em on em.id = i.issuer_contact_id
     left join contacts cl on cl.id = i.client_contact_id
     left join certifications c on c.id = i.certification_id
     left join ( select invoice_payments.invoice_id,
            sum(invoice_payments.amount) as paid_amount
           from invoice_payments
          group by invoice_payments.invoice_id) p on p.invoice_id = i.id
     left join ( select credit_notes.invoice_id,
            sum(credit_notes.amount) as credited_amount
           from credit_notes
          where credit_notes.state = 'issued'::text
          group by credit_notes.invoice_id) n on n.invoice_id = i.id
     left join ( select invoice_decurtazioni.invoice_id,
            sum(invoice_decurtazioni.amount) as decurtato_amount
           from invoice_decurtazioni
          group by invoice_decurtazioni.invoice_id) d on d.invoice_id = i.id;

-- ── Gli stessi due guardiani dell'incasso ─────────────────────────────────
create or replace function public.trg_decurtazione_non_supera_residuo()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_residuo numeric;
  v_numero text;
begin
  select f.residual + case when tg_op = 'UPDATE' then old.amount else 0 end, f.number
    into v_residuo, v_numero
    from public.v_invoices f where f.id = new.invoice_id;

  if v_residuo is null then
    raise exception 'Fattura inesistente';
  end if;

  if new.amount > v_residuo + 0.005 then
    raise exception 'Decurtazione di % su % : restano solo %. Una decurtazione piu'' grande del residuo vorrebbe dire che abbiamo incassato piu'' del dovuto.',
      to_char(new.amount, 'FM999G999G990D00'), v_numero, to_char(v_residuo, 'FM999G999G990D00');
  end if;

  return new;
end;
$function$;

create or replace function public.trg_decurtazione_riallinea()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.fn_riallinea_fattura(coalesce(new.invoice_id, old.invoice_id));
  return coalesce(new, old);
end;
$function$;

drop trigger if exists trg_decurtazioni_non_supera on public.invoice_decurtazioni;
create trigger trg_decurtazioni_non_supera
  before insert or update on public.invoice_decurtazioni
  for each row execute function public.trg_decurtazione_non_supera_residuo();

drop trigger if exists trg_decurtazioni_riallinea on public.invoice_decurtazioni;
create trigger trg_decurtazioni_riallinea
  after insert or update or delete on public.invoice_decurtazioni
  for each row execute function public.trg_decurtazione_riallinea();

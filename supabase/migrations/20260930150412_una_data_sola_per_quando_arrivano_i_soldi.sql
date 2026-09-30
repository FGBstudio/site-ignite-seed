-- ═══════════════════════════════════════════════════════════════════════════
-- Una data sola per quando arrivano i soldi
--
-- La scadenza dice quando il cliente DOVEVA pagare. Quello che serve al
-- previsionale e' un'altra cosa: quando ha detto che paghera'. Oggi quel dato
-- esiste solo per le fatture gia' scadute, si chiama `yellow_until`, e lo
-- scrive un gesto solo — «bonifico disposto» — che per funzionare obbliga la
-- fattura a entrare in recall.
--
-- Francesca ha promesse su fatture che non sono ancora scadute: «pagano entro
-- il 30», «lo vedrai addebitato il 30 settembre». Quelle oggi non hanno un
-- posto, e finiscono in un foglio Excel.
--
-- ── PERCHÉ SI SOSTITUISCE INVECE DI AFFIANCARE ────────────────────────────
-- Aggiungere una colonna accanto a `yellow_until` avrebbe lasciato due date
-- per lo stesso fatto: fra sei mesi nessuno saprebbe quale guardare, e la
-- prima volta che divergono il previsionale mente. `yellow_until` ha zero
-- righe — non si perde niente — quindi si rinomina il fatto e si tiene una
-- data sola.
--
-- Il giallo resta una CONSEGUENZA, non un dato: e' giallo quando c'e' una
-- promessa viva. Il vincolo lo dice.
--
-- ── LE NOTE: SI CORREGGONO, E NIENTE SI PERDE ─────────────────────────────
-- Una nota sbagliata si deve poter correggere, ma il diario di cosa ha detto
-- il cliente vale perche' e' intero: serve il giorno che si discute con lui su
-- chi ha detto cosa. Quindi correggere non sovrascrive — scrive una riga nuova
-- e marca la vecchia come sostituita. L'elenco mostra le vive, lo storico le
-- mostra tutte.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1 · Le note: che specie sono, e quale sostituisce quale ───────────────
alter table public.invoice_notes
  add column if not exists tipo text not null default 'libera',
  add column if not exists sostituisce_id uuid references public.invoice_notes(id) on delete set null,
  add column if not exists sostituita_da uuid references public.invoice_notes(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'invoice_notes_tipo_check') then
    alter table public.invoice_notes add constraint invoice_notes_tipo_check
      check (tipo in ('libera', 'pagamento_predisposto', 'bonifico_disposto',
                      'quietanza_richiesta', 'fattura_ricevuta', 'sollecito'));
  end if;
end $$;

create index if not exists invoice_notes_vive on public.invoice_notes (invoice_id, date desc)
  where sostituita_da is null;

comment on column public.invoice_notes.tipo is
  'Che specie di notizia e''. Non si ricava dal testo — si puo'' sempre scrivere a mano — e serve a sapere quante volte un cliente ha promesso senza pagare.';
comment on column public.invoice_notes.sostituita_da is
  'Riempito quando una correzione prende il posto di questa riga. Le note vive sono quelle con questo campo nullo.';

-- ── 2 · La data, e da dove viene ──────────────────────────────────────────
alter table public.invoices
  add column if not exists data_incasso_attesa date,
  add column if not exists data_incasso_attesa_fonte text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'invoices_incasso_attesa_fonte_check') then
    alter table public.invoices add constraint invoices_incasso_attesa_fonte_check
      check (data_incasso_attesa_fonte is null
             or data_incasso_attesa_fonte in ('cliente', 'bonifico_disposto', 'stima'));
  end if;
end $$;

comment on column public.invoices.data_incasso_attesa is
  'Quando il cliente ha detto che paghera''. Diversa dalla scadenza, che dice quando doveva.';
comment on column public.invoices.data_incasso_attesa_fonte is
  'cliente = l''ha detto lui · bonifico_disposto = dice di averlo gia'' fatto · stima = l''abbiamo dedotta noi.';

-- Il travaso. Oggi sono zero righe, ma si scrive lo stesso: una migrazione che
-- funziona solo perche' la tabella e' vuota e' una migrazione che non si puo'
-- rileggere.
update public.invoices
   set data_incasso_attesa = yellow_until,
       data_incasso_attesa_fonte = 'bonifico_disposto'
 where yellow_until is not null;

-- ── 3 · Il vincolo: il giallo ha sempre una promessa dietro ───────────────
alter table public.invoices drop constraint if exists invoices_giallo_ha_scadenza;
alter table public.invoices add constraint invoices_giallo_ha_promessa
  check (recall_status is distinct from 'yellow' or data_incasso_attesa is not null);

-- ── 4 · La vista, rifatta con la colonna nuova al posto della vecchia ─────
-- Si ricrea invece di sostituirla: una colonna non si rinomina a meta' elenco.
-- Porta anche l'ultima nota, per il pallino nel registro: senza, ogni riga
-- costerebbe una sottoquery al frontend.
drop view if exists public.v_invoices;

create view public.v_invoices as
 SELECT i.id,
    i.number,
    i.external_number,
    i.issuer_contact_id,
    em.entity_code,
    em.company_name AS issuer_name,
    i.client_contact_id,
    cl.company_name AS client_name,
    i.certification_id,
    c.name AS project_name,
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
    i.data_incasso_attesa,
    i.data_incasso_attesa_fonte,
    i.reminders_count,
    i.last_reminder_date,
    i.next_reminder_date,
    i.recovery_state,
    i.notes,
    i.created_at,
    COALESCE(p.paid_amount, 0::numeric)::numeric(14,2) AS paid_amount,
    COALESCE(n.credited_amount, 0::numeric)::numeric(14,2) AS credited_amount,
    (i.total - COALESCE(p.paid_amount, 0::numeric) - COALESCE(n.credited_amount, 0::numeric))::numeric(14,2) AS residual,
        CASE
            WHEN (i.total - COALESCE(p.paid_amount, 0::numeric) - COALESCE(n.credited_amount, 0::numeric)) <= 0::numeric AND COALESCE(p.paid_amount, 0::numeric) = 0::numeric AND COALESCE(n.credited_amount, 0::numeric) > 0::numeric THEN 'credited'::text
            WHEN (i.total - COALESCE(p.paid_amount, 0::numeric) - COALESCE(n.credited_amount, 0::numeric)) <= 0::numeric AND COALESCE(p.paid_amount, 0::numeric) > 0::numeric THEN 'paid'::text
            WHEN COALESCE(p.paid_amount, 0::numeric) > 0::numeric THEN 'partial'::text
            ELSE 'unpaid'::text
        END AS payment_status,
        CASE
            WHEN (i.total - COALESCE(p.paid_amount, 0::numeric) - COALESCE(n.credited_amount, 0::numeric)) > 0::numeric AND CURRENT_DATE > i.due_date THEN CURRENT_DATE - i.due_date
            ELSE 0
        END AS days_late,
    (i.total * i.exch_rate)::numeric(14,2) AS total_eur,
    ((i.total - COALESCE(p.paid_amount, 0::numeric) - COALESCE(n.credited_amount, 0::numeric)) * i.exch_rate)::numeric(14,2) AS residual_eur,
    COALESCE(d.decurtato_amount, 0::numeric)::numeric(14,2) AS decurtato_amount,
    COALESCE(d.da_recuperare, 0::numeric)::numeric(14,2) AS ammanco_da_recuperare,
    k.nome AS commessa,
    nt.ultima_nota,
    nt.ultima_nota_il,
    nt.ultima_nota_tipo,
    COALESCE(nt.quante_note, 0::bigint) AS quante_note
   FROM invoices i
     LEFT JOIN contacts em ON em.id = i.issuer_contact_id
     LEFT JOIN contacts cl ON cl.id = i.client_contact_id
     LEFT JOIN certifications c ON c.id = i.certification_id
     LEFT JOIN commessa_progetti cp ON cp.certification_id = i.certification_id
     LEFT JOIN commesse k ON k.id = cp.commessa_id
     LEFT JOIN ( SELECT invoice_payments.invoice_id,
            sum(invoice_payments.amount) AS paid_amount
           FROM invoice_payments
          GROUP BY invoice_payments.invoice_id) p ON p.invoice_id = i.id
     LEFT JOIN ( SELECT credit_notes.invoice_id,
            sum(credit_notes.amount) AS credited_amount
           FROM credit_notes
          WHERE credit_notes.state = 'issued'::text
          GROUP BY credit_notes.invoice_id) n ON n.invoice_id = i.id
     LEFT JOIN ( SELECT invoice_decurtazioni.invoice_id,
            sum(invoice_decurtazioni.amount) AS decurtato_amount,
            sum(
                CASE
                    WHEN invoice_decurtazioni.destino = 'da_recuperare'::text AND invoice_decurtazioni.recuperato_con IS NULL THEN invoice_decurtazioni.amount
                    ELSE 0::numeric
                END) AS da_recuperare
           FROM invoice_decurtazioni
          GROUP BY invoice_decurtazioni.invoice_id) d ON d.invoice_id = i.id
     LEFT JOIN ( SELECT x.invoice_id,
            count(*) AS quante_note,
            (array_agg(x.text ORDER BY x.date DESC, x.created_at DESC))[1] AS ultima_nota,
            (array_agg(x.date ORDER BY x.date DESC, x.created_at DESC))[1] AS ultima_nota_il,
            (array_agg(x.tipo ORDER BY x.date DESC, x.created_at DESC))[1] AS ultima_nota_tipo
           FROM invoice_notes x
          WHERE x.sostituita_da IS NULL
          GROUP BY x.invoice_id) nt ON nt.invoice_id = i.id;

-- ── 5 · Via la colonna vecchia ────────────────────────────────────────────
alter table public.invoices drop column if exists yellow_until;

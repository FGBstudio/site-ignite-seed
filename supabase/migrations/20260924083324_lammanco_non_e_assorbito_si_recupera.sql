-- ═══════════════════════════════════════════════════════════════════════════
-- L'ammanco non è assorbito: si recupera
--
-- Avevo letto le trattenute bancarie come una perdita: soldi che nessuno ha e
-- che non arriveranno. Sbagliato. Sono un AMMANCO, e va riversato sulla fattura
-- successiva dello stesso progetto a compensazione.
--
-- La differenza non è di parole. «Assorbito» chiude la partita e il denaro
-- esce dai conti; «da recuperare» lascia aperto un credito che qualcuno deve
-- ricordarsi di aggiungere, e se nessuno glielo dice quel qualcuno se lo
-- dimentica.
--
-- ── IL DATABASE AVEVA GIÀ RAGIONE, LA FATTURA NO ──────────────────────────
-- Il controllo che lo dimostra: su tutte e sette, il residuo delle tranche è
-- «contratto meno incassato», quindi l'ammanco ci sta già dentro.
--
--   2.764 Kuala Lumpur   8.300 − 4.960,50 = 3.339,50   ← e 3.339,50 è anche
--   2.740 Bangkok        7.400 − 4.420,50 = 2.979,50     il «rimanente da
--   2.741 Beijing CW     4.200 − 2.463,50 = 1.736,50     incassare» del foglio
--   2.748 Daejeon        4.200 − 2.473,50 = 1.726,50     della contabilita,
--   2.765 Macau DFS      1.500 −   880,50 =   619,50     riga per riga.
--   2.769 Makati         7.400 − 4.420,50 = 2.979,50
--   2.791 Singapore MBS  8.400 − 5.020,50 = 3.379,50
--
-- Il ciclo attivo era quindi corretto: i 19,50 sono già fra i soldi da
-- chiedere. A mentire era la riga della fattura, che diceva «Saldata, Chiusa» e
-- nient'altro — e chi la leggeva concludeva che la partita fosse finita.
--
-- ── IL RESIDUO RESTA ZERO ─────────────────────────────────────────────────
-- La fattura si chiude, e deve. Riaprirla per 19,50 la rimanderebbe in
-- Insoluti accanto ai 5.775 di Taipei che nessuno ha pagato, ed e' esattamente
-- il rumore che abbiamo appena togliato: quel documento e' saldato, il credito
-- e' vivo ma viaggia su un altro documento. Due fatti diversi, due posti
-- diversi, e un segnale che li collega.
--
-- ── DUE DESTINI, E IL DEFAULT È RECUPERARE ────────────────────────────────
-- «Assorbito» resta possibile — un arrotondamento da due centesimi non si
-- rifattura — ma non e' il default. Un default che perde denaro e' un default
-- sbagliato: se qualcuno deve fare uno sforzo, che lo faccia per rinunciare a
-- un credito, non per tenerlo.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.invoice_decurtazioni
  add column if not exists destino text not null default 'da_recuperare',
  add column if not exists recuperato_con uuid references public.invoices(id) on delete set null;

alter table public.invoice_decurtazioni
  drop constraint if exists decurtazione_destino_ammesso;
alter table public.invoice_decurtazioni
  add constraint decurtazione_destino_ammesso
    check (destino in ('da_recuperare', 'assorbito'));

-- Un ammanco assorbito non si recupera: se porta il documento che lo ha
-- recuperato, il destino dice il falso.
alter table public.invoice_decurtazioni
  drop constraint if exists decurtazione_assorbito_non_si_recupera;
alter table public.invoice_decurtazioni
  add constraint decurtazione_assorbito_non_si_recupera
    check (destino = 'da_recuperare' or recuperato_con is null);

comment on column public.invoice_decurtazioni.destino is
  'da_recuperare: va aggiunto alla prossima fattura dello stesso progetto a '
  'compensazione, e fino a quel momento e'' un credito vivo. assorbito: perdita, '
  'la partita e'' chiusa. Il default e'' recuperare, perche'' un default che perde '
  'denaro e'' un default sbagliato.';

comment on column public.invoice_decurtazioni.recuperato_con is
  'La fattura che ha effettivamente portato l''ammanco. Finche'' e'' nulla, '
  'l''ammanco e'' aperto e va segnalato a chi emette.';

-- ── Le sette diventano ammanchi da recuperare ─────────────────────────────
update public.invoice_decurtazioni d
   set destino = 'da_recuperare',
       note = 'Trattenuta dalla banca del cliente sul bonifico. Ammanco da riversare sulla '
           || 'prossima fattura dello stesso progetto a compensazione: il residuo delle '
           || 'tranche lo comprende gia.'
 where d.causale = 'spese_bancarie'
   and d.note like '%Dal registro fatture.%';

-- ── La vista dice quanto resta da recuperare, e su quale commessa ─────────
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
    coalesce(d.decurtato_amount, 0::numeric)::numeric(14,2) as decurtato_amount,
    -- Quanto di quel decurtato e' ancora un credito vivo: e' il numero che
    -- impedisce a «Chiusa» di essere l'ultima parola.
    coalesce(d.da_recuperare, 0::numeric)::numeric(14,2) as ammanco_da_recuperare,
    k.nome as commessa
   from invoices i
     left join contacts em on em.id = i.issuer_contact_id
     left join contacts cl on cl.id = i.client_contact_id
     left join certifications c on c.id = i.certification_id
     left join commessa_progetti cp on cp.certification_id = i.certification_id
     left join commesse k on k.id = cp.commessa_id
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
            sum(invoice_decurtazioni.amount) as decurtato_amount,
            sum(case when invoice_decurtazioni.destino = 'da_recuperare'
                      and invoice_decurtazioni.recuperato_con is null
                     then invoice_decurtazioni.amount else 0 end) as da_recuperare
           from invoice_decurtazioni
          group by invoice_decurtazioni.invoice_id) d on d.invoice_id = i.id;

-- ── Gli ammanchi aperti, per progetto ─────────────────────────────────────
-- Serve a chi emette la prossima fattura: se non glielo dice nessuno, quei
-- diciannove euro e cinquanta non li aggiunge.
create or replace view public.v_ammanchi_aperti as
 select i.certification_id,
        c.name as progetto,
        k.nome as commessa,
        sum(d.amount)::numeric(14,2) as importo,
        count(*)::int as quanti,
        string_agg(i.number, ', ' order by i.number) as fatture,
        min(d.date) as dal
   from public.invoice_decurtazioni d
   join public.invoices i on i.id = d.invoice_id
   left join public.certifications c on c.id = i.certification_id
   left join public.commessa_progetti cp on cp.certification_id = i.certification_id
   left join public.commesse k on k.id = cp.commessa_id
  where d.destino = 'da_recuperare' and d.recuperato_con is null
    and i.certification_id is not null
  group by i.certification_id, c.name, k.nome;

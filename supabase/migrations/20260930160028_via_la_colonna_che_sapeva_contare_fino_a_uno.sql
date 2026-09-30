-- ═══════════════════════════════════════════════════════════════════════════
-- Via la colonna che sapeva contare fino a uno
--
-- `invoices.tranche_id` ha fatto il suo lavoro finche' una fattura aveva una
-- tranche sola. Ora le righe sono una tabella, e tenere anche la colonna
-- vorrebbe dire due posti per la stessa relazione: il giorno che una fattura ha
-- due righe, quella colonna indica la prima e tace sulla seconda, e ogni conto
-- che la usa sbaglia senza dirlo.
--
-- Le 57 fatture che ce l'avevano sono gia' diventate 57 righe. Le viste che la
-- nominavano si rifanno leggendo le righe:
--
--   v_invoices              porta `quante_righe` e, quando la fattura sta su
--                           una tranche sola, il suo id: chi cercava
--                           `tranche_id` trova ancora la stessa cosa nel caso
--                           in cui quella cosa esiste.
--   v_tranche_fatturazione  si aggancia dalle righe, e finalmente vede anche
--                           le tranche fatturate insieme ad altre.
-- ═══════════════════════════════════════════════════════════════════════════

drop view if exists public.v_tranche_fatturazione;
drop view if exists public.v_followup_incassi;
drop view if exists public.v_followup_fatture;
drop view if exists public.v_progetti_fatturazione;
drop view if exists public.v_invoices;

alter table public.invoices drop column if exists tranche_id;

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
    -- Dove prima c'era `tranche_id`: l'id quando la fattura sta su una tranche
    -- sola, nullo quando ne ha piu' d'una. Chi lo legge deve sapere che una
    -- fattura puo' non averne una.
    r.tranche_unica AS tranche_id,
    COALESCE(r.quante_righe, 0::bigint) AS quante_righe,
    i.po_riferimento,
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
          GROUP BY x.invoice_id) nt ON nt.invoice_id = i.id
     LEFT JOIN ( SELECT y.invoice_id,
            count(*) AS quante_righe,
            CASE WHEN count(DISTINCT y.tranche_id) = 1
                 THEN (array_agg(y.tranche_id) FILTER (WHERE y.tranche_id IS NOT NULL))[1]
                 END AS tranche_unica
           FROM invoice_righe y
          GROUP BY y.invoice_id) r ON r.invoice_id = i.id;

grant select on public.v_invoices to authenticated;
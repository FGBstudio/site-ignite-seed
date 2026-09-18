-- Payments, fase 1 — la matematica della fattura, in un posto solo.
--
-- Residuo, incassato, creditato e stato di pagamento sono DERIVATI: non
-- esistono come colonne scrivibili. Il motivo non e' purezza — e' che un
-- «residuo» scritto a mano e un «residuo» calcolato divergono al primo incasso
-- registrato di fretta, e da quel momento nessuno sa piu' quale dei due leggere.
--
-- Questa vista e' l'unica fonte di quei numeri. Le schermate ci filtrano sopra;
-- i totali della dashboard sono somme di queste righe. Se una formula cambia,
-- cambia qui e cambia ovunque insieme.
--
-- `security_invoker = on` e' obbligatorio: senza, la vista girerebbe con i
-- privilegi di chi l'ha creata e mostrerebbe le fatture a chiunque, scavalcando
-- le RLS che abbiamo appena messo sulle tabelle.
create or replace view public.v_invoices
with (security_invoker = on)
as
select
  i.id,
  i.number,
  i.external_number,
  i.issuer_contact_id,
  em.entity_code,
  em.company_name        as issuer_name,
  i.client_contact_id,
  cl.company_name        as client_name,
  i.certification_id,
  c.name                 as project_name,
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

  -- Somma degli incassi registrati.
  coalesce(p.paid_amount, 0)::numeric(14,2)     as paid_amount,
  -- Somma delle note di credito EMESSE. Le bozze non contano: esistono, ma non
  -- sono ancora successe.
  coalesce(n.credited_amount, 0)::numeric(14,2) as credited_amount,

  (i.total - coalesce(p.paid_amount, 0) - coalesce(n.credited_amount, 0))::numeric(14,2)
                                                as residual,

  -- Stato di PAGAMENTO: ortogonale a quello di ciclo. Una fattura puo' essere
  -- in recall e parziale insieme, e sono due informazioni diverse.
  case
    when (i.total - coalesce(p.paid_amount,0) - coalesce(n.credited_amount,0)) <= 0
         and coalesce(p.paid_amount,0) = 0
         and coalesce(n.credited_amount,0) > 0              then 'credited'
    when (i.total - coalesce(p.paid_amount,0) - coalesce(n.credited_amount,0)) <= 0
         and coalesce(p.paid_amount,0) > 0                  then 'paid'
    when coalesce(p.paid_amount,0) > 0                      then 'partial'
    else 'unpaid'
  end as payment_status,

  -- Giorni di ritardo, solo se c'e' ancora qualcosa da incassare: una fattura
  -- saldata in ritardo non e' in ritardo, e' chiusa.
  case
    when (i.total - coalesce(p.paid_amount,0) - coalesce(n.credited_amount,0)) > 0
         and current_date > i.due_date
    then (current_date - i.due_date)
    else 0
  end as days_late,

  -- Il consolidato somma valute diverse solo passando dal tasso registrato
  -- sulla fattura. Mai un tasso vivo: il fatturato dell'anno scorso non deve
  -- cambiare perche' oggi la sterlina si e' mossa.
  (i.total * i.exch_rate)::numeric(14,2) as total_eur,
  ((i.total - coalesce(p.paid_amount,0) - coalesce(n.credited_amount,0)) * i.exch_rate)::numeric(14,2)
                                         as residual_eur
from public.invoices i
left join public.contacts em on em.id = i.issuer_contact_id
left join public.contacts cl on cl.id = i.client_contact_id
left join public.certifications c on c.id = i.certification_id
left join (
  select invoice_id, sum(amount) as paid_amount
    from public.invoice_payments group by invoice_id
) p on p.invoice_id = i.id
left join (
  select invoice_id, sum(amount) as credited_amount
    from public.credit_notes where state = 'issued' group by invoice_id
) n on n.invoice_id = i.id;

comment on view public.v_invoices is
  'Fatture con residuo, incassato, creditato e stato di pagamento calcolati. Unica fonte di questi numeri.';

/**
 * Il residuo di una fattura in questo momento.
 *
 * Serve alle validazioni server-side, dove una vista non basta: prima di
 * emettere una nota di credito bisogna sapere quanto resta, e la risposta deve
 * arrivare dalla stessa formula che alimenta le schermate — non da una sua
 * copia scritta nel punto in cui serviva.
 */
create or replace function public.fn_residuo_fattura(p_invoice_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select residual from public.v_invoices where id = p_invoice_id), 0);
$$;

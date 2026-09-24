-- ═══════════════════════════════════════════════════════════════════════════
-- L'ammanco resta nel residuo
--
-- Sbagliavo a sottrarlo. Una decurtazione non è una deduzione dal credito: è
-- la CLASSIFICAZIONE di un pezzo di credito che resta aperto. Diciannove euro e
-- cinquanta su quella fattura non sono arrivati, quindi stanno nel residuo — e
-- ci restano finché la prossima fattura del progetto non li porta.
--
-- Togliendoli dal residuo avevo fatto dire alla riga «Chiusa, zero», che è
-- esattamente la frase di cui l'amministrazione si è lamentata. Il segnale
-- aggiunto sotto non rimediava: metteva la verità in una seconda riga e
-- lasciava la bugia nella prima.
--
-- ── COSA CAMBIA ───────────────────────────────────────────────────────────
--   residual        = totale − incassi − note di credito        (come prima
--                                                                delle decurtazioni)
--   decurtato       = quanta parte di quel residuo è classificata
--   da_recuperare   = quanta parte è un ammanco che andrà sulla prossima
--                     fattura del progetto
--
-- La classificazione non muove numeri: dice cosa sono. Serve a colorare quel
-- residuo di ambra invece che di rosso — non è un cliente che non paga, è
-- una trattenuta con un piano — e a dire a chi emette che c'è da riportare.
--
-- Il guardiano cambia di conseguenza: non più «non superare il residuo» ma
-- «non classificare più di quanto è aperto». Prima il residuo si restringeva
-- a ogni riga scritta, e su un UPDATE bisognava rimetterci dentro il vecchio
-- importo per non rifiutare una correzione legittima; adesso il residuo sta
-- fermo e il confronto è con la somma di ciò che è già classificato.
-- ═══════════════════════════════════════════════════════════════════════════

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
    (i.total - coalesce(p.paid_amount, 0::numeric)
             - coalesce(n.credited_amount, 0::numeric))::numeric(14,2) as residual,
        case
            when (i.total - coalesce(p.paid_amount, 0::numeric) - coalesce(n.credited_amount, 0::numeric)) <= 0::numeric and coalesce(p.paid_amount, 0::numeric) = 0::numeric and coalesce(n.credited_amount, 0::numeric) > 0::numeric then 'credited'::text
            when (i.total - coalesce(p.paid_amount, 0::numeric) - coalesce(n.credited_amount, 0::numeric)) <= 0::numeric and coalesce(p.paid_amount, 0::numeric) > 0::numeric then 'paid'::text
            when coalesce(p.paid_amount, 0::numeric) > 0::numeric then 'partial'::text
            else 'unpaid'::text
        end as payment_status,
        case
            when (i.total - coalesce(p.paid_amount, 0::numeric) - coalesce(n.credited_amount, 0::numeric)) > 0::numeric and current_date > i.due_date then current_date - i.due_date
            else 0
        end as days_late,
    (i.total * i.exch_rate)::numeric(14,2) as total_eur,
    ((i.total - coalesce(p.paid_amount, 0::numeric) - coalesce(n.credited_amount, 0::numeric)) * i.exch_rate)::numeric(14,2) as residual_eur,
    -- Quanta parte del residuo è classificata: non lo riduce, lo spiega.
    coalesce(d.decurtato_amount, 0::numeric)::numeric(14,2) as decurtato_amount,
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

-- ── Il guardiano: non si classifica più di quanto è aperto ──────────────────
create or replace function public.trg_decurtazione_non_supera_residuo()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_residuo numeric;
  v_gia     numeric;
  v_numero  text;
begin
  select f.residual, f.number into v_residuo, v_numero
    from public.v_invoices f where f.id = new.invoice_id;

  if v_residuo is null then
    raise exception 'Fattura inesistente';
  end if;

  -- Quanto e' gia' classificato, escludendo la riga che si sta scrivendo.
  select coalesce(sum(x.amount), 0) into v_gia
    from public.invoice_decurtazioni x
   where x.invoice_id = new.invoice_id
     and (tg_op = 'INSERT' or x.id <> old.id);

  if v_gia + new.amount > v_residuo + 0.005 then
    raise exception 'Su % restano % da incassare, di cui % gia'' classificati: non si puo'' classificarne altri %.',
      v_numero,
      to_char(v_residuo, 'FM999G999G990D00'),
      to_char(v_gia, 'FM999G999G990D00'),
      to_char(new.amount, 'FM999G999G990D00');
  end if;

  return new;
end;
$function$;

-- Le note dicono cosa sono, non che il denaro sia uscito dai conti.
update public.invoice_decurtazioni
   set note = 'Trattenuta dalla banca del cliente sul bonifico. Resta nel residuo di questa '
           || 'fattura e va riversata sulla prossima dello stesso progetto a compensazione: '
           || 'il residuo delle tranche la comprende gia.'
 where causale = 'spese_bancarie'
   and note like '%Ammanco da riversare%';

-- I sette residui tornano aperti: la fattura non era chiusa, e va detto.
do $$
declare r record;
begin
  for r in select distinct invoice_id from public.invoice_decurtazioni loop
    perform public.fn_riallinea_fattura(r.invoice_id);
  end loop;
end $$;

-- Payments, fase 2 — il ciclo di vita della fattura.
--
-- Nessuno «segna» una fattura come chiusa: la fattura si chiude quando non
-- resta piu' niente da incassare, e lo si scopre registrando l'incasso. Lo
-- stesso vale per il recall — ci si entra scadendo, se ne esce incassando.
-- Il lavoro delle persone e' registrare i fatti; gli stati sono conseguenze.

/**
 * Riallinea lo stato di ciclo di una fattura a quello che dicono i suoi numeri.
 *
 * Chiamata dopo ogni incasso e ogni nota di credito, e dal job giornaliero.
 * E' idempotente: rieseguirla su una fattura gia' a posto non cambia niente e
 * non genera alert doppi.
 */
create or replace function public.fn_riallinea_fattura(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  v_cliente text;
begin
  select * into v from public.v_invoices where id = p_invoice_id;
  if not found then return; end if;

  v_cliente := coalesce(v.client_name, v.project_name, 'Cliente');

  -- ── Non resta niente da incassare: la fattura ha finito ───────────────────
  if v.residual <= 0 then
    if v.lifecycle_state <> 'closed' then
      update public.invoices
         set lifecycle_state = 'closed',
             -- Esce dal recall da sola: restare in una lista di solleciti dopo
             -- aver pagato e' il modo piu' rapido di far arrabbiare un cliente.
             recall_status = null,
             yellow_until = null,
             next_reminder_date = null,
             updated_at = now()
       where id = p_invoice_id;

      -- I solleciti aperti su questa fattura non sono piu' lavoro da fare.
      perform public.fn_chiudi_alert('recall_red:' || p_invoice_id::text);
      perform public.fn_chiudi_alert('recall_yellow:' || p_invoice_id::text);

      -- Lo sa anche chi stava inseguendo quel pagamento, senza doverlo chiedere.
      if v.paid_amount > 0 then
        perform public.fn_apri_alert(
          'invoice_paid',
          v_cliente || ' ha pagato ' || v.number,
          'Incassati ' || to_char(v.paid_amount, 'FM999G999G990D00') || ' ' || v.currency ||
            ' — la fattura esce da Recall e i solleciti si chiudono da soli.',
          'invoice_paid:' || p_invoice_id::text,
          v.certification_id,
          p_invoice_id
        );
      end if;
    end if;
    return;
  end if;

  -- ── C'e' ancora residuo ──────────────────────────────────────────────────
  -- Una fattura riaperta (una nota di credito annullata, un incasso corretto)
  -- torna dove le compete, invece di restare chiusa per inerzia.
  if v.lifecycle_state = 'closed' then
    update public.invoices
       set lifecycle_state = case when current_date > v.due_date then 'in_recall' else 'issued' end,
           recall_status = case when current_date > v.due_date then 'red' else null end,
           updated_at = now()
     where id = p_invoice_id;
    perform public.fn_chiudi_alert('invoice_paid:' || p_invoice_id::text);
  end if;
end;
$$;

-- ── I fatti che cambiano i numeri ────────────────────────────────────────────
create or replace function public.trg_incasso_riallinea()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.fn_riallinea_fattura(coalesce(new.invoice_id, old.invoice_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_invoice_payments_riallinea on public.invoice_payments;
create trigger trg_invoice_payments_riallinea
  after insert or update or delete on public.invoice_payments
  for each row execute function public.trg_incasso_riallinea();

drop trigger if exists trg_credit_notes_riallinea on public.credit_notes;
create trigger trg_credit_notes_riallinea
  after insert or update or delete on public.credit_notes
  for each row execute function public.trg_incasso_riallinea();

/**
 * «Bonifico disposto»: il giallo.
 *
 * Non e' automatico e non deve esserlo — e' qualcuno che ha parlato col cliente
 * e riporta quello che gli e' stato detto. Vale 30 giorni.
 *
 * Una seconda nota su una fattura gia' gialla ESTENDE la proroga, non ne apre
 * una seconda: due proroghe attive vorrebbero dire due scadenze diverse per lo
 * stesso credito.
 */
create or replace function public.fn_bonifico_disposto(p_invoice_id uuid, p_giorni integer default 30)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
begin
  select * into v from public.v_invoices where id = p_invoice_id;
  if not found then
    raise exception 'Fattura inesistente';
  end if;
  if v.residual <= 0 then
    raise exception 'La fattura % non ha residuo: non c''e'' nessun bonifico da attendere', v.number;
  end if;

  update public.invoices
     set lifecycle_state = 'in_recall',
         recall_status = 'yellow',
         yellow_until = current_date + p_giorni,
         updated_at = now()
   where id = p_invoice_id;

  -- Il rosso non e' piu' la cosa da guardare: c'e' una promessa in corso.
  perform public.fn_chiudi_alert('recall_red:' || p_invoice_id::text);
end;
$$;

-- L'incasso che chiude l'ultimo credito fa ripartire il progetto.
--
-- `fn_riallinea_fattura` gia' scatta a ogni incasso e a ogni nota di credito:
-- e' il posto dove il sistema si accorge che non resta piu' niente da
-- incassare. Da li' parte anche lo sblocco, perche' un progetto fermo per soldi
-- che sono arrivati e' fermo per niente — e aspettare che qualcuno se ne
-- ricordi vuol dire tenerlo fermo giorni in piu'.
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

  if v.residual <= 0 then
    if v.lifecycle_state <> 'closed' then
      update public.invoices
         set lifecycle_state = 'closed',
             recall_status = null,
             yellow_until = null,
             next_reminder_date = null,
             updated_at = now()
       where id = p_invoice_id;

      perform public.fn_chiudi_alert('recall_red:' || p_invoice_id::text);
      perform public.fn_chiudi_alert('recall_yellow:' || p_invoice_id::text);

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

    -- Se era l'ultimo credito scoperto, il progetto riparte da solo.
    perform public.fn_sblocca_se_credito_rientrato(v.certification_id);
    return;
  end if;

  -- C'e' ancora residuo: una fattura riaperta torna dove le compete.
  -- Una BLOCCATA resta bloccata: il blocco e' una decisione di qualcuno, e non
  -- si annulla perche' una nota di credito ha rimesso del residuo in gioco.
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

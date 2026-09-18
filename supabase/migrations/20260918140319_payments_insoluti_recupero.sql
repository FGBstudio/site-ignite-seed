-- Payments — il passaggio a insoluto.
--
-- Non e' automatico e non deve esserlo: decidere che un credito non rientrera'
-- da solo e' una scelta di qualcuno, con conseguenze (recupero legale,
-- svalutazione). Un job che lo facesse scadere da se' toglierebbe quella
-- decisione a chi deve prenderla.

/**
 * Manda una fattura a recupero.
 *
 * `in_gestione` e `legale` sono crediti che si sta ancora inseguendo: restano
 * nel residuo. `write_off` e' la perdita accettata: chiude la fattura e la
 * toglie dai crediti, ma la riga resta — un credito perso che sparisce e' un
 * credito che nessuno impara a evitare.
 */
create or replace function public.fn_porta_a_insoluto(
  p_invoice_id uuid,
  p_recupero text,
  p_nota text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
begin
  if not coalesce(public.is_admin(auth.uid()), false) then
    raise exception 'Solo l''amministrazione decide il passaggio a recupero';
  end if;
  if p_recupero not in ('in_gestione', 'legale', 'write_off') then
    raise exception 'Stato di recupero non ammesso: %', p_recupero;
  end if;

  select * into v from public.v_invoices where id = p_invoice_id;
  if not found then raise exception 'Fattura inesistente'; end if;
  if v.residual <= 0 then
    raise exception 'La fattura % non ha residuo: non c''e'' niente da recuperare', v.number;
  end if;

  update public.invoices
     set lifecycle_state = case when p_recupero = 'write_off' then 'closed' else 'insoluto' end,
         recovery_state = p_recupero,
         -- Esce dai solleciti: una pratica in mano al legale non si insegue
         -- piu' con le email dell'amministrazione.
         recall_status = null,
         yellow_until = null,
         next_reminder_date = null,
         notes = coalesce(p_nota, notes),
         updated_at = now()
   where id = p_invoice_id;

  perform public.fn_chiudi_alert('recall_red:' || p_invoice_id::text);
  perform public.fn_chiudi_alert('recall_yellow:' || p_invoice_id::text);
end;
$$;

/**
 * Riporta una fattura dal recupero alla vita normale.
 *
 * Succede: il cliente si fa vivo, la pratica rientra. Torna dove la mette la
 * sua scadenza, non dove era prima.
 */
create or replace function public.fn_riporta_da_insoluto(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
begin
  if not coalesce(public.is_admin(auth.uid()), false) then
    raise exception 'Solo l''amministrazione puo'' riportare indietro un insoluto';
  end if;

  select * into v from public.v_invoices where id = p_invoice_id;
  if not found then raise exception 'Fattura inesistente'; end if;

  update public.invoices
     set lifecycle_state = case
           when v.residual <= 0 then 'closed'
           when current_date > v.due_date then 'in_recall'
           else 'issued'
         end,
         recall_status = case
           when v.residual > 0 and current_date > v.due_date then 'red' else null
         end,
         recovery_state = null,
         updated_at = now()
   where id = p_invoice_id;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Una quietanza non è una promessa di pagamento
--
-- La prova l'ha trovato subito: registrando «richiesta quietanza» con una data,
-- la funzione scriveva `data_incasso_attesa` lo stesso, e quella fattura
-- entrava nel previsionale. Esattamente la cosa che la specifica dice di non
-- fare — «se non mi scrivono quando, non lo metto nel previsionale» — scritta
-- bene nel commento e sbagliata nel codice.
--
-- Il difetto era di struttura, non di svista: la funzione controllava «c'e' una
-- data?» invece di «questo esito puo' portarne una?». Due domande diverse, e la
-- seconda e' quella che conta.
--
-- Ora gli esiti sono di tre specie:
--   promesse   → la data serve, e senza la funzione rifiuta
--   notizie    → la data non ha senso, e passarla e' un errore da dire, non da
--                ignorare in silenzio: chi la scrive crede di aver registrato
--                qualcosa che non c'e'
--   libera     → la data e' facoltativa, perche' «mi ha detto che paga a fine
--                mese» e' una promessa vera anche se non ha un'etichetta
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.fn_registra_esito(
  p_invoice_id uuid,
  p_esito      text,
  p_data       date default null,
  p_testo      text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v record;
  v_nota_id uuid;
  v_testo text;
  v_promessa boolean;   -- la data serve
  v_notizia boolean;    -- la data non ha senso
begin
  if not coalesce(public.is_admin(auth.uid()), false) then
    raise exception 'Solo l''amministrazione annota gli aggiornamenti dal cliente';
  end if;

  if p_esito not in ('libera', 'pagamento_predisposto', 'bonifico_disposto',
                     'quietanza_richiesta', 'fattura_ricevuta') then
    raise exception 'Esito sconosciuto: %', p_esito;
  end if;

  select * into v from public.v_invoices where id = p_invoice_id;
  if not found then raise exception 'Fattura inesistente'; end if;

  v_promessa := p_esito in ('pagamento_predisposto', 'bonifico_disposto');
  v_notizia  := p_esito in ('quietanza_richiesta', 'fattura_ricevuta');

  if v_promessa and p_data is null then
    raise exception 'L''esito «%» ha senso solo con una data', p_esito;
  end if;
  if v_notizia and p_data is not null then
    raise exception 'L''esito «%» non dice quando arriveranno i soldi: la data non si registra', p_esito;
  end if;
  if p_data is not null and p_data < v.issue_date then
    raise exception 'La data promessa e'' prima dell''emissione della fattura';
  end if;

  v_testo := coalesce(nullif(btrim(coalesce(p_testo, '')), ''),
    case p_esito
      when 'pagamento_predisposto' then 'Pagamento predisposto entro il ' || to_char(p_data, 'DD/MM/YYYY')
      when 'bonifico_disposto'     then 'Bonifico disposto, accredito previsto il ' || to_char(p_data, 'DD/MM/YYYY')
      when 'quietanza_richiesta'   then 'Richiesta la quietanza di pagamento'
      when 'fattura_ricevuta'      then 'Il cliente conferma di aver ricevuto la fattura'
      else 'Aggiornamento dal cliente'
    end);

  insert into public.invoice_notes (invoice_id, date, text, tipo, created_by)
  values (p_invoice_id, current_date, v_testo, p_esito, auth.uid())
  returning id into v_nota_id;

  -- La data si scrive solo se l'esito e' una promessa — o una nota libera che
  -- ne porta una. Una notizia non tocca il previsionale.
  if p_data is not null and not v_notizia then
    update public.invoices
       set data_incasso_attesa = p_data,
           data_incasso_attesa_fonte = case when p_esito = 'bonifico_disposto'
                                            then 'bonifico_disposto' else 'cliente' end,
           -- Il giallo sospende il rosso, ma solo se c'e' un rosso da
           -- sospendere: una promessa su una fattura non ancora scaduta non ha
           -- niente da fermare, e portarla in recall sarebbe dirle di essere
           -- in ritardo quando non lo e'.
           recall_status = case when v.residual > 0 and current_date > v.due_date
                                then 'yellow' else recall_status end,
           lifecycle_state = case when v.residual > 0 and current_date > v.due_date
                                  then 'in_recall' else lifecycle_state end,
           updated_at = now()
     where id = p_invoice_id;

    if v.residual > 0 and current_date > v.due_date then
      perform public.fn_chiudi_alert('recall_red:' || p_invoice_id::text);
    end if;
  end if;

  return v_nota_id;
end;
$function$;

comment on function public.fn_registra_esito is
  'Un gesto solo: annota cosa ha detto il cliente e, se e'' una promessa, scrive quando ci si aspetta l''incasso.';

revoke all on function public.fn_registra_esito(uuid, text, date, text) from anon;
grant execute on function public.fn_registra_esito(uuid, text, date, text) to authenticated;

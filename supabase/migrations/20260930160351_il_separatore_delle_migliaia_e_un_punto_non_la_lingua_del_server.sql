-- ═══════════════════════════════════════════════════════════════════════════
-- Il separatore delle migliaia è un punto, non la lingua del server
--
-- La prova ha emesso una fattura numerata **«2,898»**: con la virgola. Perche'
-- `to_char(n, 'FM9G999G999')` usa il separatore della localizzazione del
-- server, e li' e' la virgola. Le fatture vere si chiamano «2.897».
--
-- E il difetto si moltiplicava: la ricerca dell'ultimo numero cerca
-- `^[0-9][0-9.]*$`, che una virgola non la riconosce. Quindi «2,898» restava
-- invisibile, e la fattura dopo riprendeva da «2.897 + 1» — cioe' di nuovo
-- 2.898. Due fatture con lo stesso numero, se il vincolo unico non l'avesse
-- fermata.
--
-- Il numero si compone a mano, che e' l'unico modo di essere sicuri di come
-- viene scritto: le ultime tre cifre, un punto, quello che c'e' prima.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.fn_nuovo_numero_fattura(p_issuer_contact_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_codice text;
  v_anno integer := extract(year from current_date)::int;
  v_ultimo text;
  v_num bigint;
  v_testo text;
  v_prog integer;
begin
  select entity_code into v_codice
    from public.contacts
   where id = p_issuer_contact_id and kind = 'issuer';

  if v_codice is null then
    raise exception 'La societa'' emittente non ha un codice entita'' (uk/it/cn)';
  end if;

  select i.number into v_ultimo
    from public.invoices i
   where i.issuer_contact_id = p_issuer_contact_id
     and i.number ~ '^[0-9][0-9.]*$'
   order by replace(i.number, '.', '')::bigint desc
   limit 1;

  if v_ultimo is not null then
    v_num := replace(v_ultimo, '.', '')::bigint + 1;
    v_testo := v_num::text;
    -- Il punto si rimette solo se c'era, e si mette a mano: `to_char` con
    -- «G» chiede alla localizzazione del server, e la risposta cambia da
    -- server a server.
    if position('.' in v_ultimo) > 0 and length(v_testo) > 3 then
      v_testo := left(v_testo, length(v_testo) - 3) || '.' || right(v_testo, 3);
    end if;
    return v_testo;
  end if;

  insert into public.invoice_counters (entity_code, year, kind, last_number)
  values (v_codice, v_anno, 'invoice', 1)
  on conflict (entity_code, year, kind)
  do update set last_number = public.invoice_counters.last_number + 1
  returning last_number into v_prog;

  return 'FT-' || upper(v_codice) || '-' || v_anno || '-' || lpad(v_prog::text, 4, '0');
end;
$function$;

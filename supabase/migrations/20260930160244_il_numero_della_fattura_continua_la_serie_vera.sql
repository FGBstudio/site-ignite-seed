-- ═══════════════════════════════════════════════════════════════════════════
-- Il numero della fattura continua la serie vera
--
-- Provando a emettere una fattura dalle righe e' venuto fuori che
-- `fn_nuovo_numero_fattura` **non ha mai funzionato**:
--
--   insert into invoice_counters (entity_code, year, last_number)
--   on conflict (entity_code, year)          ← la chiave e' (entity_code, year, kind)
--
-- Il vincolo non esiste, e la funzione fallisce sempre. Non se n'era accorto
-- nessuno perche' tutte e 69 le fatture sono entrate da migrazione: dal
-- programma non ne e' mai stata emessa una.
--
-- ── E IL FORMATO NON ERA QUELLO VERO ──────────────────────────────────────
-- La funzione produceva `FT-UK-2026-0001`. Le fatture vere si chiamano
-- «2.946», «3.089»: una serie sola, progressiva, col punto delle migliaia. Una
-- fattura numerata in un modo che la contabile non riconosce e' peggio di una
-- fattura che non si riesce a emettere — la prima crea un buco nel registro
-- ufficiale, la seconda fa solo perdere dieci minuti.
--
-- Quindi il numero non si inventa: si CONTINUA. Si guarda l'ultima emessa da
-- quella societa'; se e' un numero, la prossima e' quella piu' uno, scritta
-- nello stesso modo. Il contatore resta per le societa' che non hanno ancora
-- fatturato nulla — e' li' che serve dire da dove partire, ed e' una domanda
-- per l'amministrazione, non per il codice.
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
  v_prog integer;
begin
  select entity_code into v_codice
    from public.contacts
   where id = p_issuer_contact_id and kind = 'issuer';

  if v_codice is null then
    raise exception 'La societa'' emittente non ha un codice entita'' (uk/it/cn)';
  end if;

  -- La serie di quella societa', come la scrive lei. Si ordina sul valore
  -- numerico e non sul testo: «2.897» e «3.089» come stringhe si ordinano al
  -- contrario di come si contano.
  select i.number into v_ultimo
    from public.invoices i
   where i.issuer_contact_id = p_issuer_contact_id
     and i.number ~ '^[0-9][0-9.]*$'
   order by replace(i.number, '.', '')::bigint desc
   limit 1;

  if v_ultimo is not null then
    v_num := replace(v_ultimo, '.', '')::bigint + 1;
    -- Il punto delle migliaia si rimette solo se c'era: «2.946» → «2.947»,
    -- «946» → «947».
    if position('.' in v_ultimo) > 0 then
      return to_char(v_num, 'FM9G999G999');
    end if;
    return v_num::text;
  end if;

  -- Nessuna fattura ancora: si parte dal contatore. `kind` fa parte della
  -- chiave, e ometterlo era il difetto.
  insert into public.invoice_counters (entity_code, year, kind, last_number)
  values (v_codice, v_anno, 'invoice', 1)
  on conflict (entity_code, year, kind)
  do update set last_number = public.invoice_counters.last_number + 1
  returning last_number into v_prog;

  return 'FT-' || upper(v_codice) || '-' || v_anno || '-' || lpad(v_prog::text, 4, '0');
end;
$function$;

comment on function public.fn_nuovo_numero_fattura is
  'Continua la serie che quella societa'' usa gia''. Il formato strutturato resta solo per chi non ha ancora emesso nulla.';
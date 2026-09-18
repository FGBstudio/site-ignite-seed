-- Payments, fase 5 — le note di credito.
--
-- Una nota di credito e' l'unico modo di correggere una fattura emessa: il
-- documento originale resta com'e' e la rettifica si vede accanto, con il suo
-- motivo. E' anche l'unico strumento che puo' ridurre il fatturato, quindi le
-- sue regole stanno nel database.

-- ── Le serie ─────────────────────────────────────────────────────────────────
-- Fatture e note di credito hanno progressivi separati: sono due serie fiscali
-- distinte, e mescolarle vorrebbe dire buchi nell'una e nell'altra.
alter table public.invoice_counters
  add column if not exists kind text not null default 'invoice'
    check (kind in ('invoice', 'credit_note'));

do $$
begin
  if exists (
    select 1 from pg_constraint
     where conname = 'invoice_counters_pkey'
       and (select count(*) from unnest(conkey)) = 2
  ) then
    alter table public.invoice_counters drop constraint invoice_counters_pkey;
    alter table public.invoice_counters add primary key (entity_code, year, kind);
  end if;
end $$;

/**
 * Il prossimo numero di nota di credito.
 *
 * Stessa meccanica della numerazione fatture — incremento atomico sulla riga
 * del contatore — ma serie sua: NC-IT-2026-0007.
 */
create or replace function public.fn_nuovo_numero_nota_credito(p_issuer_contact_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codice text;
  v_anno integer := extract(year from current_date)::int;
  v_prog integer;
begin
  select entity_code into v_codice
    from public.contacts where id = p_issuer_contact_id and kind = 'issuer';
  if v_codice is null then
    raise exception 'La societa'' emittente non ha un codice entita'' (uk/it/cn)';
  end if;

  insert into public.invoice_counters (entity_code, year, kind, last_number)
  values (v_codice, v_anno, 'credit_note', 1)
  on conflict (entity_code, year, kind)
  do update set last_number = public.invoice_counters.last_number + 1
  returning last_number into v_prog;

  return 'NC-' || upper(v_codice) || '-' || v_anno || '-' || lpad(v_prog::text, 4, '0');
end;
$$;

/**
 * Una nota di credito non puo' superare il residuo della fattura.
 *
 * Stornare piu' di quello che resta vorrebbe dire un residuo negativo: un
 * credito che diventa un debito verso il cliente senza che nessuno l'abbia
 * deciso. Il limite si misura al momento dell'emissione, perche' fino ad allora
 * la fattura puo' aver incassato.
 *
 * Le bozze non sono soggette al limite: una bozza non tocca nessun aggregato, e
 * poterla preparare mentre il conto e' ancora in movimento e' il suo scopo.
 */
create or replace function public.trg_nc_non_supera_residuo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_residuo numeric;
  v_numero text;
begin
  if new.state <> 'issued' then
    return new;
  end if;

  -- Il residuo senza contare questa nota: se e' gia' emessa e la si sta
  -- correggendo, il suo vecchio importo va restituito prima del confronto.
  select f.residual
         + case when tg_op = 'UPDATE' and old.state = 'issued' then old.amount else 0 end,
         f.number
    into v_residuo, v_numero
    from public.v_invoices f where f.id = new.invoice_id;

  if v_residuo is null then
    raise exception 'La nota di credito deve riferirsi a una fattura esistente';
  end if;

  if new.amount > v_residuo + 0.005 then
    raise exception
      'Nota di credito di % su %: il residuo e'' solo di %. Una nota piu'' alta renderebbe la fattura un debito.',
      to_char(new.amount, 'FM999G999G990D00'), v_numero, to_char(v_residuo, 'FM999G999G990D00');
  end if;

  -- Una nota «totale» deve davvero chiudere la fattura: se copre solo una parte
  -- del residuo e' una parziale, e chiamarla totale farebbe credere che quella
  -- fattura sia chiusa quando non lo e'.
  if new.kind = 'total' and new.amount < v_residuo - 0.005 then
    raise exception
      'Nota TOTALE di % su un residuo di %: per stornare solo una parte usa il tipo «parziale».',
      to_char(new.amount, 'FM999G999G990D00'), to_char(v_residuo, 'FM999G999G990D00');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_credit_notes_non_supera on public.credit_notes;
create trigger trg_credit_notes_non_supera
  before insert or update on public.credit_notes
  for each row execute function public.trg_nc_non_supera_residuo();

/**
 * Emette una nota di credito, numero compreso.
 *
 * Come per le fatture, numero e riga nascono nella stessa transazione. Il
 * numero si assegna solo all'emissione: una bozza non consuma un progressivo,
 * perche' potrebbe non diventare mai un documento.
 */
create or replace function public.fn_emetti_nota_credito(
  p_invoice_id uuid,
  p_amount numeric,
  p_kind text,
  p_reason text default null,
  p_date date default null,
  p_bozza boolean default false
) returns public.credit_notes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fattura record;
  v_numero text;
  v_riga public.credit_notes;
begin
  if not coalesce(public.is_admin(auth.uid()), false) then
    raise exception 'Solo l''amministrazione puo'' emettere note di credito';
  end if;

  select * into v_fattura from public.v_invoices where id = p_invoice_id;
  if not found then raise exception 'Fattura inesistente'; end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'L''importo di una nota di credito deve essere positivo';
  end if;

  -- Le bozze restano senza numero finche' non diventano documenti.
  v_numero := case
    when p_bozza then 'BOZZA-' || to_char(now(), 'YYYYMMDDHH24MISS')
    else public.fn_nuovo_numero_nota_credito(v_fattura.issuer_contact_id)
  end;

  insert into public.credit_notes (number, invoice_id, date, amount, kind, reason, state, created_by)
  values (v_numero, p_invoice_id, coalesce(p_date, current_date), p_amount, p_kind,
          p_reason, case when p_bozza then 'draft' else 'issued' end, auth.uid())
  returning * into v_riga;

  -- La fattura si riallinea da sola: se la nota copre tutto il residuo, si
  -- chiude — e con lei il progetto eventualmente fermo per quel credito.
  perform public.fn_riallinea_fattura(p_invoice_id);

  return v_riga;
end;
$$;

/**
 * Trasforma una bozza in documento.
 *
 * E' qui che la nota prende il numero e comincia a contare sugli aggregati.
 */
create or replace function public.fn_emetti_bozza_nota_credito(p_credit_note_id uuid)
returns public.credit_notes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nc public.credit_notes;
  v_issuer uuid;
begin
  if not coalesce(public.is_admin(auth.uid()), false) then
    raise exception 'Solo l''amministrazione puo'' emettere note di credito';
  end if;

  select * into v_nc from public.credit_notes where id = p_credit_note_id;
  if not found then raise exception 'Nota di credito inesistente'; end if;
  if v_nc.state = 'issued' then
    raise exception 'La nota % e'' gia'' emessa', v_nc.number;
  end if;

  select issuer_contact_id into v_issuer from public.invoices where id = v_nc.invoice_id;

  update public.credit_notes
     set number = public.fn_nuovo_numero_nota_credito(v_issuer),
         state = 'issued',
         date = current_date
   where id = p_credit_note_id
  returning * into v_nc;

  perform public.fn_riallinea_fattura(v_nc.invoice_id);
  return v_nc;
end;
$$;

-- Payments, fase 3 — emettere una fattura e registrare un incasso.
--
-- Le regole stanno qui e non nel modulo: una validazione che vive solo nel
-- browser e' una cortesia verso chi compila, non una garanzia. Il registro
-- fatture e' un documento contabile e deve reggere anche quando qualcuno
-- scrive dal posto sbagliato.

/**
 * Emette una fattura, numero compreso.
 *
 * Numero e riga nascono nella stessa transazione: se si chiedesse il numero da
 * una parte e si inserisse dall'altra, un errore in mezzo brucerebbe un
 * progressivo e lascerebbe un buco nella numerazione — che su una serie
 * fiscale non e' un dettaglio.
 *
 * Il numero del gestionale del commercialista, se c'e', si affianca in
 * `external_number` senza interferire con la serie interna.
 */
create or replace function public.fn_emetti_fattura(
  p_issuer_contact_id uuid,
  p_total numeric,
  p_issue_date date,
  p_payment_terms_days integer,
  p_client_contact_id uuid default null,
  p_certification_id uuid default null,
  p_tranche_id uuid default null,
  p_currency text default 'EUR',
  p_exch_rate numeric default 1,
  p_vat_amount numeric default 0,
  p_external_number text default null,
  p_notes text default null
) returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_numero text;
  v_riga public.invoices;
begin
  -- SECURITY DEFINER apre una porta: va richiuso subito. Emettere fatture e'
  -- dell'amministrazione, e qui il controllo e' esplicito perche' la funzione
  -- gira con privilegi che il chiamante non ha.
  if not coalesce(public.is_admin(auth.uid()), false) then
    raise exception 'Solo l''amministrazione puo'' emettere fatture';
  end if;

  if p_total is null or p_total < 0 then
    raise exception 'Il totale non puo'' essere negativo';
  end if;
  if p_issue_date is null then
    raise exception 'Serve la data di emissione: la scadenza si calcola da li''';
  end if;

  v_numero := public.fn_nuovo_numero_fattura(p_issuer_contact_id);

  insert into public.invoices (
    number, external_number, issuer_contact_id, client_contact_id, certification_id,
    tranche_id, currency, exch_rate, total, vat_amount, issue_date,
    payment_terms_days, lifecycle_state, notes, created_by
  ) values (
    v_numero, nullif(trim(coalesce(p_external_number, '')), ''), p_issuer_contact_id,
    p_client_contact_id, p_certification_id, p_tranche_id,
    coalesce(p_currency, 'EUR'), coalesce(p_exch_rate, 1), p_total,
    coalesce(p_vat_amount, 0), p_issue_date, coalesce(p_payment_terms_days, 30),
    'issued', p_notes, auth.uid()
  ) returning * into v_riga;

  return v_riga;
end;
$$;

/**
 * Un incasso non puo' superare quello che resta da incassare.
 *
 * L'eccedenza non si assorbe in silenzio: se arrivano piu' soldi del dovuto e'
 * un fatto che qualcuno deve guardare — un acconto sulla fattura sbagliata, un
 * doppio bonifico — e schiacciarlo dentro il residuo lo farebbe sparire.
 */
create or replace function public.trg_incasso_non_supera_residuo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_residuo numeric;
  v_numero text;
begin
  -- Il residuo PRIMA di questa riga: in UPDATE si toglie il vecchio importo,
  -- altrimenti correggere un incasso da 100 a 110 risulterebbe sempre eccedente.
  select f.residual + case when tg_op = 'UPDATE' then old.amount else 0 end, f.number
    into v_residuo, v_numero
    from public.v_invoices f where f.id = new.invoice_id;

  if v_residuo is null then
    raise exception 'Fattura inesistente';
  end if;

  if new.amount > v_residuo + 0.005 then
    raise exception 'Incasso di % su % : restano solo %. Registra l''eccedenza a parte.',
      to_char(new.amount, 'FM999G999G990D00'), v_numero, to_char(v_residuo, 'FM999G999G990D00');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_invoice_payments_non_supera on public.invoice_payments;
create trigger trg_invoice_payments_non_supera
  before insert or update on public.invoice_payments
  for each row execute function public.trg_incasso_non_supera_residuo();

/**
 * Una fattura emessa non si corregge: si storna.
 *
 * Numero, importo e data di emissione sono quello che il cliente ha in mano e
 * che il commercialista ha registrato. Cambiarli dopo vorrebbe dire avere due
 * versioni dello stesso documento — le rettifiche passano da una nota di
 * credito, che lascia traccia di cosa e' cambiato e perche'.
 */
create or replace function public.trg_fattura_emessa_immutabile()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.number is distinct from old.number then
    raise exception 'Il numero di una fattura emessa non si cambia (% -> %)', old.number, new.number;
  end if;
  if new.total is distinct from old.total then
    raise exception 'L''importo di % non si cambia dopo l''emissione: serve una nota di credito', old.number;
  end if;
  if new.issue_date is distinct from old.issue_date then
    raise exception 'La data di emissione di % non si cambia: la scadenza dipende da li''', old.number;
  end if;
  if new.issuer_contact_id is distinct from old.issuer_contact_id then
    raise exception 'La societa'' che ha emesso % non si cambia', old.number;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_invoices_immutabile on public.invoices;
create trigger trg_invoices_immutabile
  before update on public.invoices
  for each row execute function public.trg_fattura_emessa_immutabile();

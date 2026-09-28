-- ═══════════════════════════════════════════════════════════════════════════
-- La scadenza di una storica si deriva come per tutte le altre
--
-- `invoices.due_date` e' una colonna generata: data di emissione piu' i giorni
-- di termine, e nessuno puo' scriverla a mano. E' la regola giusta — una
-- scadenza dichiarata che non torna con i suoi termini e' un piccolo bugiardo
-- che nessuno rilegge — e vale anche per una fattura del 2023.
--
-- Qui la si smette di passare all'insert. Resta calcolata sul posto per un
-- uso solo: sapere a quale data registrare l'incasso quando chi importa non ne
-- indica una.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.fn_importa_fattura_storica(
  p_number             text,
  p_issuer_contact_id  uuid,
  p_issue_date         date,
  p_total              numeric,
  p_client_contact_id  uuid    default null,
  p_currency           text    default 'EUR',
  p_exch_rate          numeric default 1,
  p_vat_amount         numeric default 0,
  p_payment_terms_days integer default 30,
  p_notes              text    default null,
  p_documento_path     text    default null,
  p_estrazione         jsonb   default null,
  p_incassata          boolean default true,
  p_data_incasso       date    default null
)
returns public.invoices
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_riga public.invoices;
  v_numero text := nullif(btrim(coalesce(p_number, '')), '');
  v_scadenza date;
  v_quando date;
begin
  if not coalesce(public.is_admin(auth.uid()), false) then
    raise exception 'Solo l''amministrazione puo'' importare fatture';
  end if;

  if v_numero is null then
    raise exception 'Una fattura importata deve portare il numero che aveva gia''';
  end if;
  if p_issue_date is null then
    raise exception 'Serve la data di emissione';
  end if;
  if p_total is null or p_total < 0 then
    raise exception 'Il totale non puo'' essere negativo';
  end if;

  if exists (
    select 1 from public.invoices
     where issuer_contact_id = p_issuer_contact_id and number = v_numero
  ) then
    raise exception 'La fattura % di questa societa'' e'' gia'' nel registro', v_numero
      using errcode = 'unique_violation';
  end if;

  -- Non si scrive: `due_date` e' generata. Serve solo come data di ripiego per
  -- l'incasso, quando chi importa non sa dire quando e' arrivato il bonifico.
  v_scadenza := p_issue_date + coalesce(p_payment_terms_days, 30);

  insert into public.invoices (
    number, issuer_contact_id, client_contact_id, currency, exch_rate,
    total, vat_amount, issue_date, payment_terms_days,
    lifecycle_state, notes, origine, documento_path, estrazione, created_by
  ) values (
    v_numero, p_issuer_contact_id, p_client_contact_id,
    coalesce(p_currency, 'EUR'), coalesce(p_exch_rate, 1),
    p_total, coalesce(p_vat_amount, 0), p_issue_date,
    coalesce(p_payment_terms_days, 30),
    case when p_incassata then 'closed' else 'issued' end,
    p_notes, 'importata', p_documento_path, p_estrazione, auth.uid()
  ) returning * into v_riga;

  if p_incassata and p_total > 0 then
    -- L'incasso e' una riga vera, non un campo: e' cosi' che il residuo si
    -- calcola invece di essere dichiarato, e vale anche per le vecchie.
    v_quando := coalesce(p_data_incasso, v_scadenza);
    insert into public.invoice_payments (invoice_id, date, amount, method, bank_ref)
    values (v_riga.id, v_quando, p_total, 'import',
            'Incasso ricostruito all''importazione dello storico');
  end if;

  return v_riga;
end;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Una fattura senza intestatario non si emette
--
-- La prova ha emesso una fattura con `cliente = NULL`. Non per un difetto di
-- codice: perche' **1.545 progetti su 1.548 non hanno un intestatario di
-- fatturazione registrato**, e dei 77 che hanno tranche, 53 non hanno nemmeno
-- il nome del cliente scritto da qualche parte. Dei 24 restanti, nessun nome
-- trova un contatto in anagrafica.
--
-- Quindi l'intestatario non si deduce: si chiede. E se non arriva, la fattura
-- non nasce — un documento intestato a nessuno non e' una fattura, e' una riga
-- che qualcuno dovra' correggere dopo, quando non si ricordera' piu' a chi
-- andava.
--
-- Una cosa in piu': quando l'intestatario viene scelto per un progetto che non
-- ne aveva uno, lo si **scrive sul progetto**. Non e' un dato nuovo — e' la
-- stessa scelta, registrata dove serve la prossima volta. Cosi' il buco dei
-- 1.545 si chiude fatturando, non con una campagna di inserimento dati.
--
-- Questo file porta il corpo definitivo di `fn_emetti_fattura_righe`: comprende
-- il controllo «tranche già fatturata» di 20260930160904 e la correzione di
-- colonna di 20260930161000.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.fn_emetti_fattura_righe(
  p_issuer_contact_id uuid,
  p_righe jsonb,
  p_issue_date date,
  p_payment_terms_days integer default 30,
  p_client_contact_id uuid default null,
  p_currency text default 'EUR',
  p_exch_rate numeric default 1,
  p_vat_amount numeric default 0,
  p_external_number text default null,
  p_po_riferimento text default null,
  p_notes text default null
)
returns public.invoices
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_riga public.invoices;
  v_numero text;
  v_imponibile numeric := 0;
  v_progetto uuid;
  v_progetti integer;
  v_clienti integer;
  v_cliente uuid;
  v_gia text;
  r jsonb;
  i integer := 0;
begin
  if not coalesce(public.is_admin(auth.uid()), false) then
    raise exception 'Solo l''amministrazione puo'' emettere fatture';
  end if;
  if p_issue_date is null then
    raise exception 'Serve la data di emissione: la scadenza si calcola da li''';
  end if;
  if p_righe is null or jsonb_array_length(p_righe) = 0 then
    raise exception 'Una fattura senza righe non dice cosa si sta fatturando';
  end if;

  -- Le righe si leggono prima di scrivere qualsiasi cosa: se una non torna,
  -- non deve restare a meta' una fattura senza le sue righe.
  for r in select jsonb_array_elements(p_righe) loop
    if nullif(btrim(coalesce(r->>'descrizione', '')), '') is null then
      raise exception 'Ogni riga deve dire cosa e'': manca la descrizione';
    end if;
    if (r->>'importo') is null or (r->>'importo')::numeric < 0 then
      raise exception 'Riga «%»: importo mancante o negativo', r->>'descrizione';
    end if;
    v_imponibile := v_imponibile + (r->>'importo')::numeric;
  end loop;

  -- Una tranche gia' su una fattura non si rifattura: la fattura esiste, va
  -- cercata. Nome della tranche e del progetto nel messaggio, perche' chi lo
  -- legge deve poter andare a vedere quale.
  select string_agg(format('«%s» (%s)', coalesce(m.name, '?'), coalesce(c.name, '?')), ', ')
    into v_gia
    from jsonb_array_elements(p_righe) x
    join public.cert_payment_milestones m on m.id = (x->>'tranche_id')::uuid
    join public.certifications c on c.id = m.certification_id
   where exists (select 1 from public.invoice_righe ir where ir.tranche_id = m.id);

  if v_gia is not null then
    raise exception 'Gia'' fatturato: %', v_gia;
  end if;

  -- Righe di clienti diversi sulla stessa fattura: non e' un caso da gestire,
  -- e' un errore da dire. Una fattura ha un intestatario solo.
  select count(distinct coalesce(c.billing_contact_id, '00000000-0000-0000-0000-000000000000'::uuid)),
         count(distinct m.certification_id)
    into v_clienti, v_progetti
    from jsonb_array_elements(p_righe) x
    join public.cert_payment_milestones m on m.id = (x->>'tranche_id')::uuid
    join public.certifications c on c.id = m.certification_id;

  if coalesce(v_clienti, 0) > 1 then
    raise exception 'Le righe scelte appartengono a clienti diversi: una fattura ha un intestatario solo';
  end if;

  -- Se il progetto sa a chi si intesta, non c'e' motivo di richiederlo. Quasi
  -- mai lo sa: quasi sempre arriva da chi sta fatturando.
  v_cliente := p_client_contact_id;
  if v_cliente is null then
    select c.billing_contact_id into v_cliente
      from jsonb_array_elements(p_righe) x
      join public.cert_payment_milestones m on m.id = (x->>'tranche_id')::uuid
      join public.certifications c on c.id = m.certification_id
     where c.billing_contact_id is not null
     limit 1;
  end if;

  if v_cliente is null then
    raise exception 'Manca l''intestatario: una fattura va intestata a qualcuno';
  end if;

  if not exists (select 1 from public.contacts where id = v_cliente) then
    raise exception 'L''intestatario indicato non e'' in anagrafica';
  end if;

  if coalesce(v_progetti, 0) = 1 then
    select m.certification_id into v_progetto
      from jsonb_array_elements(p_righe) x
      join public.cert_payment_milestones m on m.id = (x->>'tranche_id')::uuid
     limit 1;
  end if;

  v_numero := public.fn_nuovo_numero_fattura(p_issuer_contact_id);

  insert into public.invoices (
    number, external_number, issuer_contact_id, client_contact_id, certification_id,
    currency, exch_rate, total, vat_amount, issue_date, payment_terms_days,
    lifecycle_state, po_riferimento, notes, created_by
  ) values (
    v_numero, nullif(btrim(coalesce(p_external_number, '')), ''), p_issuer_contact_id,
    v_cliente, v_progetto,
    coalesce(p_currency, 'EUR'), coalesce(p_exch_rate, 1),
    v_imponibile + coalesce(p_vat_amount, 0), coalesce(p_vat_amount, 0),
    p_issue_date, coalesce(p_payment_terms_days, 30),
    'issued', nullif(btrim(coalesce(p_po_riferimento, '')), ''), p_notes, auth.uid()
  ) returning * into v_riga;

  for r in select jsonb_array_elements(p_righe) loop
    i := i + 1;
    insert into public.invoice_righe (invoice_id, tranche_id, descrizione, importo, ordine)
    values (v_riga.id, nullif(r->>'tranche_id', '')::uuid,
            btrim(r->>'descrizione'), (r->>'importo')::numeric, i);
  end loop;

  -- La scelta appena fatta resta sul progetto, se il progetto non ne aveva una.
  -- Non e' un dato nuovo: e' lo stesso intestatario, scritto dove serve la
  -- prossima volta. Solo quando la fattura riguarda un progetto solo — con due
  -- progetti non si sa a quale attribuirlo.
  if v_progetto is not null then
    update public.certifications
       set billing_contact_id = v_cliente
     where id = v_progetto and billing_contact_id is null;
  end if;

  return v_riga;
end;
$function$;

comment on function public.fn_emetti_fattura_righe(uuid, jsonb, date, integer, uuid, text, numeric, numeric, text, text, text) is
  'Emette una fattura con le sue righe. Controlla tutto prima di scrivere: descrizioni, importi, tranche libere, un cliente solo, un intestatario. Il progetto si scrive solo quando le righe parlano tutte dello stesso.';

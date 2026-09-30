-- ═══════════════════════════════════════════════════════════════════════════
-- Emettere una fattura con le sue righe
--
-- `fn_emetti_fattura` prendeva un totale e una tranche. Ora prende le righe, e
-- il totale lo somma da loro: e' l'unico modo perche' il documento e il
-- registro dicano la stessa cosa, visto che il documento le righe le stampa.
--
-- Le righe arrivano come JSON perche' sono un numero variabile di cose, non
-- perche' siano un dato informe: la funzione le legge campo per campo e
-- rifiuta quello che non torna.
--
-- ── DUE COSE CHE LA FUNZIONE DECIDE DA SÉ ─────────────────────────────────
-- Il PROGETTO della fattura: se tutte le righe vengono dallo stesso progetto e'
-- quello; se vengono da progetti diversi — Apple Lead e Apple Brian sulla
-- stessa fattura — resta nullo, e il legame vive sulle righe. Metterci il primo
-- a caso vorrebbe dire attribuire a un progetto i soldi di un altro.
--
-- L'INTESTATARIO no: quello lo si conferma, e la funzione rifiuta righe di
-- clienti diversi. Una fattura ha un intestatario solo, e non e' una cosa che
-- si deduce — e' una cosa che si controlla.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.fn_emetti_fattura_righe(
  p_issuer_contact_id  uuid,
  p_righe              jsonb,     -- [{tranche_id?, descrizione, importo}]
  p_issue_date         date,
  p_payment_terms_days integer default 30,
  p_client_contact_id  uuid    default null,
  p_currency           text    default 'EUR',
  p_exch_rate          numeric default 1,
  p_vat_amount         numeric default 0,
  p_external_number    text    default null,
  p_po_riferimento     text    default null,
  p_notes              text    default null
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
    p_client_contact_id, v_progetto,
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

  return v_riga;
end;
$function$;

comment on function public.fn_emetti_fattura_righe is
  'Emette una fattura dalle sue righe. Il totale e'' la loro somma piu'' l''IVA: il documento stampa le righe, e il registro non puo'' dire un''altra cifra.';

revoke all on function public.fn_emetti_fattura_righe(
  uuid, jsonb, date, integer, uuid, text, numeric, numeric, text, text, text
) from anon;
grant execute on function public.fn_emetti_fattura_righe(
  uuid, jsonb, date, integer, uuid, text, numeric, numeric, text, text, text
) to authenticated;
-- Payments — le formule del residuo, verificate sui casi che contano.
--
-- La matematica del residuo e' il cuore del modulo: Recall, Insoluti, i KPI
-- della dashboard e il previsionale sono tutti somme di questo numero. Se
-- sbaglia qui, sbaglia ovunque e nello stesso modo, il che e' il tipo di errore
-- che nessuno nota finche' non lo nota un cliente.
--
-- Si esegue per intero: scrive le fixture, le legge dalla vista, confronta con i
-- valori attesi e poi ANNULLA TUTTO sollevando un'eccezione. Non lascia righe
-- nel database, quindi si puo' lanciare anche in produzione.
--
--   supabase db execute --file supabase/tests/payments_formule.sql
--   (oppure incollarlo nell'SQL editor)
--
-- Esito atteso: un'eccezione che dice «TUTTI I CASI OK». Qualunque altro
-- messaggio e' un test fallito, e dice quale.

do $$
declare
  v_uk uuid;
  v_a uuid; v_b uuid; v_c uuid; v_d uuid; v_e uuid;
  -- Gli errori si accumulano invece di fermare il test al primo: un solo giro
  -- mostra tutti i casi rotti, non solo quello che capita per primo.
  v_errori text := '';
begin
  select id into v_uk from public.contacts where kind = 'issuer' and entity_code = 'uk';
  if v_uk is null then
    raise exception 'Manca la societa'' emittente UK: impossibile eseguire il test';
  end if;

  -- ── 1 · saldata ────────────────────────────────────────────────────────────
  insert into public.invoices (number, issuer_contact_id, currency, total, issue_date, payment_terms_days)
  values ('TEST-1', v_uk, 'EUR', 10000, current_date - 60, 30) returning id into v_a;
  insert into public.invoice_payments (invoice_id, date, amount)
  values (v_a, current_date - 10, 10000);

  -- ── 2 · parziale, due incassi ──────────────────────────────────────────────
  insert into public.invoices (number, issuer_contact_id, currency, total, issue_date, payment_terms_days)
  values ('TEST-2', v_uk, 'EUR', 20000, current_date - 60, 30) returning id into v_b;
  insert into public.invoice_payments (invoice_id, date, amount)
  values (v_b, current_date - 20, 5000), (v_b, current_date - 5, 7000);

  -- ── 3 · parziale + nota di credito (il caso Miu Miu del canvas) ────────────
  insert into public.invoices (number, issuer_contact_id, currency, total, issue_date, payment_terms_days)
  values ('TEST-3', v_uk, 'EUR', 18400, current_date - 90, 30) returning id into v_c;
  insert into public.invoice_payments (invoice_id, date, amount)
  values (v_c, current_date - 30, 4000);
  insert into public.credit_notes (number, invoice_id, date, amount, kind, state)
  values ('NC-TEST-1', v_c, current_date - 20, 2000, 'partial', 'issued');

  -- ── 4 · stornata interamente da NC ─────────────────────────────────────────
  insert into public.invoices (number, issuer_contact_id, currency, total, issue_date, payment_terms_days)
  values ('TEST-4', v_uk, 'EUR', 5000, current_date - 40, 30) returning id into v_d;
  insert into public.credit_notes (number, invoice_id, date, amount, kind, state)
  values ('NC-TEST-2', v_d, current_date - 10, 5000, 'total', 'issued');

  -- ── 5 · una NC in bozza non tocca niente ───────────────────────────────────
  insert into public.invoices (number, issuer_contact_id, currency, total, issue_date, payment_terms_days)
  values ('TEST-5', v_uk, 'EUR', 1000, current_date - 5, 30) returning id into v_e;
  insert into public.credit_notes (number, invoice_id, date, amount, kind, state)
  values ('NC-TEST-3', v_e, current_date, 400, 'partial', 'draft');

  -- ── I controlli ────────────────────────────────────────────────────────────
  -- Saldata: residuo zero e stato «paid», non «credited»: l'ha pagata qualcuno.
  if (select residual from public.v_invoices where id = v_a) <> 0
     or (select payment_status from public.v_invoices where id = v_a) <> 'paid' then
    v_errori := v_errori || '1(saldata) ';
  end if;

  -- Due incassi si sommano: 20.000 − 12.000.
  if (select residual from public.v_invoices where id = v_b) <> 8000
     or (select payment_status from public.v_invoices where id = v_b) <> 'partial' then
    v_errori := v_errori || '2(due incassi) ';
  end if;

  -- Incasso e nota di credito si sottraggono entrambi: 18.400 − 4.000 − 2.000.
  if (select residual from public.v_invoices where id = v_c) <> 12400
     or (select payment_status from public.v_invoices where id = v_c) <> 'partial' then
    v_errori := v_errori || '3(parziale+NC) ';
  end if;

  -- Chiusa da NC: residuo zero ma stato «credited». La differenza conta — nel
  -- primo caso sono entrati soldi, qui no.
  if (select residual from public.v_invoices where id = v_d) <> 0
     or (select payment_status from public.v_invoices where id = v_d) <> 'credited' then
    v_errori := v_errori || '4(stornata) ';
  end if;

  -- Bozza ignorata: il residuo resta pieno.
  if (select residual from public.v_invoices where id = v_e) <> 1000
     or (select payment_status from public.v_invoices where id = v_e) <> 'unpaid' then
    v_errori := v_errori || '5(NC bozza) ';
  end if;

  -- La scadenza si calcola dall'emissione reale, non da altro.
  if (select due_date from public.v_invoices where id = v_a) <> (current_date - 30) then
    v_errori := v_errori || '6(scadenza) ';
  end if;

  -- Una fattura saldata non e' in ritardo, anche se e' stata pagata tardi.
  if (select days_late from public.v_invoices where id = v_a) <> 0 then
    v_errori := v_errori || '7(ritardo su saldata) ';
  end if;

  -- Una scaduta e non pagata sì.
  if (select days_late from public.v_invoices where id = v_b) <> 30 then
    v_errori := v_errori || '8(giorni di ritardo) ';
  end if;

  -- La funzione usata dalle validazioni deve dire lo stesso numero della vista:
  -- sono due porte sulla stessa formula, non due formule.
  if public.fn_residuo_fattura(v_c) <> 12400 then
    v_errori := v_errori || '9(fn_residuo_fattura) ';
  end if;

  if v_errori = '' then
    raise exception 'TUTTI I CASI OK — nessuna riga scritta (transazione annullata)';
  else
    raise exception 'CASI FALLITI: %', v_errori;
  end if;
end $$;

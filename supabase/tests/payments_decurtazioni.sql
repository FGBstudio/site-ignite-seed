-- Payments — gli ammanchi: il residuo che non arriverà da quel bonifico.
--
-- Una decurtazione NON riduce il residuo: lo classifica. Diciannove euro e
-- cinquanta trattenuti dalla banca del cliente restano da incassare su quella
-- fattura — perché non sono arrivati — e vanno riversati sulla fattura
-- successiva dello stesso progetto a compensazione.
--
-- Il rischio del meccanismo è duplice, e i casi qui sotto lo escludono: che
-- l'ammanco finisca sommato a `paid_amount`, facendo credere di avere in banca
-- soldi che nessuno ha visto; e che sparisca dal residuo, facendo dire a una
-- fattura «Chiusa» quando chiusa non è.
--
-- Si esegue per intero: scrive le fixture, le legge dalla vista, confronta con i
-- valori attesi e poi ANNULLA TUTTO sollevando un'eccezione. Non lascia righe
-- nel database, quindi si può lanciare anche in produzione.
--
--   supabase db execute --file supabase/tests/payments_decurtazioni.sql
--   (oppure incollarlo nell'SQL editor)
--
-- Esito atteso: un'eccezione che dice «TUTTI I CASI OK». Qualunque altro
-- messaggio è un test fallito, e dice quale.

do $$
declare
  v_uk uuid;
  v_a uuid; v_b uuid; v_c uuid; v_d uuid;
  v_errori text := '';
  v_esploso boolean;
begin
  select id into v_uk from public.contacts where kind = 'issuer' and entity_code = 'uk';
  if v_uk is null then
    raise exception 'Manca la societa'' emittente UK: impossibile eseguire il test';
  end if;

  -- ── 1 · il caso Kuala Lumpur: incasso quasi pieno, il resto è un ammanco ──
  insert into public.invoices (number, issuer_contact_id, currency, total, issue_date, payment_terms_days)
  values ('TEST-D1', v_uk, 'EUR', 4980, current_date - 400, 31) returning id into v_a;
  insert into public.invoice_payments (invoice_id, date, amount)
  values (v_a, current_date - 200, 4960.50);
  insert into public.invoice_decurtazioni (invoice_id, date, amount, causale)
  values (v_a, current_date - 200, 19.50, 'spese_bancarie');

  -- ── 2 · una fattura con residuo grande e una classificazione parziale ─────
  insert into public.invoices (number, issuer_contact_id, currency, total, issue_date, payment_terms_days)
  values ('TEST-D2', v_uk, 'EUR', 10000, current_date - 90, 30) returning id into v_b;
  insert into public.invoice_payments (invoice_id, date, amount)
  values (v_b, current_date - 40, 6000);
  insert into public.invoice_decurtazioni (invoice_id, date, amount, causale)
  values (v_b, current_date - 40, 500, 'differenza_cambio');

  -- ── 3 · un assorbito: perdita accettata, nessun credito da riportare ──────
  insert into public.invoices (number, issuer_contact_id, currency, total, issue_date, payment_terms_days)
  values ('TEST-D3', v_uk, 'EUR', 1000, current_date - 100, 30) returning id into v_c;
  insert into public.invoice_payments (invoice_id, date, amount)
  values (v_c, current_date - 50, 999.98);
  insert into public.invoice_decurtazioni (invoice_id, date, amount, causale, destino)
  values (v_c, current_date - 50, 0.02, 'arrotondamento', 'assorbito');

  /* ── Le verifiche ─────────────────────────────────────────────────────── */

  -- 1 · il residuo TIENE l'ammanco: quei soldi non sono arrivati.
  if (select residual from public.v_invoices where id = v_a) <> 19.50 then
    v_errori := v_errori || '1(residuo azzerato dall ammanco) ';
  end if;
  -- E l'incassato non lo comprende: in banca sono entrati 4.960,50, non 4.980.
  if (select paid_amount from public.v_invoices where id = v_a) <> 4960.50 then
    v_errori := v_errori || '1(incassato inquinato dall ammanco) ';
  end if;
  if (select ammanco_da_recuperare from public.v_invoices where id = v_a) <> 19.50 then
    v_errori := v_errori || '1(ammanco non segnalato) ';
  end if;
  -- Non è chiusa, e non deve esserlo: è la bugia da cui è nato tutto questo.
  if (select lifecycle_state from public.v_invoices where id = v_a) = 'closed' then
    v_errori := v_errori || '1(chiusa con residuo aperto) ';
  end if;
  if (select payment_status from public.v_invoices where id = v_a) <> 'partial' then
    v_errori := v_errori || '1(stato pagamento) ';
  end if;

  -- 2 · classificare una parte non tocca il residuo, che resta 10.000 − 6.000.
  if (select residual from public.v_invoices where id = v_b) <> 4000 then
    v_errori := v_errori || '2(residuo alterato dalla classificazione) ';
  end if;
  if (select ammanco_da_recuperare from public.v_invoices where id = v_b) <> 500 then
    v_errori := v_errori || '2(ammanco parziale) ';
  end if;
  if (select days_late from public.v_invoices where id = v_b) <> 60 then
    v_errori := v_errori || '2(giorni di ritardo) ';
  end if;

  -- 3 · un assorbito è classificato ma non è un credito da riportare.
  if (select decurtato_amount from public.v_invoices where id = v_c) <> 0.02 then
    v_errori := v_errori || '3(decurtato) ';
  end if;
  if (select ammanco_da_recuperare from public.v_invoices where id = v_c) <> 0 then
    v_errori := v_errori || '3(assorbito conta come da recuperare) ';
  end if;

  -- 4 · il default è recuperare. Un default che perde denaro è sbagliato: se
  --     qualcuno deve fare uno sforzo, che lo faccia per rinunciare.
  if (select destino from public.invoice_decurtazioni where invoice_id = v_a) <> 'da_recuperare' then
    v_errori := v_errori || '4(il default assorbe) ';
  end if;

  -- 5 · non si classifica più di quanto è aperto.
  v_esploso := false;
  begin
    insert into public.invoice_decurtazioni (invoice_id, date, amount, causale)
    values (v_a, current_date, 99999, 'spese_bancarie');
  exception when others then
    v_esploso := true;
  end;
  if not v_esploso then
    v_errori := v_errori || '5(classificato oltre il residuo) ';
  end if;

  -- 6 · e nemmeno più di quanto resta dopo le classificazioni già scritte.
  --     Su TEST-D1 il residuo è 19,50 ed è già tutto classificato: un altro
  --     centesimo non ci sta.
  v_esploso := false;
  begin
    insert into public.invoice_decurtazioni (invoice_id, date, amount, causale)
    values (v_a, current_date, 0.01, 'arrotondamento');
  exception when others then
    v_esploso := true;
  end;
  if not v_esploso then
    v_errori := v_errori || '6(classificato due volte lo stesso residuo) ';
  end if;

  -- 7 · «altro» senza nota non è una causale: fra un anno quella riga dovrà
  --     ancora dire perché quei soldi non sono arrivati.
  v_esploso := false;
  begin
    insert into public.invoice_decurtazioni (invoice_id, date, amount, causale)
    values (v_b, current_date, 10, 'altro');
  exception when others then
    v_esploso := true;
  end;
  if not v_esploso then
    v_errori := v_errori || '7(altro senza nota accettato) ';
  end if;

  -- 8 · recuperato davvero: l'ammanco smette di essere aperto, ma il residuo
  --     della fattura vecchia non cambia — quel documento resta com'è, e a
  --     chiuderlo sarà l'incasso della nuova.
  insert into public.invoices (number, issuer_contact_id, currency, total, issue_date, payment_terms_days)
  values ('TEST-D4', v_uk, 'EUR', 3339.50, current_date - 5, 30) returning id into v_d;
  update public.invoice_decurtazioni set recuperato_con = v_d where invoice_id = v_a;
  if (select ammanco_da_recuperare from public.v_invoices where id = v_a) <> 0 then
    v_errori := v_errori || '8(recuperato resta aperto) ';
  end if;
  if (select residual from public.v_invoices where id = v_a) <> 19.50 then
    v_errori := v_errori || '8(il recupero ha mosso il residuo) ';
  end if;

  -- 9 · un assorbito non può portare il documento che lo ha recuperato: sarebbe
  --     un destino che contraddice i suoi stessi fatti.
  v_esploso := false;
  begin
    update public.invoice_decurtazioni set destino = 'assorbito' where invoice_id = v_a;
  exception when others then
    v_esploso := true;
  end;
  if not v_esploso then
    v_errori := v_errori || '9(assorbito con recupero accettato) ';
  end if;

  -- 10 · togliere la classificazione non muove il residuo: classificare non
  --      era una sottrazione, e smettere non è un'addizione.
  delete from public.invoice_decurtazioni where invoice_id = v_b;
  if (select residual from public.v_invoices where id = v_b) <> 4000 then
    v_errori := v_errori || '10(residuo mosso dalla cancellazione) ';
  end if;
  if (select ammanco_da_recuperare from public.v_invoices where id = v_b) <> 0 then
    v_errori := v_errori || '10(ammanco sopravvive alla cancellazione) ';
  end if;

  -- 11 · le due porte sulla stessa formula dicono lo stesso numero.
  if public.fn_residuo_fattura(v_b) <> 4000 then
    v_errori := v_errori || '11(fn_residuo_fattura) ';
  end if;

  if v_errori = '' then
    raise exception 'TUTTI I CASI OK — nessuna riga scritta (transazione annullata)';
  else
    raise exception 'CASI FALLITI: %', v_errori;
  end if;
end $$;

-- Payments — le note di credito, sui criteri della fase 5.
--
-- Verifica che una nota parziale riduca il residuo lasciando la fattura aperta,
-- che una totale chiuda entrambe, e che una nota piu' alta del residuo venga
-- rifiutata dal database — non dal modulo, che qualcuno potrebbe aggirare.
--
-- Annulla tutto: esito atteso «FASE 5: TUTTI I CRITERI OK».

do $$
declare
  v_admin uuid; v_uk uuid; v_inv uuid; v_nc public.credit_notes;
  v_err text := ''; v_msg text; v_res numeric;
begin
  select ur.user_id into v_admin from user_roles ur where upper(ur.role::text) = 'ADMIN' limit 1;
  select id into v_uk from contacts where kind = 'issuer' and entity_code = 'uk';
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  insert into invoices (number, issuer_contact_id, total, issue_date, payment_terms_days, lifecycle_state)
  values ('TEST-F5', v_uk, 10000, current_date - 10, 30, 'issued') returning id into v_inv;

  -- ── 1 · Parziale: riduce il residuo, la fattura resta aperta ──────────────
  v_nc := public.fn_emetti_nota_credito(v_inv, 3000, 'partial', 'Storno parziale');
  select residual into v_res from v_invoices where id = v_inv;
  if v_res <> 7000 then v_err := v_err || '1a(residuo ' || v_res || ') '; end if;
  if (select lifecycle_state from invoices where id = v_inv) <> 'issued' then
    v_err := v_err || '1b(chiusa troppo presto) '; end if;
  if v_nc.number !~ '^NC-UK-\d{4}-\d{4}$' then
    v_err := v_err || '1c(numero: ' || v_nc.number || ') '; end if;

  -- ── 2 · Oltre il residuo: rifiutata dal database ──────────────────────────
  begin
    perform public.fn_emetti_nota_credito(v_inv, 8000, 'partial', 'troppo');
    v_err := v_err || '2(eccedenza accettata) ';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if position('residuo' in v_msg) = 0 then v_err := v_err || '2(messaggio: ' || v_msg || ') '; end if;
  end;

  -- ── 3 · Una «totale» che non copre tutto non e' una totale ───────────────
  begin
    perform public.fn_emetti_nota_credito(v_inv, 100, 'total', 'finta totale');
    v_err := v_err || '3(totale parziale accettata) ';
  exception when others then null; end;

  -- ── 4 · Una bozza non tocca nessun aggregato ──────────────────────────────
  v_nc := public.fn_emetti_nota_credito(v_inv, 7000, 'total', 'bozza', null, true);
  select residual into v_res from v_invoices where id = v_inv;
  if v_res <> 7000 then v_err := v_err || '4a(la bozza ha inciso: ' || v_res || ') '; end if;
  if v_nc.state <> 'draft' then v_err := v_err || '4b(stato) '; end if;

  -- ── 5 · Emessa la bozza: numero, residuo a zero, fattura chiusa ──────────
  v_nc := public.fn_emetti_bozza_nota_credito(v_nc.id);
  if v_nc.number !~ '^NC-UK-' then v_err := v_err || '5a(numero: ' || v_nc.number || ') '; end if;
  select residual into v_res from v_invoices where id = v_inv;
  if v_res <> 0 then v_err := v_err || '5b(residuo ' || v_res || ') '; end if;
  if (select lifecycle_state from invoices where id = v_inv) <> 'closed' then
    v_err := v_err || '5c(non chiusa) '; end if;
  -- «credited» e non «paid»: la differenza e' che qui non e' entrato un euro.
  if (select payment_status from v_invoices where id = v_inv) <> 'credited' then
    v_err := v_err || '5d(stato pagamento) '; end if;

  if v_err = '' then
    raise exception 'FASE 5: TUTTI I CRITERI OK (transazione annullata)';
  else
    raise exception 'FASE 5 FALLITA: %', v_err;
  end if;
end $$;

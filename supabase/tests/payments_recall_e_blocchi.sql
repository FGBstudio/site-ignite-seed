-- Payments — solleciti, blocco e sblocco, sui criteri della fase 4.
--
-- Verifica che il blocco per insoluto usi `on_hold` (uno stato solo, con la
-- causa dichiarata), che il PM veda il progetto in sola lettura, che lo sblocco
-- riporti il progetto dov'era, e che un credito rientrato lo faccia ripartire
-- senza che nessuno se ne debba ricordare.
--
-- Annulla tutto: esito atteso «FASE 4: TUTTI I CRITERI OK».

do $$
declare
  v_admin uuid; v_pm uuid; v_uk uuid; v_cert uuid; v_inv uuid;
  v_err text := ''; v_msg text; v_stato_prima text; v_cert_rec record;
begin
  select ur.user_id into v_admin from user_roles ur where upper(ur.role::text) = 'ADMIN' limit 1;
  select id into v_uk from contacts where kind = 'issuer' and entity_code = 'uk';
  select id, status into v_cert, v_stato_prima
    from certifications where status = 'in_corso' and not coalesce(on_hold, false) limit 1;
  select pm_id into v_pm from certifications where id = v_cert;
  if v_cert is null then raise exception 'Serve una commessa in corso non ferma'; end if;

  -- Da qui si agisce come amministrazione: le funzioni lo pretendono.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  insert into invoices (number, issuer_contact_id, certification_id, total, issue_date,
                        payment_terms_days, lifecycle_state)
  values ('TEST-F4', v_uk, v_cert, 20000, current_date - 90, 30, 'in_recall') returning id into v_inv;
  update invoices set recall_status = 'red' where id = v_inv;

  -- ── 1 · Il sollecito si conta sulla fattura ───────────────────────────────
  perform public.fn_registra_sollecito(v_inv, 'email', 'Primo sollecito', current_date + 7);
  if (select reminders_count from invoices where id = v_inv) <> 1 then
    v_err := v_err || '1a(contatore) '; end if;
  if (select last_reminder_date from invoices where id = v_inv) <> current_date then
    v_err := v_err || '1b(data ultimo) '; end if;

  -- ── 2 · Il blocco e' on_hold, con causa e memoria di dove si era ──────────
  perform public.fn_blocca_per_insoluto(v_inv, 'Nessuna risposta ai solleciti');
  select * into v_cert_rec from certifications where id = v_cert;
  if not v_cert_rec.on_hold then v_err := v_err || '2a(non on_hold) '; end if;
  if v_cert_rec.on_hold_cause <> 'unpaid' then v_err := v_err || '2b(causa) '; end if;
  if v_cert_rec.on_hold_previous_status <> v_stato_prima then v_err := v_err || '2c(stato precedente) '; end if;
  if (select lifecycle_state from invoices where id = v_inv) <> 'blocked' then
    v_err := v_err || '2d(fattura non bloccata) '; end if;
  if not exists (select 1 from task_alerts
                  where dedup_key = 'blocco_insoluto:' || v_cert::text and not is_resolved) then
    v_err := v_err || '2e(alert) '; end if;

  -- ── 3 · Il PM vede, non tocca ─────────────────────────────────────────────
  if v_pm is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_pm, 'role','authenticated')::text, true);
    begin
      update certifications set name = name || '' where id = v_cert;
      v_err := v_err || '3(il PM ha potuto modificare) ';
    exception when others then null; end;
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role','authenticated')::text, true);
  end if;

  -- ── 4 · Lo sblocco riporta dov'era, e non cancella la memoria ─────────────
  perform public.fn_sblocca_progetto(v_cert);
  select * into v_cert_rec from certifications where id = v_cert;
  if v_cert_rec.on_hold then v_err := v_err || '4a(ancora fermo) '; end if;
  if v_cert_rec.status <> v_stato_prima then
    v_err := v_err || '4b(stato non ripristinato: ' || v_cert_rec.status || ') '; end if;
  if v_cert_rec.on_hold_reason is null then v_err := v_err || '4c(storico perso) '; end if;
  if (select lifecycle_state from invoices where id = v_inv) <> 'in_recall' then
    v_err := v_err || '4d(fattura non tornata in recall) '; end if;

  -- ── 5 · Il credito che rientra fa ripartire tutto da solo ─────────────────
  perform public.fn_blocca_per_insoluto(v_inv, 'di nuovo');
  insert into invoice_payments (invoice_id, date, amount) values (v_inv, current_date, 20000);
  select * into v_cert_rec from certifications where id = v_cert;
  if v_cert_rec.on_hold then v_err := v_err || '5a(non sbloccato dall''incasso) '; end if;
  if (select lifecycle_state from invoices where id = v_inv) <> 'closed' then
    v_err := v_err || '5b(fattura non chiusa) '; end if;

  -- ── 6 · Su chi ha pagato non si sollecita ─────────────────────────────────
  begin
    perform public.fn_registra_sollecito(v_inv, 'email', null, null);
    v_err := v_err || '6(sollecito su saldata accettato) ';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if position('residuo' in v_msg) = 0 then v_err := v_err || '6(messaggio: ' || v_msg || ') '; end if;
  end;

  if v_err = '' then
    raise exception 'FASE 4: TUTTI I CRITERI OK (transazione annullata)';
  else
    raise exception 'FASE 4 FALLITA: %', v_err;
  end if;
end $$;

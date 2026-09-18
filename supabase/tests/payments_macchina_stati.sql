-- Payments — la macchina a stati, provata sui criteri di accettazione.
--
-- Verifica la catena intera: quotazione approvata → anticipo esigibile →
-- milestone chiusa dal PM → tranche da emettere → fattura → scadenza → recall →
-- bonifico disposto → giallo scaduto → incasso → chiusura.
--
-- Usa dati veri (la prima quotazione che trova) e ANNULLA TUTTO sollevando
-- un'eccezione alla fine: non lascia righe, si puo' lanciare anche in
-- produzione. Esito atteso: «FASE 2: TUTTI I CRITERI OK».
--
--   supabase db execute --file supabase/tests/payments_macchina_stati.sql

do $$
declare
  v_cert uuid; v_uk uuid; v_step uuid; v_tr uuid; v_ms uuid; v_inv uuid; v_cat text;
  v_err text := ''; v_n integer; v_stato text; v_recall text;
begin
  select id into v_uk from contacts where kind = 'issuer' and entity_code = 'uk';
  select id into v_step from cert_timeline_steps limit 1;
  select category into v_cat from certification_milestones where category is not null limit 1;
  select id into v_cert from certifications where status = 'quotation' and site_id is not null limit 1;
  if v_cert is null or v_uk is null then
    raise exception 'Mancano i dati minimi per il test (una quotazione e la societa'' UK)';
  end if;

  -- ── 1 · Quotazione approvata: l'anticipo diventa esigibile ────────────────
  insert into cert_payment_milestones
    (certification_id, name, amount, tranche_pct, tranche_order, trigger_event, tranche_state)
  values (v_cert, 'Anticipo 30%', 30000, 30, 1, 'quotation_signed', 'pending') returning id into v_tr;

  update certifications set status = 'quotation_approved' where id = v_cert;

  if (select tranche_state from cert_payment_milestones where id = v_tr) <> 'due' then
    v_err := v_err || '1a(anticipo non esigibile) '; end if;
  if not exists (select 1 from task_alerts
                  where dedup_key = 'quotation_to_payments:' || v_cert::text and not is_resolved) then
    v_err := v_err || '1b(alert quotazione mancante) '; end if;

  -- ── 2 · Milestone chiusa dal PM: la tranche di QUEL passo ─────────────────
  insert into cert_payment_milestones
    (certification_id, name, amount, tranche_pct, tranche_order, trigger_event, tranche_state, step_id)
  values (v_cert, 'SAL 40%', 40000, 40, 2, 'design_end', 'pending', v_step) returning id into v_tr;
  insert into certification_milestones
    (certification_id, category, requirement, status, milestone_type, step_id)
  values (v_cert, v_cat, 'Design End', 'pending', 'timeline', v_step) returning id into v_ms;

  update certification_milestones set status = 'achieved' where id = v_ms;

  if (select tranche_state from cert_payment_milestones where id = v_tr) <> 'due' then
    v_err := v_err || '2a(tranche non esigibile) '; end if;
  if not exists (select 1 from task_alerts
                  where dedup_key = 'billing_due:' || v_tr::text and not is_resolved) then
    v_err := v_err || '2b(alert milestone mancante) '; end if;

  -- ── 3 · Fattura emessa: la tranche ha finito, l'alert si chiude da solo ───
  insert into invoices
    (number, issuer_contact_id, certification_id, tranche_id, total, issue_date, payment_terms_days)
  values ('TEST-F2', v_uk, v_cert, v_tr, 40000, current_date - 45, 30) returning id into v_inv;

  if (select tranche_state from cert_payment_milestones where id = v_tr) <> 'invoiced' then
    v_err := v_err || '3a(tranche non consumata) '; end if;
  if exists (select 1 from task_alerts where dedup_key = 'billing_due:' || v_tr::text and not is_resolved) then
    v_err := v_err || '3b(alert non chiuso) '; end if;

  -- ── 4 · Il tempo: la scaduta entra in recall, e il job non si ripete ──────
  perform public.fn_payments_job_giornaliero();
  select lifecycle_state, recall_status into v_stato, v_recall from invoices where id = v_inv;
  if v_stato <> 'in_recall' or v_recall <> 'red' then
    v_err := v_err || '4a(' || v_stato || '/' || coalesce(v_recall, '-') || ') '; end if;
  if not exists (select 1 from task_alerts where dedup_key = 'recall_red:' || v_inv::text and not is_resolved) then
    v_err := v_err || '4b(alert recall mancante) '; end if;

  perform public.fn_payments_job_giornaliero();
  select count(*) into v_n from task_alerts
   where dedup_key = 'recall_red:' || v_inv::text and not is_resolved;
  if v_n <> 1 then v_err := v_err || '4c(alert duplicato: ' || v_n || ') '; end if;

  -- ── 5 · «Bonifico disposto», e la promessa che scade ──────────────────────
  perform public.fn_bonifico_disposto(v_inv);
  if (select recall_status from invoices where id = v_inv) <> 'yellow' then
    v_err := v_err || '5a(non diventa giallo) '; end if;

  update invoices set yellow_until = current_date - 1 where id = v_inv;
  perform public.fn_payments_job_giornaliero();
  if (select recall_status from invoices where id = v_inv) <> 'red' then
    v_err := v_err || '5b(giallo scaduto non torna rosso) '; end if;
  if not exists (select 1 from task_alerts
                  where alert_type = 'recall_yellow_expired' and invoice_id = v_inv) then
    v_err := v_err || '5c(alert giallo scaduto) '; end if;

  -- ── 6 · L'incasso chiude tutto, da solo ──────────────────────────────────
  insert into invoice_payments (invoice_id, date, amount) values (v_inv, current_date, 40000);

  select lifecycle_state, recall_status into v_stato, v_recall from invoices where id = v_inv;
  if v_stato <> 'closed' then v_err := v_err || '6a(non chiusa: ' || v_stato || ') '; end if;
  if v_recall is not null then v_err := v_err || '6b(ancora in recall) '; end if;
  if exists (select 1 from task_alerts where dedup_key = 'recall_red:' || v_inv::text and not is_resolved) then
    v_err := v_err || '6c(sollecito non chiuso) '; end if;
  if not exists (select 1 from task_alerts where dedup_key = 'invoice_paid:' || v_inv::text and not is_resolved) then
    v_err := v_err || '6d(alert «ha pagato» mancante) '; end if;

  if v_err = '' then
    raise exception 'FASE 2: TUTTI I CRITERI OK (transazione annullata)';
  else
    raise exception 'FASE 2 FALLITA: %', v_err;
  end if;
end $$;

-- Payments — i casi del canvas, come dati di prova.
--
-- Non sono numeri inventati per riempire una tabella: sono i casi limite veri
-- che la specifica indica come fixture — una parziale con due incassi, una
-- parziale con nota di credito, una in sollecito da settimane, una gialla per
-- «bonifico disposto», una bloccata, una nei termini. Servono a vedere se le
-- schermate reggono i casi difficili, che sono gli unici che contano.
--
-- Ogni riga porta `notes = 'SEED-CANVAS'`: si cancellano tutte insieme, e non
-- si possono confondere con fatture vere.
--
--   -- per toglierle:
--   delete from invoices where notes = 'SEED-CANVAS';
--
-- Gli incassi e le note di credito se ne vanno con la fattura (cascade); le
-- note di credito no, quindi si cancellano prima.

do $$
declare
  v_uk uuid; v_it uuid;
  c record;
  v_inv uuid;
  v_i integer := 0;
begin
  select id into v_uk from contacts where kind = 'issuer' and entity_code = 'uk';
  select id into v_it from contacts where kind = 'issuer' and entity_code = 'it';
  if v_uk is null then raise exception 'Manca la societa'' emittente UK'; end if;

  -- Si appoggiano a commesse vere, cosi' cliente e progetto nelle colonne sono
  -- quelli veri e si vede come si comporta la tabella con i nomi reali.
  for c in
    select ce.id, ce.name, co.id as client_id
      from certifications ce
      join sites s on s.id = ce.site_id
      left join contacts co on co.brand_id = s.brand_id and co.kind = 'client'
     where ce.status in ('in_corso', 'certificato', 'da_configurare')
     order by ce.created_at desc
     limit 6
  loop
    v_i := v_i + 1;

    if v_i = 1 then
      -- Parziale con due incassi: il residuo e' una sottrazione, non un campo.
      insert into invoices (number, issuer_contact_id, client_contact_id, certification_id,
                            currency, exch_rate, total, issue_date, payment_terms_days,
                            lifecycle_state, notes)
      values ('FT-UK-2026-0091', v_uk, c.client_id, c.id, 'GBP', 1.17, 42000,
              current_date - 98, 30, 'in_recall', 'SEED-CANVAS')
      returning id into v_inv;
      update invoices set recall_status = 'red' where id = v_inv;
      insert into invoice_payments (invoice_id, date, amount, method, bank_ref)
      values (v_inv, current_date - 82, 21000, 'Bonifico', 'HSBC ····4102'),
             (v_inv, current_date - 19, 14700, 'Bonifico', 'HSBC ····4102');

    elsif v_i = 2 then
      -- Parziale + nota di credito: 32.000 − 13.600 − 6.000 = 12.400.
      insert into invoices (number, issuer_contact_id, client_contact_id, certification_id,
                            currency, total, issue_date, payment_terms_days,
                            lifecycle_state, notes)
      values ('FT-IT-2026-0114', coalesce(v_it, v_uk), c.client_id, c.id, 'EUR', 32000,
              current_date - 137, 30, 'in_recall', 'SEED-CANVAS')
      returning id into v_inv;
      update invoices set recall_status = 'red' where id = v_inv;
      insert into invoice_payments (invoice_id, date, amount, method)
      values (v_inv, current_date - 100, 13600, 'Bonifico');
      insert into credit_notes (number, invoice_id, date, amount, kind, reason, state)
      values ('NC-IT-2026-0007', v_inv, current_date - 60, 6000, 'partial',
              'Storno parziale su rinegoziazione', 'issued');

    elsif v_i = 3 then
      -- In sollecito da settimane, mai pagata.
      insert into invoices (number, issuer_contact_id, client_contact_id, certification_id,
                            currency, total, issue_date, payment_terms_days,
                            lifecycle_state, reminders_count, last_reminder_date, notes)
      values ('FT-IT-2026-0076', coalesce(v_it, v_uk), c.client_id, c.id, 'EUR', 27500,
              current_date - 73, 60, 'in_recall', 2, current_date - 9, 'SEED-CANVAS')
      returning id into v_inv;
      update invoices set recall_status = 'red' where id = v_inv;
      insert into invoice_reminders (invoice_id, date, channel, note)
      values (v_inv, current_date - 25, 'email', 'Primo sollecito'),
             (v_inv, current_date - 9, 'phone', 'Contattata amministrazione');

    elsif v_i = 4 then
      -- Gialla: il cliente dice di aver disposto il bonifico. Vale 30 giorni.
      insert into invoices (number, issuer_contact_id, client_contact_id, certification_id,
                            currency, exch_rate, total, issue_date, payment_terms_days,
                            lifecycle_state, recall_status, yellow_until, notes)
      values ('FT-CN-2026-0059', v_uk, c.client_id, c.id, 'CNY', 0.127, 380000,
              current_date - 100, 30, 'in_recall', 'yellow', current_date + 12, 'SEED-CANVAS');

    elsif v_i = 5 then
      -- Bloccata: il progetto e' fermo per mancato pagamento.
      insert into invoices (number, issuer_contact_id, client_contact_id, certification_id,
                            currency, exch_rate, total, issue_date, payment_terms_days,
                            lifecycle_state, notes)
      values ('FT-CN-2026-0031', v_uk, c.client_id, c.id, 'CNY', 0.127, 520000,
              current_date - 169, 30, 'blocked', 'SEED-CANVAS');

    else
      -- Nei termini: non e' ancora successo niente, ed e' giusto cosi'.
      insert into invoices (number, issuer_contact_id, client_contact_id, certification_id,
                            currency, total, issue_date, payment_terms_days,
                            lifecycle_state, notes)
      values ('FT-IT-2026-0201', coalesce(v_it, v_uk), c.client_id, c.id, 'EUR', 64000,
              current_date - 2, 30, 'issued', 'SEED-CANVAS');
    end if;
  end loop;

  -- Una saldata, per avere anche il caso che si chiude da solo.
  insert into invoices (number, issuer_contact_id, currency, total, issue_date,
                        payment_terms_days, lifecycle_state, notes)
  values ('FT-IT-2026-0182', coalesce(v_it, v_uk), 'EUR', 48000, current_date - 47, 30,
          'issued', 'SEED-CANVAS')
  returning id into v_inv;
  -- L'incasso totale la chiude da solo: nessuno la «segna» come pagata.
  insert into invoice_payments (invoice_id, date, amount, method)
  values (v_inv, current_date - 12, 48000, 'Bonifico');

  raise notice 'Seed inserito: % fatture di prova', v_i + 1;
end $$;

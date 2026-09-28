-- ═══════════════════════════════════════════════════════════════════════════
-- Le fatture di prima entrano nel registro
--
-- Il registro comincia il 7 marzo 2025, perche' quello e' il giorno in cui e'
-- nato: tutto quello che FGB ha fatturato prima esiste solo come PDF in una
-- cartella. Il risultato e' un fatturato per anno che parte da meta' strada e
-- un cliente la cui storia comincia quando abbiamo acceso il sistema.
--
-- Qui si apre la porta per farle entrare. Tre cose la distinguono
-- dall'emissione:
--
-- 1. IL NUMERO NON SI GENERA. `fn_emetti_fattura` chiama
--    `fn_nuovo_numero_fattura` e prende il prossimo della serie. Una fattura
--    del 2023 il suo numero ce l'ha gia', ed e' quello che sta sul documento
--    che il cliente ha in mano: riassegnarlo vorrebbe dire creare una seconda
--    verita' per la stessa carta.
--
-- 2. NASCE CHIUSA. Una vecchia fattura entra come gia' incassata, con il suo
--    pagamento registrato, perche' e' quasi sempre la verita' e perche'
--    l'alternativa e' peggiore: entrando aperta finirebbe in Recall il giorno
--    dopo, e la mattina qualcuno si troverebbe a sollecitare un cliente per
--    una fattura del 2023 gia' pagata. Chi importa puo' dire che non e' stata
--    pagata, e allora resta aperta — ma e' una scelta esplicita, non il
--    comportamento predefinito.
--
-- 3. SI RICORDA DA DOVE VIENE. `origine` dice se una riga l'abbiamo emessa noi
--    o e' stata importata; `documento_path` tiene il PDF originale, che e' il
--    solo documento che vale davvero; `estrazione` conserva quello che l'OCR
--    ha letto, parola per parola. Quest'ultima non e' un capriccio: quando
--    arrivera' la tabella con le informazioni vere per fattura, si potra'
--    confrontare campo per campo quello che il modello aveva capito con quello
--    che dice l'amministrazione, e correggere sapendo cosa si sta correggendo.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.invoices
  add column if not exists origine text not null default 'emessa',
  add column if not exists documento_path text,
  add column if not exists estrazione jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'invoices_origine_check') then
    alter table public.invoices
      add constraint invoices_origine_check check (origine in ('emessa', 'importata'));
  end if;
end $$;

comment on column public.invoices.origine is
  'emessa = nata qui col numero della serie; importata = fattura di prima, col numero che aveva gia''.';
comment on column public.invoices.documento_path is
  'Il PDF originale nel bucket fatture-storiche. E'' il documento che vale: il resto e'' una lettura.';
comment on column public.invoices.estrazione is
  'Quello che l''OCR ha letto, grezzo. Serve a confrontare la lettura con la verita'' quando arrivera''.';

-- Due fatture della stessa societa' non possono avere lo stesso numero: e'
-- vero in contabilita' ed e' l'unica difesa dal caricare due volte lo stesso
-- PDF. Si crea solo se i dati attuali lo permettono — non si rompe un
-- registro gia' riconciliato per un vincolo nuovo.
do $$
begin
  if not exists (
    select 1 from public.invoices
     group by issuer_contact_id, number having count(*) > 1
  ) and not exists (
    select 1 from pg_constraint where conname = 'invoices_numero_per_emittente'
  ) then
    alter table public.invoices
      add constraint invoices_numero_per_emittente unique (issuer_contact_id, number);
  end if;
end $$;

-- ── Il posto dove vivono i PDF ────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('fatture-storiche', 'fatture-storiche', false)
on conflict (id) do nothing;

drop policy if exists fatture_storiche_admin_read on storage.objects;
create policy fatture_storiche_admin_read on storage.objects
  for select to authenticated
  using (bucket_id = 'fatture-storiche' and coalesce(public.is_admin(auth.uid()), false));

drop policy if exists fatture_storiche_admin_write on storage.objects;
create policy fatture_storiche_admin_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fatture-storiche' and coalesce(public.is_admin(auth.uid()), false));

drop policy if exists fatture_storiche_admin_delete on storage.objects;
create policy fatture_storiche_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'fatture-storiche' and coalesce(public.is_admin(auth.uid()), false));

-- ── L'importazione ────────────────────────────────────────────────────────
-- NOTA: la versione qui sotto passava `due_date` all'insert, che e' una
-- colonna generata. La correzione e' nella migrazione successiva,
-- 20260928102325, che e' quella in vigore.
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
  -- Null = incassata alla scadenza, che e' l'ipotesi piu' innocua per una
  -- fattura vecchia. Una data esplicita la sposta; `p_incassata = false` la
  -- lascia aperta, e allora il registro la trattera' come tutte le altre.
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

  v_scadenza := p_issue_date + coalesce(p_payment_terms_days, 30);

  insert into public.invoices (
    number, issuer_contact_id, client_contact_id, currency, exch_rate,
    total, vat_amount, issue_date, payment_terms_days, due_date,
    lifecycle_state, notes, origine, documento_path, estrazione, created_by
  ) values (
    v_numero, p_issuer_contact_id, p_client_contact_id,
    coalesce(p_currency, 'EUR'), coalesce(p_exch_rate, 1),
    p_total, coalesce(p_vat_amount, 0), p_issue_date,
    coalesce(p_payment_terms_days, 30), v_scadenza,
    case when p_incassata then 'closed' else 'issued' end,
    p_notes, 'importata', p_documento_path, p_estrazione, auth.uid()
  ) returning * into v_riga;

  if p_incassata and p_total > 0 then
    v_quando := coalesce(p_data_incasso, v_scadenza);
    insert into public.invoice_payments (invoice_id, date, amount, method, bank_ref)
    values (v_riga.id, v_quando, p_total, 'import',
            'Incasso ricostruito all''importazione dello storico');
  end if;

  return v_riga;
end;
$function$;

comment on function public.fn_importa_fattura_storica is
  'Fa entrare nel registro una fattura emessa prima del registro, col numero che aveva gia'' e chiusa dal suo incasso.';

revoke all on function public.fn_importa_fattura_storica(
  text, uuid, date, numeric, uuid, text, numeric, numeric, integer, text, text, jsonb, boolean, date
) from public;
grant execute on function public.fn_importa_fattura_storica(
  text, uuid, date, numeric, uuid, text, numeric, numeric, integer, text, text, jsonb, boolean, date
) to authenticated;

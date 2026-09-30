-- ═══════════════════════════════════════════════════════════════════════════
-- Le funzioni seguono la data nuova, e l'esito scrive il diario
--
-- Quattro funzioni nominavano `yellow_until`. Tre la azzeravano soltanto —
-- chiudendo una fattura, portandola a insoluto, o riportando a rosso un giallo
-- scaduto — e per quelle la sostituzione e' meccanica: si riscrive la
-- definizione cambiando il nome del campo. Si fa con una sostituzione sul
-- testo invece che ricopiando duecento righe a mano, perche' ricopiare a mano
-- una funzione lunga e' il modo piu' affidabile di introdurre un errore che
-- nessuno rivedra' mai.
--
-- La quarta, `fn_bonifico_disposto`, cambia mestiere: diventa il caso
-- particolare di un gesto piu' generale.
--
-- ── IL GESTO CHE MANCAVA ──────────────────────────────────────────────────
-- Nessuno apre il registro per «scrivere una data»: lo apre perche' ha appena
-- parlato con un cliente. Quello che ha in mano e' un esito. Alcuni esiti
-- portano una data di pagamento — pagamento predisposto, bonifico disposto —
-- altri sono notizie e basta: una quietanza richiesta non dice quando
-- arriveranno i soldi, e non deve entrare nel previsionale.
--
-- `fn_registra_esito` fa tutto il gesto in un colpo: scrive la nota nel
-- diario, scrive la data quando c'e', e mette in giallo se la fattura era gia'
-- scaduta. Se non lo era non tocca lo stato — non c'e' niente da sospendere.
--
-- E finalmente «bonifico disposto» annota davvero: fino a oggi rispondeva
-- «Annotato: bonifico disposto, 30 giorni» senza lasciare traccia da nessuna
-- parte, e chi lo leggeva credeva di aver scritto una nota che non c'era.
--
-- NOTA: la versione di `fn_registra_esito` qui sotto ha un difetto che la
-- migrazione successiva (20260930150545) corregge — scriveva la data anche
-- quando l'esito non ne portava una. La prova l'ha trovato subito.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1 · Le tre che la azzeravano soltanto ─────────────────────────────────
do $$
declare
  v record;
  v_def text;
begin
  for v in
    select p.oid, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('fn_riallinea_fattura', 'fn_porta_a_insoluto', 'fn_payments_job_giornaliero')
  loop
    v_def := pg_get_functiondef(v.oid);
    if position('yellow_until' in v_def) = 0 then
      continue;
    end if;
    v_def := replace(v_def, 'yellow_until = null', 'data_incasso_attesa = null, data_incasso_attesa_fonte = null');
    v_def := replace(v_def, 'i.yellow_until is not null', 'i.data_incasso_attesa is not null');
    v_def := replace(v_def, 'v_oggi > i.yellow_until', 'v_oggi > i.data_incasso_attesa');
    if position('yellow_until' in v_def) > 0 then
      raise exception 'In %() resta un riferimento a yellow_until che non so tradurre', v.proname;
    end if;
    execute v_def;
  end loop;
end $$;

-- ── 2 · L'esito: una nota, una data, e il giallo se serve ─────────────────
-- (definizione sostituita da 20260930150545)

-- ── 3 · Correggere una nota senza perdere quella di prima ────────────────
create or replace function public.fn_correggi_nota(p_nota_id uuid, p_testo text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v public.invoice_notes;
  v_nuova uuid;
begin
  if not coalesce(public.is_admin(auth.uid()), false) then
    raise exception 'Solo l''amministrazione corregge le note';
  end if;
  if nullif(btrim(coalesce(p_testo, '')), '') is null then
    raise exception 'Una correzione senza testo cancellerebbe la nota: per quello serve un gesto suo';
  end if;

  select * into v from public.invoice_notes where id = p_nota_id;
  if not found then raise exception 'Nota inesistente'; end if;
  if v.sostituita_da is not null then
    raise exception 'Questa nota e'' gia'' stata corretta: si corregge quella che l''ha sostituita';
  end if;

  -- La correzione nasce come riga nuova e porta la data della nota originale:
  -- il diario deve dire quando il cliente ha detto quella cosa, non quando ci
  -- siamo accorti di averla scritta male.
  insert into public.invoice_notes (invoice_id, date, text, tipo, sostituisce_id, created_by)
  values (v.invoice_id, v.date, btrim(p_testo), v.tipo, v.id, auth.uid())
  returning id into v_nuova;

  update public.invoice_notes set sostituita_da = v_nuova where id = v.id;

  return v_nuova;
end;
$function$;

revoke all on function public.fn_correggi_nota(uuid, text) from anon;
grant execute on function public.fn_correggi_nota(uuid, text) to authenticated;

-- ── 4 · «Bonifico disposto» diventa un caso particolare ──────────────────
create or replace function public.fn_bonifico_disposto(p_invoice_id uuid, p_giorni integer default 30)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v record;
begin
  select * into v from public.v_invoices where id = p_invoice_id;
  if not found then
    raise exception 'Fattura inesistente';
  end if;
  if v.residual <= 0 then
    raise exception 'La fattura % non ha residuo: non c''e'' nessun bonifico da attendere', v.number;
  end if;

  -- Tutto il lavoro lo fa l'esito: cosi' il bottone che esisteva gia' nei
  -- Recall continua a funzionare uguale, e in piu' lascia finalmente la sua
  -- riga nel diario.
  perform public.fn_registra_esito(
    p_invoice_id,
    'bonifico_disposto',
    current_date + coalesce(p_giorni, 30),
    null
  );
end;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Il badge cambia ogni minuto
--
-- Lo screenshot non si puo' impedire: nessun browser lo blocca, su nessun
-- telefono. Quello che si puo' fare e' renderlo inutile.
--
-- Il QR non porta piu' il segreto. Porta tre cose in chiaro — di chi e' il
-- badge, di che minuto si parla, e una firma di dieci caratteri — e la firma la
-- sa produrre solo chi ha il segreto, cioe' il telefono di quella persona
-- dopo aver fatto login. Il varco rifa' lo stesso conto e confronta.
--
-- Uno screenshot mandato a un collega e' quindi la fotografia di una firma
-- scaduta: vale sessanta secondi, e al minuto dopo non apre piu' niente.
--
-- ── PERCHÉ NON SI ACCETTA PIÙ IL VECCHIO FORMATO ──────────────────────────
-- Continuare ad accettare il token statico avrebbe lasciato aperta esattamente
-- la porta che questa migrazione chiude: basterebbe fotografare un badge di
-- carta. I ventidue token restano, ma da oggi sono il segreto con cui si firma,
-- non piu' la cosa che si mostra. I badge stampabili smettono di esistere, ed
-- e' il prezzo consapevole di questa scelta.
--
-- ── L'OROLOGIO DEL TELEFONO ───────────────────────────────────────────────
-- Il minuto lo dichiara chi firma, e il varco accetta il minuto prima e quello
-- dopo: i telefoni sono sincronizzati, ma non al secondo, e chi passa il badge
-- proprio sul cambio di minuto non deve trovarsi respinto. La finestra vera e'
-- quindi fra sessanta e centottanta secondi, non di piu'.
--
-- `extensions.hmac` si chiama col suo schema davanti: la funzione dichiara
-- `search_path = public` e non deve allargarlo, perche' e' quella dichiarazione
-- a impedire che le si faccia eseguire una funzione omonima messa li' da
-- qualcun altro.
--
-- La meta' cliente di questo accordo sta in `src/lib/badgeFirma.ts`, ed e'
-- verificata contro un HMAC calcolato da un'altra libreria: se le due meta'
-- divergono di un carattere nessuno timbra piu'.
-- ═══════════════════════════════════════════════════════════════════════════

-- Il parametro cambia nome — da token a payload — e un parametro non si
-- rinomina in un replace. Stessa ragione per hr_mio_badge, che ora torna due
-- cose invece di una.
drop function if exists public.hr_timbra(text, numeric, numeric, text);
drop function if exists public.hr_mio_badge();

create function public.hr_timbra(
  p_payload text,
  p_lat     numeric default null,
  p_lng     numeric default null,
  p_device  text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ora     timestamptz := now();
  v_oggi    date := (v_ora at time zone 'Europe/Rome')::date;
  v_pezzi   text[];
  v_badge   text;
  v_minuto  bigint;
  v_firma   text;
  v_adesso  bigint := floor(extract(epoch from v_ora) / 60)::bigint;
  v_user    uuid;
  v_attivo  boolean;
  v_segreto text;
  v_attesa  text;
  v_nome    text;
  v_ultima  timestamptz;
  v_prima   int;
begin
  -- hr1.<id del badge senza trattini>.<minuto>.<firma>
  if p_payload !~ '^hr1\.[0-9a-f]{32}\.[0-9]+\.[0-9a-f]{10}$' then
    -- Il vecchio token statico finisce qui dentro, e va bene cosi': dal
    -- momento in cui il codice cambia ogni minuto, un codice che non cambia
    -- non e' piu' un badge.
    return jsonb_build_object('esito', 'non_badge');
  end if;

  v_pezzi  := string_to_array(btrim(p_payload), '.');
  v_badge  := v_pezzi[2];
  v_minuto := v_pezzi[3]::bigint;
  v_firma  := v_pezzi[4];

  if abs(v_minuto - v_adesso) > 1 then
    return jsonb_build_object('esito', 'scaduto');
  end if;

  select t.user_id, t.active, t.token
    into v_user, v_attivo, v_segreto
    from public.hr_qr_tokens t
   where replace(t.id::text, '-', '') = v_badge;

  if v_user is null then
    return jsonb_build_object('esito', 'sconosciuto');
  end if;
  if not coalesce(v_attivo, false) then
    return jsonb_build_object('esito', 'revocato');
  end if;

  v_attesa := left(encode(extensions.hmac(v_minuto::text, v_segreto, 'sha256'), 'hex'), 10);
  if v_attesa <> v_firma then
    return jsonb_build_object('esito', 'firma_non_valida');
  end if;

  select nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
    into v_nome
    from public.profiles p
   where p.id = v_user;
  v_nome := coalesce(v_nome, 'Badge ' || left(v_user::text, 8));

  select count(*)::int, max(t.ts)
    into v_prima, v_ultima
    from public.hr_timbrature t
   where t.user_id = v_user
     and (t.ts at time zone 'Europe/Rome')::date = v_oggi;

  -- Il QR letto due volte dalla telecamera, o rimostrato subito: una sola
  -- lettura ogni novanta secondi. Vale anche come difesa dal codice ripetuto,
  -- perche' quando i novanta secondi sono passati la firma e' gia' scaduta.
  if v_ultima is not null and v_ultima > v_ora - interval '90 seconds' then
    return jsonb_build_object(
      'esito', 'ripetuto', 'nome', v_nome, 'quando', v_ultima, 'ordinale', v_prima
    );
  end if;

  insert into public.hr_timbrature (user_id, ts, origine, device_label, location_lat, location_lng)
  values (v_user, v_ora, 'qr', p_device, p_lat, p_lng);

  return jsonb_build_object(
    'esito',    'ok',
    'nome',     v_nome,
    'quando',   v_ora,
    -- Quante ne ha fatte oggi, questa compresa. Ingresso, pausa, ripresa e
    -- uscita non si decidono qui: li conta v_hr_giornate.
    'ordinale', v_prima + 1,
    'verso',    case when (v_prima + 1) % 2 = 1 then 'in' else 'out' end
  );
end
$function$;

comment on function public.hr_timbra(text, numeric, numeric, text) is
  'Legge un badge firmato al minuto (hr1.<badge>.<minuto>.<firma>) e registra una lettura. Il token statico non e'' piu'' accettato.';

revoke all on function public.hr_timbra(text, numeric, numeric, text) from public;
grant execute on function public.hr_timbra(text, numeric, numeric, text) to authenticated;

-- ── Il badge di chi lo chiede: identificativo e segreto ───────────────────
-- Serve anche l'id, perche' e' la parte che si puo' mostrare: il segreto non
-- entra piu' nel QR, ci entra solo la firma che se ne ricava.
create function public.hr_mio_badge()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id     uuid;
  v_token  text;
  v_nostro boolean;
begin
  if auth.uid() is null then
    raise exception 'Nessuna sessione';
  end if;

  select
    exists (select 1 from public.user_roles r
             where r.user_id = auth.uid() and r.role::text <> 'viewer')
    or exists (select 1 from public.profiles p
                where p.id = auth.uid() and lower(p.email) like '%@fgb-studio.com')
    into v_nostro;

  if not v_nostro then
    raise exception 'Il badge di ingresso e'' riservato al personale di studio';
  end if;

  select id, token into v_id, v_token
    from public.hr_qr_tokens
   where user_id = auth.uid() and active;

  if v_id is null then
    insert into public.hr_qr_tokens (user_id, token, active, rotated_at)
    values (auth.uid(), 'hr_' || replace(gen_random_uuid()::text, '-', ''), true, now())
    on conflict (user_id) do update
      set token = excluded.token, active = true, rotated_at = now()
    returning id, token into v_id, v_token;
  end if;

  return jsonb_build_object('id', replace(v_id::text, '-', ''), 'segreto', v_token);
end
$function$;

revoke all on function public.hr_mio_badge() from public;
grant execute on function public.hr_mio_badge() to authenticated;

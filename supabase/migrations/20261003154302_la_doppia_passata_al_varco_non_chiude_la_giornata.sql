-- ═══════════════════════════════════════════════════════════════════════════
-- La doppia passata al varco non chiude la giornata
--
-- `hr_timbra` già scartava la seconda lettura entro **90 secondi**, e quella
-- finestra risolve il problema della telecamera che legge due volte lo stesso QR.
-- Ma non è quello il caso che fa danno.
--
-- Il verso di una lettura è solo la parità: dispari si entra, pari si esce. Quindi
-- una persona che ripassa dal varco pochi minuti dopo — è uscita a spostare
-- l'auto, è tornata indietro per una cosa dimenticata, ha accompagnato qualcuno
-- alla porta — produce una lettura che il sistema legge come **uscita**. La
-- giornata si chiude a metà pomeriggio con un orario perfettamente plausibile, e
-- nessuno se ne accorge: è esattamente quello che è successo provando lo scanner,
-- dove tre letture di prova hanno dato sei ore di lavoro a tre persone ancora in
-- ufficio.
--
-- La finestra passa a **cinque minuti**. Non è un numero tondo per gusto: sotto i
-- cinque minuti non esiste nessuna pausa che qualcuno voglia registrare — la pausa
-- pranzo dura un'ora — quindi in quella fascia una seconda lettura non può essere
-- altro che la stessa passata, o una passata che non significa niente. Sopra i
-- cinque minuti può essere un movimento vero, e lì non si decide per nessuno.
--
-- La finestra guarda l'ultima lettura **di qualunque origine**, non solo le `qr`:
-- se l'ingresso del mattino è stato scritto a mano dal foglio e la persona timbra
-- due minuti dopo, è un doppione come gli altri. (Verificato: con una lettura
-- `manuale` di due minuti prima, la timbratura torna `ripetuto`.)
--
-- Chi sta al varco adesso sa anche quanto manca. Prima leggeva «già registrato» e
-- non poteva distinguere fra «hai timbrato un secondo fa» e «il lettore non
-- funziona»: ora la risposta dice quanti secondi sono passati e fra quanti la
-- prossima lettura conterà.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.hr_timbra(p_payload text, p_device text default null)
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
  -- Quanto deve passare perche' una seconda lettura valga come un movimento
  -- vero. Sta scritto una volta sola: e' la sola cosa da cambiare se un giorno
  -- cinque minuti si rivelano troppi o troppo pochi.
  v_finestra interval := interval '5 minutes';
begin
  -- hr1.<id del badge senza trattini>.<minuto>.<firma>
  if p_payload !~ '^hr1\.[0-9a-f]{32}\.[0-9]+\.[0-9a-f]{10}$' then
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

  -- L'ultima lettura si cerca **senza il vincolo del giorno**: a mezzanotte e un
  -- minuto l'ultima di ieri e' ancora la lettura che precede, e limitandosi a
  -- oggi la finestra non vedrebbe niente da cui difendersi.
  select max(t.ts) into v_ultima
    from public.hr_timbrature t
   where t.user_id = v_user
     and t.ts > v_ora - v_finestra - interval '1 minute';

  select count(*)::int into v_prima
    from public.hr_timbrature t
   where t.user_id = v_user
     and (t.ts at time zone 'Europe/Rome')::date = v_oggi;

  if v_ultima is not null and v_ultima > v_ora - v_finestra then
    return jsonb_build_object(
      'esito',      'ripetuto',
      'nome',       v_nome,
      'quando',     v_ultima,
      'ordinale',   v_prima,
      'secondi_fa', floor(extract(epoch from (v_ora - v_ultima)))::int,
      'riprova_fra', ceil(extract(epoch from (v_ultima + v_finestra - v_ora)))::int
    );
  end if;

  insert into public.hr_timbrature (user_id, ts, origine, device_label)
  values (v_user, v_ora, 'qr', p_device);

  return jsonb_build_object(
    'esito',    'ok',
    'nome',     v_nome,
    'quando',   v_ora,
    'ordinale', v_prima + 1,
    'verso',    case when (v_prima + 1) % 2 = 1 then 'in' else 'out' end
  );
end
$function$;

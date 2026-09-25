-- ═══════════════════════════════════════════════════════════════════════════
-- Il badge timbra da solo
--
-- Finora la timbratura era tre scritture fatte dal browser: leggi il token,
-- cerca l'ingresso aperto, scrivi la riga. Tutte e tre passano dalle policy, e
-- le policy dicono che hr_qr_tokens lo legge solo il proprietario o un
-- amministratore, e che su hr_attendance scrive solo un amministratore.
--
-- Vuol dire che un tablet all'ingresso avrebbe dovuto tenere aperta una
-- sessione da amministratore tutto il giorno, appesa al muro, a disposizione di
-- chiunque passi. E senza, il badge di un collega risultava «sconosciuto»: la
-- riga c'e', ma quella sessione non ha il diritto di vederla.
--
-- Qui la timbratura diventa una domanda sola, che il database esegue per conto
-- proprio. Al dispositivo non serve nessun potere: serve avere in mano il
-- badge giusto. Il badge e' il segreto — sedici byte casuali — e chi ce l'ha
-- timbra, esattamente come un badge di plastica.
--
-- ── COSA DECIDE DA SÉ ─────────────────────────────────────────────────────
-- Entrata o uscita non le sceglie chi timbra: alle otto e mezza nessuno si
-- ricorda di premere il bottone giusto, e un kiosk rimasto su «Check-IN»
-- registrerebbe le uscite come entrate. Se c'e' un ingresso di oggi ancora
-- aperto, la passata lo chiude; altrimenti ne apre uno.
--
-- ── LE DUE ANOMALIE CHE NON SI INVENTANO ──────────────────────────────────
-- Doppia passata: chi ripassa il badge entro novanta secondi — il QR letto due
-- volte, il collega che riprova perche' non ha visto lo schermo — non timbra
-- di nuovo. Gli si ricorda cosa ha gia' fatto e a che ora.
--
-- Uscita mai timbrata: se l'ingresso aperto e' di un giorno passato, qualcuno
-- ieri sera e' andato a casa senza passare il badge. Quella giornata viene
-- chiusa a durata zero e segnata «manual_override» con la nota del perche':
-- zero ore e' visibilmente sbagliato, e chiede di essere corretto a mano da chi
-- sa a che ora quella persona e' uscita davvero. Inventare un orario di uscita
-- plausibile sarebbe peggio: diventerebbe un dato che nessuno rilegge piu'.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.hr_timbra(
  p_token  text,
  p_lat    numeric default null,
  p_lng    numeric default null,
  p_device text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ora    timestamptz := now();
  v_oggi   date := (v_ora at time zone 'Europe/Rome')::date;
  v_user   uuid;
  v_attivo boolean;
  v_nome   text;
  v_ultima public.hr_attendance%rowtype;
  v_azione text;
  v_dal    timestamptz;
begin
  select t.user_id, t.active into v_user, v_attivo
    from public.hr_qr_tokens t
   where t.token = btrim(p_token);

  if v_user is null then
    return jsonb_build_object('esito', 'sconosciuto');
  end if;
  if not coalesce(v_attivo, false) then
    return jsonb_build_object('esito', 'revocato');
  end if;

  -- Il nome lo dice il database: al varco la sessione non puo' leggere
  -- `profiles`, e uno schermo che dice «Checked IN» senza dire chi non serve a
  -- chi sta aspettando conferma.
  select nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
    into v_nome
    from public.profiles p
   where p.id = v_user;
  v_nome := coalesce(v_nome, 'Badge ' || left(v_user::text, 8));

  select * into v_ultima
    from public.hr_attendance a
   where a.user_id = v_user
   order by a.timestamp_in desc
   limit 1;

  if v_ultima.id is not null
     and greatest(v_ultima.timestamp_in, coalesce(v_ultima.timestamp_out, v_ultima.timestamp_in))
         > v_ora - interval '90 seconds' then
    return jsonb_build_object(
      'esito',  'ripetuto',
      'nome',   v_nome,
      'azione', case when v_ultima.timestamp_out is null then 'in' else 'out' end,
      'quando', greatest(v_ultima.timestamp_in, coalesce(v_ultima.timestamp_out, v_ultima.timestamp_in))
    );
  end if;

  if v_ultima.id is not null and v_ultima.timestamp_out is null then
    if (v_ultima.timestamp_in at time zone 'Europe/Rome')::date = v_oggi then
      update public.hr_attendance
         set timestamp_out = v_ora,
             updated_at    = v_ora,
             device_label  = coalesce(p_device, device_label)
       where id = v_ultima.id;
      v_azione := 'out';
      v_dal := v_ultima.timestamp_in;
    else
      update public.hr_attendance
         set timestamp_out = timestamp_in,
             updated_at    = v_ora,
             status        = 'manual_override',
             note          = btrim(coalesce(note || ' · ', '')
                           || 'Uscita mai timbrata. Giornata chiusa a durata zero il '
                           || to_char(v_ora at time zone 'Europe/Rome', 'DD/MM/YYYY HH24:MI')
                           || ': l orario di uscita vero va messo a mano.')
       where id = v_ultima.id;
      v_azione := 'in';
    end if;
  else
    v_azione := 'in';
  end if;

  if v_azione = 'in' then
    insert into public.hr_attendance (user_id, timestamp_in, location_lat, location_lng, status, device_label)
    values (v_user, v_ora, p_lat, p_lng, 'auto_qr', p_device);
  end if;

  return jsonb_build_object(
    'esito',  'ok',
    'nome',   v_nome,
    'azione', v_azione,
    'quando', v_ora,
    'dalle',  v_dal
  );
end
$function$;

comment on function public.hr_timbra(text, numeric, numeric, text) is
  'Timbratura da badge QR. Il token e'' il segreto: chi lo presenta timbra, senza che il dispositivo abbia permessi propri. Decide da se'' entrata o uscita.';

-- Il varco non e' pubblico: il dispositivo deve comunque essere dentro la
-- piattaforma. Il token da solo, da Internet, non basta.
revoke all on function public.hr_timbra(text, numeric, numeric, text) from public;
grant execute on function public.hr_timbra(text, numeric, numeric, text) to authenticated;

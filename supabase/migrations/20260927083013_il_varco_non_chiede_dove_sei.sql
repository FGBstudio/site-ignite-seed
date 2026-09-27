-- ═══════════════════════════════════════════════════════════════════════════
-- Il varco non chiede dove sei
--
-- La posizione era rimasta dal primo disegno, quando la timbratura la si
-- immaginava fatta dal telefono di ciascuno e serviva a distinguere chi era in
-- ufficio da chi era altrove. Il varco e' un tablet inchiodato a un muro: la
-- sua posizione e' sempre la stessa, e ripeterla a ogni passaggio non aggiunge
-- una sola informazione.
--
-- Quello che aggiunge e' un dato personale in piu' da raccogliere, da
-- conservare, da spiegare a chi timbra e da cancellare quando qualcuno se ne
-- va. Nelle due letture di prova era comunque arrivata vuota — il permesso non
-- c'era, e il varco non aspetta il GPS piu' di due secondi per non lasciare
-- nessuno fuori.
--
-- Quindi via: non si smette solo di chiederla, si toglie anche il posto dove
-- metterla. Una colonna che esiste e resta sempre nulla e' una promessa che
-- prima o poi qualcuno prova a mantenere.
--
-- Le due letture di prova del 25 settembre se ne vanno con lei: erano una
-- giornata da venticinque minuti che nessuno ha lavorato.
-- ═══════════════════════════════════════════════════════════════════════════

delete from public.hr_timbrature;

alter table public.hr_timbrature
  drop column location_lat,
  drop column location_lng;

-- La firma della funzione perde i due parametri: non si rinomina e non si
-- accorcia in un replace.
drop function if exists public.hr_timbra(text, numeric, numeric, text);

create function public.hr_timbra(
  p_payload text,
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
  -- lettura ogni novanta secondi.
  if v_ultima is not null and v_ultima > v_ora - interval '90 seconds' then
    return jsonb_build_object(
      'esito', 'ripetuto', 'nome', v_nome, 'quando', v_ultima, 'ordinale', v_prima
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

comment on function public.hr_timbra(text, text) is
  'Legge un badge firmato al minuto (hr1.<badge>.<minuto>.<firma>) e registra una lettura. Non raccoglie la posizione.';

grant execute on function public.hr_timbra(text, text) to anon, authenticated;

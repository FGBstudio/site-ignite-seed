-- ═══════════════════════════════════════════════════════════════════════════
-- Le letture grezze, e la giornata che ne esce
--
-- Il varco non sa cosa sta succedendo: sa che alle 8:31 qualcuno ha passato un
-- badge. Che quella lettura sia un ingresso, una pausa, una ripresa o
-- un'uscita non e' una cosa che si decide al momento — si vede a fine giornata,
-- guardando quante letture ci sono state e in che ordine.
--
-- Finche' la timbratura scriveva direttamente «entrata» o «uscita», quella
-- decisione veniva presa nell'istante peggiore: quello in cui si sa meno. La
-- seconda lettura delle 13:02 e' una pausa se poi la persona rientra, ed e'
-- l'uscita se se n'e' andata. La stessa lettura, due significati, e quale dei
-- due lo dice il resto della giornata.
--
-- Quindi: qui si registra solo il fatto — chi, quando, da dove. La forma della
-- giornata la deduce la vista, ogni volta che qualcuno la guarda, dalle letture
-- che ci sono in quel momento. Nessuna interpretazione viene congelata in una
-- colonna, e una lettura dimenticata e aggiunta a mano tre giorni dopo rimette
-- a posto la giornata da sola.
--
-- ── PERCHÉ IL QR NON CONTIENE IL NOME ─────────────────────────────────────
-- Un nome cifrato nel QR sembra la strada breve, ma lega tre cose che devono
-- restare sciolte: se cambia il nome il badge non vale piu'; se il badge si
-- perde non si puo' revocare senza revocare la persona; e chi legge il QR con
-- qualunque telefono si porta a casa un dato che non lo riguarda. Il token non
-- dice niente a chi lo guarda, si revoca in un secondo, e punta a una persona
-- sola. E' la stessa cosa, fatta in modo che si possa disfare.
--
-- hr_attendance resta dov'e', vuota: non l'ha mai usata nessuno e non la si
-- butta di nascosto in una migrazione che parla d'altro.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.hr_timbrature (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  -- Il momento della lettura. Nient'altro: nessuna colonna dice «questa e'
  -- l'uscita», perche' al momento della lettura non si sa.
  ts           timestamptz not null default now(),
  origine      text not null default 'qr' check (origine in ('qr', 'manuale')),
  device_label text,
  location_lat numeric,
  location_lng numeric,
  note         text,
  -- Chi l'ha scritta a mano. Nullo se l'ha letta il varco.
  inserita_da  uuid references auth.users(id),
  created_at   timestamptz not null default now()
);

comment on table public.hr_timbrature is
  'Le letture del badge, grezze. Ingresso, pausa, ripresa e uscita non stanno qui: si deducono in v_hr_giornate.';

create index if not exists hr_timbrature_persona_giorno
  on public.hr_timbrature (user_id, ts desc);

alter table public.hr_timbrature enable row level security;

drop policy if exists hr_timbrature_select_own_or_admin on public.hr_timbrature;
create policy hr_timbrature_select_own_or_admin on public.hr_timbrature
  for select to authenticated
  using (user_id = auth.uid() or is_admin(auth.uid()));

-- Scrivere a mano nel registro e' un atto di chi lo tiene, non di chi ci
-- compare. Il varco non passa di qui: passa da hr_timbra, che ha i suoi.
drop policy if exists hr_timbrature_write_admin on public.hr_timbrature;
create policy hr_timbrature_write_admin on public.hr_timbrature
  for all to authenticated
  using (is_admin(auth.uid()))
  with check (is_admin(auth.uid()));

-- ── La giornata, dedotta ──────────────────────────────────────────────────
-- Due letture: ingresso e uscita. Quattro: ingresso, pausa, ripresa, uscita.
-- Un numero dispari: la persona e' ancora dentro. Le ore lavorate sono la
-- somma delle coppie chiuse — la lettura spaiata in fondo non conta, perche'
-- una giornata ancora aperta non ha una durata.
create or replace view public.v_hr_giornate
with (security_invoker = on) as
with letture as (
  select t.user_id,
         (t.ts at time zone 'Europe/Rome')::date as giorno,
         t.ts,
         row_number() over (partition by t.user_id, (t.ts at time zone 'Europe/Rome')::date order by t.ts) as n,
         count(*)     over (partition by t.user_id, (t.ts at time zone 'Europe/Rome')::date) as tot
    from public.hr_timbrature t
)
select
  user_id,
  giorno,
  tot as letture,
  min(ts) filter (where n = 1)                          as ingresso,
  -- La seconda lettura e' una pausa solo se la giornata prosegue: se sono due
  -- in tutto, quella e' l'uscita e basta.
  min(ts) filter (where n = 2 and tot > 2)              as pausa,
  min(ts) filter (where n = 3)                          as ripresa,
  min(ts) filter (where n = tot and tot % 2 = 0)        as uscita,
  (tot % 2 = 1)                                         as ancora_dentro,
  round((sum(case when n % 2 = 0 then extract(epoch from ts) else -extract(epoch from ts) end)
           filter (where not (tot % 2 = 1 and n = tot)) / 60.0)::numeric, 0) as minuti_lavorati,
  case when tot % 2 = 0 then
    round((extract(epoch from (max(ts) - min(ts))) / 60.0)::numeric, 0)
    - round((sum(case when n % 2 = 0 then extract(epoch from ts) else -extract(epoch from ts) end)
             filter (where not (tot % 2 = 1 and n = tot)) / 60.0)::numeric, 0)
  end as minuti_pausa
from letture
group by user_id, giorno, tot;

comment on view public.v_hr_giornate is
  'La giornata come esce dalle letture: ingresso, pausa, ripresa, uscita, ore lavorate. Niente e'' scritto: tutto e'' dedotto.';

grant select on public.v_hr_giornate to authenticated;

-- ── La timbratura ─────────────────────────────────────────────────────────
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
  v_ora     timestamptz := now();
  v_oggi    date := (v_ora at time zone 'Europe/Rome')::date;
  v_user    uuid;
  v_attivo  boolean;
  v_nome    text;
  v_ultima  timestamptz;
  v_prima   int;
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
  -- `profiles`, e uno schermo che conferma senza dire a chi non serve a chi
  -- sta aspettando davanti alla telecamera.
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

  -- Il QR letto due volte, il collega che riprova perche' non ha visto lo
  -- schermo: una sola lettura ogni novanta secondi.
  if v_ultima is not null and v_ultima > v_ora - interval '90 seconds' then
    return jsonb_build_object(
      'esito',    'ripetuto',
      'nome',     v_nome,
      'quando',   v_ultima,
      'ordinale', v_prima
    );
  end if;

  insert into public.hr_timbrature (user_id, ts, origine, device_label, location_lat, location_lng)
  values (v_user, v_ora, 'qr', p_device, p_lat, p_lng);

  return jsonb_build_object(
    'esito',    'ok',
    'nome',     v_nome,
    'quando',   v_ora,
    -- Quante ne ha fatte oggi, questa compresa. Il verso si legge dalla
    -- parita': dispari si entra, pari si esce.
    'ordinale', v_prima + 1,
    'verso',    case when (v_prima + 1) % 2 = 1 then 'in' else 'out' end
  );
end
$function$;

comment on function public.hr_timbra(text, numeric, numeric, text) is
  'Registra una lettura del badge e dice di che numero e'' nella giornata. Non decide se e'' ingresso o uscita: quello lo dice v_hr_giornate.';

revoke all on function public.hr_timbra(text, numeric, numeric, text) from public;
grant execute on function public.hr_timbra(text, numeric, numeric, text) to authenticated;

-- ── Il badge di chi lo chiede ─────────────────────────────────────────────
-- Perche' il QR possa vivere sul telefono di ciascuno, ognuno deve poterselo
-- prendere: scrivere in hr_qr_tokens e' riservato agli amministratori, e senza
-- questa funzione l'unico modo di avere un badge sarebbe che qualcuno te lo
-- generi e te lo mandi. Ne restituisce uno solo, sempre lo stesso: chiamarla
-- due volte non invalida il foglio gia' stampato.
create or replace function public.hr_mio_badge()
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_token text;
begin
  if auth.uid() is null then
    raise exception 'Nessuna sessione';
  end if;

  select token into v_token
    from public.hr_qr_tokens
   where user_id = auth.uid() and active;

  if v_token is null then
    insert into public.hr_qr_tokens (user_id, token, active, rotated_at)
    values (auth.uid(), 'hr_' || encode(gen_random_bytes(16), 'hex'), true, now())
    on conflict (user_id) do update
      set token = excluded.token, active = true, rotated_at = now()
    returning token into v_token;
  end if;

  return v_token;
end
$function$;

revoke all on function public.hr_mio_badge() from public;
grant execute on function public.hr_mio_badge() to authenticated;

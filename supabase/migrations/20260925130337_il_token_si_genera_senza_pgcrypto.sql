-- ═══════════════════════════════════════════════════════════════════════════
-- Il token si genera senza pgcrypto
--
-- «function gen_random_bytes(integer) does not exist», alla prima apertura di
-- «My Badge». Esiste eccome, ma vive in `extensions`, e la funzione dichiara
-- `search_path = public` — come devono fare tutte le security definer, perche'
-- e' quella dichiarazione a impedire che qualcuno le faccia eseguire una
-- funzione omonima piantata in uno schema suo. Allargare il search_path per
-- comodita' sarebbe stato togliere la protezione invece di aggirare il
-- problema.
--
-- `gen_random_uuid` sta in `pg_catalog`, che c'e' sempre e non va dichiarato.
-- Un UUID v4 sono 122 bit tirati a caso: senza i trattini fa trentadue
-- caratteri esadecimali, cioe' esattamente la forma che il lettore si aspetta
-- — `hr_` piu' trentadue — e la stessa quantita' di casualita' dei sedici byte
-- di prima. Non serviva un'estensione per questo.
--
-- Il badge stampato ieri resta valido: questa riguarda solo come nasce un
-- token nuovo.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.hr_mio_badge()
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_token text;
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

  select token into v_token
    from public.hr_qr_tokens
   where user_id = auth.uid() and active;

  if v_token is null then
    insert into public.hr_qr_tokens (user_id, token, active, rotated_at)
    values (auth.uid(), 'hr_' || replace(gen_random_uuid()::text, '-', ''), true, now())
    on conflict (user_id) do update
      set token = excluded.token, active = true, rotated_at = now()
    returning token into v_token;
  end if;

  return v_token;
end
$function$;

revoke all on function public.hr_mio_badge() from public;
grant execute on function public.hr_mio_badge() to authenticated;

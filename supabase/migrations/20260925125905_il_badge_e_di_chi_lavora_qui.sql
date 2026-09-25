-- ═══════════════════════════════════════════════════════════════════════════
-- Il badge e' di chi lavora qui
--
-- `hr_mio_badge` crea il badge a chi lo chiede, ed e' concessa a chiunque abbia
-- una sessione. Ma in `profiles` non ci sono solo i nostri: otto account sono
-- referenti dei clienti — Kering, Fendi, Boucheron, Versace, Luxottica — che
-- entrano per guardare i loro progetti. Nessuno di loro timbrera' mai
-- all'ingresso, e un badge emesso a loro nome e' solo una riga che un giorno
-- qualcuno dovra' spiegarsi.
--
-- Il confine non puo' essere `is_fgb_staff`, che vuol dire ADMIN o PM: fuori
-- resterebbero specialist, energy modeler, CxA e document manager, che sono di
-- casa e in ufficio ci vengono tutti i giorni. E non puo' essere solo il
-- dominio della mail, perche' la titolare ha un indirizzo suo.
--
-- Quindi: e' dei nostri chi ha un ruolo che non sia il solo «viewer» — i
-- clienti hanno quello e basta — oppure chi ha la mail di studio. Le due
-- condizioni si coprono i buchi a vicenda: ventidue dentro, gli otto referenti
-- dei clienti fuori.
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

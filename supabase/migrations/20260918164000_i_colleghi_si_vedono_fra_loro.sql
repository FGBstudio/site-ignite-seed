-- Chi lavora qui puo' sapere chi altro lavora qui.
--
-- Su `profiles` esistevano due sole regole: gli amministratori vedono tutti,
-- ognuno vede se stesso. Conseguenza pratica: un PM che apre «Invita
-- collaboratore» trova la tendina vuota — i ruoli li legge (13 PM), ma i nomi
-- no, e senza nome non c'e' niente da mostrare. Il messaggio «No other PMs
-- found» sembrava un dato («non ce ne sono») invece di un permesso mancante.
--
-- Non si apre `profiles` a tutti: il telefono, l'ufficio e il resto restano
-- dove sono. Si espone una funzione che elenca i colleghi con le sole
-- informazioni che servono a riconoscerli — nome ed email — e solo per chi ha
-- un ruolo operativo in azienda.
--
-- SECURITY DEFINER perche' e' esattamente questo il caso d'uso: dare accesso a
-- un sottoinsieme preciso senza dare accesso alla tabella.
create or replace function public.fn_colleghi(p_ruolo text default null)
returns table (
  id uuid,
  full_name text,
  display_name text,
  email text,
  ruolo text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id,
         p.full_name,
         p.display_name,
         p.email,
         upper(r.role::text) as ruolo
    from public.profiles p
    join public.user_roles r on r.user_id = p.id
   where
     -- Chi chiede deve essere qualcuno: non e' un elenco pubblico.
     auth.uid() is not null
     -- Solo i ruoli che lavorano sui progetti. I «viewer» non si collaborano.
     and upper(r.role::text) in ('PM', 'ADMIN', 'DOCUMENT_MANAGER', 'SPECIALIST',
                                 'ENERGY_MODELER', 'CXA')
     and (p_ruolo is null or upper(r.role::text) = upper(p_ruolo))
   order by coalesce(p.full_name, p.display_name, p.email);
$$;

comment on function public.fn_colleghi is
  'Elenco dei colleghi con ruolo operativo: solo nome ed email, per le tendine che devono far scegliere una persona.';

grant execute on function public.fn_colleghi(text) to authenticated;

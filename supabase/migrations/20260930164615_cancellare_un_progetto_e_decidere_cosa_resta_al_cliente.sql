-- ═══════════════════════════════════════════════════════════════════════════
-- Cancellare un progetto è decidere cosa resta al cliente
--
-- Finora cancellare voleva dire cambiare uno stato in una tendina. Il credito
-- del cliente — se c'era — restava in una mail.
--
-- Queste tre funzioni fanno i tre momenti del credito: nasce con la
-- cancellazione, si usa su un'offerta nuova, o si chiude in un altro modo.
-- Nessuna di loro calcola l'importo: quello lo propone la vista e lo **decide una
-- persona**. La parte «nostra» di un progetto interrotto è una trattativa, non
-- una sottrazione.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.fn_cancella_progetto(
  p_certification_id uuid,
  p_credito numeric default 0,
  p_motivo text default null,
  p_contact_id uuid default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cert record;
  v_cliente uuid;
  v_credito_id uuid;
begin
  if not coalesce(public.is_admin(auth.uid()), false) then
    raise exception 'Solo l''amministrazione puo'' cancellare un progetto';
  end if;

  select c.id, c.name, c.status, c.currency, c.billing_contact_id
    into v_cert
    from public.certifications c
   where c.id = p_certification_id;

  if v_cert.id is null then
    raise exception 'Il progetto indicato non esiste';
  end if;

  if v_cert.status = 'canceled' then
    raise exception 'Il progetto «%» è già cancellato', v_cert.name;
  end if;

  -- Il credito si registra prima di cancellare: se qualcosa non torna, il
  -- progetto resta vivo invece di restare cancellato senza il suo credito.
  if coalesce(p_credito, 0) > 0 then
    v_cliente := coalesce(p_contact_id, v_cert.billing_contact_id);
    if v_cliente is null then
      raise exception 'Manca il cliente a cui intestare il credito di %: il progetto non ha un intestatario registrato', p_credito;
    end if;
    if nullif(btrim(coalesce(p_motivo, '')), '') is null then
      raise exception 'Un credito senza motivo, fra un anno, è un numero che nessuno sa spiegare';
    end if;

    insert into public.crediti_cliente (
      contact_id, certification_id_origine, importo, valuta, motivo, note, created_by
    ) values (
      v_cliente, p_certification_id, p_credito, coalesce(v_cert.currency, 'EUR'),
      btrim(p_motivo), nullif(btrim(coalesce(p_note, '')), ''), auth.uid()
    ) returning id into v_credito_id;
  end if;

  update public.certifications
     set status = 'canceled',
         setup_status = 'canceled'
   where id = p_certification_id;

  -- Le tranche non ancora fatturate non si fattureranno mai: restano lì a dire
  -- «da emettere» per sempre se nessuno le chiude.
  update public.cert_payment_milestones
     set tranche_state = 'pending'
   where certification_id = p_certification_id
     and tranche_state = 'due'
     and not exists (
       select 1 from public.invoice_righe r where r.tranche_id = cert_payment_milestones.id
     );

  return v_credito_id;
end;
$function$;

comment on function public.fn_cancella_progetto(uuid, numeric, text, uuid, text) is
  'Cancella un progetto e, se c''è, registra il credito che resta al cliente. L''importo è deciso da chi cancella: la vista lo propone, la funzione non lo calcola.';

-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.fn_usa_credito(
  p_credito_id uuid,
  p_certification_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_stato text;
  v_origine uuid;
begin
  if not coalesce(public.is_admin(auth.uid()), false) then
    raise exception 'Solo l''amministrazione puo'' usare un credito';
  end if;

  select stato, certification_id_origine into v_stato, v_origine
    from public.crediti_cliente where id = p_credito_id;

  if v_stato is null then
    raise exception 'Il credito indicato non esiste';
  end if;
  if v_stato <> 'aperto' then
    raise exception 'Questo credito è già «%»: non si può usare due volte', v_stato;
  end if;
  if p_certification_id = v_origine then
    raise exception 'Un credito non si usa sul progetto che l''ha generato';
  end if;

  -- Si segna il collegamento, non si scala l'offerta. L'importo di un'offerta lo
  -- scrive una persona: farlo qui vorrebbe dire decidere uno sconto al posto di
  -- chi sta trattando.
  update public.crediti_cliente
     set stato = 'usato',
         usato_su_certification_id = p_certification_id,
         usato_il = current_date
   where id = p_credito_id;
end;
$function$;

comment on function public.fn_usa_credito(uuid, uuid) is
  'Segna che un credito è stato tenuto in conto in un''offerta. Non scala l''importo: quello lo scrive chi tratta.';

-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.fn_chiudi_credito(
  p_credito_id uuid,
  p_stato text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_stato text;
begin
  if not coalesce(public.is_admin(auth.uid()), false) then
    raise exception 'Solo l''amministrazione puo'' chiudere un credito';
  end if;
  if p_stato not in ('rimborsato', 'perso') then
    raise exception 'Un credito si chiude «rimborsato» o «perso»: «%» non è uno stato', p_stato;
  end if;

  select stato into v_stato from public.crediti_cliente where id = p_credito_id;
  if v_stato is null then
    raise exception 'Il credito indicato non esiste';
  end if;
  if v_stato <> 'aperto' then
    raise exception 'Questo credito è già «%»', v_stato;
  end if;

  update public.crediti_cliente
     set stato = p_stato,
         note = case
                  when nullif(btrim(coalesce(p_note, '')), '') is null then note
                  when note is null then btrim(p_note)
                  else note || E'\n' || btrim(p_note)
                end
   where id = p_credito_id;
end;
$function$;

comment on function public.fn_chiudi_credito(uuid, text, text) is
  'Porta un credito a «rimborsato» o «perso». Non lo cancella: cancellarlo perderebbe la prova di una promessa fatta a un cliente.';

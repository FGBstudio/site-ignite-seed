-- ═══════════════════════════════════════════════════════════════════════════
-- Cancellare non deve mentire sullo stato delle tranche
--
-- La versione di prima, cancellando un progetto, riportava le tranche `due` a
-- `pending`. L'intenzione era giusta — quelle tranche non si fattureranno mai e
-- non devono restare nel «da emettere» — ma il mezzo era una bugia: `pending`
-- vuol dire «l'evento non è ancora arrivato», e quell'evento **è** arrivato. Il
-- lavoro era stato consegnato; è il progetto che è morto dopo.
--
-- Lo stato di una tranche descrive un fatto, e i fatti non si riscrivono per
-- far sparire una riga da un elenco. L'elenco impara a filtrare: le tranche dei
-- progetti cancellati non sono da emettere perché il progetto è cancellato, non
-- perché il loro stato dice qualcosa di falso.
--
-- Nei dati c'erano già due tranche di progetti cancellati (3.360) e due di una
-- quotazione **non ancora approvata** (15.400) in attesa di fatturazione: la
-- seconda è peggio della prima — è una fattura pronta per un lavoro che nessuno
-- ci ha ancora commissionato.
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

  -- Le tranche restano come sono: dicono cosa è successo, e cosa è successo non
  -- cambia perché il progetto è stato cancellato. È il «da emettere» che non le
  -- mostra più, perché guarda anche lo stato del progetto.
  return v_credito_id;
end;
$function$;

-- Payments, fase 4 — solleciti, blocco e sblocco.
--
-- Il blocco per insoluto NON e' uno stato nuovo: e' `on_hold`, quello che ferma
-- gia' i progetti, con la causa dichiarata. Un secondo stato di fermo avrebbe
-- voluto dire due posti da guardare per sapere se un progetto e' fermo, e due
-- risposte diverse quando i due non concordano.

/**
 * Registra un sollecito.
 *
 * Su una fattura senza residuo non si sollecita: e' gia' uscita dal recall, e
 * un sollecito su chi ha pagato e' il genere di errore che costa un cliente.
 * Il divieto sta qui e non nel modulo perche' e' una regola, non un consiglio.
 */
create or replace function public.fn_registra_sollecito(
  p_invoice_id uuid,
  p_canale text,
  p_nota text default null,
  p_prossimo date default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  v_id uuid;
begin
  if not coalesce(public.is_admin(auth.uid()), false) then
    raise exception 'Solo l''amministrazione registra i solleciti';
  end if;

  select * into v from public.v_invoices where id = p_invoice_id;
  if not found then raise exception 'Fattura inesistente'; end if;

  if v.residual <= 0 then
    raise exception 'La fattura % non ha residuo: e'' gia'' uscita dal recall', v.number;
  end if;

  insert into public.invoice_reminders (invoice_id, date, channel, note, created_by)
  values (p_invoice_id, current_date, p_canale, p_nota, auth.uid())
  returning id into v_id;

  -- Il contatore e le date vivono sulla fattura perche' e' li' che si guardano:
  -- «quanti solleciti ha avuto» non deve costare una sottoquery ogni riga.
  update public.invoices
     set reminders_count = reminders_count + 1,
         last_reminder_date = current_date,
         next_reminder_date = p_prossimo,
         updated_at = now()
   where id = p_invoice_id;

  return v_id;
end;
$$;

/**
 * Ferma il progetto perche' non e' stato pagato.
 *
 * Salva lo stato operativo da cui si viene, cosi' lo sblocco sa dove tornare:
 * senza, riprendere vorrebbe dire indovinare a che punto era il lavoro.
 */
create or replace function public.fn_blocca_per_insoluto(
  p_invoice_id uuid,
  p_motivo text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  v_cert record;
begin
  if not coalesce(public.is_admin(auth.uid()), false) then
    raise exception 'Solo l''amministrazione puo'' bloccare un progetto';
  end if;

  select * into v from public.v_invoices where id = p_invoice_id;
  if not found then raise exception 'Fattura inesistente'; end if;
  if v.certification_id is null then
    raise exception 'La fattura % non e'' legata a una commessa: non c''e'' niente da bloccare', v.number;
  end if;
  if v.residual <= 0 then
    raise exception 'La fattura % e'' saldata: non si blocca un progetto gia'' pagato', v.number;
  end if;

  select * into v_cert from public.certifications where id = v.certification_id;

  update public.certifications
     set on_hold = true,
         on_hold_cause = 'unpaid',
         on_hold_reason = coalesce(p_motivo, 'Mancato pagamento ' || v.number),
         on_hold_at = now(),
         on_hold_by = auth.uid(),
         -- Solo se non era gia' fermo: sovrascrivere qui vorrebbe dire perdere
         -- lo stato buono e riportare il progetto a «fermo» anche dopo lo sblocco.
         on_hold_previous_status = case
           when coalesce(v_cert.on_hold, false) then v_cert.on_hold_previous_status
           else v_cert.status
         end
   where id = v.certification_id;

  -- Tutte le fatture ancora scoperte di quella commessa seguono: il progetto e'
  -- fermo per il credito nel suo insieme, non per una riga sola.
  update public.invoices i
     set lifecycle_state = 'blocked', updated_at = now()
    from public.v_invoices f
   where f.id = i.id
     and i.certification_id = v.certification_id
     and f.residual > 0
     and i.lifecycle_state in ('issued', 'in_recall');

  perform public.fn_apri_alert(
    'project_on_hold',
    'Progetto fermo per insoluto · ' || coalesce(v_cert.name, ''),
    'Bloccato per ' || v.number || ' — residuo ' || to_char(v.residual, 'FM999G999G990D00') ||
      '. Si sblocca da solo quando il credito rientra.',
    'blocco_insoluto:' || v.certification_id::text,
    v.certification_id,
    p_invoice_id
  );
end;
$$;

/**
 * Riprende il progetto.
 *
 * Torna allo stato operativo da cui era stato fermato, non a uno stato scelto
 * adesso. Causa, autore e data restano scritti: sono la memoria di cos'e'
 * successo, e servono quando fra sei mesi qualcuno chiede perche' quel
 * progetto si e' fermato.
 */
create or replace function public.fn_sblocca_progetto(p_certification_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cert record;
begin
  if not coalesce(public.is_admin(auth.uid()), false) then
    raise exception 'Solo l''amministrazione puo'' sbloccare un progetto';
  end if;

  select * into v_cert from public.certifications where id = p_certification_id;
  if not found then raise exception 'Commessa inesistente'; end if;

  update public.certifications
     set on_hold = false,
         status = coalesce(v_cert.on_hold_previous_status, v_cert.status),
         on_hold_cause = null
         -- `on_hold_reason`, `on_hold_at` e `on_hold_by` restano: raccontano
         -- l'ultimo blocco, e cancellarli vorrebbe dire far finta di niente.
   where id = p_certification_id;

  -- Le fatture tornano dove le mette la loro scadenza, non dove erano prima.
  update public.invoices i
     set lifecycle_state = case when current_date > i.due_date then 'in_recall' else 'issued' end,
         recall_status = case when current_date > i.due_date then 'red' else null end,
         updated_at = now()
    from public.v_invoices f
   where f.id = i.id
     and i.certification_id = p_certification_id
     and i.lifecycle_state = 'blocked'
     and f.residual > 0;

  perform public.fn_chiudi_alert('blocco_insoluto:' || p_certification_id::text);
end;
$$;

/**
 * Il credito rientrato sblocca il progetto da solo.
 *
 * Un progetto fermo per soldi che sono arrivati e' un progetto fermo per
 * niente, e nessuno dovrebbe doversi ricordare di farlo ripartire. Si aggancia
 * a `fn_riallinea_fattura`, che gia' scatta a ogni incasso.
 */
create or replace function public.fn_sblocca_se_credito_rientrato(p_certification_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cert record;
  v_scoperte integer;
begin
  if p_certification_id is null then return; end if;

  select * into v_cert from public.certifications where id = p_certification_id;
  if not found or not coalesce(v_cert.on_hold, false) then return; end if;
  -- Si tocca solo quello che Payments ha fermato: un progetto fermo per ragioni
  -- operative non riparte perche' e' arrivato un bonifico.
  if v_cert.on_hold_cause is distinct from 'unpaid' then return; end if;

  select count(*) into v_scoperte
    from public.v_invoices where certification_id = p_certification_id and residual > 0;

  if v_scoperte = 0 then
    update public.certifications
       set on_hold = false,
           status = coalesce(on_hold_previous_status, status),
           on_hold_cause = null
     where id = p_certification_id;

    perform public.fn_chiudi_alert('blocco_insoluto:' || p_certification_id::text);
  end if;
end;
$$;

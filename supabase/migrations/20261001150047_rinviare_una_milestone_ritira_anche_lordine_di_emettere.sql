-- ═══════════════════════════════════════════════════════════════════════════
-- Rinviare una milestone ritira anche l'ordine di emettere
--
-- `fn_rinvia_milestone_pagamento` chiudeva la richiesta di conferma e lasciava
-- aperto l'eventuale `billing_due`. Ma un `billing_due` dice a Payments «emetti
-- questa tranche»: se il PM ha appena detto che il traguardo **non** è
-- raggiunto, quell'ordine è stato ritirato e deve sparire. Altrimenti la
-- fattura parte comunque, dalla parte opposta dello stesso sistema.
--
-- Nei dati ce n'era **uno** in questo stato: un `billing_due` aperto su una
-- tranche che non è esigibile. Viene dall'automatismo di prima, quando chiudere
-- una milestone avvisava Payments nello stesso istante e niente poteva più
-- tornare indietro. Si chiude qui, perché dice a Payments di emettere una cosa
-- che il sistema stesso considera non dovuta.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.fn_rinvia_milestone_pagamento(
  p_milestone_id uuid,
  p_nuova_data date,
  p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_m record;
  t record;
begin
  select m.id, m.certification_id, m.requirement, m.notes, m.step_id, c.pm_id
    into v_m
    from public.certification_milestones m
    join public.certifications c on c.id = m.certification_id
   where m.id = p_milestone_id;

  if v_m.id is null then
    raise exception 'La milestone indicata non esiste';
  end if;
  if not (coalesce(public.is_admin(auth.uid()), false) or v_m.pm_id = auth.uid()) then
    raise exception 'Questa milestone la sposta il PM del progetto';
  end if;
  if p_nuova_data is null then
    raise exception 'Serve la data nuova: «non è raggiunta» da solo non dice quando lo sarà';
  end if;

  -- Si riapre e si sposta. Lo stato torna indietro perché la milestone era stata
  -- data per chiusa da un automatismo: lasciarla «achieved» con una data futura
  -- sarebbe una riga che dice due cose incompatibili. Le date reali si azzerano
  -- per la stessa ragione.
  update public.certification_milestones
     set override_date = p_nuova_data,
         status = 'pending',
         completed_date = null,
         actual_date = null,
         notes = case
                   when nullif(btrim(coalesce(p_motivo, '')), '') is null then notes
                   when notes is null then btrim(p_motivo)
                   else notes || E'\n' || btrim(p_motivo)
                 end
   where id = p_milestone_id;

  -- Le richieste di conferma su questa milestone non hanno più senso: il
  -- traguardo non c'è, e riproporle domani sarebbe chiedere la stessa cosa a cui
  -- si è già risposto.
  update public.task_alerts
     set is_resolved = true, resolved_at = now()
   where alert_type = 'milestone_da_confermare'
     and dedup_key like 'milestone_conferma:' || p_milestone_id::text || ':%'
     and is_resolved = false;

  -- E si ritira l'ordine di emettere, dove era già partito. Una tranche che
  -- torna «prevista» non si fattura, e un avviso che dice il contrario manda la
  -- fattura dalla parte opposta dello stesso sistema.
  if v_m.step_id is not null then
    for t in
      select id from public.cert_payment_milestones
       where certification_id = v_m.certification_id
         and step_id = v_m.step_id
         and tranche_state <> 'invoiced'
    loop
      update public.cert_payment_milestones
         set tranche_state = 'pending'
       where id = t.id and tranche_state = 'due';

      perform public.fn_chiudi_alert('billing_due:' || t.id::text);
    end loop;
  end if;
end;
$function$;

comment on function public.fn_rinvia_milestone_pagamento(uuid, date, text) is
  'La risposta opposta al timbro: il traguardo non è raggiunto, la data si sposta, la tranche torna prevista e l''ordine di emettere si ritira. Non toccа le tranche già fatturate: quelle si correggono con una nota di credito, non spostando una data.';

-- ═══════════════════════════════════════════════════════════════════════════
-- L'avviso rimasto in piedi dall'automatismo vecchio
-- ═══════════════════════════════════════════════════════════════════════════

update public.task_alerts a
   set is_resolved = true, resolved_at = now()
 where a.alert_type = 'billing_due'
   and a.is_resolved = false
   and exists (
     select 1 from public.cert_payment_milestones t
      where a.dedup_key = 'billing_due:' || t.id::text
        and t.tranche_state <> 'due'
   );

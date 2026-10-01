-- ═══════════════════════════════════════════════════════════════════════════
-- Fra «il sistema pensa che sia fatta» e «Payments emette» entra una persona
--
-- Il trigger smette di portare la tranche a esigibile e di avvisare Payments.
-- Chiede invece al PM di timbrare: la tranche resta `pending`, che è la verità
-- — l'evento non è confermato da nessuno.
--
-- L'avviso porta la **data della milestone** in `scheduled_date`, non la data di
-- oggi: così compare nella settimana in cui il traguardo è previsto, che è dove
-- il PM lo sta cercando. Un avviso datato oggi su una milestone di tre settimane
-- fa è un avviso che si legge nel posto sbagliato.
--
-- `fn_conferma_milestone_pagamento` è l'altra metà: timbra, porta la tranche a
-- esigibile, chiude la richiesta di conferma e apre l'avviso a Payments. Quello
-- che prima era un solo passaggio automatico ora sono due, e il secondo ha un
-- nome e un responsabile.
--
-- `fn_rinvia_milestone_pagamento` è la risposta opposta, e serve quanto la prima:
-- se il traguardo **non** è stato raggiunto, il PM sposta la data invece di
-- confermare. Senza questa strada l'unico modo di non confermare sarebbe
-- ignorare l'avviso, e un avviso ignorato torna domani identico.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.trg_milestone_chiude_tranche()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  t record;
  v_nome text;
  v_chiusa boolean;
begin
  if new.step_id is null then
    return new;
  end if;

  -- Chiusa se lo dice lo stato, oppure se e' arrivata una data reale: sono
  -- due modi di dire lo stesso fatto, e prima ne ascoltavamo uno solo.
  v_chiusa :=
       (new.status = 'achieved' and old.status is distinct from 'achieved')
    or (new.completed_date is not null and old.completed_date is null)
    or (new.actual_date is not null and old.actual_date is null);

  if not v_chiusa then
    return new;
  end if;

  select name into v_nome from public.certifications where id = new.certification_id;

  for t in
    select * from public.cert_payment_milestones
     where certification_id = new.certification_id
       and step_id = new.step_id
       and tranche_state = 'pending'
  loop
    -- La tranche **non** si muove. Diventa esigibile quando il PM lo conferma:
    -- finché non lo fa, «previsto» è l'unica cosa vera che si possa dire.
    perform public.fn_apri_alert(
      'milestone_da_confermare',
      'Confermi che «' || coalesce(new.requirement, 'la milestone') || '» è raggiunta?'
        || ' · ' || coalesce(v_nome, ''),
      'Chiudendola diventa esigibile ' || coalesce(t.name, 'una tranche')
        || case when t.amount is not null
                then ' da ' || to_char(t.amount, 'FM999G999G990D00') || ' ' || coalesce((select currency from public.certifications where id = new.certification_id), 'EUR')
                else '' end
        || '. Fino alla tua conferma non viene emessa nessuna fattura.',
      'milestone_conferma:' || new.id::text || ':' || t.id::text,
      new.certification_id,
      null,
      '/pm?conferma=' || new.id::text,
      -- La settimana in cui il traguardo era previsto, non oggi.
      coalesce(new.override_date, new.due_date, current_date)
    );
  end loop;

  return new;
end;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.fn_conferma_milestone_pagamento(
  p_milestone_id uuid,
  p_tranche_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_m record;
  t record;
  v_nome text;
  v_quante integer := 0;
begin
  select m.id, m.certification_id, m.requirement, m.step_id, c.pm_id, c.name
    into v_m
    from public.certification_milestones m
    join public.certifications c on c.id = m.certification_id
   where m.id = p_milestone_id;

  if v_m.id is null then
    raise exception 'La milestone indicata non esiste';
  end if;

  -- Timbra chi ha il progetto, o l'amministrazione. Chiunque altro non ha modo
  -- di sapere se quel traguardo è stato raggiunto.
  if not (coalesce(public.is_admin(auth.uid()), false) or v_m.pm_id = auth.uid()) then
    raise exception 'Questa milestone la conferma il PM del progetto';
  end if;

  if v_m.step_id is null then
    raise exception 'Questa milestone non è agganciata a nessun passo: non sblocca pagamenti';
  end if;

  v_nome := v_m.name;

  for t in
    select * from public.cert_payment_milestones
     where certification_id = v_m.certification_id
       and step_id = v_m.step_id
       and tranche_state = 'pending'
       and (p_tranche_id is null or id = p_tranche_id)
  loop
    update public.cert_payment_milestones
       set tranche_state = 'due'
     where id = t.id;

    -- La richiesta di conferma ha fatto il suo mestiere: si chiude.
    perform public.fn_chiudi_alert('milestone_conferma:' || v_m.id::text || ':' || t.id::text);

    -- E solo adesso Payments lo viene a sapere.
    perform public.fn_apri_alert(
      'billing_due',
      'Milestone confermata — emetti ' || coalesce(t.name, 'la tranche')
        || ' · ' || coalesce(v_nome, ''),
      'Il PM ha confermato «' || coalesce(v_m.requirement, '') || '»: la tranche è esigibile.',
      'billing_due:' || t.id::text,
      v_m.certification_id,
      null,
      '/payments/da-emettere?cert=' || v_m.certification_id::text || '&tranche=' || t.id::text
    );

    v_quante := v_quante + 1;
  end loop;

  return v_quante;
end;
$function$;

comment on function public.fn_conferma_milestone_pagamento(uuid, uuid) is
  'Il timbro del PM: la milestone è raggiunta davvero. Porta le tranche agganciate a esigibili e solo adesso avvisa Payments.';

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
begin
  select m.id, m.certification_id, m.requirement, m.notes, c.pm_id
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

  /**
   * Si riapre e si sposta.
   *
   * Lo stato torna indietro perché la milestone era stata data per chiusa da un
   * automatismo: lasciarla «achieved» con una data futura sarebbe una riga che
   * dice due cose incompatibili. Le date reali si azzerano per la stessa ragione.
   */
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
end;
$function$;

comment on function public.fn_rinvia_milestone_pagamento(uuid, date, text) is
  'La risposta opposta al timbro: il traguardo non è raggiunto, la data si sposta. Senza questa strada l''unico modo di non confermare sarebbe ignorare l''avviso — e un avviso ignorato torna domani identico.';

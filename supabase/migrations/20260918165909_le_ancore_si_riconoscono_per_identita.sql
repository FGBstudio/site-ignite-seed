-- L'inizio cantiere si riconosce dal passo, non dalla sua posizione.
--
-- `fn_refresh_timeline_dates` cercava la milestone dell'inizio lavori
-- confrontando `order_index` con quello del passo a catalogo. Finche' nessuno
-- tocca la scaletta funziona; appena si inserisce o si toglie una riga, le
-- posizioni scorrono e la data di cantiere finisce su un'altra milestone —
-- senza errori, senza avvisi, e con una scadenza sbagliata che sembra giusta.
--
-- Ora il legame passa da `step_id`, che e' l'identita' del passo. Il ripiego
-- sulla posizione resta per le milestone che uno `step_id` non ce l'hanno
-- ancora: e' l'unica informazione che hanno.
--
-- Il backfill di `step_id` sulle milestone gia' esistenti e' stato eseguito a
-- parte, impersonando un amministratore: il trigger che protegge i progetti
-- fermi respinge le modifiche di chiunque altro, e fra le milestone da
-- collegare ce n'erano anche di progetti in hold. 185 collegate su 240; le
-- restanti sono righe di serie o create a mano, e useranno il ripiego.
--
--   update public.certification_milestones m
--      set step_id = s.id
--     from public.cert_timeline_steps s
--    where m.step_id is null
--      and m.milestone_type = 'timeline'
--      and s.timeline_key = public.fn_timeline_key_for_cert(m.certification_id)
--      and s.order_index = m.order_index
--      and s.timing_kind <> 'series';

create or replace function public.fn_refresh_timeline_dates(p_certification_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cert   record;
  v_hand   date;
  v_start  date;
  v_hand_e date;
begin
  select * into v_cert from public.certifications where id = p_certification_id;
  if v_cert.id is null then return; end if;

  v_hand := public.fn_cert_handover(p_certification_id);

  if v_cert.cronoprogramma_id is not null then
    v_start := public.fn_crono_data(v_cert.cronoprogramma_id, 'construction_start');
    select e.data_effettiva into v_hand_e
      from public.cronoprogramma_eventi e
     where e.cronoprogramma_id = v_cert.cronoprogramma_id and e.ancora = 'handover';
  else
    v_hand_e := v_cert.handover_date;
  end if;

  update public.certification_milestones m
     set due_date    = v_hand,
         actual_date = v_hand_e
   where m.certification_id = p_certification_id
     and m.derived_from = 'handover'
     and m.override_date is null
     and (m.due_date is distinct from v_hand or m.actual_date is distinct from v_hand_e);

  if v_start is not null then
    update public.certification_milestones m
       set due_date    = v_start,
           actual_date = v_start,
           derived_from = 'crono_construction_start',
           edit_locked_for_pm = true
     where m.certification_id = p_certification_id
       and m.milestone_type = 'timeline'
       and m.override_date is null
       and (
         m.step_id in (
           select s.id from public.cert_timeline_steps s
            where s.ancora = 'construction_start'
         )
         or (
           m.step_id is null
           and m.order_index in (
             select s.order_index from public.cert_timeline_steps s
              where s.timeline_key = public.fn_timeline_key_for_cert(p_certification_id)
                and s.ancora = 'construction_start')
         )
       )
       and (m.due_date is distinct from v_start
         or m.derived_from is distinct from 'crono_construction_start');
  end if;

  update public.certification_milestones m
     set due_date = public.fn_crono_evento_punto(m.crono_evento_id, m.anchor_point)
                    + coalesce(m.offset_days, 0)
   where m.certification_id = p_certification_id
     and m.milestone_type = 'timeline'
     and m.crono_evento_id is not null
     and m.override_date is null
     and public.fn_crono_evento_punto(m.crono_evento_id, m.anchor_point) is not null
     and m.due_date is distinct from
         (public.fn_crono_evento_punto(m.crono_evento_id, m.anchor_point) + coalesce(m.offset_days, 0));

  update public.certification_milestones m
     set actual_date = r.latest_shipment_date::date, due_date = r.latest_shipment_date::date
    from public.site_air_records r
   where m.certification_id = p_certification_id
     and m.derived_from = 'air_shipment'
     and m.override_date is null
     and r.certification_id = p_certification_id
     and m.actual_date is distinct from r.latest_shipment_date::date;

  update public.certification_milestones m
     set due_date = coalesce(a.actual_date, a.due_date) + m.offset_days
    from public.certification_milestones a
   where m.certification_id = p_certification_id
     and a.certification_id = p_certification_id
     and m.milestone_type = 'timeline' and a.milestone_type = 'timeline'
     and m.crono_evento_id is null
     and m.override_date is null
     and m.anchor_order is not null
     and a.order_index = m.anchor_order
     and coalesce(a.actual_date, a.due_date) is not null
     and m.due_date is distinct from coalesce(a.actual_date, a.due_date) + m.offset_days;

  -- L'override e' la verita' dichiarata: si riversa su due_date perche' i
  -- trigger pagamenti e le viste storiche leggono quella colonna.
  update public.certification_milestones m
     set due_date = m.override_date
   where m.certification_id = p_certification_id
     and m.override_date is not null
     and m.due_date is distinct from m.override_date;
end;
$function$;

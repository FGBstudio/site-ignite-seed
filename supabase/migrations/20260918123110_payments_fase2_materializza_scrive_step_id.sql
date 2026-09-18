-- La timeline materializzata si ricorda da quale passo viene.
--
-- Senza questo, `step_id` resterebbe vuoto su ogni milestone e il ritorno
-- «milestone chiusa → tranche esigibile» non partirebbe mai: i trigger della
-- fase 2 cercano la tranche per identita' del passo, e un campo sempre nullo
-- non trova mai niente. E' il prerequisito di tutta la catena, ed e' una riga.
--
-- Il resto della funzione e' invariato rispetto a com'era.
create or replace function public.fn_materialize_timeline(p_certification_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_key    text;
  v_cert   record;
  v_count  integer := 0;
  v_air    boolean;
  v_energy boolean;
begin
  select * into v_cert from public.certifications where id = p_certification_id;
  if v_cert.id is null then return 0; end if;

  if public.fn_cert_richiede_cronoprogramma(p_certification_id)
     and v_cert.cronoprogramma_id is null then
    return 0;
  end if;

  if exists (select 1 from public.certification_milestones
              where certification_id = p_certification_id and milestone_type = 'timeline') then
    return 0;
  end if;

  v_key := public.fn_timeline_key_for_cert(p_certification_id);
  if v_key is null then return 0; end if;

  v_air    := coalesce(v_cert.has_iaq_monitoring, false)    or lower(coalesce(v_cert.cert_type,'')) = 'air';
  v_energy := coalesce(v_cert.has_energy_monitoring, false) or lower(coalesce(v_cert.cert_type,'')) = 'energy';

  insert into public.certification_milestones (
    certification_id, milestone_type, category, requirement, order_index, status,
    optional, anchor_order, offset_days, derived_from, edit_locked_for_pm, not_applicable,
    ancora, step_id
  )
  select p_certification_id, 'timeline', 'Timeline', s.requirement, s.order_index, 'pending',
         s.optional, s.anchor_order, s.offset_days, s.derived_from,
         (s.timing_kind in ('derived', 'series') or s.ancora is not null),
         case when s.derived_from = 'air_shipment'    and not v_air    then true
              when s.derived_from = 'energy_shipment' and not v_energy then true
              else false end,
         s.ancora,
         -- Il passo di provenienza, per identita'. Mai l'ordine: una riga
         -- inserita in mezzo sposterebbe tutte le posizioni e legherebbe la
         -- tranche alla milestone sbagliata, senza che nessuno se ne accorga.
         s.id
    from public.cert_timeline_steps s
   where s.timeline_key = v_key
     and s.timing_kind <> 'series'
   order by s.order_index;

  get diagnostics v_count = row_count;

  perform public.fn_refresh_timeline_dates(p_certification_id);
  perform public.fn_genera_serie(p_certification_id);
  return v_count;
end;
$function$;

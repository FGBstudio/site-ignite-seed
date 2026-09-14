-- ============================================================================
-- La milestone dichiara a quale ancora corrisponde
--
-- Specifica: v1 §7 punto 1.
--
-- ── Il difetto, per la terza volta ────────────────────────────────────────
--
-- Tre punti del sistema riconoscevano una milestone di cantiere dal suo NOME:
--
--   Gantt admin           cerca "construction phase"   -> 2 scalette su 23
--   usePMDashboard        stessa stringa               -> stesso esito
--   TimelineSetupWizard   cerca "Construction end (Handover)" con la e
--                         minuscola, mentre le scalette scrivono "End"
--                         -> non trova mai niente
--
-- Il primo lascia vuote le colonne Con. Start e Con. Fcst su 587 progetti
-- ID+C. Il terzo spiega perche' `actual_handover_date` aveva 2 righe su 1.135:
-- il ramo che la scrive non si e' mai eseguito.
--
-- Il catalogo `cert_timeline_steps` sa gia' a quale ancora corrisponde ogni
-- passo, ma la milestone materializzata no — quindi chi la legge era costretto
-- a indovinare dal titolo. Con la colonna qui la domanda si risponde leggendo
-- un valore, e la grafia del titolo torna a essere quello che e': testo per gli
-- occhi.
-- ============================================================================

alter table public.certification_milestones
  add column if not exists ancora public.crono_ancora;

create index if not exists cert_milestones_ancora_idx
  on public.certification_milestones (certification_id, ancora)
  where ancora is not null;

comment on column public.certification_milestones.ancora IS
  'L''evento di cronoprogramma a cui questa milestone corrisponde. Sostituisce il riconoscimento per nome.';

-- Le timeline gia' materializzate si allineano dal catalogo, per posizione.
update public.certification_milestones m
   set ancora = s.ancora
  from public.cert_timeline_steps s
 where m.ancora is null
   and m.milestone_type = 'timeline'
   and s.ancora is not null
   and s.timeline_key = public.fn_timeline_key_for_cert(m.certification_id)
   and s.order_index = m.order_index;

-- E d'ora in avanti la scrive la materializzazione.
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
    ancora
  )
  select p_certification_id, 'timeline', 'Timeline', s.requirement, s.order_index, 'pending',
         s.optional, s.anchor_order, s.offset_days, s.derived_from,
         (s.timing_kind in ('derived', 'series') or s.ancora is not null),
         case when s.derived_from = 'air_shipment'    and not v_air    then true
              when s.derived_from = 'energy_shipment' and not v_energy then true
              else false end,
         s.ancora
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

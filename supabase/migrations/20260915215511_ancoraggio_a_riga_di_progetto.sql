-- ============================================================================
-- Fase 0 — Ancoraggio cross-entita': un passo di certificazione si aggancia a
-- una RIGA della project timeline, non solo alle due ancore cablate.
--
-- Flusso v2 §3.2: «il menu "Ancorato a" elenca esclusivamente le righe della
-- PROJECT TIMELINE di questo sito». Finora il motore sapeva fare due cose sole
-- — handover e construction start, riconosciute per `derived_from` — mentre
-- `anchor_order` puntava a un'altra milestone della stessa certificazione.
-- Agganciare un passo a «Tender» o a «Impianti» non era esprimibile.
--
-- Si aggancia per **identita'** (l'id della riga), non per nome: e' la stessa
-- cura applicata al Gantt, alle ancore e alle tranche. Una riga rinominata
-- resta la riga giusta; una riga cancellata sgancia il passo invece di
-- puntare nel vuoto (on delete set null).
--
-- Il motore non e' riscritto: gli si aggiunge un passaggio prima della catena.
-- ============================================================================

-- ── La data di una riga di progetto ───────────────────────────────────────
--
-- La fine se la riga e' una fase, l'inizio se e' una milestone, l'effettiva
-- se e' avvenuta. «Impianti (fine = impianti pronti per test)» significa
-- proprio questo: cio' che sblocca il passo e' la fine della fase.
create or replace function public.fn_crono_evento_data(p_evento_id uuid)
returns date
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(e.data_effettiva, e.data_fine, e.data_pianificata)
    from public.cronoprogramma_eventi e
   where e.id = p_evento_id;
$function$;

alter table public.certification_milestones
  add column if not exists crono_evento_id uuid
    references public.cronoprogramma_eventi(id) on delete set null;

create index if not exists cert_milestones_crono_evento_idx
  on public.certification_milestones (crono_evento_id)
  where crono_evento_id is not null;

comment on column public.certification_milestones.crono_evento_id IS
  'La riga della project timeline da cui questo passo si calcola (con offset_days). Prevale su anchor_order. NULL = passo non ancorato a una riga di progetto.';

-- ── Il motore, esteso ─────────────────────────────────────────────────────
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
    -- L'effettiva separata: una previsione non e' un fatto, e i passi che
    -- pendono dall'handover devono poter distinguere "e' previsto per" da
    -- "e' successo il".
    select e.data_effettiva into v_hand_e
      from public.cronoprogramma_eventi e
     where e.cronoprogramma_id = v_cert.cronoprogramma_id and e.ancora = 'handover';
  else
    -- Senza cronoprogramma la certificazione ha una data sola, che fa
    -- entrambi i ruoli: e' il comportamento storico e non va cambiato.
    v_hand_e := v_cert.handover_date;
  end if;

  -- Handover
  update public.certification_milestones m
     set due_date    = v_hand,
         actual_date = v_hand_e
   where m.certification_id = p_certification_id
     and m.derived_from = 'handover'
     and (m.due_date is distinct from v_hand or m.actual_date is distinct from v_hand_e);

  -- Construction Start, solo quando c'e' un cronoprogramma da cui ereditarlo.
  if v_start is not null then
    update public.certification_milestones m
       set due_date    = v_start,
           actual_date = v_start,
           derived_from = 'crono_construction_start',
           edit_locked_for_pm = true
     where m.certification_id = p_certification_id
       and m.milestone_type = 'timeline'
       and m.order_index in (
             select s.order_index from public.cert_timeline_steps s
              where s.timeline_key = public.fn_timeline_key_for_cert(p_certification_id)
                and s.ancora = 'construction_start')
       and (m.due_date is distinct from v_start
         or m.derived_from is distinct from 'crono_construction_start');
  end if;

  -- ── NUOVO: i passi agganciati a una riga di progetto ────────────────────
  --
  -- Prima della catena interna, perche' un passo calcolato puo' pendere da
  -- uno di questi: se si aggiornassero dopo, la catena leggerebbe la data
  -- vecchia e servirebbe un secondo giro.
  update public.certification_milestones m
     set due_date = public.fn_crono_evento_data(m.crono_evento_id) + coalesce(m.offset_days, 0)
   where m.certification_id = p_certification_id
     and m.milestone_type = 'timeline'
     and m.crono_evento_id is not null
     and public.fn_crono_evento_data(m.crono_evento_id) is not null
     and m.due_date is distinct from
         (public.fn_crono_evento_data(m.crono_evento_id) + coalesce(m.offset_days, 0));

  -- Spedizioni: invariato.
  update public.certification_milestones m
     set actual_date = r.latest_shipment_date::date, due_date = r.latest_shipment_date::date
    from public.site_air_records r
   where m.certification_id = p_certification_id
     and m.derived_from = 'air_shipment'
     and r.certification_id = p_certification_id
     and m.actual_date is distinct from r.latest_shipment_date::date;

  -- La catena dei calcolati interni: invariata, ma non tocca i passi che
  -- ormai pendono da una riga di progetto.
  update public.certification_milestones m
     set due_date = coalesce(a.actual_date, a.due_date) + m.offset_days
    from public.certification_milestones a
   where m.certification_id = p_certification_id
     and a.certification_id = p_certification_id
     and m.milestone_type = 'timeline' and a.milestone_type = 'timeline'
     and m.crono_evento_id is null
     and m.anchor_order is not null
     and a.order_index = m.anchor_order
     and coalesce(a.actual_date, a.due_date) is not null
     and m.due_date is distinct from coalesce(a.actual_date, a.due_date) + m.offset_days;
end;
$function$;

-- ── Chi pende da una riga, in tutto il sito ───────────────────────────────
--
-- Serve all'anteprima della cascata (§3.4): spostando una riga si muovono i
-- passi di TUTTE le certificazioni agganciate, non solo di quella aperta.
-- Ricorsiva perche' un calcolato interno puo' pendere da un passo che a sua
-- volta pende dalla riga.
create or replace function public.fn_cascata_evento(
  p_evento_id uuid,
  p_nuova_data date
)
returns table (
  certification_id uuid,
  certificazione   text,
  pm_id            uuid,
  milestone_id     uuid,
  order_index      integer,
  requirement      text,
  natura           text,
  data_vecchia     date,
  data_nuova       date,
  giorni           integer
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with ev as (
    select e.id, e.cronoprogramma_id, e.ancora
      from public.cronoprogramma_eventi e where e.id = p_evento_id
  ),
  certs as (
    select c.id, c.name, c.pm_id
      from public.certifications c, ev
     where c.cronoprogramma_id = ev.cronoprogramma_id
       and coalesce(c.on_hold, false) = false
  ),
  recursive_base as (
    -- Diretti: ereditati dall'ancora, oppure agganciati a questa riga.
    select m.certification_id, m.id, m.order_index, m.requirement,
           case when m.crono_evento_id = p_evento_id then 'calcolata' else 'ereditata' end as natura,
           m.due_date as vecchia,
           (p_nuova_data + coalesce(case when m.crono_evento_id = p_evento_id then m.offset_days end, 0))::date as nuova
      from public.certification_milestones m
      join certs on certs.id = m.certification_id, ev
     where m.milestone_type = 'timeline'
       and ( m.crono_evento_id = p_evento_id
          or (ev.ancora = 'handover' and m.derived_from = 'handover')
          or (ev.ancora = 'construction_start' and m.derived_from = 'crono_construction_start') )
  )
  select * from (
    with recursive catena as (
      select certification_id, id, order_index, requirement, natura, vecchia, nuova
        from recursive_base
      union all
      select c.certification_id, c.id, c.order_index, c.requirement,
             'calcolata'::text, c.due_date, (k.nuova + c.offset_days)::date
        from public.certification_milestones c
        join catena k on c.anchor_order = k.order_index
                     and c.certification_id = k.certification_id
       where c.milestone_type = 'timeline'
         and c.crono_evento_id is null
         and c.anchor_order is not null
         and c.offset_days is not null
    )
    select k.certification_id, ce.name, ce.pm_id, k.id, k.order_index, k.requirement,
           k.natura, k.vecchia, k.nuova, (k.nuova - k.vecchia)::integer
      from catena k join certs ce on ce.id = k.certification_id
     where k.nuova is distinct from k.vecchia
  ) x(certification_id, certificazione, pm_id, milestone_id, order_index,
      requirement, natura, data_vecchia, data_nuova, giorni)
   order by certificazione, order_index;
$function$;

comment on function public.fn_cascata_evento(uuid, date) IS
  'Cosa si sposterebbe, in tutte le certificazioni del sito, cambiando la data di una riga di progetto. Non scrive: e'' l''anteprima del flusso v2 §3.4.';

-- ── Il trigger propone anche per le righe libere ──────────────────────────
--
-- Prima guardava solo le righe con `ancora`: una riga aggiunta dal PM e poi
-- usata come ancora da un passo non proponeva niente, e le date dei colleghi
-- restavano indietro in silenzio.
create or replace function public.fn_crono_mirror_handover()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_data  date;
  v_prec  date;
  v_cert  record;
  v_dip   boolean;
begin
  v_data := coalesce(new.data_effettiva, new.data_fine, new.data_pianificata);
  if v_data is null then return new; end if;

  v_prec := case when tg_op = 'UPDATE'
                 then coalesce(old.data_effettiva, old.data_fine, old.data_pianificata) end;
  if v_prec is not distinct from v_data then return new; end if;

  -- Una riga senza ancora conta solo se qualcuno ci pende davvero.
  v_dip := exists (
    select 1 from public.certification_milestones m
     where m.crono_evento_id = new.id and m.milestone_type = 'timeline');
  if new.ancora is null and not v_dip then return new; end if;

  for v_cert in
    select c.id, c.pm_id, c.on_hold, c.handover_date
      from public.certifications c
     where c.cronoprogramma_id = new.cronoprogramma_id
  loop
    if coalesce(v_cert.on_hold, false) then continue; end if;

    -- Alla prima compilazione non c'e' niente da proporre: non e' uno
    -- spostamento, e' l'asse che nasce. Si applica e basta.
    if v_prec is null then
      if new.ancora = 'handover' and v_cert.handover_date is distinct from v_data then
        update public.certifications set handover_date = v_data where id = v_cert.id;
      else
        perform public.fn_refresh_timeline_dates(v_cert.id);
      end if;
      continue;
    end if;

    insert into public.cronoprogramma_proposte
      (cronoprogramma_id, certification_id, evento_id, ancora,
       data_precedente, data_nuova, fonte, proposta_da)
    values
      (new.cronoprogramma_id, v_cert.id, new.id,
       coalesce(new.ancora, 'handover'),
       v_prec, v_data, coalesce(new.fonte, 'fonte non indicata'), new.aggiornata_da)
    on conflict (certification_id, ancora) where stato = 'in_sospeso'
    do update set data_nuova      = excluded.data_nuova,
                  data_precedente = coalesce(public.cronoprogramma_proposte.data_precedente, excluded.data_precedente),
                  evento_id       = excluded.evento_id,
                  fonte           = excluded.fonte,
                  proposta_da     = excluded.proposta_da,
                  proposta_il     = now();
  end loop;

  return new;
end;
$function$;

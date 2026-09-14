-- ============================================================================
-- La serie ricorrente
--
-- Specifica: v1 §5, decisione §3.5.
--
-- ── Il problema ───────────────────────────────────────────────────────────
--
-- I report di cantiere sono mensili e fatturabili, quindi il loro numero
-- dipende dalla durata del cronoprogramma. Le tre scalette GC Support li
-- elencano cosi':
--
--   #4  FGB Construction Report No. 1 Issued
--   #5  FGB Construction Report No. 2 Issued
--   #6  FGB Construction Report No. 3 Issued
--   #7  Further FGB Construction Reports (as needed)
--
-- Non e' una serie: e' un elenco tarato su una durata presunta. Un cantiere di
-- dieci mesi produce dieci report dentro un contenitore che ne prevede tre piu'
-- un jolly, e il conteggio reale — cioe' il numero da fatturare — finisce fuori
-- dal sistema. E' il collegamento piu' diretto fra slittamento e ricavo di
-- tutto il progetto, e oggi non e' calcolabile.
--
-- ── Le due regole che contano ─────────────────────────────────────────────
--
-- 1. Le occorrenze gia' emesse non si toccano mai. Un ricalcolo che cancella
--    un report consegnato distrugge sia l'avanzamento sia la base di
--    fatturazione. Se l'handover arretra al punto da rendere "di troppo" un
--    report gia' emesso, si segnala: significa che il periodo si e' accorciato
--    dopo che il lavoro era stato fatto.
--
-- 2. Due conteggi, non uno. Contrattuali (dalla durata assunta in quotazione,
--    cioe' fino alla baseline) e proiettati (dalla durata corrente). La
--    differenza e' la fatturazione addizionale; fonderli fa sparire proprio
--    l'informazione per cui si costruisce il meccanismo.
--
-- ── Perche' la rigenerazione non e' automatica ────────────────────────────
--
-- Non viene chiamata da `fn_refresh_timeline_dates`. Prima per un motivo di
-- dominio — il §3.6 vuole proposta e conferma, non spostamenti silenziosi — e
-- poi per uno tecnico: `trg_milestone_cascade_dates` richiama il refresh a ogni
-- variazione di `actual_date`, e una generazione annidata dentro il refresh
-- aprirebbe un ciclo. C'e' un'anteprima che non scrive e una generazione che
-- scrive, e le chiama chi ha deciso.
-- ============================================================================

-- ── La definizione, sul catalogo ──────────────────────────────────────────
--
-- Le tre nature erano dichiarate in un vincolo, non solo per convenzione. La
-- quarta va aggiunta li': la tabella controlla la propria coerenza, ed e'
-- giusto che continui a farlo.
alter table public.cert_timeline_steps
  drop constraint if exists cert_timeline_steps_timing_kind_check;
alter table public.cert_timeline_steps
  add constraint cert_timeline_steps_timing_kind_check
  check (timing_kind = any (array['manual'::text, 'calculated'::text, 'derived'::text, 'series'::text]));

alter table public.cert_timeline_steps
  add column if not exists series_periodicita    text
    check (series_periodicita is null or series_periodicita in ('mensile')),
  add column if not exists series_ancora_inizio  public.crono_ancora,
  add column if not exists series_ancora_fine    public.crono_ancora;

-- Nello stesso stile degli altri tre vincoli: la natura e i suoi parametri
-- stanno insieme o non stanno affatto.
alter table public.cert_timeline_steps
  drop constraint if exists cert_timeline_steps_series_check;
alter table public.cert_timeline_steps
  add constraint cert_timeline_steps_series_check
  check ((timing_kind = 'series') = (series_periodicita is not null and series_ancora_inizio is not null));

-- ── L'occorrenza, sulla milestone ─────────────────────────────────────────
alter table public.certification_milestones
  add column if not exists series_step_order integer,
  add column if not exists series_index      integer;

create index if not exists cert_milestones_serie_idx
  on public.certification_milestones (certification_id, series_step_order, series_index)
  where series_step_order is not null;

comment on column public.certification_milestones.series_index IS
  'Il numero progressivo dell''occorrenza. Non si riusa e non si rinumera: il report n.3 resta il n.3 anche se il periodo si accorcia.';

-- ── Conversione delle tre scalette GC Support ─────────────────────────────
--
-- Le righe rimosse restano in una tabella di appoggio: la conversione e'
-- reversibile, e senza copia non lo sarebbe.
create table if not exists public._bak_gc_support_report_steps as
select * from public.cert_timeline_steps
 where timeline_key in ('LEED GC Support', 'BREEAM GC Support', 'WELL GC Support')
   and order_index between 4 and 7;

-- Il #4 diventa la serie. Non si rinumerano gli altri passi: `anchor_order`
-- punta a `order_index`, e in tutte e tre le scalette i riferimenti sono a
-- indici >= 8. Rinumerare per estetica romperebbe la catena dei calcolati.
update public.cert_timeline_steps
   set requirement          = 'FGB Construction Report (serie mensile)',
       timing_kind          = 'series',
       series_periodicita   = 'mensile',
       series_ancora_inizio = 'construction_start',
       series_ancora_fine   = 'handover',
       optional             = false
 where timeline_key in ('LEED GC Support', 'BREEAM GC Support', 'WELL GC Support')
   and order_index = 4;

delete from public.cert_timeline_steps
 where timeline_key in ('LEED GC Support', 'BREEAM GC Support', 'WELL GC Support')
   and order_index between 5 and 7;

-- ── Quanti report ─────────────────────────────────────────────────────────
--
-- Regola sul periodo parziale: mese iniziato, report dovuto. E' la decisione
-- aperta §11.1 e va confermata da Payments — e' una regola di fatturazione,
-- non un arrotondamento tecnico. Sta scritta qui in un punto solo apposta:
-- cambiarla e' cambiare questa funzione.
create or replace function public.fn_serie_conteggio(p_inizio date, p_fine date)
returns integer
language sql
immutable
as $function$
  select case
    when p_inizio is null or p_fine is null or p_fine <= p_inizio then 0
    else (extract(year  from age(p_fine, p_inizio)) * 12
        + extract(month from age(p_fine, p_inizio)))::integer
       + case when extract(day from age(p_fine, p_inizio)) > 0 then 1 else 0 end
  end;
$function$;

comment on function public.fn_serie_conteggio(date, date) IS
  'Quante occorrenze mensili fra due date. Mese iniziato = occorrenza dovuta (decisione aperta §11.1, da confermare con Payments).';

-- ── I due conteggi ────────────────────────────────────────────────────────
create or replace function public.fn_serie_conteggi(p_certification_id uuid)
returns table (
  step_order    integer,
  inizio        date,
  fine_baseline date,
  fine_corrente date,
  contrattuali  integer,
  proiettati    integer
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select s.order_index,
         public.fn_crono_data(c.cronoprogramma_id, s.series_ancora_inizio),
         c.baseline_handover_date,
         public.fn_cert_handover(c.id),
         public.fn_serie_conteggio(
           public.fn_crono_data(c.cronoprogramma_id, s.series_ancora_inizio),
           c.baseline_handover_date),
         public.fn_serie_conteggio(
           public.fn_crono_data(c.cronoprogramma_id, s.series_ancora_inizio),
           public.fn_cert_handover(c.id))
    from public.certifications c
    join public.cert_timeline_steps s
      on s.timeline_key = public.fn_timeline_key_for_cert(c.id)
     and s.timing_kind = 'series'
   where c.id = p_certification_id;
$function$;

comment on function public.fn_serie_conteggi(uuid) IS
  'Contrattuali contro proiettati. La differenza e'' la fatturazione addizionale, ed e'' il numero che finisce nella voce di registro.';

-- ── L'anteprima: non scrive niente ────────────────────────────────────────
--
-- Accetta un handover ipotetico, cosi' la stessa funzione serve sia a mostrare
-- lo stato attuale sia a rispondere alla domanda "se il GC sposta a maggio,
-- quanti report diventano?".
create or replace function public.fn_serie_anteprima(
  p_certification_id uuid,
  p_nuovo_handover   date default null
)
returns table (
  step_order         integer,
  totale_ora         integer,
  totale_dopo        integer,
  da_creare          integer,
  da_rimuovere       integer,
  emessi_in_eccesso  integer
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with s as (
    select st.order_index,
           public.fn_crono_data(c.cronoprogramma_id, st.series_ancora_inizio) as inizio,
           coalesce(p_nuovo_handover, public.fn_cert_handover(c.id))          as fine,
           c.id as cert_id
      from public.certifications c
      join public.cert_timeline_steps st
        on st.timeline_key = public.fn_timeline_key_for_cert(c.id)
       and st.timing_kind = 'series'
     where c.id = p_certification_id
  ),
  occ as (
    select m.series_step_order, m.series_index,
           (m.status = 'completed' or m.completed_date is not null or m.actual_date is not null) as emessa
      from public.certification_milestones m
     where m.certification_id = p_certification_id
       and m.series_step_order is not null
  )
  select s.order_index,
         (select count(*) from occ where occ.series_step_order = s.order_index)::integer,
         public.fn_serie_conteggio(s.inizio, s.fine),
         greatest(0, public.fn_serie_conteggio(s.inizio, s.fine)
                   - (select count(*) from occ where occ.series_step_order = s.order_index))::integer,
         (select count(*) from occ
           where occ.series_step_order = s.order_index
             and occ.series_index > public.fn_serie_conteggio(s.inizio, s.fine)
             and not occ.emessa)::integer,
         (select count(*) from occ
           where occ.series_step_order = s.order_index
             and occ.series_index > public.fn_serie_conteggio(s.inizio, s.fine)
             and occ.emessa)::integer
    from s;
$function$;

comment on function public.fn_serie_anteprima(uuid, date) IS
  'Cosa succederebbe alla serie con un handover dato. Non scrive: e'' il pannello che il PM vede prima di confermare.';

-- ── La generazione: scrive, e non distrugge ───────────────────────────────
create or replace function public.fn_genera_serie(p_certification_id uuid)
returns table (
  step_order        integer,
  creati            integer,
  rimossi           integer,
  emessi_in_eccesso integer
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r          record;
  v_n        integer;
  v_creati   integer;
  v_rimossi  integer;
  v_eccesso  integer;
  i          integer;
begin
  for r in
    select st.order_index,
           st.requirement,
           st.optional,
           public.fn_crono_data(c.cronoprogramma_id, st.series_ancora_inizio) as inizio,
           public.fn_cert_handover(c.id)                                       as fine
      from public.certifications c
      join public.cert_timeline_steps st
        on st.timeline_key = public.fn_timeline_key_for_cert(c.id)
       and st.timing_kind = 'series'
     where c.id = p_certification_id
  loop
    v_creati := 0; v_rimossi := 0;

    if r.inizio is null then
      -- Senza construction start non si sa da dove contare. Non si inventa un
      -- inizio: la serie resta vuota e il PM vede che manca il dato.
      step_order := r.order_index; creati := 0; rimossi := 0; emessi_in_eccesso := 0;
      return next;
      continue;
    end if;

    v_n := public.fn_serie_conteggio(r.inizio, r.fine);

    -- Le mancanti. Ogni occorrenza e' una milestone normale: da qui in poi si
    -- comporta come qualunque altro passo — si marca, compare nel Gantt,
    -- contribuisce all'avanzamento.
    for i in 1 .. v_n loop
      if not exists (
        select 1 from public.certification_milestones m
         where m.certification_id = p_certification_id
           and m.series_step_order = r.order_index
           and m.series_index = i
      ) then
        insert into public.certification_milestones (
          certification_id, milestone_type, category, requirement, order_index,
          status, optional, due_date, edit_locked_for_pm, not_applicable,
          series_step_order, series_index
        ) values (
          p_certification_id, 'timeline', 'Timeline',
          'FGB Construction Report No. ' || i || ' Issued',
          r.order_index,
          'pending', coalesce(r.optional, false),
          (r.inizio + (i || ' months')::interval)::date,
          false, false,
          r.order_index, i
        );
        v_creati := v_creati + 1;
      end if;
    end loop;

    -- Le eccedenti, ma solo quelle non emesse.
    delete from public.certification_milestones m
     where m.certification_id = p_certification_id
       and m.series_step_order = r.order_index
       and m.series_index > v_n
       and m.status is distinct from 'completed'
       and m.completed_date is null
       and m.actual_date is null;
    get diagnostics v_rimossi = row_count;

    -- Quelle emesse oltre il nuovo limite restano dove sono. Non e' un errore
    -- da correggere: e' un fatto da far vedere.
    select count(*) into v_eccesso
      from public.certification_milestones m
     where m.certification_id = p_certification_id
       and m.series_step_order = r.order_index
       and m.series_index > v_n;

    step_order := r.order_index;
    creati := v_creati;
    rimossi := v_rimossi;
    emessi_in_eccesso := v_eccesso;
    return next;
  end loop;
end;
$function$;

comment on function public.fn_genera_serie(uuid) IS
  'Genera e rigenera le occorrenze. Aggiunge le mancanti, rimuove le future in eccesso, non tocca mai una occorrenza emessa.';

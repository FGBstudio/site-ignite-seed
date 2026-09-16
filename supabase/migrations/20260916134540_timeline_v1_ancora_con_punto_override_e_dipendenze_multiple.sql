-- SPECIFICA_TIMELINE v1.0 — il modello dati.
--
-- Tre cose che la spec chiede e che lo schema non sapeva dire, piu' una
-- decisione del PO che la spec contraddice.
--
-- 1. ANCORA CON UN PUNTO. Oggi un passo di certificazione si aggancia a una
--    riga di progetto e ne prende «la data» — che fn_crono_evento_data
--    risolve come coalesce(effettiva, fine, pianificata). Su una milestone
--    va bene; su una FASE e' ambiguo, e l'ambiguita' e' silenziosa: «30 gg
--    dopo Construction» non dice se dopo l'inizio o dopo la fine, e su una
--    fase di otto mesi sono otto mesi di differenza. La spec 5 lo scrive
--    esplicito: anchor.point in {start, end}.
--
-- 2. OVERRIDE ESPLICITO. Oggi due_date e' insieme il valore calcolato e il
--    valore scritto a mano: quando il PM corregge una data, il ricalcolo
--    successivo gliela sovrascrive senza dirlo. Con override_date separata
--    la mano del PM sopravvive al ricalcolo (spec 6.4) e la natura del passo
--    diventa leggibile invece che indovinata.
--
-- 3. DIPENDENZE MULTIPLE. ancora_evento_id ne ammetteva una. Il PO ha
--    chiesto «una attivita' ad un'altra oppure a piu'»: serve un ponte.
--    Non un array — con una tabella il controllo anticicli resta una query
--    ricorsiva normale invece di diventare un esercizio.
--
-- 4. IL MOTORE RESTA ACCESO. La spec 6.5 dice «nessun auto-scheduling in
--    v1»; il PO ha deciso il contrario: se il progetto slitta, le attivita'
--    dipendenti si spostano. Questa migrazione segue il PO. Regola con piu'
--    madri: inizio = la PIU' TARDA delle fini + offset (finish-to-start), e
--    la durata dell'attivita' si conserva — slitta tutta, non si comprime.
--
-- Nessun backfill: crono_evento_id, ancora_evento_id e l'avanzamento delle
-- attivita' di progetto hanno zero righe in produzione. Verificato.

-- ── 1. Il punto dell'ancora ──────────────────────────────────────────────
alter table public.certification_milestones
  add column if not exists anchor_point text;
alter table public.cert_timeline_steps
  add column if not exists anchor_point text;

alter table public.certification_milestones
  drop constraint if exists certification_milestones_anchor_point_check;
alter table public.certification_milestones
  add constraint certification_milestones_anchor_point_check
  check (anchor_point is null or anchor_point in ('start','end'));

alter table public.cert_timeline_steps
  drop constraint if exists cert_timeline_steps_anchor_point_check;
alter table public.cert_timeline_steps
  add constraint cert_timeline_steps_anchor_point_check
  check (anchor_point is null or anchor_point in ('start','end'));

comment on column public.certification_milestones.anchor_point is
  'Quale estremo della riga di progetto legge l''ancora: start = inizio, end = fine. NULL equivale a end, che e'' il comportamento storico. Su una fase di otto mesi la differenza fra i due e'' otto mesi: prima non si poteva dire.';

-- ── 2. L'override ────────────────────────────────────────────────────────
alter table public.certification_milestones
  add column if not exists override_date date;

comment on column public.certification_milestones.override_date is
  'La data scritta a mano dal PM. Quando c''e'', vince sull''ancora e sopravvive al ricalcolo (spec 6.4). due_date ne resta la copia materializzata, perche'' i trigger pagamenti e le query storiche leggono quella colonna. Toglierla fa tornare il passo al calcolo automatico.';

-- ── 3. Le dipendenze, molte ──────────────────────────────────────────────
create table if not exists public.crono_dipendenze (
  id            uuid primary key default gen_random_uuid(),
  evento_id     uuid not null references public.cronoprogramma_eventi(id) on delete cascade,
  dipende_da_id uuid not null references public.cronoprogramma_eventi(id) on delete cascade,
  offset_giorni integer not null default 0,
  creata_il     timestamptz not null default now(),
  creata_da     uuid references auth.users(id) on delete set null,
  constraint crono_dipendenze_non_se_stessa check (evento_id <> dipende_da_id),
  constraint crono_dipendenze_unica unique (evento_id, dipende_da_id)
);

create index if not exists crono_dipendenze_evento_idx on public.crono_dipendenze(evento_id);
create index if not exists crono_dipendenze_madre_idx  on public.crono_dipendenze(dipende_da_id);

comment on table public.crono_dipendenze is
  'Dipendenze fra attivita'' della project timeline, molte per attivita''. Finish-to-start: l''inizio della figlia e'' la piu'' tarda delle fini delle madri, piu'' l''offset. Sostituisce cronoprogramma_eventi.ancora_evento_id, che ne ammetteva una sola.';

insert into public.crono_dipendenze (evento_id, dipende_da_id, offset_giorni)
select e.id, e.ancora_evento_id, coalesce(e.offset_giorni, 0)
  from public.cronoprogramma_eventi e
 where e.ancora_evento_id is not null
on conflict do nothing;

alter table public.crono_dipendenze enable row level security;

drop policy if exists crono_dipendenze_read on public.crono_dipendenze;
create policy crono_dipendenze_read on public.crono_dipendenze for select
  using (public.fn_crono_can_read());

drop policy if exists crono_dipendenze_write on public.crono_dipendenze;
create policy crono_dipendenze_write on public.crono_dipendenze for all
  using (exists (select 1 from public.cronoprogramma_eventi e
                  where e.id = evento_id and public.fn_crono_can_write(e.cronoprogramma_id)))
  with check (exists (select 1 from public.cronoprogramma_eventi e
                       where e.id = evento_id and public.fn_crono_can_write(e.cronoprogramma_id)));

-- ── 4. Niente cicli, sul ponte ───────────────────────────────────────────
create or replace function public.fn_crono_dip_vieta_cicli()
returns trigger
language plpgsql
as $$
declare
  v_ciclo boolean;
begin
  with recursive risalita as (
    select new.dipende_da_id as nodo, 1 as passo
    union all
    select d.dipende_da_id, r.passo + 1
      from public.crono_dipendenze d
      join risalita r on d.evento_id = r.nodo
     where r.passo < 50
  )
  select exists (select 1 from risalita where nodo = new.evento_id) into v_ciclo;

  if v_ciclo then
    raise exception 'Dipendenza circolare: questa attivita'' dipende gia'', direttamente o a catena, da quella che le stai assegnando.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crono_dip_vieta_cicli on public.crono_dipendenze;
create trigger trg_crono_dip_vieta_cicli
  before insert or update on public.crono_dipendenze
  for each row execute function public.fn_crono_dip_vieta_cicli();

-- ── 5. Il ricalcolo, con piu' madri ──────────────────────────────────────
create or replace function public.fn_crono_ricalcola(p_cronoprogramma_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_mosse integer := 0;
  v_tot   integer := 0;
  v_giro  integer := 0;
begin
  perform set_config('fgb.ricalcolo', '1', true);

  loop
    v_giro := v_giro + 1;
    exit when v_giro > 20;

    with madri as (
      -- La piu' tarda delle fini: con piu' predecessori si parte quando
      -- l'ultimo ha finito, non quando il primo ha finito.
      select d.evento_id,
             max(public.fn_crono_evento_data(d.dipende_da_id) + d.offset_giorni)::date as inizio
        from public.crono_dipendenze d
        join public.cronoprogramma_eventi e on e.id = d.evento_id
       where e.cronoprogramma_id = p_cronoprogramma_id
         and public.fn_crono_evento_data(d.dipende_da_id) is not null
       group by d.evento_id
    ),
    nuove as (
      select e.id,
             m.inizio,
             -- La durata si conserva: l'attivita' slitta tutta, non si
             -- comprime contro una fine rimasta ferma.
             case when e.data_fine is not null and e.data_pianificata is not null
                  then (m.inizio + (e.data_fine - e.data_pianificata))::date end as fine
        from public.cronoprogramma_eventi e
        join madri m on m.evento_id = e.id
    )
    update public.cronoprogramma_eventi e
       set data_pianificata = n.inizio,
           data_fine        = coalesce(n.fine, e.data_fine),
           stato            = case when e.stato = 'da_confermare' then 'inserita' else e.stato end
      from nuove n
     where e.id = n.id
       and (e.data_pianificata is distinct from n.inizio
         or (n.fine is not null and e.data_fine is distinct from n.fine));

    get diagnostics v_mosse = row_count;
    v_tot := v_tot + v_mosse;
    exit when v_mosse = 0;
  end loop;

  perform set_config('fgb.ricalcolo', '0', true);

  perform public.fn_refresh_timeline_dates(c.id)
     from public.certifications c
    where c.cronoprogramma_id = p_cronoprogramma_id;

  return v_tot;
end;
$function$;

comment on function public.fn_crono_ricalcola(uuid) is
  'Propaga lo slittamento lungo le dipendenze. Finish-to-start con piu'' madri: inizio = max(fine madri) + offset. La durata dell''attivita'' si conserva. Massimo 20 giri: i cicli sono gia'' impediti all''inserimento, il tetto e'' solo una rete.';

create or replace function public.fn_crono_dip_propaga()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_crono uuid;
begin
  if current_setting('fgb.ricalcolo', true) = '1' then return null; end if;
  select cronoprogramma_id into v_crono
    from public.cronoprogramma_eventi
   where id = coalesce(new.evento_id, old.evento_id);
  if v_crono is not null then perform public.fn_crono_ricalcola(v_crono); end if;
  return null;
end;
$$;

drop trigger if exists trg_crono_dip_propaga on public.crono_dipendenze;
create trigger trg_crono_dip_propaga
  after insert or update or delete on public.crono_dipendenze
  for each row execute function public.fn_crono_dip_propaga();

-- ── 6. L'ancora legge il punto giusto ────────────────────────────────────
create or replace function public.fn_crono_evento_punto(p_evento_id uuid, p_punto text)
returns date
language sql
stable security definer
set search_path to 'public'
as $function$
  select case when p_punto = 'start'
              then coalesce(e.data_pianificata, e.data_effettiva)
              else coalesce(e.data_effettiva, e.data_fine, e.data_pianificata)
         end
    from public.cronoprogramma_eventi e
   where e.id = p_evento_id;
$function$;

comment on function public.fn_crono_evento_punto(uuid, text) is
  'La data di un estremo di una riga di progetto. end (o NULL) mantiene il comportamento storico di fn_crono_evento_data; start legge l''inizio. Su una milestone i due coincidono, su una fase no — ed e'' il motivo per cui il punto esiste.';

-- ── 7. L'override vince, e il punto si rispetta ──────────────────────────
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
       and m.order_index in (
             select s.order_index from public.cert_timeline_steps s
              where s.timeline_key = public.fn_timeline_key_for_cert(p_certification_id)
                and s.ancora = 'construction_start')
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

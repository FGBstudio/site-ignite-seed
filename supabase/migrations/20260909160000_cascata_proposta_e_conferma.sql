-- ============================================================================
-- La cascata: proposta, anteprima, conferma, registro
--
-- Specifica: v1 §3.5, §3.6, §8.1 punto 3.
--
-- ── La correzione ─────────────────────────────────────────────────────────
--
-- `fn_crono_mirror_handover`, scritta col motore, allineava subito
-- `certifications.handover_date` di tutte le certificazioni agganciate. Fa
-- funzionare la catena, ma viola il §3.6: chi sposta l'handover muove anche le
-- milestone dei colleghi, che possono avere finestre d'ente o date d'audit che
-- lui non conosce.
--
-- Qui il trigger smette di applicare e comincia a proporre. La data condivisa
-- cambia subito — e' un fatto, ed e' giusto che tutti lo vedano — ma le
-- conseguenze sulle timeline restano una proposta finche' il PM di quella
-- certificazione non la conferma.
--
-- ── Perche' la proposta e' anche la notifica ──────────────────────────────
--
-- Nessuna tabella di notifiche separata. La riga in sospeso *e'* la coda: la
-- schermata mostra "2 conferme in sospeso" leggendo da qui. Un elenco
-- parallelo di avvisi sarebbe una seconda copia dello stesso fatto, e le due
-- copie divergono al primo errore di scrittura.
-- ============================================================================

create table if not exists public.cronoprogramma_proposte (
  id                uuid primary key default gen_random_uuid(),
  cronoprogramma_id uuid not null references public.cronoprogrammi(id) on delete cascade,
  certification_id  uuid not null references public.certifications(id) on delete cascade,
  evento_id         uuid references public.cronoprogramma_eventi(id) on delete set null,
  ancora            public.crono_ancora not null,

  data_precedente   date,
  data_nuova        date not null,
  fonte             text not null,

  proposta_da       uuid references auth.users(id) on delete set null,
  proposta_il       timestamptz not null default now(),

  stato             text not null default 'in_sospeso'
                    check (stato in ('in_sospeso', 'confermata', 'rifiutata')),
  confermata_da     uuid references auth.users(id) on delete set null,
  confermata_il     timestamptz
);

-- Una sola proposta pendente per (certificazione, ancora): se il GC cambia
-- idea due volte prima che il PM confermi, vale l'ultima. Accumularle
-- costringerebbe a confermare una storia invece che uno stato.
create unique index if not exists crono_proposte_una_pendente
  on public.cronoprogramma_proposte (certification_id, ancora)
  where stato = 'in_sospeso';

create index if not exists crono_proposte_per_cert
  on public.cronoprogramma_proposte (certification_id, stato);

comment on table public.cronoprogramma_proposte IS
  'Uno spostamento di data di cantiere in attesa che il PM della certificazione lo confermi. La riga in sospeso e'' anche la notifica.';

-- ── Il trigger propone invece di applicare ────────────────────────────────
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
begin
  if new.ancora is null then return new; end if;

  v_data := coalesce(new.data_effettiva, new.data_pianificata);
  if v_data is null then return new; end if;

  v_prec := case when tg_op = 'UPDATE'
                 then coalesce(old.data_effettiva, old.data_pianificata) end;
  if v_prec is not distinct from v_data then return new; end if;

  for v_cert in
    select c.id, c.pm_id, c.on_hold, c.handover_date
      from public.certifications c
     where c.cronoprogramma_id = new.cronoprogramma_id
  loop
    -- Un progetto in hold non si muove e non riceve proposte: il vincolo
    -- esiste gia' altrove, qui lo si rispetta invece di inciamparci.
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
      (new.cronoprogramma_id, v_cert.id, new.id, new.ancora,
       v_prec, v_data, coalesce(new.fonte, 'fonte non indicata'), new.aggiornata_da)
    on conflict (certification_id, ancora) where stato = 'in_sospeso'
    do update set data_nuova    = excluded.data_nuova,
                  data_precedente = coalesce(public.cronoprogramma_proposte.data_precedente, excluded.data_precedente),
                  fonte         = excluded.fonte,
                  proposta_da   = excluded.proposta_da,
                  proposta_il   = now();
  end loop;

  return new;
end;
$function$;

-- ── L'anteprima: cosa si muove, cosa no ───────────────────────────────────
--
-- Segue la catena degli ancoraggi in modo ricorsivo, perche' non tutti i
-- calcolati pendono direttamente dall'handover: in WELL NC il submission pende
-- dai risultati della performance verification, che e' un passo deciso dal PM
-- — e infatti non si muove. E' proprio questa la parte che il PM deve vedere:
-- non "tutto slitta", ma esattamente cosa slitta e cosa no.
create or replace function public.fn_cascata_anteprima(
  p_certification_id uuid,
  p_nuova_data       date
)
returns table (
  milestone_id uuid,
  order_index  integer,
  requirement  text,
  natura       text,
  data_vecchia date,
  data_nuova   date,
  giorni       integer
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with recursive catena as (
    select m.id, m.order_index, m.requirement,
           'ereditata'::text as natura,
           m.due_date as vecchia,
           p_nuova_data as nuova
      from public.certification_milestones m
     where m.certification_id = p_certification_id
       and m.milestone_type = 'timeline'
       and m.derived_from = 'handover'
    union all
    select c.id, c.order_index, c.requirement,
           'calcolata'::text,
           c.due_date,
           (k.nuova + c.offset_days)::date
      from public.certification_milestones c
      join catena k on c.anchor_order = k.order_index
     where c.certification_id = p_certification_id
       and c.milestone_type = 'timeline'
       and c.anchor_order is not null
       and c.offset_days is not null
  )
  select id, order_index, requirement, natura, vecchia, nuova,
         (nuova - vecchia)::integer
    from catena
   where nuova is distinct from vecchia
   order by order_index;
$function$;

comment on function public.fn_cascata_anteprima(uuid, date) IS
  'Le milestone che si sposterebbero con un handover diverso. I passi decisi dal PM non compaiono: non si muovono.';

-- ── Il verdetto contrattuale ──────────────────────────────────────────────
--
-- La domanda che rende l'anteprima utile a chi decide invece che solo a chi
-- pianifica: la fine stimata resta dentro il contratto?
create or replace function public.fn_cascata_verdetto(
  p_certification_id uuid,
  p_nuova_data       date
)
returns table (
  fine_stimata       date,
  scadenza_contratto date,
  giorni_oltre       integer,
  a_rischio          boolean,
  baseline           date,
  scostamento_baseline integer,
  report_contrattuali  integer,
  report_proiettati    integer
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    (select max(data_nuova) from public.fn_cascata_anteprima(p_certification_id, p_nuova_data)),
    c.contract_end_date,
    case when c.contract_end_date is not null then
      ((select max(data_nuova) from public.fn_cascata_anteprima(p_certification_id, p_nuova_data))
       - c.contract_end_date)::integer end,
    coalesce(
      (select max(data_nuova) from public.fn_cascata_anteprima(p_certification_id, p_nuova_data))
      > c.contract_end_date, false),
    c.baseline_handover_date,
    (p_nuova_data - c.baseline_handover_date)::integer,
    (select contrattuali from public.fn_serie_conteggi(p_certification_id) limit 1),
    (select totale_dopo from public.fn_serie_anteprima(p_certification_id, p_nuova_data) limit 1)
  from public.certifications c
 where c.id = p_certification_id;
$function$;

-- ── La conferma ───────────────────────────────────────────────────────────
--
-- Applica, poi scrive la voce di registro coi derivati gia' dentro. I derivati
-- si congelano qui e non si ricalcolano dopo: la voce racconta cosa si sapeva
-- quel giorno, ed e' su quella che Payments negozia. Ricalcolata a posteriori
-- non varrebbe niente in trattativa.
create or replace function public.fn_conferma_cascata(p_proposta_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  p        record;
  v_verd   record;
  v_reg_id uuid;
begin
  select * into p from public.cronoprogramma_proposte where id = p_proposta_id and stato = 'in_sospeso';
  if p.id is null then
    raise exception 'Proposta inesistente o gia'' trattata';
  end if;

  select * into v_verd from public.fn_cascata_verdetto(p.certification_id, p.data_nuova);

  if p.ancora = 'handover' then
    update public.certifications
       set handover_date = p.data_nuova
     where id = p.certification_id;
  end if;

  -- Le date derivate si riallineano dal motore, non a mano: un secondo posto
  -- che calcola le stesse date sarebbe un secondo posto da tenere allineato.
  perform public.fn_refresh_timeline_dates(p.certification_id);
  perform public.fn_genera_serie(p.certification_id);

  insert into public.cronoprogramma_registro
    (cronoprogramma_id, evento_id, chi, data_precedente, data_nuova, fonte,
     scostamento_giorni, scostamento_baseline_giorni, fine_stimata,
     scadenza_contratto, report_contrattuali, report_proiettati, note)
  values
    (p.cronoprogramma_id, p.evento_id, coalesce(auth.uid(), p.proposta_da),
     p.data_precedente, p.data_nuova, p.fonte,
     (p.data_nuova - p.data_precedente)::integer,
     v_verd.scostamento_baseline,
     v_verd.fine_stimata,
     v_verd.scadenza_contratto,
     v_verd.report_contrattuali,
     v_verd.report_proiettati,
     (select name from public.certifications where id = p.certification_id))
  returning id into v_reg_id;

  update public.cronoprogramma_proposte
     set stato = 'confermata', confermata_da = auth.uid(), confermata_il = now()
   where id = p_proposta_id;

  return v_reg_id;
end;
$function$;

comment on function public.fn_conferma_cascata(uuid) IS
  'Applica lo spostamento a una certificazione e scrive la voce di registro gia'' monetizzata.';

-- ── Le conferme in sospeso ────────────────────────────────────────────────
create or replace function public.fn_conferme_in_sospeso(p_solo_mie boolean default true)
returns table (
  proposta_id      uuid,
  certification_id uuid,
  certificazione   text,
  sito             text,
  pm_id            uuid,
  ancora           public.crono_ancora,
  data_precedente  date,
  data_nuova       date,
  fonte            text,
  proposta_il      timestamptz,
  milestone_da_spostare integer
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select pr.id, c.id, c.name, s.name, c.pm_id, pr.ancora,
         pr.data_precedente, pr.data_nuova, pr.fonte, pr.proposta_il,
         (select count(*)::integer from public.fn_cascata_anteprima(c.id, pr.data_nuova))
    from public.cronoprogramma_proposte pr
    join public.certifications c on c.id = pr.certification_id
    join public.sites s on s.id = c.site_id
   where pr.stato = 'in_sospeso'
     and (not p_solo_mie or c.pm_id = auth.uid() or coalesce(public.is_admin(auth.uid()), false))
   order by pr.proposta_il desc;
$function$;

-- ── Riservatezza ──────────────────────────────────────────────────────────
alter table public.cronoprogramma_proposte enable row level security;

drop policy if exists crono_proposte_select on public.cronoprogramma_proposte;
create policy crono_proposte_select on public.cronoprogramma_proposte
  for select to authenticated using (public.fn_crono_can_read());

-- Le proposte le scrive il trigger, non le persone.
drop policy if exists crono_proposte_update on public.cronoprogramma_proposte;
create policy crono_proposte_update on public.cronoprogramma_proposte
  for update to authenticated
  using (
    coalesce(public.is_admin(auth.uid()), false)
    or exists (select 1 from public.certifications c
                where c.id = certification_id and c.pm_id = auth.uid())
  )
  with check (true);

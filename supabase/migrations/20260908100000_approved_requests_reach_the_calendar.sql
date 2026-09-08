-- ============================================================================
-- Una richiesta approvata finisce sul calendario
--
-- `hr_requests` e `hr_availability` non si parlavano. Approvare una ferie
-- cambiava lo stato della richiesta e nient'altro: il calendario condiviso
-- continuava a mostrare la persona in ufficio, e la Saturation Matrix — che
-- legge hr_availability per sapere chi e' pianificabile — continuava a
-- caricarla di lavoro nei giorni in cui era in ferie.
--
-- Le due tabelle erano state costruite per essere lette insieme e non si sono
-- mai toccate. Nessuno se n'e' accorto perche' il modulo non e' ancora in uso:
-- zero richieste, zero timbrature.
--
-- ── Come si traducono ─────────────────────────────────────────────────────
--
--   holiday -> vacation      permit -> permit (con le ore)      travel -> travel
--
-- Solo nei giorni feriali: il calendario copre i giorni lavorativi, e scrivere
-- una ferie di sabato aggiungerebbe righe in giorni che nel calendario non
-- esistono.
--
-- ── Perche' un trigger e non una chiamata dal frontend ────────────────────
--
-- Perche' la regola vale a prescindere da chi approva: l'interfaccia oggi, un
-- import domani, una correzione fatta a mano stanotte. Il collegamento fra le
-- due tabelle e' un fatto del dominio, non un passaggio dell'interfaccia.
-- ============================================================================

-- Da dove viene una riga di calendario. NULL = scritta a mano.
alter table public.hr_availability
  add column if not exists source_request_id uuid
  references public.hr_requests(id) on delete set null;

comment on column public.hr_availability.source_request_id IS
  'La richiesta approvata che ha generato questa riga. NULL se e'' stata scritta a mano. Serve a poterla ritirare se l''approvazione viene revocata.';

create index if not exists hr_availability_source_request_idx
  on public.hr_availability (source_request_id)
  where source_request_id is not null;

create or replace function public.fn_hr_sync_request_to_availability()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_status public.hr_availability_status;
  v_hours  numeric;
begin
  -- Approvata adesso: si scrivono i giorni.
  if new.status = 'approved' and coalesce(old.status::text, '') <> 'approved' then

    v_status := case new.type
                  when 'holiday' then 'vacation'
                  when 'permit'  then 'permit'
                  when 'travel'  then 'travel'
                end::public.hr_availability_status;

    -- Le ore di un permesso, quando gli orari ci sono. Servono alla matrice di
    -- saturazione per sapere quanto pesa davvero.
    if new.type = 'permit' and new.start_time is not null and new.end_time is not null then
      v_hours := round(extract(epoch from (new.end_time - new.start_time)) / 3600.0, 2);
    else
      v_hours := null;
    end if;

    insert into public.hr_availability (user_id, date, status, hours_planned, note, source_request_id)
    select new.user_id,
           d::date,
           v_status,
           v_hours,
           nullif(btrim(coalesce(new.reason, '')), ''),
           new.id
      from generate_series(new.start_date::date, new.end_date::date, interval '1 day') d
     where extract(isodow from d) <= 5
    on conflict (user_id, date) do update
       set status            = excluded.status,
           hours_planned     = excluded.hours_planned,
           note              = excluded.note,
           source_request_id = excluded.source_request_id,
           updated_at        = now();

  -- Approvazione revocata: si ritirano solo le righe nate da questa richiesta.
  -- Quelle scritte a mano non si toccano: non le ha messe l'approvazione e non
  -- tocca all'approvazione toglierle.
  elsif coalesce(old.status::text, '') = 'approved' and new.status <> 'approved' then
    delete from public.hr_availability
     where source_request_id = new.id;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_hr_request_to_availability on public.hr_requests;
create trigger trg_hr_request_to_availability
  after update of status on public.hr_requests
  for each row execute function public.fn_hr_sync_request_to_availability();

-- Cancellare una richiesta approvata deve ritirare anche i suoi giorni.
-- La chiave esterna e' ON DELETE SET NULL, che lascerebbe le righe orfane e
-- indistinguibili da quelle scritte a mano.
create or replace function public.fn_hr_request_deleted()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  delete from public.hr_availability where source_request_id = old.id;
  return old;
end;
$function$;

drop trigger if exists trg_hr_request_deleted on public.hr_requests;
create trigger trg_hr_request_deleted
  before delete on public.hr_requests
  for each row execute function public.fn_hr_request_deleted();

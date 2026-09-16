-- ============================================================================
-- L'ancora e' una riga, non una parola di vocabolario
--
-- Due difetti, una causa sola.
--
-- 1. Nella project timeline non si poteva agganciare una riga a un'altra. Un
--    cronoprogramma vero e' fatto di dipendenze — le finiture partono dopo gli
--    impianti — e senza di esse spostare una data significa rifare tutte le
--    altre a mano.
--
-- 2. L'interfaccia offriva come bersagli gli otto nomi dell'enum
--    `crono_ancora` — «Lancio gara d'appalto», «Involucro chiuso»… — anche
--    quando nella timeline del sito quelle righe non esistevano, perche' il PM
--    aveva importato il gantt vero o le aveva cancellate. Erano voci a caso:
--    un vocabolario astratto offerto al posto delle righe reali.
--
-- La cura e' la stessa dappertutto in questo sistema: **si punta per
-- identita'**. L'enum resta, ma solo per i due ruoli che il motore deve
-- riconoscere — handover e construction start — e smette di essere l'elenco
-- che si mostra a chi lavora.
-- ============================================================================

alter table public.cronoprogramma_eventi
  add column if not exists ancora_evento_id uuid
    references public.cronoprogramma_eventi(id) on delete set null,
  add column if not exists offset_giorni integer;

alter table public.cronoprogramma_eventi
  drop constraint if exists crono_eventi_non_ancora_se_stessa;
alter table public.cronoprogramma_eventi
  add constraint crono_eventi_non_ancora_se_stessa
  check (ancora_evento_id is null or ancora_evento_id <> id);

comment on column public.cronoprogramma_eventi.ancora_evento_id IS
  'La riga precedente da cui questa si calcola, nello stesso cronoprogramma. NULL = data decisa a mano.';
comment on column public.cronoprogramma_eventi.offset_giorni IS
  'Giorni dopo la riga di ancoraggio. Si somma alla sua data di fine (o inizio, se e'' una milestone).';

-- ── Niente cicli ──────────────────────────────────────────────────────────
--
-- Un anello fra tre righe manderebbe il ricalcolo a girare su se stesso. Si
-- rifiuta alla scrittura, dove si puo' ancora spiegare cos'e' successo.
create or replace function public.fn_crono_vieta_cicli()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_cur uuid := new.ancora_evento_id;
  v_n   integer := 0;
begin
  while v_cur is not null and v_n < 50 loop
    if v_cur = new.id then
      raise exception 'Questa riga finirebbe per dipendere da se stessa: scegli un''altra ancora.';
    end if;
    select ancora_evento_id into v_cur from public.cronoprogramma_eventi where id = v_cur;
    v_n := v_n + 1;
  end loop;
  return new;
end;
$function$;

drop trigger if exists trg_crono_vieta_cicli on public.cronoprogramma_eventi;
create trigger trg_crono_vieta_cicli
  before insert or update of ancora_evento_id on public.cronoprogramma_eventi
  for each row when (new.ancora_evento_id is not null)
  execute function public.fn_crono_vieta_cicli();

-- ── Il ricalcolo della project timeline ───────────────────────────────────
--
-- Le righe agganciate prendono la data dalla loro ancora piu' l'offset. Una
-- fase conserva la propria durata: si sposta, non si allunga — e' cio' che fa
-- qualunque pianificatore, ed e' cio' che il PM si aspetta.
--
-- Iterativo e non ricorsivo perche' la catena e' corta e l'ordine non e'
-- garantito: si ripassa finche' qualcosa cambia, al massimo venti volte.
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
  -- Il ricalcolo scrive sulla stessa tabella che lo innesca: senza questa
  -- bandiera il trigger si richiamerebbe a ogni riga.
  perform set_config('fgb.ricalcolo', '1', true);

  loop
    v_giro := v_giro + 1;
    exit when v_giro > 20;

    with nuove as (
      select e.id,
             (public.fn_crono_evento_data(e.ancora_evento_id) + coalesce(e.offset_giorni, 0))::date as inizio,
             case when e.data_fine is not null and e.data_pianificata is not null
                  then (public.fn_crono_evento_data(e.ancora_evento_id) + coalesce(e.offset_giorni, 0)
                        + (e.data_fine - e.data_pianificata))::date end as fine
        from public.cronoprogramma_eventi e
       where e.cronoprogramma_id = p_cronoprogramma_id
         and e.ancora_evento_id is not null
         and public.fn_crono_evento_data(e.ancora_evento_id) is not null
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

  -- Le certificazioni agganciate leggono queste date: vanno riallineate.
  perform public.fn_refresh_timeline_dates(c.id)
     from public.certifications c
    where c.cronoprogramma_id = p_cronoprogramma_id;

  return v_tot;
end;
$function$;

comment on function public.fn_crono_ricalcola(uuid) IS
  'Ricalcola le righe agganciate della project timeline e riallinea le certificazioni. Le fasi si spostano conservando la durata.';

-- ── Una riga che si muove muove le sue ───────────────────────────────────
create or replace function public.fn_crono_propaga()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if coalesce(current_setting('fgb.ricalcolo', true), '0') = '1' then
    return new;
  end if;
  if coalesce(new.data_effettiva, new.data_fine, new.data_pianificata)
     is not distinct from coalesce(old.data_effettiva, old.data_fine, old.data_pianificata) then
    return new;
  end if;
  if exists (select 1 from public.cronoprogramma_eventi
              where ancora_evento_id = new.id) then
    perform public.fn_crono_ricalcola(new.cronoprogramma_id);
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_crono_propaga on public.cronoprogramma_eventi;
create trigger trg_crono_propaga
  after update on public.cronoprogramma_eventi
  for each row execute function public.fn_crono_propaga();

-- ── I vincoli di precedenza parlano di righe, non di parole ──────────────
--
-- `fn_cert_violazioni` confrontava il passo con l'ancora dell'enum. Se nella
-- timeline del sito quella riga non esiste — perche' il gantt vero e' un
-- altro — il vincolo non ha bersaglio e non deve dire niente: meglio tacere
-- che nominare una riga che il PM non ha davanti.
create or replace function public.fn_cert_vincoli_risolti(p_certification_id uuid)
returns table (
  order_index integer,
  operatore   text,
  evento_id   uuid,
  evento_nome text,
  evento_data date,
  messaggio   text
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select k.order_index, k.operatore, e.id, e.nome,
         public.fn_crono_evento_data(e.id), k.messaggio
    from public.cert_step_constraints k
    join public.certifications c on c.id = p_certification_id
    join public.cronoprogramma_eventi e
      on e.cronoprogramma_id = c.cronoprogramma_id
     and e.ancora = k.ancora
   where k.timeline_key = public.fn_timeline_key_for_cert(p_certification_id);
$function$;

comment on function public.fn_cert_vincoli_risolti(uuid) IS
  'I vincoli di precedenza della scaletta, risolti sulle righe vere della project timeline del sito. Un vincolo senza bersaglio non compare.';

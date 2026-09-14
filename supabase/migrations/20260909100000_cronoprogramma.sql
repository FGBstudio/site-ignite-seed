-- ============================================================================
-- Il cronoprogramma
--
-- Specifica di riferimento: specifica-cronoprogramma-v1.md §2, §3.5.
--
-- Interamente additiva: tre tabelle nuove, una colonna nullable su
-- certifications, due funzioni e le policy delle nuove tabelle. Non modifica
-- dati, non tocca trigger esistenti, non rimuove niente. Si annulla lasciando
-- cadere le tre tabelle, la colonna e le due funzioni.
--
-- ── Perche' non si chiama "cantiere" ──────────────────────────────────────
--
-- Perche' contiene anche eventi che precedono il cantiere: il lancio della
-- gara e l'aggiudicazione avvengono prima che il cantiere esista, e le loro
-- date non stanno nel gantt del GC ma dal committente. Chiamarlo cantiere
-- avrebbe garantito che fra sei mesi qualcuno creasse una seconda tabella per
-- ospitare la prima meta' dell'asse.
--
-- ── Le tre tabelle ────────────────────────────────────────────────────────
--
--   cronoprogrammi          l'intervento: appartiene a un sito solo
--   cronoprogramma_eventi   le date, ciascuna con la propria fonte
--   cronoprogramma_registro chi ha cambiato cosa, e quanto costa
-- ============================================================================

-- ── L'intervento ──────────────────────────────────────────────────────────
create table if not exists public.cronoprogrammi (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references public.sites(id) on delete cascade,
  nome        text,
  stato       text not null default 'attivo'
              check (stato in ('attivo', 'chiuso')),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.cronoprogrammi IS
  'Un intervento su un sito, con il suo asse temporale. Un sito puo'' averne piu'' d''uno nel tempo (rifacimenti successivi), mai piu'' d''uno attivo insieme.';
comment on column public.cronoprogrammi.site_id IS
  'Obbligatorio. Lo store dentro un mall sono due siti, ciascuno col proprio cronoprogramma: nessuna relazione molti-a-molti.';

-- Il vincolo che fa vincere l'aggancio sulla creazione.
--
-- Non e' solo igiene: e' il meccanismo del §3.4. Quando la seconda
-- certificazione nasce su un sito che ha gia' un cronoprogramma attivo, creare
-- non e' un'alternativa piu' comoda dell'agganciarsi — e' impossibile. E' cosi'
-- che le date discordanti smettono di prodursi alla fonte, invece di essere
-- riconciliate dopo.
create unique index if not exists cronoprogrammi_uno_solo_attivo_per_sito
  on public.cronoprogrammi (site_id)
  where stato = 'attivo';

-- ── Gli eventi ────────────────────────────────────────────────────────────
--
-- Le otto ancore canoniche del §2.2. Sono le stesse in un fit-out e in una
-- nuova costruzione — la distinzione fra i due tipi di cantiere non produce
-- ancore diverse, e per questo non esiste un campo "tipo".
do $$
begin
  if not exists (select 1 from pg_type where typname = 'crono_ancora') then
    create type public.crono_ancora as enum (
      -- prima del cantiere: le date vengono dal committente o dalla DL
      'lancio_gara',
      'aggiudicazione_gc',
      'progetto_definitivo',
      -- durante: dal gantt del GC, o a mano
      'construction_start',
      'impianti_pronti',
      'involucro_chiuso',
      'sito_pronto_test',
      'handover'
    );
  end if;
end $$;

create table if not exists public.cronoprogramma_eventi (
  id                uuid primary key default gen_random_uuid(),
  cronoprogramma_id uuid not null references public.cronoprogrammi(id) on delete cascade,

  -- Le ancore canoniche portano il valore dell'enum. Gli eventi che il PM
  -- aggiunge perche' il gantt del GC li contiene davvero hanno ancora NULL e
  -- vivono solo di nome: l'asse e' una lista ordinata di eventi, non un
  -- insieme di colonne fisse (§2.1).
  ancora            public.crono_ancora,
  nome              text not null,
  ordine            integer not null,

  -- La previsione e il fatto sono due cose diverse. Finche' il cantiere non
  -- consegna, un'effettiva non esiste: e' la previsione a guidare il ricalcolo.
  data_pianificata  date,
  data_effettiva    date,

  -- La fonte sta sull'evento, non sul cronoprogramma (§2.1). Sullo stesso asse
  -- convivono date messe a mano dal PM a marzo e date importate dal GC a
  -- settembre: un unico "aggiornato al" mentirebbe su meta' di esse.
  fonte             text,
  stato             text not null default 'da_confermare'
                    check (stato in ('inserita', 'da_confermare', 'confermata')),
  aggiornata_il     timestamptz,
  aggiornata_da     uuid references auth.users(id) on delete set null,

  created_at        timestamptz not null default now(),

  -- Una data senza fonte non e' un dato, e' un'opinione: l'admin non puo'
  -- distinguere una nostra previsione da un impegno del GC.
  constraint crono_eventi_data_ha_fonte
    check (
      (data_pianificata is null and data_effettiva is null)
      or nullif(btrim(coalesce(fonte, '')), '') is not null
    )
);

-- Ogni ancora canonica compare una volta sola per cronoprogramma. Gli eventi
-- liberi del PM non sono vincolati: puo' averne quanti ne servono.
create unique index if not exists crono_eventi_ancora_unica
  on public.cronoprogramma_eventi (cronoprogramma_id, ancora)
  where ancora is not null;

create index if not exists crono_eventi_per_crono
  on public.cronoprogramma_eventi (cronoprogramma_id, ordine);

comment on column public.cronoprogramma_eventi.data_effettiva IS
  'Quando e'' successo davvero. Si scrive una volta sola, a cose avvenute. Non e'' "l''ultima previsione": quella e'' data_pianificata.';

-- ── Il registro ───────────────────────────────────────────────────────────
--
-- Non e' un log tecnico. E' il documento su cui Payments negozia la proroga,
-- e per esserlo deve uscire gia' monetizzato: se i derivati vanno ricostruiti
-- a mano ogni volta, in trattativa nessuno lo aprira'.
create table if not exists public.cronoprogramma_registro (
  id                uuid primary key default gen_random_uuid(),
  cronoprogramma_id uuid not null references public.cronoprogrammi(id) on delete cascade,
  evento_id         uuid references public.cronoprogramma_eventi(id) on delete set null,

  chi               uuid not null references auth.users(id),
  quando            timestamptz not null default now(),

  data_precedente   date,
  data_nuova        date,
  fonte             text not null,

  -- I derivati, calcolati al momento in cui la voce si scrive. Congelati
  -- apposta: raccontano cosa si sapeva allora, e una voce ricalcolata a
  -- posteriori non varrebbe niente in trattativa.
  scostamento_giorni            integer,
  scostamento_baseline_giorni   integer,
  fine_stimata                  date,
  scadenza_contratto            date,
  report_contrattuali           integer,
  report_proiettati             integer,

  note              text,
  created_at        timestamptz not null default now()
);

create index if not exists crono_registro_per_crono
  on public.cronoprogramma_registro (cronoprogramma_id, quando desc);

comment on column public.cronoprogramma_registro.scostamento_baseline_giorni IS
  'Rispetto alla baseline contrattuale della certificazione, non rispetto alla data precedente: e'' il numero su cui si chiede l''estensione.';

-- ── L'aggancio ────────────────────────────────────────────────────────────
--
-- Nullable, e resta nullable: 427 progetti su 1.135 non hanno cantiere, e non
-- sono progetti a cui manca qualcosa. Vivono sul proprio asse.
alter table public.certifications
  add column if not exists cronoprogramma_id uuid
  references public.cronoprogrammi(id) on delete set null;

create index if not exists certifications_cronoprogramma_idx
  on public.certifications (cronoprogramma_id)
  where cronoprogramma_id is not null;

comment on column public.certifications.cronoprogramma_id IS
  'Il cronoprogramma su cui questa certificazione si innesta. NULL per edificio esistente, monitoraggio e servizi autonomi.';

-- ── Riservatezza ──────────────────────────────────────────────────────────
--
-- "Lettura ampia" (§3.5) vuol dire ampia fra noi, non ampia in assoluto.
-- Questo progetto Supabase serve anche la dashboard cliente, e fra gli utenti
-- autenticati ci sono sette profili esterni con ruolo `viewer`: una policy
-- `to authenticated using (true)` darebbe ai clienti le date dei nostri
-- cantieri e il registro delle trattative di proroga.
create or replace function public.fn_crono_can_read()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(public.is_admin(auth.uid()), false)
      or exists (
           select 1 from public.user_roles r
            where r.user_id = auth.uid()
              and upper(r.role::text) in ('PM', 'ADMIN')
         );
$function$;

-- Scrittura condivisa, ma non da chiunque: i PM delle certificazioni
-- agganciate, piu' chi l'ha creato — perche' al primo salvataggio non c'e'
-- ancora nessuna certificazione agganciata.
--
-- Il controllo non sta qui, sta nella traccia (§3.5): chi scrive lascia una
-- voce di registro con la fonte. Questa policy serve solo a tenere fuori chi
-- non c'entra.
create or replace function public.fn_crono_can_write(p_cronoprogramma_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(public.is_admin(auth.uid()), false)
      or exists (select 1 from public.certifications c
                  where c.cronoprogramma_id = p_cronoprogramma_id
                    and c.pm_id = auth.uid())
      or exists (select 1 from public.cronoprogrammi k
                  where k.id = p_cronoprogramma_id
                    and k.created_by = auth.uid());
$function$;

alter table public.cronoprogrammi          enable row level security;
alter table public.cronoprogramma_eventi   enable row level security;
alter table public.cronoprogramma_registro enable row level security;

drop policy if exists cronoprogrammi_select on public.cronoprogrammi;
create policy cronoprogrammi_select on public.cronoprogrammi
  for select to authenticated using (public.fn_crono_can_read());

-- Crearne uno: chiunque fra noi, ma solo intestandolo a se'.
drop policy if exists cronoprogrammi_insert on public.cronoprogrammi;
create policy cronoprogrammi_insert on public.cronoprogrammi
  for insert to authenticated
  with check (public.fn_crono_can_read() and created_by = auth.uid());

drop policy if exists cronoprogrammi_update on public.cronoprogrammi;
create policy cronoprogrammi_update on public.cronoprogrammi
  for update to authenticated
  using (public.fn_crono_can_write(id))
  with check (public.fn_crono_can_write(id));

drop policy if exists cronoprogrammi_delete on public.cronoprogrammi;
create policy cronoprogrammi_delete on public.cronoprogrammi
  for delete to authenticated using (coalesce(public.is_admin(auth.uid()), false));

drop policy if exists crono_eventi_select on public.cronoprogramma_eventi;
create policy crono_eventi_select on public.cronoprogramma_eventi
  for select to authenticated using (public.fn_crono_can_read());

drop policy if exists crono_eventi_write on public.cronoprogramma_eventi;
create policy crono_eventi_write on public.cronoprogramma_eventi
  for all to authenticated
  using (public.fn_crono_can_write(cronoprogramma_id))
  with check (public.fn_crono_can_write(cronoprogramma_id));

-- Il registro non si corregge e non si cancella: e' la sua unica ragione
-- d'essere. Si scrive e si legge — e non c'e' nessuna policy di UPDATE o
-- DELETE, quindi nemmeno un amministratore lo riscrive passando dall'app.
drop policy if exists crono_registro_select on public.cronoprogramma_registro;
create policy crono_registro_select on public.cronoprogramma_registro
  for select to authenticated using (public.fn_crono_can_read());

drop policy if exists crono_registro_insert on public.cronoprogramma_registro;
create policy crono_registro_insert on public.cronoprogramma_registro
  for insert to authenticated
  with check (public.fn_crono_can_write(cronoprogramma_id) and chi = auth.uid());

-- L'avanzamento: una percentuale, non due controlli.
--
-- Cosa c'era. Su certification_milestones uno `status` a tre valori —
-- pending / in_progress / achieved. Su 280 righe, 7 sono in_progress: il
-- valore di mezzo non lo usa nessuno, perche' non dice niente. «In corso» e'
-- vero per tre mesi di fila e non distingue la settimana uno dalla settimana
-- undici. Sulla project timeline, invece, di avanzamento non c'era proprio
-- nulla: `stato` li' parla dell'affidabilita' della DATA (inserita, da
-- confermare, confermata), che e' un'altra domanda.
--
-- Cosa si fa. Una sola colonna `avanzamento` 0..100, e lo `status` diventa un
-- DERIVATO di quella: 0 = pending, 1..99 = in_progress, 100 = achieved. Non
-- e' una scelta fra il nuovo e il vecchio — e' il vecchio tenuto in vita
-- correttamente. Le query che filtrano status = 'achieved' continuano a
-- funzionare, il PM tocca un comando solo, e i due non possono divergere
-- perche' non sono due dati.
--
-- Il trigger sincronizza nei due sensi: chi scrive la percentuale aggiorna lo
-- status, e chi scrive ancora lo status (codice vecchio, import) ottiene la
-- percentuale coerente. La re-entranza e' esclusa perche' si scrive su NEW
-- dentro un BEFORE, senza UPDATE annidati.
--
-- Il timestamp non e' contorno: una fase ferma al 40% da tre settimane non e'
-- «al 40%», e' «non si sa». Senza la data dell'ultimo aggiornamento la
-- percentuale mente con l'aria di essere precisa.

-- ── 1. Le colonne ────────────────────────────────────────────────────────
alter table public.certification_milestones
  add column if not exists avanzamento smallint not null default 0,
  add column if not exists avanzamento_aggiornato_il timestamptz;

alter table public.certification_milestones
  drop constraint if exists certification_milestones_avanzamento_range;
alter table public.certification_milestones
  add constraint certification_milestones_avanzamento_range
  check (avanzamento between 0 and 100);

alter table public.cronoprogramma_eventi
  add column if not exists avanzamento smallint not null default 0,
  add column if not exists avanzamento_aggiornato_il timestamptz,
  add column if not exists avanzamento_aggiornato_da uuid;

alter table public.cronoprogramma_eventi
  drop constraint if exists cronoprogramma_eventi_avanzamento_range;
alter table public.cronoprogramma_eventi
  add constraint cronoprogramma_eventi_avanzamento_range
  check (avanzamento between 0 and 100);

comment on column public.certification_milestones.avanzamento is
  'Percentuale 0..100 dichiarata dal PM. Unico comando: status ne e'' il derivato (0=pending, 1-99=in_progress, 100=achieved). Su una milestone, che e'' un istante, vale solo 0 o 100 — il 43% di una consegna non esiste e l''interfaccia non lo offre.';

comment on column public.certification_milestones.avanzamento_aggiornato_il is
  'Quando la percentuale e'' stata toccata l''ultima volta. Serve a distinguere «40%» da «40% dichiarato tre settimane fa», che non sono la stessa informazione.';

comment on column public.cronoprogramma_eventi.avanzamento is
  'Percentuale 0..100 di avanzamento del lavoro. Da non confondere con `stato`, che riguarda l''affidabilita'' della data e non l''esecuzione. Sulle milestone vale 0 o 100.';

-- ── 2. status e avanzamento sono lo stesso dato ──────────────────────────
create or replace function public.fn_milestone_avanzamento_status()
returns trigger
language plpgsql
as $$
declare
  v_da_pct boolean;
begin
  if tg_op = 'INSERT' then
    -- All'inserimento comanda la percentuale se e' stata data, altrimenti lo
    -- status: cosi' i seed e le generazioni esistenti non cambiano senso.
    v_da_pct := coalesce(new.avanzamento, 0) <> 0;
  else
    v_da_pct := new.avanzamento is distinct from old.avanzamento;
  end if;

  if v_da_pct then
    new.status := case
      when new.avanzamento >= 100 then 'achieved'
      when new.avanzamento <= 0   then 'pending'
      else 'in_progress'
    end;
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    new.avanzamento := case new.status
      when 'achieved'    then 100
      when 'in_progress' then greatest(1, least(99, coalesce(new.avanzamento, 0)))
      else 0
    end;
  else
    -- Nessuno dei due e' cambiato: si allinea solo se sono incoerenti.
    if new.status = 'achieved' and coalesce(new.avanzamento, 0) < 100 then
      new.avanzamento := 100;
    elsif new.status = 'pending' and coalesce(new.avanzamento, 0) > 0 then
      new.status := case when new.avanzamento >= 100 then 'achieved' else 'in_progress' end;
    end if;
  end if;

  if tg_op = 'INSERT' or new.avanzamento is distinct from old.avanzamento then
    new.avanzamento_aggiornato_il := now();
  end if;

  if new.status = 'achieved' and new.completed_date is null then
    new.completed_date := current_date;
  elsif new.status <> 'achieved' then
    new.completed_date := null;
  end if;

  return new;
end;
$$;

comment on function public.fn_milestone_avanzamento_status() is
  'Tiene status e avanzamento come facce dello stesso dato: chi scrive l''uno ottiene l''altro. Nessun UPDATE annidato, quindi nessuna re-entranza da guardare.';

drop trigger if exists trg_milestone_avanzamento on public.certification_milestones;
create trigger trg_milestone_avanzamento
  before insert or update on public.certification_milestones
  for each row execute function public.fn_milestone_avanzamento_status();

-- Allinea il passato senza inventare nulla: solo le due estremita' certe.
update public.certification_milestones
   set avanzamento = 100
 where status = 'achieved' and avanzamento <> 100;

update public.certification_milestones
   set avanzamento = 50
 where status = 'in_progress' and avanzamento = 0;

-- ── 3. Il timestamp anche sul cronoprogramma ─────────────────────────────
create or replace function public.fn_crono_avanzamento_timbro()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' or new.avanzamento is distinct from old.avanzamento then
    new.avanzamento_aggiornato_il := now();
    new.avanzamento_aggiornato_da := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crono_avanzamento on public.cronoprogramma_eventi;
create trigger trg_crono_avanzamento
  before insert or update on public.cronoprogramma_eventi
  for each row execute function public.fn_crono_avanzamento_timbro();

-- ── 4. Il rollup, pesato sui giorni ──────────────────────────────────────
--
-- La media aritmetica delle righe e' sbagliata e si vede subito: una fase di
-- sei mesi al 10% e una milestone di un giorno al 100% non fanno «55% del
-- progetto». Si pesa sulla durata — le milestone, che durata non hanno,
-- pesano un giorno ciascuna.
create or replace function public.fn_crono_avanzamento(p_cronoprogramma_id uuid)
returns table (pct numeric, righe integer, datate integer, ferme integer)
language sql
stable
as $$
  with r as (
    select e.avanzamento,
           greatest(1, coalesce(e.data_fine, e.data_pianificata) - e.data_pianificata) as peso,
           (e.data_pianificata is not null) as datata,
           (e.avanzamento between 1 and 99
            and coalesce(e.avanzamento_aggiornato_il, '-infinity') < now() - interval '14 days') as ferma
      from public.cronoprogramma_eventi e
     where e.cronoprogramma_id = p_cronoprogramma_id
  )
  select coalesce(round(sum(avanzamento::numeric * peso) / nullif(sum(peso), 0)), 0),
         count(*)::int,
         count(*) filter (where datata)::int,
         count(*) filter (where ferma)::int
    from r;
$$;

comment on function public.fn_crono_avanzamento(uuid) is
  'Avanzamento di una project timeline, pesato sulla durata delle righe. `ferme` conta le righe in corso che nessuno tocca da due settimane: e'' il numero che dice se la percentuale e'' ancora vera.';

create or replace function public.fn_cert_avanzamento(p_cert_id uuid)
returns table (pct numeric, passi integer, fatti integer, ferme integer)
language sql
stable
as $$
  select coalesce(round(avg(m.avanzamento::numeric)), 0),
         count(*)::int,
         count(*) filter (where m.avanzamento >= 100)::int,
         count(*) filter (where m.avanzamento between 1 and 99
                            and coalesce(m.avanzamento_aggiornato_il, '-infinity') < now() - interval '14 days')::int
    from public.certification_milestones m
   where m.certification_id = p_cert_id
     and coalesce(m.not_applicable, false) = false;
$$;

comment on function public.fn_cert_avanzamento(uuid) is
  'Avanzamento di una timeline di certificazione. Qui la media e'' semplice e non pesata: i passi sono istanti, non intervalli, e pesarli su una durata che non hanno sarebbe un numero finto.';

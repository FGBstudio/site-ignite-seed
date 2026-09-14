-- ============================================================================
-- Il motore guarda il cronoprogramma
--
-- Specifica: v1 §3.2 (ereditarieta'), §4.1 (anchor cross-entita'), §7.1.
--
-- ── Il problema di fondo ──────────────────────────────────────────────────
--
-- Oggi tre punti diversi del sistema cercano una milestone per NOME:
--
--   il Gantt          cerca "construction phase"  -> trova 2 scalette su 23
--   il wizard         cerca "Construction end (Handover)" con la e minuscola
--                     -> le scalette dicono "Construction End (Handover)",
--                        quindi non trova mai niente
--   usePMDashboard    stessa stringa del Gantt, stesso esito
--
-- Sono tre istanze dello stesso difetto, e continuerebbero a moltiplicarsi
-- finche' il legame fra un passo di scaletta e un evento di cantiere resta
-- implicito nel testo del passo. Qui diventa esplicito: `cert_timeline_steps`
-- guadagna una colonna che dice a quale ancora corrisponde il passo, e da quel
-- momento nessuno ha piu' motivo di confrontare stringhe.
--
-- Additiva: una colonna nuova sul catalogo, due funzioni nuove, due funzioni
-- riscritte a parita' di comportamento per chi non ha un cronoprogramma.
-- ============================================================================

-- ── Il passo sa a quale evento corrisponde ────────────────────────────────
alter table public.cert_timeline_steps
  add column if not exists ancora public.crono_ancora;

comment on column public.cert_timeline_steps.ancora IS
  'L''evento di cronoprogramma a cui questo passo corrisponde. Sostituisce il riconoscimento per nome: le 23 scalette usano tre grafie diverse per gli stessi due eventi.';

-- Le due grafie di Construction Start: 21 scalette dicono "Construction
-- Start", WELL Core e WELL New Construction dicono "Construction Phase Start".
-- E' la divergenza che tiene vuote le colonne Con. Start del Gantt su 587
-- progetti.
update public.cert_timeline_steps
   set ancora = 'construction_start'
 where ancora is null
   and (requirement ilike 'construction start'
     or requirement ilike 'construction phase start');

update public.cert_timeline_steps
   set ancora = 'handover'
 where ancora is null
   and (derived_from = 'handover' or requirement ilike 'construction end (handover)');

-- ── Che data ha un evento ─────────────────────────────────────────────────
--
-- L'effettiva se c'e', altrimenti la pianificata. Finche' il cantiere non
-- consegna e' la previsione a guidare tutto; quando consegna, il fatto prende
-- il posto della previsione senza che nulla debba essere riscritto.
create or replace function public.fn_crono_data(p_cronoprogramma_id uuid, p_ancora public.crono_ancora)
returns date
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(e.data_effettiva, e.data_pianificata)
    from public.cronoprogramma_eventi e
   where e.cronoprogramma_id = p_cronoprogramma_id
     and e.ancora = p_ancora
   limit 1;
$function$;

-- ── Da dove viene l'handover di una certificazione ────────────────────────
--
-- Un punto solo. Se la certificazione e' agganciata a un cronoprogramma la
-- data e' quella condivisa; altrimenti resta quella propria, perche' 427
-- progetti su 1.135 non hanno cantiere e non ne avranno mai uno.
--
-- Questa e' la funzione che rende vera la frase "Construction Start e Handover
-- non sono piu' dati di input della certificazione". Senza un punto unico di
-- risoluzione resterebbero due strade per scrivere la stessa data, ed e'
-- esattamente cio' che ha prodotto i 13 siti con date discordanti.
create or replace function public.fn_cert_handover(p_certification_id uuid)
returns date
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case
           when c.cronoprogramma_id is not null
             then coalesce(public.fn_crono_data(c.cronoprogramma_id, 'handover'), c.handover_date)
           else c.handover_date
         end
    from public.certifications c
   where c.id = p_certification_id;
$function$;

-- ── Il ricalcolo ──────────────────────────────────────────────────────────
--
-- Rispetto a prima cambia solo da dove arrivano le due date di cantiere.
-- L'incatenamento anchor_order + offset_days e' identico, e per una
-- certificazione senza cronoprogramma il comportamento e' quello di sempre.
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
  -- Senza, resta un passo che il PM compila a mano come ha sempre fatto.
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

  -- Spedizioni: invariato.
  update public.certification_milestones m
     set actual_date = r.latest_shipment_date::date, due_date = r.latest_shipment_date::date
    from public.site_air_records r
   where m.certification_id = p_certification_id
     and m.derived_from = 'air_shipment'
     and r.certification_id = p_certification_id
     and m.actual_date is distinct from r.latest_shipment_date::date;

  -- La catena dei calcolati: invariata.
  update public.certification_milestones m
     set due_date = coalesce(a.actual_date, a.due_date) + m.offset_days
    from public.certification_milestones a
   where m.certification_id = p_certification_id
     and a.certification_id = p_certification_id
     and m.milestone_type = 'timeline' and a.milestone_type = 'timeline'
     and m.anchor_order is not null
     and a.order_index = m.anchor_order
     and coalesce(a.actual_date, a.due_date) is not null
     and m.due_date is distinct from coalesce(a.actual_date, a.due_date) + m.offset_days;
end;
$function$;

-- ── Lo specchio ───────────────────────────────────────────────────────────
--
-- `certifications.handover_date` resta allineata all'handover del
-- cronoprogramma. Non e' ridondanza per pigrizia: cinque trigger esistenti
-- pendono da quella colonna — le tre righe di monitoraggio, il controllo di
-- scostamento, la materializzazione — e staccarla significherebbe riscriverli
-- tutti per un guadagno nullo. La colonna smette di essere una fonte e diventa
-- un riflesso; chi la scrive e' il cronoprogramma.
--
-- La baseline contrattuale non viene toccata: `fn_freeze_baseline_handover`
-- scrive solo quando e' NULL, quindi resta la data su cui si chiede
-- l'estensione, come deve.
create or replace function public.fn_crono_mirror_handover()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_crono uuid;
  v_data  date;
  v_cert  record;
begin
  v_crono := coalesce(new.cronoprogramma_id, old.cronoprogramma_id);
  if v_crono is null then return coalesce(new, old); end if;
  if coalesce(new.ancora, old.ancora) is distinct from 'handover' then
    return coalesce(new, old);
  end if;

  v_data := coalesce(new.data_effettiva, new.data_pianificata);
  if v_data is null then return new; end if;

  for v_cert in
    select id, on_hold from public.certifications
     where cronoprogramma_id = v_crono
       and handover_date is distinct from v_data
  loop
    -- Un progetto in hold non si muove da solo. Il vincolo esiste gia'
    -- (`trg_enforce_cert_not_on_hold`) e qui lo si rispetta invece di
    -- inciamparci: la cascata lo segnalera' come non spostato.
    if coalesce(v_cert.on_hold, false) then
      continue;
    end if;

    update public.certifications
       set handover_date = v_data
     where id = v_cert.id;
  end loop;

  return new;
end;
$function$;

drop trigger if exists trg_crono_mirror_handover on public.cronoprogramma_eventi;
create trigger trg_crono_mirror_handover
  after insert or update of data_pianificata, data_effettiva
  on public.cronoprogramma_eventi
  for each row execute function public.fn_crono_mirror_handover();

-- Agganciare una certificazione a un cronoprogramma ne riallinea subito le
-- date: altrimenti l'aggancio sarebbe una dichiarazione senza effetto fino
-- alla prossima modifica.
create or replace function public.fn_cert_crono_attached()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_data date;
begin
  if new.cronoprogramma_id is null
     or new.cronoprogramma_id is not distinct from old.cronoprogramma_id then
    return new;
  end if;

  v_data := public.fn_crono_data(new.cronoprogramma_id, 'handover');
  if v_data is not null and new.handover_date is distinct from v_data then
    new.handover_date := v_data;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_cert_crono_attached on public.certifications;
create trigger trg_cert_crono_attached
  before update of cronoprogramma_id on public.certifications
  for each row execute function public.fn_cert_crono_attached();

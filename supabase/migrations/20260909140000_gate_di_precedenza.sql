-- ============================================================================
-- Il gate: prima il cronoprogramma, poi la certificazione
--
-- Specifica: v1 §3.1, §3.7, decisione §2 fase 1.
--
-- ── Perche' il gate sta nel motore e non nell'interfaccia ─────────────────
--
-- Perche' oggi la timeline si materializza da sola: `trg_certifications_
-- materialize_timeline` scatta all'inserimento di una certificazione e chiama
-- `fn_materialize_timeline`. Un gate scritto solo nelle schermate sarebbe
-- aggirato dal trigger un istante dopo la creazione, e il PM si troverebbe la
-- timeline gia' fatta con Construction Start e Handover da riempire a mano —
-- cioe' esattamente il comportamento che si vuole togliere.
--
-- ── Perche' e' una precedenza e non un muro ───────────────────────────────
--
-- Un blocco duro su un dato che il PM non ha lo costringe a inventare qualcosa
-- pur di procedere, ed e' il modo classico in cui questi gate producono dati
-- peggiori di quelli che volevano prevenire. Qui il problema non si pone quasi
-- mai: l'handover arriva dalla quotazione ed e' disponibile dal kickoff, quindi
-- il cronoprogramma nasce sempre con almeno una data vera. Construction start,
-- che il GC puo' non aver ancora comunicato, e' ammesso come «da confermare»
-- invece che come campo obbligatorio vuoto.
--
-- Il gate vale per le 12 scalette che toccano il cantiere. Le 7 su edificio
-- esistente e le 4 di monitoraggio non lo hanno: non e' che manchi loro il
-- cantiere, e' che vivono su un asse loro.
-- ============================================================================

-- ── Quali certificazioni hanno bisogno di un cronoprogramma ───────────────
--
-- Non un elenco di nomi di scaletta scritto nel codice: la domanda si risolve
-- guardando se la scaletta ha un passo agganciato a un'ancora di cantiere.
-- Aggiungere domani una scaletta con Construction Start la fa entrare da sola.
create or replace function public.fn_cert_richiede_cronoprogramma(p_certification_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.cert_timeline_steps s
     where s.timeline_key = public.fn_timeline_key_for_cert(p_certification_id)
       and s.ancora is not null
  );
$function$;

comment on function public.fn_cert_richiede_cronoprogramma(uuid) IS
  'Vero per le 12 scalette che toccano il cantiere. Ricavato dalle ancore dei passi, non da un elenco di nomi.';

-- ── Perche' la timeline non si e' generata ────────────────────────────────
--
-- Il motivo va restituito, non lasciato indovinare: "non succede niente" e'
-- il modo piu' rapido per far pensare che il sistema sia rotto.
create or replace function public.fn_cert_gate(p_certification_id uuid)
returns table (bloccata boolean, motivo text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    public.fn_cert_richiede_cronoprogramma(p_certification_id)
      and (select cronoprogramma_id from public.certifications where id = p_certification_id) is null,
    case
      when public.fn_cert_richiede_cronoprogramma(p_certification_id)
       and (select cronoprogramma_id from public.certifications where id = p_certification_id) is null
      then 'Questa certificazione si innesta su un cantiere. Compila prima il cronoprogramma del sito, poi torna qui: Construction Start e Handover li erediterai da li''.'
    end;
$function$;

-- ── Il gate dentro la materializzazione ───────────────────────────────────
--
-- Unica differenza rispetto a prima: la guardia in testa. Il resto e'
-- identico, piu' la chiamata alla serie — che alla prima generazione ci vuole,
-- altrimenti una scaletta GC Support nascerebbe senza nessun report.
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

  -- Il gate. Nessuna eccezione: non e' un errore, e' un "non ancora".
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
    optional, anchor_order, offset_days, derived_from, edit_locked_for_pm, not_applicable
  )
  select p_certification_id, 'timeline', 'Timeline', s.requirement, s.order_index, 'pending',
         s.optional, s.anchor_order, s.offset_days, s.derived_from,
         -- Ereditati e serie sono in sola lettura per il PM: le prime vengono
         -- dal cronoprogramma, le seconde dal motore.
         (s.timing_kind in ('derived', 'series') or s.ancora is not null),
         case when s.derived_from = 'air_shipment'    and not v_air    then true
              when s.derived_from = 'energy_shipment' and not v_energy then true
              else false end
    from public.cert_timeline_steps s
   where s.timeline_key = v_key
     -- La riga di definizione della serie non diventa una milestone: le
     -- milestone sono le sue occorrenze, generate subito dopo.
     and s.timing_kind <> 'series'
   order by s.order_index;

  get diagnostics v_count = row_count;

  perform public.fn_refresh_timeline_dates(p_certification_id);
  perform public.fn_genera_serie(p_certification_id);
  return v_count;
end;
$function$;

-- ── Agganciare sblocca ────────────────────────────────────────────────────
--
-- `trg_cert_crono_attached` (BEFORE) allinea gia' l'handover. Qui, dopo, si
-- materializza: senza, il PM aggancerebbe il cronoprogramma e non vedrebbe
-- succedere niente fino alla modifica successiva.
create or replace function public.fn_cert_crono_attached_after()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.cronoprogramma_id is not null
     and new.cronoprogramma_id is distinct from old.cronoprogramma_id then
    perform public.fn_materialize_timeline(new.id);
    perform public.fn_refresh_timeline_dates(new.id);
  end if;
  return new;
exception when others then
  raise notice 'fn_cert_crono_attached_after: %', sqlerrm;
  return new;
end;
$function$;

drop trigger if exists trg_cert_crono_attached_after on public.certifications;
create trigger trg_cert_crono_attached_after
  after update of cronoprogramma_id on public.certifications
  for each row execute function public.fn_cert_crono_attached_after();

-- ── La scadenza del contratto ─────────────────────────────────────────────
--
-- Non esisteva da nessuna parte, e senza di essa meta' del cruscotto CEO non
-- e' calcolabile: "fine stimata contro scadenza contratto" e' l'indicatore che
-- dice se serve una proroga, ed e' il numero su cui Payments negozia.
--
-- La metto per certificazione, come la baseline dell'handover, perche' e' la
-- commessa ad avere una scadenza — non il sito e non il cantiere. Da
-- confermare: se in quotazione la scadenza e' gia' scritta da qualche parte,
-- questa colonna deve leggerla invece di essere compilata a mano.
alter table public.certifications
  add column if not exists contract_end_date date;

comment on column public.certifications.contract_end_date IS
  'Scadenza contrattuale della commessa. Con la fine stimata forma l''indicatore "contratto a rischio" del cruscotto direzionale.';

-- ═══════════════════════════════════════════════════════════════════════════
-- Una tranche che nessuno può sbloccare non è una tranche
--
-- `tranche_state` ha tre valori e solo due strade per muoversi: il trigger
-- dell'approvazione, che promuove **il solo anticipo**, e il timbro del PM su una
-- milestone, che richiede un `step_id` con una milestone vera dietro. Nessuna
-- interfaccia scrive `due`. Quindi una tranche fuori da quei due casi resta in
-- attesa per sempre: un importo che nessuno potrà mai chiedere al cliente.
--
-- Oggi, sulle 41 in attesa: 34 sono agganciate a un passo con la sua milestone e
-- si sbloccheranno; 2 non hanno né passo, né data, né il trigger della firma; 2
-- sono agganciate a un passo di cui su quel progetto **la milestone non esiste**
-- — 14.000 € appesi a un evento che non arriverà. Quattro righe, non un disastro,
-- ma il meccanismo che le produce è intatto e continuerebbe a produrne.
--
-- Il wizard, intanto, documenta il caso «a scadenza, non legata a un'attività»
-- come «una scelta legittima, ma esplicita». La scelta è legittima davvero, e
-- `cert_payment_milestones` ha perfino le colonne per dirla — `due_date` e
-- `data_prevista`, 13 e 14 righe già compilate. Solo che nessuno le leggeva per
-- promuovere. Il meccanismo era mezzo costruito.
--
-- Qui si chiude, in quattro pezzi.
--
-- **1. La promozione a scadenza.** Ogni mattina le tranche in attesa la cui data
-- è arrivata diventano esigibili, con lo stesso avviso che apre il timbro del PM.
-- Promuove **solo** quelle che non stanno aspettando un lavoro: senza passo, o
-- con un passo di cui non esiste la milestone. Una tranche agganciata a una
-- milestone viva continua ad aspettare quella, perché è l'evento vero, e
-- promuoverla a calendario vorrebbe dire fatturare prima del lavoro — l'errore
-- che l'intero passaggio del timbro esiste per evitare.
--
-- Rispetta anche lo stato del progetto: niente avvisi per un progetto cancellato
-- o per un'offerta non approvata. È la stessa regola che `progettoFatturabile`
-- applica in TypeScript, e qui vale anche quando nessuno sta guardando.
--
-- La chiama il giro giornaliero di Payments, come passo 8: vedi la migrazione
-- `il_lavoro_giornaliero_non_deve_cadere_quando_una_promessa_scade`.
--
-- **2. Un divieto per il futuro.** Una tranche che nasce in attesa deve avere
-- almeno una strada per diventare esigibile: un passo, una data, o il trigger
-- della firma. Solo in INSERT: le righe storiche si lasciano stare, perché
-- correggerle è una decisione su quattro casi concreti e non il compito di un
-- vincolo.
--
-- **3. Una promozione a mano, tracciata.** Perché un caso non previsto ci sarà
-- sempre, e oggi l'unica alternativa è aprire il database. Solo
-- l'amministrazione, con un motivo obbligatorio che finisce nella descrizione
-- dell'avviso: chi legge «da emettere» deve poter sapere perché quella riga è lì.
--
-- **4. Una vista che le nomina.** Il difetto vero non era avere quattro tranche
-- bloccate: era che per trovarle servisse una query scritta a mano. Ora si
-- chiedono.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. La promozione a scadenza ───────────────────────────────────────────
create or replace function public.fn_promuovi_tranche_a_scadenza()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  t record;
  v_quante integer := 0;
begin
  for t in
    select m.id, m.name, m.amount, m.certification_id,
           coalesce(m.due_date, m.data_prevista) as quando,
           c.name as progetto, c.currency
      from public.cert_payment_milestones m
      join public.certifications c on c.id = m.certification_id
     where m.tranche_state = 'pending'
       and coalesce(m.due_date, m.data_prevista) <= current_date
       -- Non sta aspettando un lavoro: nessun passo, o un passo di cui su questo
       -- progetto non esiste la milestone.
       and (
         m.step_id is null
         or not exists (
           select 1 from public.certification_milestones s
            where s.certification_id = m.certification_id
              and s.step_id = m.step_id
         )
       )
       -- Un progetto cancellato o un'offerta non approvata non si fatturano.
       and lower(coalesce(c.status, '')) not in
           ('potential', 'quotation', 'canceled', 'cancelled')
  loop
    update public.cert_payment_milestones
       set tranche_state = 'due'
     where id = t.id;

    perform public.fn_apri_alert(
      'billing_due',
      'Scadenza arrivata — emetti ' || coalesce(t.name, 'la tranche')
        || ' · ' || coalesce(t.progetto, ''),
      'La tranche era prevista al ' || to_char(t.quando, 'DD/MM/YYYY')
        || ' e non è legata a un''attività di progetto: la data è arrivata, quindi è esigibile.',
      'billing_due:' || t.id::text,
      t.certification_id,
      null,
      '/payments/da-emettere?cert=' || t.certification_id::text || '&tranche=' || t.id::text,
      t.quando
    );

    v_quante := v_quante + 1;
  end loop;

  return v_quante;
end;
$function$;

-- ── 2. Il divieto, solo sulle righe nuove ─────────────────────────────────
create or replace function public.trg_tranche_deve_poter_diventare_esigibile()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if coalesce(new.tranche_state, 'pending') <> 'pending' then
    return new;
  end if;

  if new.step_id is not null
     or new.due_date is not null
     or new.data_prevista is not null
     or coalesce(new.trigger_event, '') = 'quotation_signed' then
    return new;
  end if;

  raise exception
    'La tranche «%» non avrebbe modo di diventare esigibile: serve un passo del progetto a cui agganciarla, oppure una data, oppure il trigger della firma. Senza, è un importo che nessuno potrà chiedere.',
    coalesce(new.name, 'senza nome');
end;
$function$;

drop trigger if exists trg_tranche_deve_poter_diventare_esigibile
  on public.cert_payment_milestones;

create trigger trg_tranche_deve_poter_diventare_esigibile
  before insert on public.cert_payment_milestones
  for each row execute function public.trg_tranche_deve_poter_diventare_esigibile();

-- ── 3. La promozione a mano ───────────────────────────────────────────────
create or replace function public.fn_rendi_esigibile_tranche(
  p_tranche_id uuid,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  t record;
begin
  if not coalesce(public.is_admin(auth.uid()), false) then
    raise exception 'Solo l''amministrazione può rendere esigibile una tranche';
  end if;

  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'Serve un motivo: chi legge «da emettere» deve sapere perché questa riga è esigibile';
  end if;

  select m.id, m.name, m.amount, m.certification_id, m.tranche_state,
         c.name as progetto, c.status
    into t
    from public.cert_payment_milestones m
    join public.certifications c on c.id = m.certification_id
   where m.id = p_tranche_id;

  if t.id is null then
    raise exception 'La tranche indicata non esiste';
  end if;
  if t.tranche_state <> 'pending' then
    raise exception 'La tranche «%» non è in attesa: è %', coalesce(t.name, '?'), t.tranche_state;
  end if;
  if lower(coalesce(t.status, '')) in ('potential', 'quotation', 'canceled', 'cancelled') then
    raise exception 'Il progetto «%» è in stato «%»: non c''è niente da fatturare', t.progetto, t.status;
  end if;

  update public.cert_payment_milestones set tranche_state = 'due' where id = t.id;

  perform public.fn_apri_alert(
    'billing_due',
    'Resa esigibile a mano — emetti ' || coalesce(t.name, 'la tranche')
      || ' · ' || coalesce(t.progetto, ''),
    'Decisa dall''amministrazione: ' || btrim(p_motivo),
    'billing_due:' || t.id::text,
    t.certification_id,
    null,
    '/payments/da-emettere?cert=' || t.certification_id::text || '&tranche=' || t.id::text,
    current_date
  );
end;
$function$;

-- ── 4. La vista che le nomina ─────────────────────────────────────────────
create or replace view public.v_tranche_bloccate as
 select m.id as tranche_id,
    m.certification_id,
    c.name as progetto,
    c.status as stato_progetto,
    m.name as tranche,
    m.amount as importo,
    c.currency,
    m.trigger_event,
    m.step_id,
    coalesce(m.due_date, m.data_prevista) as data_prevista,
    case
      when m.step_id is null then 'nessun passo e nessuna data: niente la sbloccherà'
      else 'agganciata a un passo di cui su questo progetto non esiste la milestone'
    end as perche
   from cert_payment_milestones m
   join certifications c on c.id = m.certification_id
  where m.tranche_state = 'pending'
    and lower(coalesce(c.status, '')) not in ('potential', 'quotation', 'canceled', 'cancelled')
    and coalesce(m.trigger_event, '') <> 'quotation_signed'
    and coalesce(m.due_date, m.data_prevista) is null
    and (
      m.step_id is null
      or not exists (
        select 1 from certification_milestones s
         where s.certification_id = m.certification_id and s.step_id = m.step_id
      )
    );

alter view public.v_tranche_bloccate set (security_invoker = on);

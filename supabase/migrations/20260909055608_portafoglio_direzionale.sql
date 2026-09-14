-- ============================================================================
-- Il portafoglio, come lo guarda la direzione
--
-- Specifica: v1 §8.4, decisione domanda 6.
--
-- ── Su base sito, non su base cronoprogramma ──────────────────────────────
--
-- Una vista radicata sul cantiere escluderebbe i 427 progetti che non ne hanno
-- — il 38% del portafoglio — e romperebbe la coerenza con la dashboard cliente,
-- che e' gia' su base sito. Il cronoprogramma e' un attributo di
-- raggruppamento e un filtro, non la radice.
--
-- ── Perche' i numeri li calcola il database ───────────────────────────────
--
-- Perche' gli stessi numeri servono al cruscotto CEO, al dettaglio sito e alla
-- riga espandibile. Calcolati tre volte in TypeScript diventerebbero tre
-- risposte diverse alla stessa domanda entro il primo mese.
--
-- ── Le due misure che non vanno fuse ──────────────────────────────────────
--
--   slittamento     handover corrente contro la baseline contrattuale.
--                   Serve a negoziare: li' la storia conta.
--   ritardo nostro  milestone scadute contro le date correnti.
--                   Serve a decidere oggi: li' conta il presente.
--
-- Il ritardo nostro si misura sempre contro le date correnti, mai contro un
-- piano congelato. Se siamo in ritardo e poi il cantiere slitta, rientriamo nel
-- range e il ritardo si chiude da solo — perche' nei fatti non e' piu' un
-- problema. Un indicatore calcolato su una baseline fissa mostrerebbe rosso a
-- un PM il cui problema si e' appena risolto, e nel giro di poche settimane
-- nessuno guarderebbe piu' quel semaforo.
-- ============================================================================

create or replace function public.fn_portafoglio_siti(p_soglia_stantio integer default 21)
returns table (
  site_id              uuid,
  sito                 text,
  citta                text,
  cliente              text,
  certificazioni       integer,
  storico              boolean,
  cronoprogramma_id    uuid,
  fase_corrente        text,
  fase_data            date,
  slittamento_giorni   integer,
  ritardo_nostro_giorni integer,
  prossima_milestone   text,
  prossima_data        date,
  prossimo_pm          text,
  freschezza_giorni    integer,
  stantio              boolean,
  fine_stimata         date,
  scadenza_contratto   date,
  a_rischio            boolean,
  mesi_proroga         integer,
  report_contrattuali  integer,
  report_proiettati    integer,
  conferme_in_sospeso  integer,
  vincoli_violati      integer
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with certs as (
    select c.*, s.name as sito_nome, s.city, b.name as brand
      from public.certifications c
      join public.sites s  on s.id = c.site_id
      join public.brands b on b.id = s.brand_id
     where lower(coalesce(c.status,'')) not in ('canceled','cancelled','potential','quotation')
  ),
  per_sito as (
    select site_id,
           max(sito_nome) as sito_nome,
           max(city)      as city,
           max(brand)     as brand,
           count(*)::integer as n,
           -- Un sito e' storico quando tutto quello che c'era e' arrivato in
           -- fondo. Non e' incompleto: e' finito, e va marcato come tale
           -- invece di riempire le liste di eccezione con allarmi su lavori
           -- che nessuno riaprira'.
           bool_and(lower(coalesce(status,'')) in ('certificato','completato','online')) as storico,
           max(cronoprogramma_id::text)::uuid as crono,
           max((handover_date - baseline_handover_date))::integer as slittamento,
           min(contract_end_date) as scadenza
      from certs group by site_id
  )
  select
    p.site_id, p.sito_nome, p.city, p.brand, p.n, p.storico, p.crono,

    -- La fase corrente e' l'ultima ancora gia' passata.
    (select e.nome from public.cronoprogramma_eventi e
      where e.cronoprogramma_id = p.crono
        and coalesce(e.data_effettiva, e.data_pianificata) <= current_date
      order by coalesce(e.data_effettiva, e.data_pianificata) desc limit 1),
    (select max(coalesce(e.data_effettiva, e.data_pianificata)) from public.cronoprogramma_eventi e
      where e.cronoprogramma_id = p.crono
        and coalesce(e.data_effettiva, e.data_pianificata) <= current_date),

    p.slittamento,

    (select max(current_date - m.due_date)::integer
       from public.certification_milestones m join certs c on c.id = m.certification_id
      where c.site_id = p.site_id and m.milestone_type = 'timeline'
        and m.due_date < current_date
        and coalesce(m.status,'') <> 'completed' and m.completed_date is null
        and not coalesce(m.not_applicable, false)),

    (select m.requirement from public.certification_milestones m join certs c on c.id = m.certification_id
      where c.site_id = p.site_id and m.milestone_type = 'timeline'
        and m.due_date >= current_date and coalesce(m.status,'') <> 'completed'
        and not coalesce(m.not_applicable, false)
      order by m.due_date limit 1),
    (select min(m.due_date) from public.certification_milestones m join certs c on c.id = m.certification_id
      where c.site_id = p.site_id and m.milestone_type = 'timeline'
        and m.due_date >= current_date and coalesce(m.status,'') <> 'completed'
        and not coalesce(m.not_applicable, false)),
    (select coalesce(pr.full_name, pr.email) from public.certification_milestones m
       join certs c on c.id = m.certification_id
       left join public.profiles pr on pr.id = c.pm_id
      where c.site_id = p.site_id and m.milestone_type = 'timeline'
        and m.due_date >= current_date and coalesce(m.status,'') <> 'completed'
        and not coalesce(m.not_applicable, false)
      order by m.due_date limit 1),

    -- Un dato di cantiere fermo a tre mesi fa produce numeri che sembrano
    -- validi e non lo sono: e' il modo tipico in cui un cruscotto direzionale
    -- perde credibilita'.
    (select (current_date - max(e.aggiornata_il)::date)::integer
       from public.cronoprogramma_eventi e where e.cronoprogramma_id = p.crono),
    coalesce((select (current_date - max(e.aggiornata_il)::date) > p_soglia_stantio
       from public.cronoprogramma_eventi e where e.cronoprogramma_id = p.crono), false),

    (select max(m.due_date) from public.certification_milestones m join certs c on c.id = m.certification_id
      where c.site_id = p.site_id and m.milestone_type = 'timeline'),
    p.scadenza,
    coalesce((select max(m.due_date) from public.certification_milestones m join certs c on c.id = m.certification_id
      where c.site_id = p.site_id and m.milestone_type = 'timeline') > p.scadenza, false),
    -- Arrotondato per eccesso: si negozia in mesi interi, non in giorni.
    ceil(greatest(0, (select max(m.due_date) from public.certification_milestones m join certs c on c.id = m.certification_id
      where c.site_id = p.site_id and m.milestone_type = 'timeline') - p.scadenza) / 30.0)::integer,

    (select sum(x.contrattuali)::integer from certs c
       cross join lateral public.fn_serie_conteggi(c.id) x where c.site_id = p.site_id),
    (select sum(x.proiettati)::integer from certs c
       cross join lateral public.fn_serie_conteggi(c.id) x where c.site_id = p.site_id),

    (select count(*)::integer from public.cronoprogramma_proposte pr join certs c on c.id = pr.certification_id
      where c.site_id = p.site_id and pr.stato = 'in_sospeso'),
    (select count(*)::integer from certs c
       cross join lateral public.fn_cert_violazioni(c.id) v where c.site_id = p.site_id)

  from per_sito p
 order by p.storico, p.sito_nome;
$function$;

comment on function public.fn_portafoglio_siti(integer) IS
  'Una riga per sito. Slittamento e ritardo nostro restano due colonne distinte: fonderle in un semaforo unico distrugge l''informazione per cui il cruscotto esiste.';

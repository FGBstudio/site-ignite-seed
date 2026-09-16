-- L'avanzamento arriva nel portafoglio direzionale.
--
-- Tre colonne nuove in coda a `fn_portafoglio_siti`, e nessun calcolo nuovo:
-- si riusano `fn_crono_avanzamento` (pesata sui giorni) e `fn_cert_avanzamento`,
-- cosi' il numero che vede l'admin nella lista e quello che il PM vede sulla
-- sua timeline sono lo stesso numero. Il commento in testa all'hook
-- `usePortafoglio` dice esattamente perche': tre calcoli paralleli
-- diventerebbero tre risposte diverse entro il primo mese.
--
-- `avanzamento_cert` e' separata apposta: il cantiere al 70% con la
-- certificazione al 10% e' precisamente la situazione che l'admin deve poter
-- vedere a colpo d'occhio, e una percentuale sola la nasconderebbe.
--
-- Il DROP serve perche' cambia il tipo di ritorno. Il chiamante e' uno solo
-- (`usePortafoglio`), verificato prima di eseguirlo.

drop function if exists public.fn_portafoglio_siti(integer);

create function public.fn_portafoglio_siti(p_soglia_stantio integer default 21)
returns table(
  site_id uuid, sito text, citta text, cliente text, certificazioni integer,
  storico boolean, cronoprogramma_id uuid, fase_corrente text, fase_data date,
  slittamento_giorni integer, ritardo_nostro_giorni integer,
  prossima_milestone text, prossima_data date, prossimo_pm text,
  freschezza_giorni integer, stantio boolean, fine_stimata date,
  scadenza_contratto date, a_rischio boolean, mesi_proroga integer,
  report_contrattuali integer, report_proiettati integer,
  conferme_in_sospeso integer, vincoli_violati integer,
  avanzamento integer, avanzamento_cert integer, righe_ferme integer
)
language sql
stable security definer
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
           bool_and(lower(coalesce(status,'')) in ('certificato','completato','online')) as storico,
           max(cronoprogramma_id::text)::uuid as crono,
           max((handover_date - baseline_handover_date))::integer as slittamento,
           min(contract_end_date) as scadenza
      from certs group by site_id
  )
  select
    p.site_id, p.sito_nome, p.city, p.brand, p.n, p.storico, p.crono,

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

    (select (current_date - max(e.aggiornata_il)::date)::integer
       from public.cronoprogramma_eventi e where e.cronoprogramma_id = p.crono),
    coalesce((select (current_date - max(e.aggiornata_il)::date) > p_soglia_stantio
       from public.cronoprogramma_eventi e where e.cronoprogramma_id = p.crono), false),

    (select max(m.due_date) from public.certification_milestones m join certs c on c.id = m.certification_id
      where c.site_id = p.site_id and m.milestone_type = 'timeline'),
    p.scadenza,
    coalesce((select max(m.due_date) from public.certification_milestones m join certs c on c.id = m.certification_id
      where c.site_id = p.site_id and m.milestone_type = 'timeline') > p.scadenza, false),
    ceil(greatest(0, (select max(m.due_date) from public.certification_milestones m join certs c on c.id = m.certification_id
      where c.site_id = p.site_id and m.milestone_type = 'timeline') - p.scadenza) / 30.0)::integer,

    (select sum(x.contrattuali)::integer from certs c
       cross join lateral public.fn_serie_conteggi(c.id) x where c.site_id = p.site_id),
    (select sum(x.proiettati)::integer from certs c
       cross join lateral public.fn_serie_conteggi(c.id) x where c.site_id = p.site_id),

    (select count(*)::integer from public.cronoprogramma_proposte pr join certs c on c.id = pr.certification_id
      where c.site_id = p.site_id and pr.stato = 'in_sospeso'),
    (select count(*)::integer from certs c
       cross join lateral public.fn_cert_violazioni(c.id) v where c.site_id = p.site_id),

    -- ── Avanzamento: lo stesso numero che vede il PM, non uno nuovo ──────
    coalesce((select a.pct::integer from public.fn_crono_avanzamento(p.crono) a), 0),
    coalesce((select round(avg(x.pct))::integer from certs c
       cross join lateral public.fn_cert_avanzamento(c.id) x
      where c.site_id = p.site_id and x.passi > 0), 0),
    coalesce((select a.ferme from public.fn_crono_avanzamento(p.crono) a), 0)
      + coalesce((select sum(x.ferme)::integer from certs c
           cross join lateral public.fn_cert_avanzamento(c.id) x
          where c.site_id = p.site_id), 0)

  from per_sito p
  order by p.storico, p.sito_nome;
$function$;

comment on function public.fn_portafoglio_siti(integer) is
  'Il portafoglio direzionale. `avanzamento` e'' quello del cantiere (pesato sui giorni), `avanzamento_cert` quello medio delle certificazioni del sito: tenerli separati e'' il punto — un cantiere al 70% con la certificazione al 10% e'' la situazione che va vista, e una percentuale sola la nasconderebbe. `righe_ferme` conta le righe in corso che nessuno aggiorna da due settimane.';

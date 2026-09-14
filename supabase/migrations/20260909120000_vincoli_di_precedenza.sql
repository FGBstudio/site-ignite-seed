-- ============================================================================
-- I vincoli di precedenza
--
-- Specifica: v1 §4.3, decisione §3.3.1.
--
-- ── Cosa fanno, e soprattutto cosa non fanno ──────────────────────────────
--
-- Non calcolano date. Generano avvisi.
--
-- La distinzione viene dal §3.3.1: ci sono date che il PM *subisce* — lancio
-- gara, aggiudicazione, prontezza impianti, handover — e date che il PM
-- *decide* — quando emettere le guidelines, quando fare il training. Le prime
-- stanno sul cronoprogramma condiviso. Le seconde restano sue, ma hanno un
-- ordine rispetto alle prime che oggi esiste solo nella testa del PM:
--
--   "le design guidelines vanno emesse prima del capitolato di gara,
--    altrimenti non finiscono nei documenti d'appalto e la certificazione
--    parte gia' in salita"
--
-- Calcolare quelle date sarebbe sbagliato: il PM le decide, e una data imposta
-- da un motore verrebbe ignorata. Segnalare quando l'ordine e' rotto costa
-- molto meno ed e' probabilmente la cosa piu' utile al PM di tutto il lavoro.
--
-- L'avviso scatta anche quando a muoversi e' l'ancora e non il passo: se la
-- gara viene anticipata, le guidelines diventano in ritardo senza che il PM
-- abbia toccato niente. E' il caso che nessuno vede a mano.
-- ============================================================================

create table if not exists public.cert_step_constraints (
  id           uuid primary key default gen_random_uuid(),
  timeline_key text not null,
  order_index  integer not null,
  operatore    text not null check (operatore in ('prima_di', 'dopo_di')),
  ancora       public.crono_ancora not null,
  messaggio    text,
  created_at   timestamptz not null default now(),
  unique (timeline_key, order_index, ancora, operatore)
);

comment on table public.cert_step_constraints IS
  'L''ordine dichiarato fra un passo deciso dal PM e un evento di cronoprogramma. Non produce date: produce avvisi.';

-- ── I quattro del §4.3 ────────────────────────────────────────────────────
--
-- Il riconoscimento per nome qui e' accettabile — e' un popolamento una
-- tantum di una tabella dichiarativa, non una regola valutata a ogni lettura.
-- Da qui in avanti il vincolo vive come riga, non come stringa nel codice.
insert into public.cert_step_constraints (timeline_key, order_index, operatore, ancora, messaggio)
select s.timeline_key, s.order_index, 'prima_di', 'lancio_gara',
       'Va emessa prima del lancio della gara: dopo, non entra nei documenti d''appalto.'
  from public.cert_timeline_steps s
 where s.requirement ilike '%guidelines%'
on conflict do nothing;

insert into public.cert_step_constraints (timeline_key, order_index, operatore, ancora, messaggio)
select s.timeline_key, s.order_index, 'prima_di', 'lancio_gara',
       'I requisiti di gara vanno consegnati prima del lancio della gara.'
  from public.cert_timeline_steps s
 where s.requirement ilike '%tendering%'
on conflict do nothing;

insert into public.cert_step_constraints (timeline_key, order_index, operatore, ancora, messaggio)
select s.timeline_key, s.order_index, 'dopo_di', 'construction_start',
       'Il training del GC ha senso a cantiere aperto.'
  from public.cert_timeline_steps s
 where s.requirement ilike '%gc training%'
on conflict do nothing;

insert into public.cert_step_constraints (timeline_key, order_index, operatore, ancora, messaggio)
select s.timeline_key, s.order_index, 'prima_di', 'handover',
       'Il commissioning va chiuso prima della consegna.'
  from public.cert_timeline_steps s
 where s.requirement ilike '%commissioning tests%'
on conflict do nothing;

-- ── Le violazioni ─────────────────────────────────────────────────────────
--
-- Una riga per vincolo rotto. Nessuna riga quando non c'e' cronoprogramma:
-- senza le date subite non c'e' un ordine da rispettare, e inventare avvisi
-- su un asse che non esiste e' il modo piu' rapido per far ignorare tutti gli
-- avvisi.
create or replace function public.fn_cert_violazioni(p_certification_id uuid)
returns table (
  order_index   integer,
  requirement   text,
  operatore     text,
  ancora        public.crono_ancora,
  data_passo    date,
  data_ancora   date,
  giorni        integer,
  messaggio     text
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with cert as (
    select c.id, c.cronoprogramma_id, public.fn_timeline_key_for_cert(c.id) as k
      from public.certifications c where c.id = p_certification_id
  )
  select m.order_index,
         m.requirement,
         v.operatore,
         v.ancora,
         coalesce(m.actual_date, m.due_date) as data_passo,
         public.fn_crono_data(cert.cronoprogramma_id, v.ancora) as data_ancora,
         (coalesce(m.actual_date, m.due_date) - public.fn_crono_data(cert.cronoprogramma_id, v.ancora))::integer,
         v.messaggio
    from cert
    join public.cert_step_constraints v
      on v.timeline_key = cert.k
    join public.certification_milestones m
      on m.certification_id = cert.id
     and m.milestone_type = 'timeline'
     and m.order_index = v.order_index
   where cert.cronoprogramma_id is not null
     and coalesce(m.actual_date, m.due_date) is not null
     and public.fn_crono_data(cert.cronoprogramma_id, v.ancora) is not null
     and not coalesce(m.not_applicable, false)
     and case v.operatore
           when 'prima_di' then coalesce(m.actual_date, m.due_date) > public.fn_crono_data(cert.cronoprogramma_id, v.ancora)
           when 'dopo_di'  then coalesce(m.actual_date, m.due_date) < public.fn_crono_data(cert.cronoprogramma_id, v.ancora)
         end;
$function$;

comment on function public.fn_cert_violazioni(uuid) IS
  'I vincoli di precedenza rotti su una certificazione. Vuota quando la certificazione non ha un cronoprogramma: senza date subite non c''e'' un ordine da violare.';

alter table public.cert_step_constraints enable row level security;

drop policy if exists cert_step_constraints_select on public.cert_step_constraints;
create policy cert_step_constraints_select on public.cert_step_constraints
  for select to authenticated using (public.fn_crono_can_read());

drop policy if exists cert_step_constraints_write on public.cert_step_constraints;
create policy cert_step_constraints_write on public.cert_step_constraints
  for all to authenticated
  using (coalesce(public.is_admin(auth.uid()), false))
  with check (coalesce(public.is_admin(auth.uid()), false));

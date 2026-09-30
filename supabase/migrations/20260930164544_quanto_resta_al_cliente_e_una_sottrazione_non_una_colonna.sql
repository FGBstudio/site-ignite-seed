-- ═══════════════════════════════════════════════════════════════════════════
-- Quanto resta al cliente è una sottrazione, non una colonna
--
-- Due viste. La prima elenca i crediti con quello che serve per leggerli: il
-- nome del cliente, il progetto che li ha generati, quello dove sono finiti.
-- La seconda è il saldo per cliente — la somma degli aperti, calcolata.
--
-- E una terza cosa, che non è un credito ma la sua **proposta**: quando si sta
-- per cancellare un progetto, quanto il cliente ha pagato in più di quello che
-- gli è stato consegnato. È il numero che il dialogo di cancellazione mostra,
-- e viene da righe che esistono già — non lo si chiede a chi cancella, che
-- dovrebbe andarlo a cercare in due schermate.
--
-- «Consegnato» è la somma delle tranche il cui evento è arrivato: `due` (il
-- lavoro è fatto, la fattura non ancora) e `invoiced`. Le `pending` no — il
-- loro evento non è successo, e quel lavoro non è stato fatto.
-- ═══════════════════════════════════════════════════════════════════════════

create view public.v_crediti_cliente as
select
  cr.id,
  cr.contact_id,
  ct.company_name as cliente,
  cr.certification_id_origine,
  org.name as progetto_origine,
  org.status as stato_progetto_origine,
  cr.importo,
  cr.valuta,
  cr.motivo,
  cr.stato,
  cr.usato_su_certification_id,
  uso.name as progetto_uso,
  cr.usato_il,
  cr.data,
  cr.note,
  cr.created_at,
  pr.full_name as registrato_da
from public.crediti_cliente cr
join public.contacts ct on ct.id = cr.contact_id
left join public.certifications org on org.id = cr.certification_id_origine
left join public.certifications uso on uso.id = cr.usato_su_certification_id
left join public.profiles pr on pr.id = cr.created_by;

comment on view public.v_crediti_cliente is
  'I crediti dei clienti, leggibili: chi, quanto, da quale progetto e dove sono finiti.';

grant select on public.v_crediti_cliente to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════

create view public.v_saldo_credito_cliente as
select
  cr.contact_id,
  ct.company_name as cliente,
  cr.valuta,
  sum(cr.importo) filter (where cr.stato = 'aperto') as credito_aperto,
  count(*) filter (where cr.stato = 'aperto') as quanti_aperti,
  sum(cr.importo) filter (where cr.stato = 'usato') as credito_usato,
  sum(cr.importo) filter (where cr.stato = 'rimborsato') as credito_rimborsato,
  sum(cr.importo) filter (where cr.stato = 'perso') as credito_perso,
  max(cr.data) filter (where cr.stato = 'aperto') as aperto_piu_recente
from public.crediti_cliente cr
join public.contacts ct on ct.id = cr.contact_id
group by cr.contact_id, ct.company_name, cr.valuta;

comment on view public.v_saldo_credito_cliente is
  'Il saldo a credito di un cliente: la somma degli aperti. Non è scritto da nessuna parte — un saldo scritto diverge dal primo credito che cambia stato.';

grant select on public.v_saldo_credito_cliente to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════

create view public.v_credito_da_cancellazione as
select
  c.id as certification_id,
  c.name as progetto,
  c.status,
  c.currency as valuta,
  c.billing_contact_id,
  coalesce(inc.incassato, 0)::numeric(14,2) as incassato,
  coalesce(tr.consegnato, 0)::numeric(14,2) as consegnato,
  coalesce(tr.quante_consegnate, 0) as quante_consegnate,
  coalesce(tr.quante_tranche, 0) as quante_tranche,
  -- La differenza a favore del cliente. Zero quando non c'è: un credito
  -- negativo non è un credito, è un insoluto, e quello ha già la sua strada.
  greatest(coalesce(inc.incassato, 0) - coalesce(tr.consegnato, 0), 0)::numeric(14,2)
    as differenza_a_favore,
  -- Un credito già registrato su questo progetto: serve a non registrarlo due
  -- volte se si riapre il dialogo.
  (select sum(cr.importo) from public.crediti_cliente cr
    where cr.certification_id_origine = c.id and cr.stato <> 'perso')::numeric(14,2)
    as credito_gia_registrato
from public.certifications c
left join lateral (
  select sum(f.paid_amount) as incassato
    from public.v_invoices f
   where f.certification_id = c.id
) inc on true
left join lateral (
  select count(*) as quante_tranche,
         count(*) filter (where m.tranche_state in ('due', 'invoiced')) as quante_consegnate,
         sum(m.amount) filter (where m.tranche_state in ('due', 'invoiced')) as consegnato
    from public.cert_payment_milestones m
   where m.certification_id = c.id
) tr on true;

comment on view public.v_credito_da_cancellazione is
  'Quanto un cliente ha pagato in più di quello che gli è stato consegnato. È la cifra che il dialogo di cancellazione propone: proposta, non imposta — la parte «nostra» la decide una persona.';

grant select on public.v_credito_da_cancellazione to authenticated;

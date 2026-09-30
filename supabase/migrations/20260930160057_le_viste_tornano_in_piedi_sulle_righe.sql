-- ═══════════════════════════════════════════════════════════════════════════
-- Le viste tornano in piedi, appoggiate alle righe
--
-- Togliere `invoices.tranche_id` ha fatto cadere le quattro viste che stavano
-- sopra `v_invoices`. Si ricostruiscono identiche, salvo una che cambia
-- davvero: `v_tranche_fatturazione` si aggancia dalle righe invece che dalla
-- colonna, e cosi' vede anche una tranche fatturata insieme ad altre — prima
-- quella tranche risultava «mai fatturata».
-- ═══════════════════════════════════════════════════════════════════════════

create view public.v_followup_fatture as
select
  f.id, f.number, f.issue_date, f.client_name, f.project_name, f.commessa,
  f.entity_code, f.issuer_name, f.currency,
  (f.total - f.vat_amount)::numeric(14,2) as imponibile,
  f.vat_amount, f.total, f.paid_amount, f.residual, f.due_date, f.days_late,
  f.lifecycle_state, f.recall_status, f.payment_status, f.ammanco_da_recuperare,
  f.data_incasso_attesa, f.data_incasso_attesa_fonte,
  to_char(f.data_incasso_attesa, 'YYYY-MM') as mese_previsto,
  f.lifecycle_state = 'in_recall' as in_recall,
  s.primo_sollecito,
  case when s.primo_sollecito is not null
       then (current_date - s.primo_sollecito) end as giorni_in_recall,
  f.reminders_count, f.ultima_nota, f.ultima_nota_il, f.ultima_nota_tipo,
  f.quante_note, u.ultimo_incasso
from public.v_invoices f
left join lateral (
  select min(r.date) as primo_sollecito
    from public.invoice_reminders r where r.invoice_id = f.id
) s on true
left join lateral (
  select max(p.date) as ultimo_incasso
    from public.invoice_payments p where p.invoice_id = f.id
) u on true;

comment on view public.v_followup_fatture is
  'Il prospetto previsionale: una riga per fattura, col mese che decide la promessa del cliente.';

create view public.v_followup_incassi as
select
  p.id as incasso_id, p.invoice_id, p.date as incassato_il,
  to_char(p.date, 'YYYY-MM') as mese_incasso,
  p.amount as incassato, p.method, p.bank_ref,
  f.number, f.issue_date, f.client_name, f.project_name, f.commessa,
  f.entity_code, f.issuer_name, f.currency,
  (f.total - f.vat_amount)::numeric(14,2) as imponibile,
  f.vat_amount, f.total, f.due_date,
  f.residual as outstanding, f.ammanco_da_recuperare,
  (p.date - f.issue_date) as giorni_per_incassare,
  f.reminders_count, f.ultima_nota
from public.invoice_payments p
join public.v_invoices f on f.id = p.invoice_id;

comment on view public.v_followup_incassi is
  'Il prospetto definitivo: una riga per incasso, perche'' e'' il bonifico a decidere in che mese la cassa e'' entrata.';

create view public.v_progetti_fatturazione as
select
  c.id,
  c.name as progetto,
  b.name as brand,
  coalesce(pag.company_name, c.client) as intestatario,
  pag.id as intestatario_id,
  s.city, s.country,
  c.cert_type, c.cert_rating, c.cert_level, c.project_subtype, c.cert_version,
  c.status, c.currency,
  em.entity_code, em.company_name as emittente,
  pr.full_name as pm,
  c.quotation_sent_date, c.quotation_approved_at, c.handover_date,
  nullif(coalesce(c.quotation_list_price, 0), 0)::numeric(14,2) as listino,
  nullif(coalesce(c.total_fees, 0), 0)::numeric(14,2) as quotato,
  coalesce(t.tranche_totali, 0)::numeric(14,2) as tranche_totali,
  coalesce(t.quante_tranche, 0) as quante_tranche,
  coalesce(t.tranche_fatturate, 0) as tranche_fatturate,
  coalesce(fa.fatturato, 0)::numeric(14,2) as fatturato,
  coalesce(fa.incassato, 0)::numeric(14,2) as incassato,
  (case when coalesce(c.total_fees, 0) > 0
        then c.total_fees - coalesce(fa.fatturato, 0) end)::numeric(14,2) as da_fatturare,
  (coalesce(fa.fatturato, 0) - coalesce(fa.incassato, 0))::numeric(14,2) as da_incassare,
  case when coalesce(c.total_fees, 0) > 0
       then round(coalesce(fa.fatturato, 0) / c.total_fees, 4) end as pct_fatturazione,
  (coalesce(c.total_fees, 0) = 0 and coalesce(fa.fatturato, 0) > 0) as quotazione_mancante
from public.certifications c
left join public.sites s on s.id = c.site_id
left join public.brands b on b.id = s.brand_id
left join public.profiles pr on pr.id = c.pm_id
left join public.contacts em on em.id = c.issuer_contact_id
left join public.contacts pag on pag.id = c.billing_contact_id
left join lateral (
  select count(*) as quante_tranche,
         sum(m.amount) as tranche_totali,
         -- Adesso una tranche risulta fatturata anche quando e' finita su una
         -- fattura insieme ad altre: prima quella riga diceva «mai fatturata».
         count(*) filter (
           where exists (select 1 from public.invoice_righe r where r.tranche_id = m.id)
         ) as tranche_fatturate
    from public.cert_payment_milestones m
   where m.certification_id = c.id
) t on true
left join lateral (
  select sum(f.total) as fatturato, sum(f.paid_amount) as incassato
    from public.v_invoices f
   where f.certification_id = c.id
) fa on true;

comment on view public.v_progetti_fatturazione is
  'L''«Elenco Progetti» del foglio di Francesca. Dove la quotazione non e'' stata registrata i conti che dipendono da lei restano nulli: non si sa, e non si inventa.';

create view public.v_tranche_fatturazione as
select
  m.id as tranche_id,
  m.certification_id,
  m.tranche_order,
  m.name as tranche,
  m.tranche_pct,
  m.amount as importo_previsto,
  m.trigger_event,
  m.payment_scheme,
  m.data_prevista,
  m.tranche_state,
  f.id as invoice_id,
  f.number as fattura,
  f.issue_date as emessa_il,
  f.due_date as scade_il,
  -- Quello che di questa fattura riguarda QUESTA tranche: la riga, non il
  -- totale del documento. Su una fattura con due righe, attribuirle tutta e'
  -- il modo di contare due volte gli stessi soldi.
  r.importo as fatturato,
  f.paid_amount as incassato_fattura,
  f.residual as residuo_fattura,
  f.currency, f.lifecycle_state, f.payment_status, f.days_late,
  f.data_incasso_attesa, f.ultima_nota,
  coalesce(f.quante_righe, 0) as righe_della_fattura,
  (r.id is not null) as fatturata
from public.cert_payment_milestones m
left join public.invoice_righe r on r.tranche_id = m.id
left join public.v_invoices f on f.id = r.invoice_id;

comment on view public.v_tranche_fatturazione is
  'Una riga per tranche, con la riga di fattura che le corrisponde. «Fatturata» si deduce dall''esistenza di quella riga, non da uno stato.';

grant select on public.v_followup_fatture to authenticated;
grant select on public.v_followup_incassi to authenticated;
grant select on public.v_progetti_fatturazione to authenticated;
grant select on public.v_tranche_fatturazione to authenticated;
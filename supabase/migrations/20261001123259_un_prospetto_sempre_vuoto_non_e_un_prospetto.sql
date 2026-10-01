-- ═══════════════════════════════════════════════════════════════════════════
-- Un prospetto sempre vuoto non è un prospetto
--
-- Il Follow-up previsionale non mostrava **niente, in nessun mese**, e non per
-- un difetto di calcolo: `mese_previsto` nasceva solo da `data_incasso_attesa`,
-- cioè dalla promessa del cliente. Di promesse registrate ce ne sono **zero** —
-- le note sono zero, perché finora non c'era dove scriverle. Quindi la riga non
-- cadeva in nessun mese, e il foglio del venerdì restava bianco per sempre.
--
-- La specifica diceva due cose diverse in due punti: «il filtro lavora su
-- `coalesce(data_incasso_attesa, due_date)`» in un paragrafo, «solo quelle con
-- una data» in quello dopo. Avevo implementato il secondo, ed è quello che
-- produce la pagina vuota.
--
-- Il mese ora viene dalla promessa **quando c'è**, dalla scadenza quando no — ma
-- le due cose non si mescolano: `mese_da_promessa` dice da dove viene, e la
-- pagina può separare «cassa promessa» da «cassa soltanto attesa». Perché il
-- problema che la specifica voleva evitare è reale: annunciare come promessa una
-- cassa che nessuno ha promesso. La risposta non è nascondere la riga, è dire
-- che tipo di riga è.
--
-- La vista si ricrea invece di sostituirsi: una colonna nuova in mezzo
-- all'elenco `create or replace` non la accetta.
-- ═══════════════════════════════════════════════════════════════════════════

drop view if exists public.v_followup_fatture;

create view public.v_followup_fatture as
select
  f.id,
  f.number,
  f.issue_date,
  f.client_name,
  f.project_name,
  f.commessa,
  f.entity_code,
  f.issuer_name,
  f.currency,
  (f.total - f.vat_amount)::numeric(14,2) as imponibile,
  f.vat_amount,
  f.total,
  f.paid_amount,
  f.residual,
  f.due_date,
  f.days_late,
  f.lifecycle_state,
  f.recall_status,
  f.payment_status,
  f.ammanco_da_recuperare,
  f.data_incasso_attesa,
  f.data_incasso_attesa_fonte,

  -- In quale mese cade questa riga. La promessa vince sulla scadenza: è il
  -- motivo per cui il «−7500» scritto a mano nel foglio di settembre sparisce,
  -- la riga si sposta da sola nel mese in cui il cliente ha detto che pagherà.
  to_char(coalesce(f.data_incasso_attesa, f.due_date)::timestamptz, 'YYYY-MM') as mese_previsto,

  -- Da dove viene quel mese. Senza questa colonna le due specie di riga si
  -- sommerebbero in un unico totale, e quel totale direbbe «promesso» anche di
  -- quello che nessuno ha promesso.
  (f.data_incasso_attesa is not null) as mese_da_promessa,

  f.lifecycle_state = 'in_recall' as in_recall,
  s.primo_sollecito,
  case when s.primo_sollecito is not null then current_date - s.primo_sollecito end as giorni_in_recall,
  f.reminders_count,
  f.ultima_nota,
  f.ultima_nota_il,
  f.ultima_nota_tipo,
  f.quante_note,
  u.ultimo_incasso
from public.v_invoices f
left join lateral (
  select min(r.date) as primo_sollecito from public.invoice_reminders r where r.invoice_id = f.id
) s on true
left join lateral (
  select max(p.date) as ultimo_incasso from public.invoice_payments p where p.invoice_id = f.id
) u on true;

comment on view public.v_followup_fatture is
  'Il prospetto del venerdì, forma previsionale. Il mese viene dalla promessa del cliente quando c''è, dalla scadenza quando no — e `mese_da_promessa` dice quale delle due, perché sommarle insieme spaccerebbe per promessa una cassa che nessuno ha promesso.';

grant select on public.v_followup_fatture to authenticated;

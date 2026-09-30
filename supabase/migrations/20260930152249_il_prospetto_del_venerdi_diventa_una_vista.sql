-- ═══════════════════════════════════════════════════════════════════════════
-- Il prospetto del venerdì diventa una vista
--
-- Ogni venerdì Francesca consegna due fogli: «PROSPETTO FATTURATO IN ENTRATA
-- PREVISIONALE A FINE MESE» e il suo gemello «DEFINITIVO». Li tiene a mano, e
-- ogni riga e' gia' nel database — data, cliente, numero, progetto, importo,
-- IVA, recall, note.
--
-- Il punto piu' fragile di quei fogli e' il totale di settembre:
-- `=SUM(E3:E13)-7500`. Quel 7.500 e' una fattura slittata a ottobre, sottratta
-- a mano di qua e riscritta a mano di la'. Con la data di incasso attesa la
-- riga si sposta da sola, e quel meno non serve piu'.
--
-- ── DUE DOMANDE, DUE VISTE ────────────────────────────────────────────────
-- «Quanto mi aspetto a novembre» e «quanto e' entrato a settembre» sembrano la
-- stessa domanda e non lo sono:
--
--   il PREVISIONALE guarda le FATTURE, e il mese lo decide la promessa del
--   cliente. Una fattura di cui nessuno ha detto niente NON compare — metterla
--   vorrebbe dire annunciare cassa che nessuno ha promesso.
--
--   il DEFINITIVO guarda gli INCASSI, e il mese lo decide il bonifico. Una
--   riga per incasso, non per fattura: una fattura pagata in due volte entra
--   nei due mesi in cui e' arrivata, e nel foglio a mano questo non si vede.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.v_followup_fatture as
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
  -- Il foglio tiene IMPORTO e VAT in due colonne: l'importo e' l'imponibile.
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
  -- Il mese in cui la riga cade nel previsionale. Nullo quando nessuno ha
  -- promesso niente: e' il filtro stesso.
  to_char(f.data_incasso_attesa, 'YYYY-MM') as mese_previsto,
  f.lifecycle_state = 'in_recall' as in_recall,
  s.primo_sollecito,
  -- Quanto tempo si sta inseguendo: si conta dal primo sollecito, non dalla
  -- scadenza. Misura quanto ci stiamo mettendo noi, non quanto ha tardato lui.
  -- Senza solleciti resta nullo — un conto che parte da zero quando nessuno ha
  -- ancora chiamato sarebbe un numero falso.
  case when s.primo_sollecito is not null
       then (current_date - s.primo_sollecito) end as giorni_in_recall,
  f.reminders_count,
  f.ultima_nota,
  f.ultima_nota_il,
  f.ultima_nota_tipo,
  f.quante_note,
  u.ultimo_incasso
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

create or replace view public.v_followup_incassi as
select
  p.id as incasso_id,
  p.invoice_id,
  p.date as incassato_il,
  to_char(p.date, 'YYYY-MM') as mese_incasso,
  p.amount as incassato,
  p.method,
  p.bank_ref,
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
  f.due_date,
  -- Quanto di quella fattura non e' mai arrivato: la colonna OUTSTANDING del
  -- foglio, che quasi sempre e' una trattenuta bancaria.
  f.residual as outstanding,
  f.ammanco_da_recuperare,
  -- Quanti giorni ci ha messo: e' il «days PD» dell'altro foglio.
  (p.date - f.issue_date) as giorni_per_incassare,
  f.reminders_count,
  f.ultima_nota
from public.invoice_payments p
join public.v_invoices f on f.id = p.invoice_id;

comment on view public.v_followup_incassi is
  'Il prospetto definitivo: una riga per incasso, perche'' e'' il bonifico a decidere in che mese la cassa e'' entrata.';

grant select on public.v_followup_fatture to authenticated;
grant select on public.v_followup_incassi to authenticated;

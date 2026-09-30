-- ═══════════════════════════════════════════════════════════════════════════
-- La storia di un cliente, in due viste
--
-- Francesca sta ricostruendo a mano, in `2026_FGB_Projects_Payment_Update`, una
-- cosa che il database sa gia' dire: per ogni progetto quanto e' stato quotato,
-- quanto fatturato, a che punto e' la fatturazione, quanto resta da fatturare e
-- quanto da incassare. Le colonne del suo foglio sono tutte rapporti fra righe
-- che esistono.
--
-- ── IL DIFETTO DEL FOGLIO CHE NON SI EREDITA ──────────────────────────────
-- Nella riga di Louis Vuitton, «Totale incassato» vale 6.750 — ma la colonna
-- «Date payment» e' vuota: quei soldi non sono ancora arrivati. La formula e'
-- `=J6`, cioe' copia l'importo fatturato. Il foglio non sa distinguere
-- fatturato da incassato, e chi lo legge crede di avere in cassa un credito.
--
-- Qui l'incassato e' la somma degli incassi registrati. Finche' non ce n'e'
-- uno, vale zero — anche se la fattura e' stata emessa ieri.
--
-- ── DUE LIVELLI, COME IL FOGLIO ───────────────────────────────────────────
-- `v_progetti_fatturazione` e' l'«Elenco Progetti»: una riga per progetto.
-- `v_tranche_fatturazione` e' il foglio del cliente aperto: una riga per
-- tranche, con la fattura che le corrisponde quando c'e'.
--
-- La spunta «fatturata» non e' uno stato scritto da nessuno: e' l'esistenza di
-- una fattura agganciata a quella tranche. Ed e' il motivo per cui la
-- percentuale di fatturazione non va salvata — e' il rapporto fra due conti.
--
-- NOTA: la prima versione di `v_progetti_fatturazione` trattava una quotazione
-- mancante come zero, e i conti diventavano negativi. La migrazione
-- 20260930155054 la sostituisce ed e' quella in vigore.
-- ═══════════════════════════════════════════════════════════════════════════

-- (v_progetti_fatturazione: definizione sostituita da 20260930155054)

create or replace view public.v_tranche_fatturazione as
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
  f.total as fatturato,
  f.paid_amount as incassato,
  f.residual as residuo,
  f.currency,
  f.lifecycle_state,
  f.payment_status,
  f.days_late,
  f.data_incasso_attesa,
  f.ultima_nota,
  -- La spunta: esiste una fattura per questa tranche? Non e' uno stato scritto
  -- da nessuno, e' una domanda con una risposta sola.
  (f.id is not null) as fatturata
from public.cert_payment_milestones m
left join public.v_invoices f on f.tranche_id = m.id;

comment on view public.v_tranche_fatturazione is
  'Una riga per tranche, con la sua fattura quando c''e''. La spunta «fatturata» si deduce, non si scrive.';

grant select on public.v_tranche_fatturazione to authenticated;

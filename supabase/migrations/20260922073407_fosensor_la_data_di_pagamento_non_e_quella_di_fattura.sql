-- ═══════════════════════════════════════════════════════════════════════════
-- Tre date, non due.
--
-- Avevo collassato l'emissione della fattura sulla data di cassa: sbagliato.
-- Sono due momenti distinti e vanno disegnati distinti — grigio quando la
-- fattura esce, rosso quando esce il denaro. Qui nasce data_documento, che
-- sul passivo non c'era, e si correggono le quattro righe dove avevo messo
-- l'emissione al posto del pagamento.
--
-- Nota su 260417FS01 40%: il foglio scrive 31/09/2026, che non esiste.
-- Tenuto il 30/09/2026.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.uscite_previste
  add column if not exists data_documento date;

comment on column public.uscite_previste.data_documento is
  'Quando la fattura e stata emessa. Da qui parte il conto alla rovescia dei termini, ma il denaro esce in data_prevista: sono due date diverse e vanno mostrate come tali.';

-- ── le date di pagamento corrette ──────────────────────────────────────────
with corr(rif, coda, cassa, fonte, stato) as (values
  ('260417FS01','30% deposito',    date '2026-09-30','contratto','prevista'),
  ('260901FS01','R&D CO2-CO',      date '2026-09-08','reale',    'pagata'),
  ('260901FS01','30% deposito',    date '2026-09-30','contratto','prevista'),
  ('260911FS01','100% anticipato', date '2026-09-30','contratto','prevista')
)
update public.uscite_previste u
   set data_prevista       = c.cassa,
       data_prevista_fonte = c.fonte,
       stato               = c.stato
  from corr c
 where u.riferimento = c.rif
   and split_part(u.descrizione, ' · ', 2) = c.coda;

-- ── l'emissione, che fin qui viveva impropriamente in data_evento ─────────
update public.uscite_previste
   set data_documento = data_evento
 where data_evento is not null
   and descrizione like 'Fattura %';

-- Le quote seguono la loro fattura: stessa emissione, stessa cassa.
update public.uscite_previste q
   set data_documento = f.data_documento
  from public.uscite_previste f
 where f.natura = 'cassa'
   and q.natura = 'quota'
   and q.riferimento = f.riferimento
   and split_part(q.descrizione, ' · ', 2) = split_part(f.descrizione, ' · ', 2);

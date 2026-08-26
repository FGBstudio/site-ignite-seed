-- Timeline della WELL Health-Safety Rating.
--
-- E' la piu' corta del portafoglio: nessuna fase di cantiere, nessuna Performance
-- Verification. Il perno e' la milestone 3, "Completed documentation received":
-- da li' partono sia la submission (un mese) sia il rilascio (quattro mesi), che
-- e' il motivo per cui entrambe puntano allo stesso ancoraggio invece di
-- incatenarsi una all'altra.

insert into public.cert_timeline_steps
  (timeline_key, order_index, requirement, timing_kind, anchor_order, offset_days, optional)
values
  ('WELL HSR', 1, 'Pre-assessment',                    'manual',     null, null,  false),
  ('WELL HSR', 2, 'FGB Sustainability Guidelines',     'manual',     null, null,  false),
  ('WELL HSR', 3, 'Completed documentation received',  'manual',     null, null,  false),
  ('WELL HSR', 4, 'WELL HSR Submission',               'calculated',    3,   30,  false),
  ('WELL HSR', 5, 'WELL HSR Certification Attainment', 'calculated',    3,  120,  false);

-- Senza questa riga il catalogo conosce la HSR ma fn_timeline_key_for_cert non
-- trova nulla, e la materializzazione esce a mani vuote.
update public.cert_catalog
   set timeline_key = 'WELL HSR',
       updated_at   = now()
 where scheme = 'WELL' and typology = 'Health-Safety (HSR)';

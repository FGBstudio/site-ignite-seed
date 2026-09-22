-- ═══════════════════════════════════════════════════════════════════════════
-- Le prossime installazioni Fendi, e la catena che ne discende.
--
-- Regola della commessa: si fattura il giorno dell'installazione, si incassa
-- trenta giorni dopo. Quindi la data programmata e' l'evento, e la cassa e'
-- evento + 30.
--
-- Gli importi del foglio («Remaining Value to invoice») coincidono al
-- centesimo con le tranche «40% al primo dato» gia' a database su tutti e
-- quindici gli store: non e' una somiglianza, e' la stessa riga.
--
-- Restano «stimate» e non «previste» perche' l'installazione deve ancora
-- avvenire: la data si muovera' se si muove il cantiere, e la freccia deve
-- dirlo. Diventeranno piene quando l'incasso arrivera'.
--
-- Non si tocca invoice_sent_date: quella dice che una fattura e' stata
-- emessa davvero, e scriverci dentro una previsione farebbe comparire un
-- documento che non esiste. Hangzhou MixC e' fuori per lo stesso motivo — la
-- sua fattura e' gia' stata emessa il 21/09.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.cert_payment_milestones disable trigger trg_cert_payment_milestones_guard;

with programmate(tranche_id, onsite) as (values
  ('eea21f86-8283-4d37-af94-bd8f1f57a827'::uuid, date '2026-09-23'), -- Hong Kong, Elements
  ('f2da23ac-768d-4a99-b64f-14f8950b9bcd'::uuid, date '2026-09-23'), -- Hong Kong, Elements (Men)
  ('bc7c7e71-d777-47a1-bf39-444f81a717e8'::uuid, date '2026-09-23'), -- Taipa, Galaxy
  ('c7c1472f-fd33-4895-ad57-9c189dd5c384'::uuid, date '2026-09-23'), -- Lotus, Four Seasons (DFS)
  ('d9f32b58-dea6-47b0-8c58-b955783587c4'::uuid, date '2026-09-24'), -- Hong Kong, Pacific Place
  ('69155df0-79a7-44d2-a5f0-f4e99ff9223b'::uuid, date '2026-09-24'), -- Hong Kong, Landmark
  ('6374f471-260d-48a7-88a4-f3802d99a95d'::uuid, date '2026-09-24'), -- Se, One Central
  ('363d9527-cad6-43a8-bc91-b4bdce5391c4'::uuid, date '2026-10-10'), -- Beijing, China World
  ('376d8278-8e8e-4e77-973e-9f8e03ed67fe'::uuid, date '2026-10-10'), -- Beijing, Sanlitun
  ('f4a7d490-4db8-4eae-8aea-b70a5ecbcbec'::uuid, date '2026-10-11'), -- Beijing, Shin Kong Place (Men)
  ('aeb0e396-7988-4874-aebd-ec8d3c739977'::uuid, date '2026-10-11'), -- Beijing, SKP (Women)
  ('21f25c07-b0b7-4ffa-91d0-38704a80d059'::uuid, date '2026-10-13'), -- Shenyang, MixC
  ('346d04e1-a24c-41eb-893f-6f5ce90462c7'::uuid, date '2026-10-14'), -- Dalian, Olympia 66
  ('07524035-896c-472f-a782-231b9d8b957b'::uuid, date '2026-10-15')  -- Harbin, Charter (Women)
)
update public.cert_payment_milestones m
   set data_evento         = p.onsite,
       data_evento_fonte   = 'installazione',
       data_prevista       = p.onsite + 30,
       data_prevista_fonte = 'da_evento_stimato',
       due_date            = p.onsite + 30
  from programmate p
 where m.id = p.tranche_id;

alter table public.cert_payment_milestones enable trigger trg_cert_payment_milestones_guard;

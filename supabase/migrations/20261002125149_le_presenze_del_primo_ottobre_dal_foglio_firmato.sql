-- ═══════════════════════════════════════════════════════════════════════════
-- Le presenze del 1° ottobre 2026, dal foglio firmato
--
-- Dieci persone in ufficio, quattro letture ciascuna: ingresso, inizio pausa,
-- ripresa, uscita. È la forma che `v_hr_giornate` si aspetta — conta le letture
-- del giorno e le legge in ordine — quindi non c'è nessuna giornata da comporre:
-- si scrivono i quattro istanti e il resto si deriva.
--
-- Gli orari sono quelli del foglio, nel fuso di Roma. Scritti come
-- `timestamp at time zone 'Europe/Rome'` e non come orari UTC calcolati a mano:
-- il 1° ottobre l'Italia è ancora in ora estiva, e due settimane dopo non lo
-- sarà più. Un offset scritto a mano funziona per questo foglio e sbaglia il
-- prossimo.
--
-- `origine = 'manuale'` perché nessuno ha passato il badge: la fonte è il foglio
-- cartaceo, e sta nella nota di ogni lettura. `inserita_da` è l'account di Matteo,
-- che è chi ha consegnato il foglio.
--
-- Le quattro righe senza orari — Cardoso «UNAVAILABLE», Martignoni «SMART»,
-- Monteleone «LIGURIA», Cortopassi «OK» — **non sono qui**: non sono letture, sono
-- stati della giornata, e vanno in `hr_availability` con lo stato giusto. Quale sia
-- quello giusto per «LIGURIA» e per «OK» è una domanda, non una deduzione, quindi
-- aspettano una risposta invece di entrare sbagliate.
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.hr_timbrature (user_id, ts, origine, note, inserita_da)
select u.id,
       ('2026-10-01 ' || v.ora)::timestamp at time zone 'Europe/Rome',
       'manuale',
       'Foglio presenze firmato del 1/10/2026',
       (select id from auth.users where email = 'm.martignoni@fgb-studio.com')
  from (values
    -- Berdin Aloysius
    ('a.berdin@fgb-studio.com',     '09:15'), ('a.berdin@fgb-studio.com',     '13:40'),
    ('a.berdin@fgb-studio.com',     '14:10'), ('a.berdin@fgb-studio.com',     '18:15'),
    -- De Carlo Micaela
    ('m.decarlo@fgb-studio.com',    '09:30'), ('m.decarlo@fgb-studio.com',    '13:00'),
    ('m.decarlo@fgb-studio.com',    '14:00'), ('m.decarlo@fgb-studio.com',    '18:30'),
    -- Donadello Erica
    ('e.donadello@fgb-studio.com',  '09:10'), ('e.donadello@fgb-studio.com',  '13:15'),
    ('e.donadello@fgb-studio.com',  '14:15'), ('e.donadello@fgb-studio.com',  '18:05'),
    -- Ferrante Cecilia
    ('c.ferrante@fgb-studio.com',   '09:30'), ('c.ferrante@fgb-studio.com',   '13:00'),
    ('c.ferrante@fgb-studio.com',   '14:00'), ('c.ferrante@fgb-studio.com',   '18:30'),
    -- Gadru Shikha
    ('s.gadru@fgb-studio.com',      '09:20'), ('s.gadru@fgb-studio.com',      '13:00'),
    ('s.gadru@fgb-studio.com',      '14:00'), ('s.gadru@fgb-studio.com',      '18:30'),
    -- Isaac Akhila
    ('a.isaac@fgb-studio.com',      '08:30'), ('a.isaac@fgb-studio.com',      '13:00'),
    ('a.isaac@fgb-studio.com',      '14:00'), ('a.isaac@fgb-studio.com',      '17:30'),
    -- Sundaresan Muthu
    ('m.sundaresan@fgb-studio.com', '08:45'), ('m.sundaresan@fgb-studio.com', '13:10'),
    ('m.sundaresan@fgb-studio.com', '14:10'), ('m.sundaresan@fgb-studio.com', '17:45'),
    -- Vellutini Marco
    ('m.vellutini@fgb-studio.com',  '09:20'), ('m.vellutini@fgb-studio.com',  '13:00'),
    ('m.vellutini@fgb-studio.com',  '14:00'), ('m.vellutini@fgb-studio.com',  '18:30'),
    -- Paris Beatrice (internship)
    ('b.paris@fgb-studio.com',      '09:30'), ('b.paris@fgb-studio.com',      '13:00'),
    ('b.paris@fgb-studio.com',      '14:00'), ('b.paris@fgb-studio.com',      '18:30'),
    -- Chinetti Laura (internship)
    ('l.chinetti@fgb-studio.com',   '08:30'), ('l.chinetti@fgb-studio.com',   '13:00'),
    ('l.chinetti@fgb-studio.com',   '14:00'), ('l.chinetti@fgb-studio.com',   '17:30')
  ) as v(email, ora)
  join auth.users u on u.email = v.email
 -- Rieseguire non deve raddoppiare la giornata: una lettura è quell'istante per
 -- quella persona, e due copie farebbero diventare otto le letture del giorno —
 -- cioè una seconda pausa inventata.
 where not exists (
   select 1 from public.hr_timbrature t
    where t.user_id = u.id
      and t.ts = ('2026-10-01 ' || v.ora)::timestamp at time zone 'Europe/Rome'
 );

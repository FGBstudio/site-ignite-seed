-- ═══════════════════════════════════════════════════════════════════════════
-- I quattro senza orari del 1° ottobre
--
-- Sul foglio del 1° ottobre quattro righe non hanno orari ma una parola: Cardoso
-- «UNAVAILABLE», Martignoni «SMART», Monteleone «LIGURIA», Cortopassi «OK» sotto
-- l'intestazione UK EMPLOYEE. Non sono letture di badge — non c'è nessun istante
-- da registrare — ma non sono nemmeno giornate vuote: sono stati, e il posto degli
-- stati è `hr_availability`.
--
-- Due si traducono da sole: «UNAVAILABLE» è `unavailable`, «SMART» è
-- `smart_working`. Le altre due no, e la differenza non è formale: una giornata
-- scritta `travel` invece di `smart_working` dice una cosa diversa su cosa ha
-- fatto quella persona. Le ha decise Matteo — «LIGURIA» è smart working dalla
-- Liguria, «OK» è la giornata regolare di chi lavora dal Regno Unito — e la nota
-- di ogni riga porta la parola del foglio, così chi rilegge vede da dove viene lo
-- stato e non deve fidarsi della traduzione.
--
-- Nessuna riga `office` per i dieci presenti: la loro giornata è già nelle
-- letture, e `v_hr_giornate` la ricava. Scriverla di nuovo qui sarebbe una copia
-- che può smettere di combaciare.
--
-- Cardoso e Martignoni avevano già una riga per quel giorno (dal calendario
-- generato il 26 agosto), quindi il `not exists` le ha saltate: le corregge la
-- migrazione successiva.
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.hr_availability (user_id, date, status, note)
select u.id, '2026-10-01'::date, v.stato::hr_availability_status, v.nota
  from (values
    ('k.cardoso@fgb-studio.com',     'unavailable',
     'Foglio presenze del 1/10/2026: «UNAVAILABLE».'),
    ('m.martignoni@fgb-studio.com',  'smart_working',
     'Foglio presenze del 1/10/2026: «SMART».'),
    ('a.monteleone@fgb-studio.com',  'smart_working',
     'Foglio presenze del 1/10/2026: «LIGURIA». Smart working dalla Liguria, come indicato da Matteo.'),
    ('e.cortopassi@fgb-studio.com',  'smart_working',
     'Foglio presenze del 1/10/2026: «OK», sotto UK EMPLOYEE. Giornata regolare lavorata dal Regno Unito, come indicato da Matteo.')
  ) as v(email, stato, nota)
  join auth.users u on u.email = v.email
 where not exists (
   select 1 from public.hr_availability a
    where a.user_id = u.id and a.date = '2026-10-01'::date
 );

-- ═══════════════════════════════════════════════════════════════════════════
-- Il foglio firmato vince sul calendario inventato
--
-- `hr_availability` contiene 2.783 righe per 11 persone, dal 2 gennaio al 31
-- dicembre 2026, scritte tutte nello stesso istante il 26 agosto e nessuna nata da
-- una richiesta: è un anno di disponibilità generato, non dichiarato. Comprende
-- ferie, malattie e trasferte su giorni che non sono ancora arrivati.
--
-- Sul 1° ottobre quel calendario dice `office` per Cardoso e per Martignoni. Il
-- foglio firmato dice «UNAVAILABLE» e «SMART», e nessuno dei due ha una lettura di
-- badge quel giorno. Fra un calendario generato a tavolino e un foglio che qualcuno
-- ha firmato, il foglio è il fatto.
--
-- Si correggono **solo queste due righe**, quelle del giorno che il foglio copre, e
-- la nota dice da dove viene la correzione. Le altre 2.781 restano come sono: sono
-- un problema più grande di questa migrazione — ogni foglio vero che entrerà le
-- contraddirà una per una — e cancellare un anno di righe su cui qualcuno potrebbe
-- aver costruito qualcosa non è una decisione da prendere di passaggio.
-- ═══════════════════════════════════════════════════════════════════════════

update public.hr_availability a
   set status = v.stato::hr_availability_status,
       note = v.nota,
       updated_at = now()
  from (values
    ('k.cardoso@fgb-studio.com',    'unavailable',
     'Foglio presenze firmato del 1/10/2026: «UNAVAILABLE». Corregge un «office» che veniva dal calendario generato il 26/8, non da una dichiarazione.'),
    ('m.martignoni@fgb-studio.com', 'smart_working',
     'Foglio presenze firmato del 1/10/2026: «SMART». Corregge un «office» che veniva dal calendario generato il 26/8, non da una dichiarazione.')
  ) as v(email, stato, nota)
  join auth.users u on u.email = v.email
 where a.user_id = u.id
   and a.date = '2026-10-01'::date
   -- Una riga nata da una richiesta approvata non si tocca: lì dietro c'e' una
   -- decisione di qualcuno, non un riempimento.
   and a.source_request_id is null;

-- ═══════════════════════════════════════════════════════════════════════════
-- Le tre letture QR di prova del 2 ottobre
--
-- Provando lo scanner sono entrate tre letture vere: De Carlo alle 15:18:09,
-- Ferrante alle 15:18:47, Gadru alle 15:20:30, tutte `qr` e tutte dallo stesso
-- dispositivo nell'arco di due minuti. Non sono presenze: sono una prova, e Matteo
-- lo ha confermato.
--
-- Lasciarle avrebbe un effetto preciso e sbagliato. Ognuna di quelle tre persone
-- aveva una lettura sola per oggi — l'ingresso del mattino, dal foglio — e due
-- letture fanno un numero pari: `v_hr_giornate` avrebbe letto la prova come
-- l'**uscita**, chiuso la giornata e calcolato sei ore di lavoro per chi è ancora
-- in ufficio. Togliendole si torna a una lettura a testa, cioè `ancora_dentro`, che
-- è la verità.
--
-- Si cancella per quello che sono, non per id: `origine = 'qr'` in quella mezz'ora,
-- per quelle tre persone. Così la riga dice da sé perché quelle tre e non altre, e
-- rieseguirla non può prendere le letture del foglio — che sono `manuale` — né una
-- lettura QR vera di un altro giorno.
-- ═══════════════════════════════════════════════════════════════════════════

delete from public.hr_timbrature t
 using auth.users u
 where u.id = t.user_id
   and u.email in (
     'm.decarlo@fgb-studio.com',
     'c.ferrante@fgb-studio.com',
     's.gadru@fgb-studio.com'
   )
   and t.origine = 'qr'
   and t.ts >= '2026-10-02 15:00'::timestamp at time zone 'Europe/Rome'
   and t.ts <  '2026-10-02 15:30'::timestamp at time zone 'Europe/Rome';

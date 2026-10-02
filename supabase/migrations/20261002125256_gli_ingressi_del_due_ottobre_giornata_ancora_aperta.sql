-- ═══════════════════════════════════════════════════════════════════════════
-- Gli ingressi del 2 ottobre 2026, giornata ancora aperta
--
-- Del 2 ottobre il foglio ha solo gli ingressi: nessuno è ancora uscito. Si
-- scrive una lettura sola a testa, e `v_hr_giornate` lo dice da sé — numero di
-- letture dispari significa `ancora_dentro`, e l'uscita resta vuota invece di
-- essere indovinata. Scrivere adesso un'uscita plausibile sarebbe inventare la
-- parte del giorno che non è ancora successa.
--
-- Martignoni fa eccezione con tre letture: è entrato alle 12:55 e la pausa
-- 13:30–14:00 era già segnata. Tre letture restano dispari, quindi anche la sua
-- giornata resta aperta, con ingresso e ripresa al loro posto.
--
-- Sul suo rigo c'è una nota in parte illeggibile, «RIPA89. 9:00». Resta trascritta
-- com'è, con detto che non si legge: **non ne ricavo una lettura alle 9:00**.
-- Potrebbe essere un'ora di lavoro altrove, un riferimento, o un'altra cosa; una
-- lettura inventata alle 9:00 gli darebbe quattro ore di lavoro che nessuno ha
-- scritto, e chiuderebbe anche la giornata con un numero pari.
--
-- I nomi del foglio di oggi hanno qualche lettera fuori posto rispetto
-- all'anagrafica — Donatiello/Donadello, Sheikha/Shikha, Bergin/Berdin,
-- Faris/Paris. Abbinati per persona, non per grafia, e l'abbinamento è qui sotto
-- in chiaro perché si possa controllare.
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.hr_timbrature (user_id, ts, origine, note, inserita_da)
select u.id,
       ('2026-10-02 ' || v.ora)::timestamp at time zone 'Europe/Rome',
       'manuale',
       v.nota,
       (select id from auth.users where email = 'm.martignoni@fgb-studio.com')
  from (values
    -- «Sundaresan Muthu»
    ('m.sundaresan@fgb-studio.com', '08:30', 'Foglio presenze del 2/10/2026'),
    -- «Donatiello Erica» → Donadello Erica
    ('e.donadello@fgb-studio.com',  '09:05', 'Foglio presenze del 2/10/2026'),
    -- «Gadru Sheikha» → Gadru Shikha
    ('s.gadru@fgb-studio.com',      '09:11', 'Foglio presenze del 2/10/2026'),
    -- «Bergin Aloysius» → Berdin Aloysius
    ('a.berdin@fgb-studio.com',     '09:17', 'Foglio presenze del 2/10/2026'),
    -- «Faris Beatrice (Internship)» → Paris Beatrice
    ('b.paris@fgb-studio.com',      '09:20', 'Foglio presenze del 2/10/2026'),
    -- «De Carlo Micaela»
    ('m.decarlo@fgb-studio.com',    '09:30', 'Foglio presenze del 2/10/2026'),
    -- «Ferrante Cecilia»
    ('c.ferrante@fgb-studio.com',   '09:35', 'Foglio presenze del 2/10/2026'),
    -- Martignoni Matteo: ingresso tardo, pausa già segnata, nota illeggibile
    ('m.martignoni@fgb-studio.com', '12:55',
     'Foglio presenze del 2/10/2026. Sul rigo una nota in parte illeggibile, trascritta com''e'': «RIPA89. 9:00» — non interpretata, nessuna lettura ricavata da quel 9:00.'),
    ('m.martignoni@fgb-studio.com', '13:30', 'Foglio presenze del 2/10/2026 — inizio pausa'),
    ('m.martignoni@fgb-studio.com', '14:00', 'Foglio presenze del 2/10/2026 — ripresa')
  ) as v(email, ora, nota)
  join auth.users u on u.email = v.email
 where not exists (
   select 1 from public.hr_timbrature t
    where t.user_id = u.id
      and t.ts = ('2026-10-02 ' || v.ora)::timestamp at time zone 'Europe/Rome'
 );

-- ═══════════════════════════════════════════════════════════════════════════
-- I permessi dicono quello che fanno
--
-- Nelle migrazioni di oggi ho scritto `revoke all ... from public` convinto
-- che bastasse a tenere fuori chi non ha fatto login. Non bastava: questo
-- progetto ha una default privilege che concede l'esecuzione a `anon`,
-- `authenticated` e `service_role` su ogni funzione nuova in `public`. La ACL
-- vera era {anon=X, authenticated=X, service_role=X} da subito.
--
-- In concreto non e' mai stato un buco — `hr_mio_badge` controlla `auth.uid()`
-- e senza sessione solleva un'eccezione, e `hr_timbra` chiede una firma viva —
-- ma un permesso che dice una cosa diversa da quella che si voleva e' un
-- permesso su cui il prossimo che passa ragionera' male.
--
-- Quindi si mette per iscritto quello che deve valere davvero:
--   hr_timbra     → anche senza sessione. E' il varco, e la chiave e' il
--                   codice firmato, non l'essere loggati.
--   hr_mio_badge  → solo con una sessione. Il badge e' di una persona, e
--                   senza sapere chi sta chiedendo non c'e' niente da dare.
-- ═══════════════════════════════════════════════════════════════════════════

revoke all on function public.hr_mio_badge() from anon;
grant execute on function public.hr_mio_badge() to authenticated;

grant execute on function public.hr_timbra(text, numeric, numeric, text) to anon, authenticated;

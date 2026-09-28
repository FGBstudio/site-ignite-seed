-- ═══════════════════════════════════════════════════════════════════════════
-- Importare fatture non e' cosa da anonimi
--
-- Stessa lezione di tre giorni fa sul badge: `revoke all ... from public` non
-- toglie niente a `anon`, perche' qui una default privilege concede
-- l'esecuzione ad anon, authenticated e service_role su ogni funzione nuova in
-- `public`. La ACL di `fn_importa_fattura_storica` nasceva quindi aperta
-- anche a chi non ha fatto login.
--
-- Non era un buco — la prima cosa che la funzione fa e' chiedere
-- `is_admin(auth.uid())`, e senza sessione quello e' falso, quindi solleva
-- l'eccezione — ma un permesso che dice il contrario di quello che si voleva
-- e' un permesso su cui il prossimo che passa ragionera' male.
--
-- Il difetto e' diffuso: l'avvisatore ne conta 159 cosi' in tutto il progetto,
-- `fn_emetti_fattura` compresa. Qui si chiude quella appena scritta, senza
-- fingere di aver sistemato le altre.
-- ═══════════════════════════════════════════════════════════════════════════

revoke all on function public.fn_importa_fattura_storica(
  text, uuid, date, numeric, uuid, text, numeric, numeric, integer, text, text, jsonb, boolean, date
) from anon;

grant execute on function public.fn_importa_fattura_storica(
  text, uuid, date, numeric, uuid, text, numeric, numeric, integer, text, text, jsonb, boolean, date
) to authenticated;

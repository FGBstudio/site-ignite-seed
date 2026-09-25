-- ═══════════════════════════════════════════════════════════════════════════
-- Il varco non ha bisogno di un account
--
-- Finche' il badge era un codice fisso, la sessione del tablet era una delle
-- poche cose che rendevano il varco un varco: senza, bastava una fotografia.
-- Da quando il codice si firma e scade in un minuto, quella sessione non
-- protegge piu' niente che non sia gia' protetto meglio.
--
-- Chi chiamasse questa funzione da Internet non otterrebbe nulla: senza una
-- firma viva la risposta e' `firma_non_valida`, e per produrne una serve il
-- segreto di un badge, che sta nel telefono del proprietario dopo il login. La
-- porta non e' aperta: e' che la chiave non e' piu' la sessione, e' il codice.
--
-- In cambio spariscono tre grane vere di un dispositivo appeso al muro: la
-- sessione che scade di notte — e la mattina dopo nessuno timbra, e lo scopri
-- dalla fila —, una password da tenere da qualche parte, e un accesso da
-- portarsi via insieme al tablet.
--
-- Quello che si perde: le letture non diranno piu' «questo dispositivo era
-- loggato come il varco». Resta il `device_label` e resta la posizione, che
-- per un tablet fermo all'ingresso dicono la stessa cosa.
-- ═══════════════════════════════════════════════════════════════════════════

grant execute on function public.hr_timbra(text, numeric, numeric, text) to anon;

-- Il resto no: il badge se lo crea solo chi ha fatto login, e le presenze le
-- legge solo chi ne ha diritto. Qui passa una cosa sola — registrare una
-- lettura valida — ed e' l'unica che serva a un varco.

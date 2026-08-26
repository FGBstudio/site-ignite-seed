-- SAINT LAURENT · MILANO, Montenapoleone: 51 apparecchi installati che nessun
-- progetto dichiarava.
--
-- Il sito ha una riga di monitoraggio energetico con 3 bridge e 48 PAN in stato
-- Installed, agganciata alla sua LEED — ma la LEED aveva has_energy_monitoring
-- a false, e sul sito non esiste nessun progetto Energy. Un impianto reale,
-- invisibile a ogni domanda del tipo "questo progetto ha il monitoraggio?".
--
-- L'energia appartiene alla LEED del sito: si accende il flag. Nessun progetto
-- nuovo, nessuna riga nuova — la riga c'e' gia' e punta gia' li'.
--
-- Attenzione all'omonimia: esistono DUE siti chiamati "MILANO, Montenapoleone",
-- uno Loro Piana e uno Saint Laurent. Qui si agisce sull'id, non sul nome.

BEGIN;

UPDATE public.certifications
   SET has_energy_monitoring = true, updated_at = now()
 WHERE id = '1337971b-a151-488f-a914-117f3e47175b'   -- SAINT LAURENT · MILANO, Montenapoleone [LEED]
   AND has_energy_monitoring = false;

COMMIT;

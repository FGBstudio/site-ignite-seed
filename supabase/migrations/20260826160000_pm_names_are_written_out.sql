-- I nomi dei PM in anagrafica.
--
-- Le tendine e la colonna PM leggono profiles.full_name. Dove e' vuoto
-- comparivano l'indirizzo email o un uuid: "g.denegri" al posto di una persona.
--
-- Si scrive "Nome Cognome", che e' la forma in cui il resto dell'anagrafica e'
-- registrato; l'inversione in "Cognome Nome" per gli elenchi la fa
-- src/lib/personName.ts, cosi' il dato resta uno e la presentazione e' una
-- scelta di chi mostra.

update public.profiles
   set full_name = 'German Denegri',
       updated_at = now()
 where email = 'g.denegri@fgb-studio.com'
   and coalesce(btrim(full_name), '') = '';

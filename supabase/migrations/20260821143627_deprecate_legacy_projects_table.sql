-- ============================================================================
-- Archiviazione · la tabella legacy `projects`
--
-- Nel database c'erano due tabelle che dicevano "questo e' un progetto":
--
--   certifications           1.141 righe — l'entita' radice, quella vera
--   projects                    18 righe — residuo dello scaffolding iniziale
--
-- Le 18 righe puntano tutte a un sito reale e 11 a una certification esistente:
-- e' un doppione, non contiene nulla che le certification non abbiano gia'.
-- Nessuna delle due applicazioni la legge — verificato su tutto src/ del seed
-- tool e della dash mappa. Gli unici a toccarla sono due edge function di
-- seeding, load-json-seed e seed-data, che cancellano tutto e reinseriscono
-- dati di esempio ("Miu Miu Dubai Mall", utenti @retailops.com): scaffolding
-- Lovable, non produzione.
--
-- Non e' pero' inerte: durante le deduplica di ieri ho dovuto ripuntare le sue
-- righe tre volte per non lasciarle orfane. E il rischio vero e' che un domani
-- una vista o un export la legga e mostri 18 progetti invece di 1.141.
--
-- Si rinomina invece di cancellare: i dati restano tutti, e se qualcosa la
-- legge ancora si rompe subito e in modo evidente, invece di restituire numeri
-- sbagliati in silenzio. Per tornare indietro basta il rename opposto.
-- ============================================================================

ALTER TABLE public.projects RENAME TO _deprecated_projects;

COMMENT ON TABLE public._deprecated_projects IS
  'ARCHIVIATA il 2026-08-21. Residuo dello scaffolding iniziale: l''entita'' progetto e'' public.certifications. Conservata coi suoi dati per sicurezza; nessuna applicazione la legge. Per ripristinarla: ALTER TABLE public._deprecated_projects RENAME TO projects.';

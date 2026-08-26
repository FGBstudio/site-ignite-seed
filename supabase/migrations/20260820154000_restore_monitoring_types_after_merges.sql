-- ============================================================================
-- Ripristino · monitoring_types azzerato dalle deduplica
--
-- Effetto collaterale scoperto dopo le fusioni Boucheron, Frankfurt e Warsaw.
--
-- Spostare una certification da un sito all'altro fa scattare
-- `trg_certs_sync_monitoring`, che chiama `sync_site_monitoring_from_certs`:
-- quella funzione RICALCOLA sites.monitoring_types dai flag
-- has_iaq/has_energy/has_water_monitoring delle certifications del sito, e li
-- SOVRASCRIVE. Le certification spostate hanno tutti e tre i flag a false —
-- come 1.100 delle 1.142 in tabella — quindi il ricalcolo ha scritto un array
-- vuoto sopra il valore che i siti avevano.
--
-- I tre siti qui sotto hanno un sensore AIR fisicamente installato, quindi
-- 'air_quality' e' semplicemente vero di loro:
--
--   964d00e8  Boucheron Taiwan Diamond Tower — device 2504090014
--   733bb17c  FRANKFURT, Goethestraße        — device 2508140026, 49.018 letture
--   ef05ca9c  Vitkac (Warsaw)                — device 2504090046
--
-- Per Boucheron e Warsaw il valore precedente e' documentato: entrambi erano
-- 'air_quality' prima della fusione. Per Frankfurt il valore non era stato
-- letto prima, quindi questo e' una ricostruzione, non un ripristino
-- letterale: il sito ha un sensore aria che trasmette da mesi, e 'air_quality'
-- e' l'unico valore coerente con quel fatto.
--
-- Milano NON compare: era gia' vuoto prima della fusione (nessun device AIR,
-- solo 51 Energy) e resta com'era.
--
-- ── Perche' 'air_quality' e non 'AIR' ───────────────────────────────────────
--
-- In tabella convivono due convenzioni incompatibili:
--
--     'air_quality'    65 siti   scritto dall'import storico
--     'AIR'           106 siti   scritto da sync_site_monitoring_from_certs
--
-- `fn_recalculate_site_air` controlla ESCLUSIVAMENTE
-- `'air_quality' = ANY(monitoring_types)`, quindi per i 106 siti marcati 'AIR'
-- quella protezione non scatta mai: se perdono l'ultimo device la loro riga
-- monitor viene cancellata come se il monitoraggio non fosse mai stato
-- previsto. Qui si usa 'air_quality' perche' e' il valore che il codice legge;
-- la riconciliazione delle due convenzioni e' un lavoro a se', da fare insieme
-- alla revisione della funzione.
-- ============================================================================

UPDATE public.sites
   SET monitoring_types = ARRAY['air_quality']::text[],
       updated_at = now()
 WHERE id IN (
         '964d00e8-f72b-450b-859b-dc4c516762ad',  -- Boucheron Taiwan Diamond Tower
         '733bb17c-fd26-4b13-9ad8-97f3fb028133',  -- FRANKFURT, Goethestraße
         'ef05ca9c-d1b5-435b-a11a-216eb03c2921'   -- Vitkac
       )
   AND NOT ('air_quality' = ANY(COALESCE(monitoring_types, ARRAY[]::text[])));

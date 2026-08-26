-- Due negozi registrati due volte: LOEWE Saint-Honoré e Saint Laurent Avenue
-- Montaigne.
--
-- In entrambi i casi il sito con i sensori e quello con la certificazione sono
-- due record diversi dello stesso posto:
--
--   LOEWE     03d77a31 "LOEWE St. Honoré"   275 Rue Saint-Honoré   3 sensori, progetto Air
--             ea57b038 "Loewe Saint Honorè" 396 Rue Saint-Honoré   LEED "Saint Honorè", 0 sensori
--             — 78 metri l'uno dall'altro
--
--   SAINT LAURENT
--             716d34d9 "Saint Laurent Avenue Montaigne" 37 Avenue Montaigne  4 sensori, progetto Air
--             fd4d5f8c "AVENUE MONTAIGNE"              40 Rue de Sèvres      TAXONOMY, 0 sensori
--             — nome identico, indirizzo geocodificato a 2,4 km dal posto giusto
--
-- Sopravvive in tutti e due i casi il sito che ha i sensori e lo storico: la
-- certificazione e' una riga da spostare, la telemetria no. Il risultato e' un
-- sito con due progetti — la certificazione e la fornitura del monitoraggio —
-- che e' esattamente cio' che sono: due contratti distinti sullo stesso posto.
--
-- Il meteo dei siti assorbiti non si sposta: e' gia' duplicato (14.435 letture
-- identiche per coppia, stessa citta') e scende in CASCADE.

BEGIN;

CREATE TABLE IF NOT EXISTS public._bak_merge_loewe_montaigne AS
  SELECT 'site' AS kind, to_jsonb(s) AS row FROM public.sites s
   WHERE s.id IN ('ea57b038-4eda-44ae-bd7c-1bd58aa2197b',
                  'fd4d5f8c-3b20-416b-a814-119288291aab')
  UNION ALL
  SELECT 'ops_location', to_jsonb(l) FROM public.ops_locations l
   WHERE l.id IN ('ea57b038-4eda-44ae-bd7c-1bd58aa2197b',
                  'fd4d5f8c-3b20-416b-a814-119288291aab');

-- ── 1) Le certificazioni cambiano casa ─────────────────────────────────────
UPDATE public.certifications
   SET site_id = '03d77a31-7bba-4077-84dd-bfd8c93b9c40', updated_at = now()
 WHERE site_id = 'ea57b038-4eda-44ae-bd7c-1bd58aa2197b';

UPDATE public.certifications
   SET site_id = '716d34d9-d36f-4d60-ae53-2fd97ab48078', updated_at = now()
 WHERE site_id = 'fd4d5f8c-3b20-416b-a814-119288291aab';

-- ── 2) I gemelli se ne vanno ───────────────────────────────────────────────
-- ops_locations non ha cascade dal sito (site_id e' ON DELETE SET NULL e su
-- queste due righe e' gia' nullo): resterebbero fra le destinazioni di
-- spedizione. Nessuna spedizione le usa.
DELETE FROM public.ops_locations
 WHERE id IN ('ea57b038-4eda-44ae-bd7c-1bd58aa2197b',
              'fd4d5f8c-3b20-416b-a814-119288291aab')
   AND NOT EXISTS (
     SELECT 1 FROM public.ops_shipments sh
      WHERE sh.origin_location_id = ops_locations.id
         OR sh.destination_location_id = ops_locations.id);

DELETE FROM public.sites
 WHERE id IN ('ea57b038-4eda-44ae-bd7c-1bd58aa2197b',
              'fd4d5f8c-3b20-416b-a814-119288291aab');

-- ── 3) I superstiti si riallineano ─────────────────────────────────────────
SELECT public.fn_recalculate_site_air('03d77a31-7bba-4077-84dd-bfd8c93b9c40');
SELECT public.fn_sync_air_typology('03d77a31-7bba-4077-84dd-bfd8c93b9c40');
SELECT public.fn_recalculate_site_air('716d34d9-d36f-4d60-ae53-2fd97ab48078');
SELECT public.fn_sync_air_typology('716d34d9-d36f-4d60-ae53-2fd97ab48078');
SELECT public.fn_refresh_air_online_status();

COMMIT;

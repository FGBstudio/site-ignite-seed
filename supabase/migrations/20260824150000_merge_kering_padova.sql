-- KERING Padova: due siti per lo stesso indirizzo.
--
-- "Kering Eyewear" (brand KERING) e "Offices HQ" (brand KERING EYEWEAR) stanno
-- entrambi a Via Altichiero 180, a 235 m l'uno dall'altro, e portavano la stessa
-- richiesta: 15 CO-CO2 + 5 WELL. Le certificazioni pero' sono una sola coppia —
-- Offices HQ - LEED e Offices HQ - WELL — e stanno su "Offices HQ".
--
-- Sopravvive "Offices HQ" con le sue due certificazioni. Il gemello se ne va.
-- La sua riga d'aria era agganciata a mano a Offices HQ - WELL: e' un doppione
-- della riga che quella certificazione ha gia' sul sito giusto, e contava una
-- seconda volta gli stessi 5 sensori.
--
-- Non si perde storico: la serie meteo dei due siti e' identica — 14.413 letture
-- ciascuno, dal 2025-01-01 al 2026-08-24, perche' e' il meteo dello stesso
-- indirizzo raccolto due volte.

BEGIN;

-- Il gemello portava la spunta del monitoraggio dell'aria, il sopravvissuto no.
UPDATE public.sites
   SET monitoring_types = ARRAY['air_quality']::text[],
       updated_at = now()
 WHERE id = '925be222-d247-4d01-a6f4-181799f8d2d5'
   AND NOT ('air_quality' = ANY(COALESCE(monitoring_types, '{}'::text[])));

-- site_air_records, site_config, weather_data e le due tabelle
-- site_weather_energy_* scendono tutte in CASCADE dal sito.
DELETE FROM public.sites WHERE id = 'ac9580a7-0a5c-439f-bbe4-dceca9f68156';

-- ops_locations non ha una chiave esterna verso sites — il vecchio mirror
-- riusava l'id del sito come id della destinazione — quindi la riga sarebbe
-- sopravvissuta alla cancellazione e avrebbe continuato a comparire fra le
-- destinazioni di spedizione. Nessuna spedizione la usa.
DELETE FROM public.ops_locations
 WHERE id = 'ac9580a7-0a5c-439f-bbe4-dceca9f68156'
   AND NOT EXISTS (SELECT 1 FROM public.ops_shipments sh
                    WHERE sh.origin_location_id = 'ac9580a7-0a5c-439f-bbe4-dceca9f68156'
                       OR sh.destination_location_id = 'ac9580a7-0a5c-439f-bbe4-dceca9f68156');

SELECT public.fn_recalculate_site_air('925be222-d247-4d01-a6f4-181799f8d2d5');
SELECT public.fn_sync_air_typology('925be222-d247-4d01-a6f4-181799f8d2d5');

COMMIT;

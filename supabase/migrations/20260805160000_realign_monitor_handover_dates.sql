-- ============================================================================
-- Monitor · Report — riallinea le date handover dei monitor a Operations,
--                    saltando i valori segnaposto.
--
-- Companion di 20260805150000, che ha installato i trigger di sincronizzazione
-- ma non ha riscritto nulla di storico. Questa chiude il divario esistente su
-- tutti e tre i domini: air, water, energy.
--
-- ── Quali righe tocca ───────────────────────────────────────────────────────
--
--   • esiste una certificazione collegata (certification_id NOT NULL)
--   • la certificazione ha una data (mai si azzera un monitor perché
--     Operations non sa cosa scriverci)
--   • le due date differiscono
--   • la data di Operations NON è un valore riempito in blocco
--
-- ── Perché il filtro sui segnaposto è dinamico ──────────────────────────────
--
-- certifications.handover_date è in larga parte riempito a blocchi. Misurato il
-- 2026-08-06: 461 certificazioni condividono 2026-06-29, 115 stanno su
-- 2026-06-30, 101 su 2026-05-06, 86 su 2026-04-09, 47 su 2026-07-15, 40 su
-- 2026-07-16, 15 su 2026-07-01 — 765 su ~1134 distribuite su sette date, tutte
-- scritte in poche sessioni a partire dal 2026-07-06.
--
-- Escludere la sola 2026-06-29 avrebbe protetto 9 righe su 82 destinate a un
-- segnaposto: quella data raccoglie le certificazioni CHIUSE (354 su 461),
-- mentre i progetti aperti — quelli con i monitor attivi — stanno sulle altre
-- sei. Su energy non avrebbe escluso nulla: 72 righe su 74 sarebbero passate da
-- 2025-12-31 a 2026-05-06, cioè da un valore finto a un altro.
--
-- Il filtro è quindi calcolato dai dati e non da una lista fissa: qualunque data
-- condivisa da almeno SOGLIA certificazioni è considerata un riempimento. Una
-- lista fissa invecchia — al prossimo riempimento in blocco smetterebbe di
-- proteggere senza che nessuno se ne accorga.
--
-- La soglia di 15 separa nettamente i due gruppi nei dati attuali: sopra ci sono
-- solo i sette riempimenti noti, sotto le date di progetto reali. È comunque un
-- giudizio, non una legge: se un giorno molti progetti veri consegnassero
-- davvero nello stesso giorno, andrebbe rivista.
--
-- ── Effetto atteso ──────────────────────────────────────────────────────────
--
--   dominio | righe toccate | di cui monitor era NULL (nessuna perdita)
--   --------+---------------+------------------------------------------
--   air     |            18 |  9
--   energy  |             3 |  3
--   water   |             0 |  0   (tabella vuota)
--
-- Le altre 76 righe divergenti restano tali di proposito: per quelle Operations
-- non ha una data vera da propagare. Il trigger installato da 20260805150000 le
-- allineerà nel momento in cui qualcuno gliene darà una.
--
-- ── Idempotenza ─────────────────────────────────────────────────────────────
--
-- Snapshot e UPDATE condividono la stessa identica clausola WHERE. Dopo la prima
-- esecuzione nessuna riga la soddisfa più, quindi una seconda esecuzione non
-- scrive nulla e non duplica lo snapshot. Non servono marcatori di run.
-- ============================================================================

-- Dipende dalla tabella creata da 20260805150000; ricreata qui con IF NOT EXISTS
-- così il file resta eseguibile anche da solo.
CREATE TABLE IF NOT EXISTS public.monitor_handover_sync_backup (
  id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain                       text NOT NULL,
  record_id                    uuid NOT NULL,
  site_id                      uuid,
  certification_id             uuid,
  monitor_handover_date        date,
  certification_handover_date  date,
  monitor_project_name         text,
  monitor_pm_id                uuid,
  was_divergent                boolean NOT NULL DEFAULT false,
  captured_at                  timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Snapshot delle righe che stanno per essere riscritte.
-- ─────────────────────────────────────────────────────────────────────────────
WITH segnaposto AS (
  SELECT handover_date
  FROM public.certifications
  WHERE handover_date IS NOT NULL
  GROUP BY handover_date
  HAVING count(*) >= 15
)
INSERT INTO public.monitor_handover_sync_backup
  (domain, record_id, site_id, certification_id,
   monitor_handover_date, certification_handover_date,
   monitor_project_name, monitor_pm_id, was_divergent)
SELECT 'air:pre-realign', sar.id, sar.site_id, sar.certification_id,
       sar.handover_date, c.handover_date, sar.project_name, sar.pm_id, true
FROM public.site_air_records sar
JOIN public.certifications c ON c.id = sar.certification_id
WHERE c.handover_date IS NOT NULL
  AND sar.handover_date IS DISTINCT FROM c.handover_date
  AND c.handover_date NOT IN (SELECT handover_date FROM segnaposto)

UNION ALL
SELECT 'water:pre-realign', swr.id, swr.site_id, swr.certification_id,
       swr.handover_date, c.handover_date, swr.project_name, swr.pm_id, true
FROM public.site_water_records swr
JOIN public.certifications c ON c.id = swr.certification_id
WHERE c.handover_date IS NOT NULL
  AND swr.handover_date IS DISTINCT FROM c.handover_date
  AND c.handover_date NOT IN (SELECT handover_date FROM segnaposto)

UNION ALL
SELECT 'energy:pre-realign', ser.id, ser.site_id, ser.certification_id,
       ser.handover_date, c.handover_date, ser.project_name, ser.pm_id, true
FROM public.site_energy_records ser
JOIN public.certifications c ON c.id = ser.certification_id
WHERE c.handover_date IS NOT NULL
  AND ser.handover_date IS DISTINCT FROM c.handover_date
  AND c.handover_date NOT IN (SELECT handover_date FROM segnaposto);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Riallineamento. Stessa WHERE dello snapshot, in tutti e tre i domini.
-- ─────────────────────────────────────────────────────────────────────────────
WITH segnaposto AS (
  SELECT handover_date FROM public.certifications
  WHERE handover_date IS NOT NULL
  GROUP BY handover_date HAVING count(*) >= 15
)
UPDATE public.site_air_records sar
   SET handover_date = c.handover_date,
       updated_at    = now()
  FROM public.certifications c
 WHERE c.id = sar.certification_id
   AND c.handover_date IS NOT NULL
   AND sar.handover_date IS DISTINCT FROM c.handover_date
   AND c.handover_date NOT IN (SELECT handover_date FROM segnaposto);

WITH segnaposto AS (
  SELECT handover_date FROM public.certifications
  WHERE handover_date IS NOT NULL
  GROUP BY handover_date HAVING count(*) >= 15
)
UPDATE public.site_water_records swr
   SET handover_date = c.handover_date,
       updated_at    = now()
  FROM public.certifications c
 WHERE c.id = swr.certification_id
   AND c.handover_date IS NOT NULL
   AND swr.handover_date IS DISTINCT FROM c.handover_date
   AND c.handover_date NOT IN (SELECT handover_date FROM segnaposto);

WITH segnaposto AS (
  SELECT handover_date FROM public.certifications
  WHERE handover_date IS NOT NULL
  GROUP BY handover_date HAVING count(*) >= 15
)
UPDATE public.site_energy_records ser
   SET handover_date = c.handover_date,
       updated_at    = now()
  FROM public.certifications c
 WHERE c.id = ser.certification_id
   AND c.handover_date IS NOT NULL
   AND ser.handover_date IS DISTINCT FROM c.handover_date
   AND c.handover_date NOT IN (SELECT handover_date FROM segnaposto);

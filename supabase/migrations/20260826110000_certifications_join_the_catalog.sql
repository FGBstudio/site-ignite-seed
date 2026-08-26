-- Le certificazioni entrano nel catalogo.
--
-- I due vecchi CHECK se ne vanno: uno elencava undici cert_type e non conosceva
-- i servizi (MEP_Commissioning, WELL_PTA, GC Support...), l'altro assegnava a
-- CSRD le medaglie di LEED per un copia-incolla mai piu' riletto. Al loro posto
-- arriva un trigger che legge cert_catalog — vedi la migrazione successiva.
--
-- Qui si converte lo storico: 931 righe. Le regole generali sistemano le grafie
-- diverse per la stessa cosa; poi ci sono le decisioni prese una per una, che
-- nessuna regola avrebbe potuto indovinare — quali negozi WELL sono Existing
-- Building, quale tipologia LEED ha un progetto che non l'aveva mai avuta.
--
-- Il trigger dell'on hold viene spento per la durata della transazione: e' una
-- regola pensata per chi modifica a mano un progetto sospeso, non per una
-- conversione di vocabolario.
--
-- Restano fuori, di proposito:
--   · i progetti potential e quotation — l'offerta e' ancora incerta;
--   · SAINT LAURENT · AVENUE MONTAIGNE, TAXONOMY gia' certificata senza codice
--     attivita': si sistemera' con calma, e il trigger non la tocca.

BEGIN;

ALTER TABLE public.certifications
  ADD COLUMN IF NOT EXISTS cert_version     text,
  ADD COLUMN IF NOT EXISTS delivery_context text;

COMMENT ON COLUMN public.certifications.cert_version IS
  'Versione dello standard: v4.1, 2021, v6, v2 Pilot. Informativa — non entra nella scelta di timeline e scorecard.';
COMMENT ON COLUMN public.certifications.delivery_context IS
  'Secondo asse, usato solo dove serve: per WiredScore lo stesso Office puo'' essere Dev o Occ, e sono due timeline diverse.';

ALTER TABLE public.certifications DROP CONSTRAINT IF EXISTS certifications_chk_cert_type;
ALTER TABLE public.certifications DROP CONSTRAINT IF EXISTS certifications_cert_level_by_type_chk;

ALTER TABLE public.certifications DISABLE TRIGGER trg_enforce_cert_not_on_hold;

-- ── Grafie: la stessa cosa scritta in modi diversi ─────────────────────────
UPDATE public.certifications SET project_subtype = 'Commercial Interiors'
 WHERE cert_type = 'LEED' AND btrim(coalesce(project_subtype,'')) IN ('Commercial Interior','Interiors');

UPDATE public.certifications SET project_subtype = 'Warehouses & Distribution Centers'
 WHERE cert_type = 'LEED' AND btrim(coalesce(project_subtype,'')) IN ('Warehouses','Warehouse');

UPDATE public.certifications SET project_subtype = 'Schools'
 WHERE cert_type = 'LEED' AND btrim(coalesce(project_subtype,'')) = 'School';

-- ── BREEAM In Use: le Part prendono il nome per esteso ─────────────────────
UPDATE public.certifications
   SET cert_rating = 'In-Use', cert_version = 'v6',
       project_subtype = CASE btrim(coalesce(project_subtype,''))
                           WHEN 'Part 1' THEN 'Part 1: Asset Performance'
                           WHEN 'Part 2' THEN 'Part 2: Building Management'
                           ELSE project_subtype END
 WHERE cert_type = 'BREEAM' AND btrim(coalesce(cert_rating,'')) = 'In Use';

-- ── WELL: la tipologia decide scorecard e timeline, il rating non esiste ───
-- 194 negozi di ottica, tutti con handover fra aprile e giugno 2026: una
-- campagna sola, e una tipologia sola.
UPDATE public.certifications c
   SET project_subtype = 'Existing Building', cert_version = 'v2', cert_rating = NULL
  FROM public.sites s LEFT JOIN public.brands b ON b.id = s.brand_id
 WHERE s.id = c.site_id AND c.cert_type = 'WELL'
   AND coalesce(nullif(btrim(c.cert_rating),''),'') = ''
   AND b.name IN ('LENSCRAFTERS','GRANDVISION','SUNGLASS HUT','SALMOIRAGHI E VIGANÒ');

UPDATE public.certifications c
   SET project_subtype = 'New Construction', cert_version = 'v2', cert_rating = NULL
  FROM public.sites s LEFT JOIN public.brands b ON b.id = s.brand_id
 WHERE s.id = c.site_id AND c.cert_type = 'WELL'
   AND coalesce(nullif(btrim(c.cert_rating),''),'') = ''
   AND b.name IN ('VISILAB','DIMAR');

UPDATE public.certifications
   SET project_subtype = 'Health-Safety (HSR)', cert_version = 'v2-aligned', cert_rating = NULL
 WHERE cert_type = 'WELL' AND btrim(coalesce(cert_rating,'')) = 'HSR';

-- ── TAXONOMY: il codice attivita' era gia' scritto, solo nel campo sbagliato ─
UPDATE public.certifications
   SET project_subtype = btrim(cert_rating), cert_rating = NULL
 WHERE cert_type = 'TAXONOMY' AND btrim(coalesce(cert_rating,'')) IN ('7.1','7.2','7.7');

-- ── Le tipologie decise una per una ───────────────────────────────────────
UPDATE public.certifications SET project_subtype = 'Retail'
 WHERE id::text LIKE ANY (ARRAY['781788ca%','fad0bb7c%','4760caca%','f5493337%',
                                'b7548644%','1be5c73f%','5475c9ea%','62683f2e%',
                                '711d375c%','9f37bf7f%']);

UPDATE public.certifications SET project_subtype = 'Commercial Interiors'
 WHERE id::text LIKE ANY (ARRAY['7ff31bd5%','03a9435a%','40b44c24%','5d9ced97%']);

UPDATE public.certifications SET project_subtype = 'Warehouses & Distribution Centers'
 WHERE id::text LIKE '6c1d0865%';   -- FENDI Fabbrica

UPDATE public.certifications SET project_subtype = 'Core & Shell'
 WHERE id::text LIKE 'a3eb64e7%';   -- RED CIRCLE Lorenzini 12

-- ── La medaglia era finita nel campo del rating ───────────────────────────
UPDATE public.certifications SET cert_rating = 'ID+C', cert_level = 'Platinum'
 WHERE id::text LIKE ANY (ARRAY['c3bc2735%','1337971b%']);

UPDATE public.certifications SET cert_rating = 'ID+C', cert_version = 'v4.0'
 WHERE id::text LIKE 'a5473600%';   -- era "ID+C v.4"

UPDATE public.certifications SET cert_rating = 'BD+C', cert_level = 'Platinum'
 WHERE id::text LIKE 'd1cb1c13%';

UPDATE public.certifications SET cert_rating = 'BD+C'
 WHERE id::text LIKE '466b87b5%';

UPDATE public.certifications SET cert_rating = NULL, project_subtype = 'New Construction', cert_version = 'v2'
 WHERE id::text LIKE ANY (ARRAY['26447bae%','d63355df%']);

UPDATE public.certifications SET cert_rating = NULL, project_subtype = 'Existing Building', cert_version = 'v2'
 WHERE id::text LIKE '842b64bc%';   -- APOLLO-OPTIK

UPDATE public.certifications SET cert_rating = 'International New Construction', project_subtype = 'Residential'
 WHERE id::text LIKE 'ca869170%';

UPDATE public.certifications
   SET cert_rating = 'Refurbishment and Fit-Out', project_subtype = 'Retail',
       cert_level = 'Very Good', cert_version = '2015'
 WHERE id::text LIKE 'ab5c92ca%';   -- IKEA Elmas

UPDATE public.certifications SET cert_rating = 'ID+C', project_subtype = 'Retail'
 WHERE id::text LIKE 'd43e49f0%';

-- ── BREEAM: New Construction era il rating system, mancava la tipologia ────
UPDATE public.certifications SET cert_rating = 'International New Construction', project_subtype = 'Healthcare'
 WHERE id::text LIKE 'bacf7922%';   -- LOVETT CARE Care Home
UPDATE public.certifications SET cert_rating = 'International New Construction', project_subtype = 'Retail'
 WHERE id::text LIKE '5e0919cb%';   -- PGM METRO
UPDATE public.certifications SET cert_rating = 'International New Construction', project_subtype = 'Residential'
 WHERE id::text LIKE '51fa6142%';   -- PRIMUS II UK Student

-- ── Due schemi sbagliati in partenza ──────────────────────────────────────
UPDATE public.certifications
   SET cert_type = 'TAXONOMY', cert_rating = NULL, project_subtype = '7.2'
 WHERE id::text LIKE '4d17c4ec%';   -- BRIONI: era ESG col codice nel rating

UPDATE public.certifications
   SET cert_type = 'Energy', cert_rating = NULL, project_subtype = NULL,
       has_energy_monitoring = true
 WHERE id::text LIKE 'b6a09d83%';   -- MIU MIU Firenze: e' Energy, non un audit

-- ── Ripa89: la nostra attivita' non e' certificare, e' erogare servizi ────
-- I nomi restano: dicono a quale scopo serve ciascun servizio.
UPDATE public.certifications
   SET cert_type = 'MEP_Commissioning', cert_rating = NULL, project_subtype = NULL,
       cert_level = NULL, cert_version = NULL
 WHERE id::text LIKE ANY (ARRAY['024850cb%','cd558598%']);

UPDATE public.certifications
   SET cert_type = 'WELL_PTA', cert_rating = NULL, project_subtype = NULL,
       cert_level = NULL, cert_version = NULL
 WHERE id::text LIKE 'e6a8494c%';

-- ── TETRIS W Hotel Majestic: il PTA e' un terzo progetto, non esisteva ────
INSERT INTO public.certifications (
  site_id, name, client, cert_type, status, region, pm_id, handover_date, fgb_monitor
)
SELECT c.site_id, 'W Hotel Majestic - PTA', c.client, 'WELL_PTA', c.status,
       c.region, c.pm_id, c.handover_date, false
  FROM public.certifications c
 WHERE c.id::text LIKE 'd63355df%'
   AND NOT EXISTS (SELECT 1 FROM public.certifications x
                    WHERE x.site_id = c.site_id AND x.cert_type = 'WELL_PTA');

ALTER TABLE public.certifications ENABLE TRIGGER trg_enforce_cert_not_on_hold;

COMMIT;

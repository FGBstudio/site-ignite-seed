-- Il catalogo delle certificazioni: un vocabolario solo, in tabella.
--
-- Fino a qui lo stesso vocabolario stava scritto in quattro posti che non
-- concordavano: il vincolo CHECK sul database, la TAXONOMY di ratingSubtypes.ts,
-- il registro di certificationTemplates.ts e le liste dei tipi selezionabili nel
-- wizard e nel form. Quattro elenchi diversi per la stessa domanda — «cosa si
-- puo' scrivere qui» — con l'esito che cert_rating e project_subtype erano di
-- fatto testo libero e ci e' finito dentro di tutto: medaglie nel campo del
-- rating, rating LEED su schemi BREEAM, 197 progetti WELL senza tipologia.
--
-- Qui il vocabolario diventa dati. Una riga per combinazione che esiste al
-- mondo, e i livelli ammessi appesi a ciascuna. Quando esce LEED v5 e' un
-- INSERT, non una migrazione e un rilascio; e le due applicazioni leggono la
-- stessa tabella, quindi non possono divergere.
--
-- ── I quattro modelli di esito ─────────────────────────────────────────────
--
-- I cinque schemi documentati non hanno tutti la stessa forma, ed e' per questo
-- che il vincolo unico su cert_level continuava a rompersi:
--
--   score_band   un punteggio cade in una fascia — LEED, WELL, BREEAM contano
--                punti, Envision percentuali. Da qui score_unit.
--   level_only   i livelli esistono ma non si calcolano — WiredScore, WELL HSR.
--   gates        tre sbarramenti da superare tutti — TAXONOMY: SC, DNSH, MSS.
--                L'esito e' binario, allineato o no.
--   none         forniture e servizi: non c'e' niente da ottenere. Il badge e'
--                Pending/Completed e viene dall'avanzamento della scaletta.
--
-- ── I due assi ────────────────────────────────────────────────────────────
--
-- Cosa si certifica (scheme + rating_system + typology) decide la scorecard.
-- Quale scaletta si segue lo dice timeline_key, che NON e' sempre derivabile
-- dal primo: per WiredScore lo stesso Office puo' essere in sviluppo o gia'
-- occupato, e sono due timeline diverse. Da qui delivery_context.
--
-- Questa migrazione crea e popola. Non tocca una sola riga di certifications:
-- le chiavi esterne arrivano dopo, quando lo storico sara' stato convertito.

BEGIN;

CREATE TABLE IF NOT EXISTS public.cert_catalog (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme           text NOT NULL,
  rating_system    text,
  typology         text,
  version          text,
  delivery_context text,
  display_label    text NOT NULL,
  outcome_model    text NOT NULL CHECK (outcome_model IN ('score_band','level_only','gates','none')),
  score_unit       text CHECK (score_unit IN ('points','percent')),
  timeline_key     text,
  is_sellable      boolean NOT NULL DEFAULT true,
  order_index      integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Le quattro coordinate identificano la combinazione. NULLS NOT DISTINCT perche'
-- «nessun rating system» e' un valore come gli altri: WELL non ne ha, e due
-- righe WELL con la stessa tipologia devono collidere.
CREATE UNIQUE INDEX IF NOT EXISTS cert_catalog_key
  ON public.cert_catalog (scheme, rating_system, typology, version, delivery_context)
  NULLS NOT DISTINCT;

CREATE TABLE IF NOT EXISTS public.cert_catalog_levels (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id  uuid NOT NULL REFERENCES public.cert_catalog(id) ON DELETE CASCADE,
  level       text NOT NULL,
  order_index integer NOT NULL,
  score_min   numeric,
  score_max   numeric,
  UNIQUE (catalog_id, level)
);

CREATE TRIGGER trg_cert_catalog_updated_at
  BEFORE UPDATE ON public.cert_catalog
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.cert_catalog        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cert_catalog_levels ENABLE ROW LEVEL SECURITY;

-- E' un vocabolario, non un dato di progetto: lo legge chiunque sia autenticato.
CREATE POLICY cert_catalog_read        ON public.cert_catalog        FOR SELECT TO authenticated USING (true);
CREATE POLICY cert_catalog_levels_read ON public.cert_catalog_levels FOR SELECT TO authenticated USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- LEED — 42 combinazioni, soglie uguali ovunque
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.cert_catalog (scheme, rating_system, typology, version, display_label, outcome_model, score_unit, timeline_key, order_index)
SELECT 'LEED', r.rating, r.typology, v.version,
       'LEED ' || r.rating || ' · ' || r.typology,
       'score_band', 'points', r.tl, r.ord
FROM (VALUES
  ('BD+C','New Construction','LEED BD+C',11),
  ('BD+C','Core & Shell','LEED BD+C',12),
  ('BD+C','Schools','LEED BD+C',13),
  ('BD+C','Retail','LEED BD+C',14),
  ('BD+C','Data Centers','LEED BD+C',15),
  ('BD+C','Warehouses & Distribution Centers','LEED BD+C',16),
  ('BD+C','Hospitality','LEED BD+C',17),
  ('BD+C','Healthcare','LEED BD+C',18),
  ('ID+C','Commercial Interiors','LEED ID+C',21),
  ('ID+C','Retail','LEED ID+C',22),
  ('ID+C','Hospitality','LEED ID+C',23),
  ('O+M','Existing Buildings','LEED O+M',31),
  ('O+M','Retail','LEED O+M',32),
  ('O+M','Schools','LEED O+M',33),
  ('O+M','Hospitality','LEED O+M',34),
  ('O+M','Data Centers','LEED O+M',35),
  ('O+M','Warehouses & Distribution Centers','LEED O+M',36),
  ('Homes','Homes and Multifamily Lowrise',NULL,41),
  ('Homes','Multifamily Midrise',NULL,42),
  ('ND','Neighborhood Development',NULL,51)
) AS r(rating, typology, tl, ord)
CROSS JOIN (VALUES ('v4.0'),('v4.1')) AS v(version);

INSERT INTO public.cert_catalog (scheme, rating_system, typology, version, display_label, outcome_model, score_unit, order_index)
VALUES
  ('LEED','Cities & Communities','LEED for Cities','v4.1','LEED Cities & Communities · Cities','score_band','points',61),
  ('LEED','Cities & Communities','LEED for Communities','v4.1','LEED Cities & Communities · Communities','score_band','points',62);

INSERT INTO public.cert_catalog_levels (catalog_id, level, order_index, score_min, score_max)
SELECT c.id, l.level, l.ord, l.mn, l.mx
FROM public.cert_catalog c
CROSS JOIN (VALUES
  ('Certified',1,40,49),('Silver',2,50,59),('Gold',3,60,79),('Platinum',4,80,110)
) AS l(level, ord, mn, mx)
WHERE c.scheme = 'LEED';

-- ═══════════════════════════════════════════════════════════════════════════
-- WELL — la tipologia decide sia scorecard sia timeline
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.cert_catalog (scheme, typology, version, display_label, outcome_model, score_unit, timeline_key, order_index)
VALUES
  ('WELL','New Construction','v2','WELL New Construction','score_band','points','WELL New Construction',11),
  ('WELL','Existing Building','v2','WELL Existing Building','score_band','points','WELL Existing Building',12),
  ('WELL','Core','v2','WELL Core','score_band','points','WELL Core',13),
  ('WELL','New Construction','v2 Pilot','WELL New Construction (Pilot)','score_band','points','WELL New Construction',21),
  ('WELL','Existing Building','v2 Pilot','WELL Existing Building (Pilot)','score_band','points','WELL Existing Building',22),
  ('WELL','Core and Shell','v2 Pilot','WELL Core and Shell (Pilot)','score_band','points','WELL Core',23);

-- Il Bronze esiste soltanto nel Pilot: il vincolo attuale lo ammetteva su ogni WELL.
INSERT INTO public.cert_catalog_levels (catalog_id, level, order_index, score_min, score_max)
SELECT c.id, l.level, l.ord, l.mn, l.mx
FROM public.cert_catalog c
CROSS JOIN (VALUES ('Silver',2,50,59),('Gold',3,60,79),('Platinum',4,80,100)) AS l(level, ord, mn, mx)
WHERE c.scheme = 'WELL' AND c.version IN ('v2','v2 Pilot');

INSERT INTO public.cert_catalog_levels (catalog_id, level, order_index, score_min, score_max)
SELECT c.id, 'Bronze', 1, 40, 49
FROM public.cert_catalog c
WHERE c.scheme = 'WELL' AND c.version = 'v2 Pilot';

-- HSR: un'attestazione, non una medaglia. La scaletta arrivera'.
INSERT INTO public.cert_catalog (scheme, typology, version, display_label, outcome_model, order_index)
VALUES ('WELL','Health-Safety (HSR)','v2-aligned','WELL Health-Safety Rating','level_only',31);

INSERT INTO public.cert_catalog_levels (catalog_id, level, order_index)
SELECT id, 'Achieved', 1 FROM public.cert_catalog
WHERE scheme = 'WELL' AND typology = 'Health-Safety (HSR)';

-- ═══════════════════════════════════════════════════════════════════════════
-- BREEAM — In-Use Part 3 escluso: non si vende
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.cert_catalog (scheme, rating_system, typology, version, display_label, outcome_model, score_unit, timeline_key, order_index)
SELECT 'BREEAM','International New Construction', t.typology, v.version,
       'BREEAM International NC · ' || t.typology, 'score_band','percent','BREEAM NC / RFO', t.ord
FROM (VALUES
  ('Residential',11),('Commercial Offices',12),('Retail',13),('Industrial',14),
  ('Education',15),('Healthcare',16),('Hospitality',17),('Other Buildings',18)
) AS t(typology, ord)
CROSS JOIN (VALUES ('2016'),('2021')) AS v(version);

INSERT INTO public.cert_catalog (scheme, rating_system, typology, version, display_label, outcome_model, score_unit, timeline_key, order_index)
SELECT 'BREEAM','Refurbishment and Fit-Out', t.typology, '2015',
       'BREEAM Refurbishment · ' || t.typology, 'score_band','percent','BREEAM NC / RFO', t.ord
FROM (VALUES
  ('Commercial Offices',21),('Retail',22),('Education',23),
  ('Healthcare',24),('Hospitality',25),('Other Buildings',26)
) AS t(typology, ord);

INSERT INTO public.cert_catalog (scheme, rating_system, typology, version, display_label, outcome_model, score_unit, timeline_key, order_index)
VALUES
  ('BREEAM','In-Use','Part 1: Asset Performance','v6','BREEAM In-Use Part 1','score_band','percent','BREEAM In-Use Part 1',31),
  ('BREEAM','In-Use','Part 2: Building Management','v6','BREEAM In-Use Part 2','score_band','percent','BREEAM In-Use Part 2',32);

INSERT INTO public.cert_catalog_levels (catalog_id, level, order_index, score_min, score_max)
SELECT c.id, l.level, l.ord, l.mn, l.mx
FROM public.cert_catalog c
CROSS JOIN (VALUES
  ('Pass',1,30,44),('Good',2,45,54),('Very Good',3,55,69),
  ('Excellent',4,70,84),('Outstanding',5,85,100)
) AS l(level, ord, mn, mx)
WHERE c.scheme = 'BREEAM';

-- ═══════════════════════════════════════════════════════════════════════════
-- WiredScore — qui serve il secondo asse: lo stesso Office puo' essere
-- in sviluppo (Dev) o gia' occupato (Occ), e sono due scalette diverse.
-- «Pre-certified» non e' un livello: e' la milestone 4 di WiredScore Dev.
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.cert_catalog (scheme, typology, delivery_context, display_label, outcome_model, timeline_key, order_index)
SELECT 'WiredScore', t.typology, d.ctx,
       'WiredScore ' || t.typology || ' · ' || d.ctx, 'level_only',
       'WiredScore ' || d.ctx, t.ord
FROM (VALUES ('Office',11),('Home',12),('Industrial',13),('Neighborhood',14),('Portfolio',15)) AS t(typology, ord)
CROSS JOIN (VALUES ('Dev'),('Occ')) AS d(ctx);

INSERT INTO public.cert_catalog_levels (catalog_id, level, order_index)
SELECT c.id, l.level, l.ord
FROM public.cert_catalog c
CROSS JOIN (VALUES ('Certified',1),('Silver',2),('Gold',3),('Platinum',4)) AS l(level, ord)
WHERE c.scheme = 'WiredScore' AND c.typology <> 'Home';

-- Home ha il solo Certified.
INSERT INTO public.cert_catalog_levels (catalog_id, level, order_index)
SELECT id, 'Certified', 1 FROM public.cert_catalog
WHERE scheme = 'WiredScore' AND typology = 'Home';

-- ═══════════════════════════════════════════════════════════════════════════
-- Envision — percentuali, non punti
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.cert_catalog (scheme, typology, version, display_label, outcome_model, score_unit, order_index)
VALUES
  ('Envision','General Infrastructure','v2','Envision v2','score_band','percent',11),
  ('Envision','General Infrastructure','v3','Envision v3','score_band','percent',12);

INSERT INTO public.cert_catalog_levels (catalog_id, level, order_index, score_min, score_max)
SELECT c.id, l.level, l.ord, l.mn, l.mx
FROM public.cert_catalog c
CROSS JOIN (VALUES ('Bronze',1,20,29),('Silver',2,30,39),('Gold',3,40,49),('Platinum',4,50,100)) AS l(level, ord, mn, mx)
WHERE c.scheme = 'Envision';

-- ═══════════════════════════════════════════════════════════════════════════
-- TAXONOMY — tre sbarramenti, esito binario. I codici attivita' sono gia'
-- quelli che il database usa oggi nel campo rating: 7.1, 7.2.
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.cert_catalog (scheme, typology, display_label, outcome_model, timeline_key, order_index)
VALUES
  ('TAXONOMY','7.1','Tassonomia 7.1 · Nuove Costruzioni','gates','TAXONOMY',11),
  ('TAXONOMY','7.2','Tassonomia 7.2 · Ristrutturazioni Importanti','gates','TAXONOMY',12),
  ('TAXONOMY','7.7','Tassonomia 7.7 · Acquisizione e Proprieta','gates','TAXONOMY',13);

INSERT INTO public.cert_catalog_levels (catalog_id, level, order_index)
SELECT c.id, l.level, l.ord
FROM public.cert_catalog c
CROSS JOIN (VALUES ('Non allineato',1),('Allineato',2)) AS l(level, ord)
WHERE c.scheme = 'TAXONOMY';

-- ═══════════════════════════════════════════════════════════════════════════
-- CSRD — conseguito o no. Il vincolo precedente gli dava le medaglie di LEED.
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.cert_catalog (scheme, display_label, outcome_model, order_index)
VALUES ('CSRD','CSRD','level_only',11);

INSERT INTO public.cert_catalog_levels (catalog_id, level, order_index)
SELECT c.id, l.level, l.ord
FROM public.cert_catalog c
CROSS JOIN (VALUES ('Non conseguito',1),('Conseguito',2)) AS l(level, ord)
WHERE c.scheme = 'CSRD';

-- ═══════════════════════════════════════════════════════════════════════════
-- I servizi — nessun esito da ottenere: si erogano. Pending finche' la
-- scaletta non e' completa, Completed quando lo e'.
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.cert_catalog (scheme, display_label, outcome_model, timeline_key, order_index)
VALUES
  ('Air',                 'Air — ClAir IAQ',        'none','Air',11),
  ('Energy',              'Energy — Greeny',        'none','Energy',12),
  ('Energy_Audit',        'Energy Audit',           'none','Energy Audit',13),
  ('MEP_Commissioning',   'MEP Commissioning',      'none','MEP Commissioning',21),
  ('Envelope_Commissioning','Envelope Commissioning','none','Envelope Commissioning',22),
  ('IAQ_Testing',         'IAQ Testing',            'none','IAQ Testing',23),
  ('WELL_PTA',            'WELL PTA',               'none','WELL PTA',24),
  ('LEED_GC_Support',     'LEED GC Support',        'none','LEED GC Support',31),
  ('BREEAM_GC_Support',   'BREEAM GC Support',      'none','BREEAM GC Support',32),
  ('WELL_GC_Support',     'WELL GC Support',        'none','WELL GC Support',33);

INSERT INTO public.cert_catalog_levels (catalog_id, level, order_index)
SELECT c.id, l.level, l.ord
FROM public.cert_catalog c
CROSS JOIN (VALUES ('Pending',1),('Completed',2)) AS l(level, ord)
WHERE c.outcome_model = 'none';

-- ═══════════════════════════════════════════════════════════════════════════
-- ESG e GRESB restano fuori: il primo e' un doppione di TAXONOMY da chiarire,
-- del secondo non ho ancora la struttura dei livelli.
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE public.cert_catalog IS
  'Vocabolario unico degli schemi di certificazione e dei servizi. Una riga per combinazione che esiste al mondo. Sostituisce i quattro elenchi che stavano nel vincolo CHECK, in ratingSubtypes.ts, in certificationTemplates.ts e nelle liste del wizard.';
COMMENT ON COLUMN public.cert_catalog.outcome_model IS
  'score_band = punteggio in fascia · level_only = livelli senza punteggio · gates = sbarramenti tutti da superare · none = servizio, nessun esito';
COMMENT ON COLUMN public.cert_catalog.timeline_key IS
  'Quale scaletta di milestone segue. Non sempre derivabile dallo schema: per WiredScore dipende da delivery_context.';
COMMENT ON COLUMN public.cert_catalog.delivery_context IS
  'Secondo asse, usato solo dove serve: per WiredScore lo stesso Office puo'' essere Dev o Occ e sono due timeline diverse.';

COMMIT;

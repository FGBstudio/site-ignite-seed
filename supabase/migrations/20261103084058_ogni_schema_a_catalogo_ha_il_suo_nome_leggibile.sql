-- ═══════════════════════════════════════════════════════════════════════════
-- Ogni schema a catalogo ha il suo nome leggibile
--
-- Il nome di uno schema stava scritto a mano in **quattro file** — il wizard
-- delle offerte, il form progetto, l'onboarding sito/progetto e la pagina
-- Projects — con sette, undici, sette e sette voci: quattro mappe diverse.
--
-- Tutte nominavano `ESG` e `GRESB`, che a catalogo non esistono, e con tre grafie
-- differenti («Taxonomy ESG», «ESG - Taxonomy», «ESG»). E nessuna nominava i nove
-- schemi che esistono davvero — TAXONOMY, CSRD, Envision, WiredScore,
-- IAQ_Testing, le due Commissioning, WELL_PTA e i tre GC Support — che quindi si
-- mostravano col codice: in una tendina commerciale si leggeva
-- «WELL_GC_Support».
--
-- Nel wizard c'era anche `CERT_LEVELS`, le medaglie per schema: **dichiarata e
-- mai usata**. Le medaglie vengono da `cert_catalog_levels` e dipendono dalla
-- combinazione, non dallo schema — il Bronze di WELL esiste solo sul v2 Pilot.
-- Diciotto righe morte che invitavano a reintrodurre una seconda verità.
--
-- La causa stava nel catalogo, non nelle mappe. `display_label` descrive la
-- **voce** — «LEED BD+C · Core & Shell», «WiredScore Home · Dev» — e per il nome
-- dello schema andava bene solo dove la voce è una sola, cioè per i servizi. Il
-- hook infatti faceva: etichetta = `display_label` se il servizio non ha un
-- esito, altrimenti il codice. Le mappe servivano a rimediare a quel codice.
--
-- Ora il nome dello schema è una colonna del catalogo. Vocabolario e nome
-- leggibile vivono nella stessa tabella, e uno schema nuovo arriva col suo nome
-- invece che col suo codice. Il NOT NULL fa in modo che non possa arrivare senza.
--
-- Nel front-end il passaggio da codice a nome sta in `src/lib/nomeSchema.ts`, un
-- punto solo, con un ripiego meccanico — gli underscore diventano spazi — per i
-- millisecondi prima che il catalogo sia caricato.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.cert_catalog
  add column if not exists scheme_label text;

update public.cert_catalog c
   set scheme_label = v.etichetta
  from (values
    ('LEED',                   'LEED'),
    ('WELL',                   'WELL'),
    ('BREEAM',                 'BREEAM'),
    ('TAXONOMY',               'Taxonomy ESG'),
    ('CSRD',                   'CSRD'),
    ('Envision',               'Envision'),
    ('WiredScore',             'WiredScore'),
    ('Air',                    'Air — ClAir IAQ'),
    ('Energy',                 'Energy — Greeny'),
    ('Energy_Audit',           'Energy Audit'),
    ('IAQ_Testing',            'IAQ Testing'),
    ('MEP_Commissioning',      'MEP Commissioning'),
    ('Envelope_Commissioning', 'Envelope Commissioning'),
    ('LEED_GC_Support',        'LEED — supporto al General Contractor'),
    ('WELL_GC_Support',        'WELL — supporto al General Contractor'),
    ('BREEAM_GC_Support',      'BREEAM — supporto al General Contractor'),
    ('WELL_PTA',               'WELL — Performance Testing Agent')
  ) as v(scheme, etichetta)
 where c.scheme = v.scheme;

-- Un nome ci vuole. Chi aggiunge uno schema senza etichetta se ne accorge qui e
-- non in una tendina, davanti a un cliente.
alter table public.cert_catalog
  alter column scheme_label set not null;

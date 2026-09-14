-- ============================================================================
-- Un servizio di monitoraggio puo' vivere appeso al solo sito
--
-- Specifica: v1 §6, decisione §5.
--
-- "Mandami i monitor per domani" — senza certificazione e senza cantiere — e'
-- una vendita reale, non un caso degenere. Sull'aria succede gia': 66 righe di
-- `site_air_records` hanno `certification_id` nullo, ed e' esattamente il caso
-- descritto nel §6.
--
-- Su energia e acqua era impossibile: `certification_id` era NOT NULL, quindi
-- il modello conosceva solo il monitoraggio satellite di una certificazione
-- madre. E' il motivo per cui tutte e 107 le righe energia hanno una
-- certificazione e le orfane sono tutte aria — non una scelta, un vincolo.
--
-- Qui le tre tabelle diventano simmetriche, con lo stesso schema di indici che
-- l'aria ha gia': una riga per (sito, certificazione) quando e' agganciata, una
-- riga libera per sito quando non lo e'.
--
-- Allentare un NOT NULL non invalida nessuna riga esistente.
-- ============================================================================

alter table public.site_energy_records alter column certification_id drop not null;
alter table public.site_water_records  alter column certification_id drop not null;

-- L'indice precedente era unico sulla sola certificazione: con i NULL ammessi
-- avrebbe lasciato passare piu' righe libere per lo stesso sito, perche'
-- Postgres considera i NULL tutti diversi fra loro.
drop index if exists public.site_energy_records_certification_id_uniq;

create unique index if not exists site_energy_records_site_cert_key
  on public.site_energy_records (site_id, certification_id)
  where certification_id is not null;
create unique index if not exists site_energy_records_site_unattached_key
  on public.site_energy_records (site_id)
  where certification_id is null;

create unique index if not exists site_water_records_site_cert_key
  on public.site_water_records (site_id, certification_id)
  where certification_id is not null;
create unique index if not exists site_water_records_site_unattached_key
  on public.site_water_records (site_id)
  where certification_id is null;

comment on column public.site_energy_records.certification_id IS
  'NULL quando il servizio e'' venduto da solo, appeso al sito. Vedi specifica-cronoprogramma-v1 §6.';

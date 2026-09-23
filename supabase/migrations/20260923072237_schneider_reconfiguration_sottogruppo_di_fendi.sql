-- ═══════════════════════════════════════════════════════════════════════════
-- Schneider Reconfiguration: un sottogruppo, non una commessa
--
-- I diciotto progetti della riconfigurazione Schneider non sono un contratto
-- a parte: stanno dentro Fendi Energy 2024. Ma sono una lavorazione distinta,
-- con hardware proprio (i convertitori ZLAN), e nell'elenco progetti vanno
-- letti insieme, in coda, non mescolati agli altri cinquantadue.
--
-- Bastava una colonna. Una commessa finta avrebbe spezzato i totali di Fendi
-- Energy 2024 in due tronconi che nessun contratto giustifica.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.commessa_progetti
  add column if not exists sottogruppo text;

comment on column public.commessa_progetti.sottogruppo is
  'Lavorazione distinta dentro la stessa commessa. Nell''elenco progetti diventa una sezione in coda.';

-- I progetti che ancora non stavano in Fendi Energy 2024 ci entrano.
insert into public.commessa_progetti (commessa_id, certification_id, sottogruppo)
select k.id, e.certification_id, 'Schneider Reconfiguration'
  from public.site_energy_records e
  cross join public.commesse k
 where k.nome = 'Fendi Energy 2024'
   and e.certification_id is not null
   and e.project_name in (
     'Chengdu, IFS', 'Hangzhou, MixC', 'Hong Kong, Elements', 'Hong Kong, Elements (Men)',
     'Hong Kong, Landmark', 'Hong Kong, Pacific Place', 'Lótus, Four Seasons (DFS)',
     'Milan, Galleria', 'Nanjing, IFC - Energy', 'Sé, One Central',
     'Shanghai, Plaza 66 (Kids)', 'Shanghai, Plaza 66 (Women)',
     'Taipa, Galaxy', 'Beijing, WF Central', 'Harbin, Charter (Men)',
     'Tianjin, Galaxy Mall', 'Hong Kong, Landmark (Men)', 'Hong Kong, Canton Road'
   )
   and not exists (
     select 1 from public.commessa_progetti cp where cp.certification_id = e.certification_id
   );

-- Quelli che c'erano gia' prendono l'etichetta.
update public.commessa_progetti cp
   set sottogruppo = 'Schneider Reconfiguration'
  from public.site_energy_records e
 where e.certification_id = cp.certification_id
   and e.project_name in (
     'Chengdu, IFS', 'Hangzhou, MixC', 'Hong Kong, Elements', 'Hong Kong, Elements (Men)',
     'Hong Kong, Landmark', 'Hong Kong, Pacific Place', 'Lótus, Four Seasons (DFS)',
     'Milan, Galleria', 'Nanjing, IFC - Energy', 'Sé, One Central',
     'Shanghai, Plaza 66 (Kids)', 'Shanghai, Plaza 66 (Women)',
     'Taipa, Galaxy', 'Beijing, WF Central', 'Harbin, Charter (Men)',
     'Tianjin, Galaxy Mall', 'Hong Kong, Landmark (Men)', 'Hong Kong, Canton Road'
   )
   and cp.sottogruppo is distinct from 'Schneider Reconfiguration';

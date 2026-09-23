-- Milan Galleria, Hong Kong Canton Road e Shanghai Plaza 66 (Women) montano
-- un convertitore ZLAN come le altre, ma non fanno parte della
-- riconfigurazione Schneider: sono progetti dell'elenco normale.
--
-- Avevo dedotto l'appartenenza dall'hardware, e l'hardware non basta a
-- dirlo: il convertitore serve anche dove la riconfigurazione non c'e'.
update public.commessa_progetti cp
   set sottogruppo = null
  from public.certifications c
 where c.id = cp.certification_id
   and c.name in ('Milan, Galleria', 'Hong Kong, Canton Road', 'Shanghai, Plaza 66 (Women)')
   and cp.sottogruppo = 'Schneider Reconfiguration';

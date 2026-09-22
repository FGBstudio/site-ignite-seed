-- ═══════════════════════════════════════════════════════════════════════════
-- Milano Galleria: un negozio, due siti. Si accorpano le certificazioni, non
-- si cancella niente.
--
--   cd580cbd «Fendi Milano Galleria»              1 cert Energy 7.100 EUR,
--                                                 1 record energia, 3 device,
--                                                 1 hardware, 15.011 righe meteo
--   0340fc7b «Fendi Galleria Vittorio Emanuele II» 2 cert LEED,
--                                                 14.820 righe meteo,
--                                                 1.792 orarie, 76 giornaliere
--
-- Vince il primo: e' quello a cui si appoggiano il progetto, i device e
-- l'hardware. Le due LEED traslocano la'.
--
-- Il sito vuoto NON si cancella. Su `sites` trentatre chiavi esterne sono in
-- CASCADE, `certifications` compresa: una delete porterebbe via 16.688 righe
-- di meteo e meteo-energia senza chiedere niente a nessuno. Spostare i dati
-- non e' meglio — il sito superstite ha gia' la sua serie sullo stesso periodo
-- e la stessa citta', e si creerebbero doppioni.
--
-- Resta quindi un sito senza certificazioni che custodisce la sua serie
-- storica. E' un artefatto, si vede negli elenchi, ed e' il prezzo di non
-- buttare dati: cancellarlo e' una decisione separata, e va presa sapendo
-- cosa costa.
update public.certifications
   set site_id = 'cd580cbd-b3ce-4d31-b483-215a80d11f30'
 where site_id = '0340fc7b-0a6f-4f90-a154-60287130eb15';

-- Il nome dice cosa e' diventato, cosi' nessuno lo riusa per sbaglio.
update public.sites
   set name = 'Fendi Galleria Vittorio Emanuele II (accorpato in Fendi Milano Galleria)'
 where id = '0340fc7b-0a6f-4f90-a154-60287130eb15';

-- Lucan Lodge: il dichiarato era 13.800, ma quello comprendeva un servizio
-- diverso dalla fornitura dei monitor. La commessa vale i 9.600 delle sue
-- tranche, e i 4.200 di differenza non erano un ammanco.
update public.commesse
   set valore_dichiarato = 9600.00,
       note = '60 monitor CO2. Valore = la sola fornitura dei monitor: i 13.800 di prima comprendevano un altro servizio. In database il sito esiste in due copie che restano separate.'
 where nome = 'Lucan Lodge';

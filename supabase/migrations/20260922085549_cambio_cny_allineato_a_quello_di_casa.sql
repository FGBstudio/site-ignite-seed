-- Avevo messo 0,129 come segnaposto, dichiarandolo. Il foglio usa 0,126582
-- (1 EUR = 7,90 RMB) e i suoi euro tornano al centesimo su tutte e sei le
-- righe fornite: 1.650 -> 208,86, 22.500 -> 2.848,10, 600 -> 75,95,
-- 9.325,50 -> 1.180,44, 10.896 -> 1.379,24, 3.108,50 -> 393,48.
--
-- Vale per tutto il CNY, FoSensor e Kai Cheng insieme: due cambi diversi nello
-- stesso libro renderebbero i totali non confrontabili. Quando arriveranno gli
-- estratti conto si mettera' il cambio del giorno sulle fatture gia' pagate,
-- come fatto con Centrica.
update public.uscite_previste
   set cambio = 0.126582
 where valuta = 'CNY';

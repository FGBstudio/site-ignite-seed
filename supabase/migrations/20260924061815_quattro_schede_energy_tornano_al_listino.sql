-- ═══════════════════════════════════════════════════════════════════════════
-- Quattro schede energy tornano al listino
--
-- Le cifre dell'amministrazione escono tutte e quattro dal listino prodotti,
-- al centesimo, con i conteggi giusti:
--
--   Canton Road    9 × 104,30 + 1 × 237,30 = 1.176,00
--   Qingdao       12 × 104,30 + 1 × 237,30 = 1.488,90
--   IFC (Women)    6 × 104,30 + 1 × 237,30 =   863,10
--   Cannes        18 × 104,30 + 1 × 237,30 = 2.114,70
--
-- Quindi non scrivo un totale: correggo cio' che era contato male e il totale
-- viene da se'. Qingdao e IFC (Women) avevano due bridge invece di uno,
-- Cannes un modulo MANGO che non c'e', e Canton Road aveva i conteggi giusti
-- ma un importo che non seguiva piu' da nessun conteggio — 2.114,70, cioe' il
-- valore di Cannes, arrivato li' per copia.
--
-- Nessuna delle quattro porta la nota «dal listino prodotti», che e' il
-- filtro con cui fn_ricalcola_costi_energy tiene allineate le altre. Ed e'
-- esattamente per questo che sono andate alla deriva: stavano fuori dall unica
-- funzione che ricontrolla. La nota la metto, ma non la dicitura che le
-- includerebbe nel ricalcolo, perche' quella funzione converte in euro a
-- 0,8498 e sovrascriverebbe gli euro dell'amministrazione.
--
-- Sul cambio: questi euro stanno a 0,8781 circa (riga per riga, non identico).
-- Le schede ne portano 0,86 fisso, il ricalcolo 0,8498, e le uscite di cassa
-- usano il cambio della fattura del fornitore. Quattro cambi per lo stesso
-- hardware: qui registro quello dell amministrazione dove l amministrazione
-- ha dato un numero, e la scelta di quale valga resta da fare.
-- ═══════════════════════════════════════════════════════════════════════════

update public.site_energy_records r
   set total_sensors  = d.sensori,
       total_bridges  = d.bridge,
       no_mango       = 0,
       additional_bridge = 0,
       sensor_total_cost = d.sensori * 104.30,
       bridge_total_cost = d.bridge  * 237.30,
       total_package_cost_usd = d.sensori * 104.30 + d.bridge * 237.30,
       total_package_cost_eur = d.eur,
       fx_rate_usd_eur = round(d.eur / (d.sensori * 104.30 + d.bridge * 237.30), 6),
       notes = 'Conteggi e importo allineati allo specchietto amministrazione del 24/09/2026. '
            || 'Euro dall amministrazione, non ricalcolato: non aggiungere la dicitura del '
            || 'listino nelle note o fn_ricalcola_costi_energy lo riscrive a 0,8498.'
  from (values
         ('Hong Kong, Canton Road',  9, 1, 1032.76),
         ('Qingdao, Hisense Plaza', 12, 1, 1307.55),
         ('Shanghai, IFC (Women)',   6, 1,  757.97),
         ('Cannes, La Croisette',   18, 1, 1856.92)
       ) as d(progetto, sensori, bridge, eur)
 where r.certification_id = (select id from public.certifications
                              where name = d.progetto and cert_type = 'Energy');

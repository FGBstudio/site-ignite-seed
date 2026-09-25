-- ═══════════════════════════════════════════════════════════════════════════
-- Le schede aria Kering prendono i numeri veri
--
-- Inserendo le sette certificazioni, un trigger ha creato da se' le sette schede
-- di monitoraggio — vuote: «Upcoming», zero sensori. Giusto che lo faccia: una
-- certificazione con has_iaq_monitoring senza scheda sarebbe un buco. Ma il mio
-- insert le cercava assenti e le ha trovate presenti, quindi non ha scritto
-- niente e i numeri sono rimasti quelli del trigger.
--
-- Qui si aggiorna invece di inserire. La lezione e' che su una tabella che
-- qualcun altro popola per conto suo, «inserisci se non c'e'» non basta: serve
-- «scrivi il valore giusto comunque», altrimenti chi arriva secondo perde
-- sempre e in silenzio.
-- ═══════════════════════════════════════════════════════════════════════════

update public.site_air_records a
   set status = d.quanti || ' delivered',
       total_sensors = d.quanti,
       project_name = d.nome,
       notes = d.nota
  from (values
    ('KERING Senato',       10, 'Only «piano 4 & 6» are transmitting. Others are not loading.'),
    ('Kering Scandicci',    10, 'All ok.'),
    ('KERING Trecate',      34, 'Solo Corpo A piano 0 e 1, corpo B1 piano 0 e 3, corpo B2 piano 1 e 2 '
                             || 'trasmettono in piattaforma. Nove monitor sono Kaiterra su Building A, '
                             || 'identificati da un id a otto caratteri e non da un MAC.'),
    ('Paris, Rue Monsieur',  8, 'Non caricano in piattaforma. Alcuni non hanno mai funzionato dopo il '
                             || 'reboot; su un MAC Kering segnala che funziona ma non e collegato a un '
                             || 'apparato gestito da loro, quindi non possono assegnargli la VLAN giusta.'),
    ('Kering Dubai',         1, 'No picture.'),
    ('Kering Amsterdam',     1, 'Non in piattaforma, per il resto ok.'),
    ('Kering San Paolo',     1, 'Spedito con DHL 3482392852, ricevuto e installato. Segnalano luce '
                             || 'rossa lampeggiante: trasmissione da verificare.')
  ) as d(nome, quanti, nota)
  join public.sites s on s.name = d.nome
  join public.certifications c on c.site_id = s.id and c.cert_type = 'WELL'
 where a.certification_id = c.id;

-- ═══════════════════════════════════════════════════════════════════════════
-- Kai Cheng a 7,7 e gli stampi hanno una data
--
-- ── IL CAMBIO DI KAI CHENG ────────────────────────────────────────────────
-- L'ordine delle installazioni Fendi era registrato a 1 EUR = 7,9 CNY. Sono
-- 7,7. Il debito in renminbi non cambia — 133.061,75, e quello era gia' giusto
-- — cambia quanto ci costa in euro: 16.843,22 diventano 17.280,73, cioe' i
-- 437,53 che mancavano rispetto al planning.
--
-- Il cambio sta scritto in due posti: sull'ordine e su ogni riga di uscita che
-- ne e' nata (le righe portano il proprio cambio perche' un ordine puo' avere
-- fatture a cambi diversi). Vanno allineati insieme, o la somma delle rate
-- smette di fare il totale dell'ordine.
--
-- Restano fuori gli ordini FoSensor, che stanno a 7,9: e' il loro cambio, non
-- un refuso da propagare. Un cambio per acquisto, come per i dollari.
--
-- Gli ultimi due centesimi. 1/7,7 e' periodico e uscite_previste.cambio tiene
-- sei decimali: 0,129870, che su 133.061,75 renminbi perde due centesimi —
-- 17.280,73 contro i 17.280,75 del planning, che divide e poi somma invece di
-- arrotondare ogni rata. Allargare la colonna a otto decimali non si puo' senza
-- ricreare importo_eur, che e' generata, e con essa la vista di cassa che ci si
-- appoggia: due centesimi non valgono quel lavoro. Restano, e stanno scritti
-- qui perche' chi riconcilia non debba scoprirli da solo.
--
-- ── LE DATE DEGLI STAMPI ──────────────────────────────────────────────────
-- 01/09/2024, tutte e tre le rate pagate. Escono dalla colonna «Senza data» e
-- vanno dove sono successe: settembre 2024, ben prima della prima commessa
-- Aria, che e' esattamente cosa vuol dire «investimento sostenuto all'inizio».
-- Lo storno della fee resta senza data, perche' dipende dalle 300 unita' e non
-- da un giorno.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Kai Cheng: 1 EUR = 7,7 CNY ────────────────────────────────────────────
update public.ops_purchase_orders
   set cambio = round(1.0 / 7.7, 8),
       note_condizioni = coalesce(note_condizioni || ' ', '')
                      || 'Cambio 1 EUR = 7,7 CNY, confermato dall amministrazione.'
 where po_number = 'PO-KC1';

update public.uscite_previste u
   set cambio = round(1.0 / 7.7, 8)
  from public.ops_purchase_orders p
 where p.po_number = 'PO-KC1'
   and (u.po_id = p.id
        or u.supplier_id = (select id from public.suppliers where name = 'Kai Cheng'));

-- ── Gli stampi: pagati il 01/09/2024 ──────────────────────────────────────
update public.uscite_previste u
   set data_prevista = date '2024-09-01',
       data_prevista_fonte = 'reale',
       data_effettiva = date '2024-09-01',
       data_evento = date '2024-09-01',
       data_evento_fonte = 'reale',
       note = 'Costo sostenuto il 01/09/2024, prima di qualunque commessa Aria.'
 where u.supplier_id = (select id from public.suppliers where name = 'Keye Youcheng')
   and u.importo > 0;

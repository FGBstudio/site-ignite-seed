-- ═══════════════════════════════════════════════════════════════════════════
-- La funzione vecchia scriveva su una colonna che non c'è più
--
-- `fn_emetti_fattura` inseriva `invoices.tranche_id`. Quella colonna è stata
-- eliminata quando le righe hanno preso il suo posto: la funzione è rimasta
-- lì, apparentemente sana, e sarebbe fallita alla prima chiamata — o peggio,
-- avrebbe fatto dubitare che il problema fosse altrove.
--
-- Una funzione che non può funzionare non si tiene «per compatibilità»: si
-- toglie, così chi la cerca trova subito quella nuova invece di un errore
-- oscuro. `fn_emetti_fattura_righe` fa tutto quello che faceva, e in più sa
-- fatturare più di una tranche alla volta.
-- ═══════════════════════════════════════════════════════════════════════════

drop function if exists public.fn_emetti_fattura(uuid, numeric, date, integer, uuid, uuid, uuid, text, numeric, numeric, text, text);

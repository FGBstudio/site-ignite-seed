-- ═══════════════════════════════════════════════════════════════════════════
-- Il valore dichiarato di Boucheron segue le tranche
--
-- Era 34.900: 16.900 di Vendome piu' tre boutique da 6.000, la cifra di
-- quando le quotazioni extra non c'erano e i tre contratti valevano meno di
-- quanto valgono. Le tranche ora fanno 44.700, che e' anche il totale del
-- planning dell'amministrazione.
--
-- Old Bond Street e Shanghai Bund 18 restano fuori dal valore perche' non
-- hanno tranche — ma Old Bond Street ha hardware ordinato per 1.488,90 $ su
-- PO-6, quindi costa senza incassare: e' un progetto fermo con merce a terra,
-- non un progetto che non esiste.
-- ═══════════════════════════════════════════════════════════════════════════

update public.commesse
   set valore_dichiarato = 44700.00,
       note = 'Quattro progetti fatturabili: Vendome 16.900, Cannes 12.000, Monaco 8.500, '
           || 'Geneva 7.300. Su Cannes, Monaco e Geneva l anticipo e 3.000 fissi, non una '
           || 'percentuale. Old Bond Street e Shanghai Bund 18 dentro la commessa ma senza '
           || 'tranche: Old Bond Street ha comunque hardware su PO-6 per 1.488,90 USD. '
           || 'Manca del tutto il costo installatore europeo, 4.690 secondo il planning.'
 where nome = 'Boucheron Energy 2025';

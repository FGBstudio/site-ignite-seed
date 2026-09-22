-- Il valore dichiarato della commessa e' la somma dei valori dei progetti,
-- extra compresi. Prima era 355.150, preso dal foglio del 21/09 — 337.150 sul
-- lotto principale piu 18.000 sul lotto Fendi Red — e da allora sono successe
-- quattro cose che lo hanno reso vecchio.
--
-- Da dove arrivano i 7.965 EUR di differenza, voce per voce:
--
--   + 8.775  maggiorazione del 25% sui sei store Taiwan, che il foglio del
--            cliente applica e a database non era mai entrata
--   + 2.000  i tre Additional call out di settembre: Hangzhou MixC 1.000,
--            Taikoo Hui Men 500, Plaza 66 Women 500 — fuori contratto per
--            definizione, e infatti il dichiarato non li conosceva
--   - 1.310  Bicester: il dichiarato lo contava 6.550, il foglio del cliente
--            dice 5.240, ed e' il foglio a comandare
--   - 1.500  «Fendi Red Milano Galleria»: nel dichiarato c'era, come progetto
--            non e' mai esistito. Milano Galleria vale 7.100 sia a database
--            sia sul foglio, quindi quei 1.500 erano contati in piu'
--   ─────────
--   + 7.965
--
-- Le altre commesse non si toccano: li' il dichiarato e' un valore di
-- contratto detto a voce, non una somma, e sovrascriverlo cancellerebbe
-- proprio l'informazione che serve a vedere cosa manca.
update public.commesse
   set valore_dichiarato = 363115.00,
       note = 'Valore = somma dei progetti, extra compresi. Dal foglio cliente del 22/09/2026: 66 store piu Bicester. Comprende la maggiorazione Taiwan del 25% e i tre Additional call out di settembre.'
 where nome = 'Fendi Energy 2024';

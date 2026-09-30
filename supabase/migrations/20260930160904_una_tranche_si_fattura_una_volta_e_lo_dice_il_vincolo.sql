-- ═══════════════════════════════════════════════════════════════════════════
-- Una tranche si fattura una volta, e lo dice il vincolo
--
-- La prova ha fatturato **due volte la stessa tranche**. La funzione
-- controllava la descrizione, l'importo, che il cliente fosse uno solo — non
-- se quella tranche fosse gia' su una fattura. Il risultato: lo stesso 50%
-- chiesto al cliente due volte, e la tranche che restava «invoiced» come se
-- fosse tutto in ordine.
--
-- Il divieto va scritto dove non si puo' aggirare: un indice unico sulle
-- righe. Cosi' non protegge solo questa funzione, ma qualunque strada porti a
-- una riga — un import, una correzione a mano, una funzione che scriveremo
-- l'anno prossimo.
--
-- La funzione poi lo ripete a voce, perche' «duplicate key value violates
-- unique constraint invoice_righe_una_tranche_una_volta» non e' una frase da
-- mostrare a chi sta fatturando.
--
-- Nello stesso giro: se le righe sono tutte di un cliente, l'intestatario non
-- serve chiederlo. Prima andava passato a mano, e passarlo sbagliato era
-- possibile.
--
-- NOTA STORICA: la query del controllo cercava `m.tranche_name`, colonna che
-- non esiste (si chiama `m.name`). Il controllo moriva sull'errore di colonna
-- invece di girare. Corretto in 20260930161000.
-- ═══════════════════════════════════════════════════════════════════════════

-- Le fatture della prova vanno via prima, o l'indice non nasce.
delete from public.invoice_righe
 where invoice_id in (select id from public.invoices where number in ('2.898','2.899','2.900'));
delete from public.invoices where number in ('2.898','2.899','2.900');

create unique index invoice_righe_una_tranche_una_volta
  on public.invoice_righe (tranche_id)
  where tranche_id is not null;

comment on index public.invoice_righe_una_tranche_una_volta is
  'Una tranche sta su una riga sola: fatturarla due volte e'' chiedere due volte gli stessi soldi.';

-- ═══════════════════════════════════════════════════════════════════════════
-- Il corpo della funzione applicato qui è quello di 20260930161120, che lo
-- sostituisce per intero: si legge quello.
-- ═══════════════════════════════════════════════════════════════════════════

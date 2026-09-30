-- ═══════════════════════════════════════════════════════════════════════════
-- La frase del master ITA riguarda l'offerta, non la fattura
--
-- Nella migrazione di poco fa avevo scritto, nelle note dell'entita' italiana,
-- che «le coordinate bancarie da stampare sono quelle inglesi». Era una
-- deduzione mia, e sbagliata.
--
-- La frase del master — «Tutti i pagamenti dovranno essere effettuati presso la
-- nostra entita' FGB studio con sede in UK» — e' una condizione dell'OFFERTA.
-- La fatturazione segue un percorso suo: quale societa' emette, e con quali
-- coordinate, si decide al momento di emettere. Ogni fattura porta la banca del
-- proprio emittente, come fa la 2.946 di Bottega Veneta con l'HSBC di Zmyrna.
--
-- Una nota che dice a chi legge di stampare l'IBAN di un'altra societa' e' il
-- genere di istruzione che un giorno qualcuno esegue. Si corregge adesso.
-- ═══════════════════════════════════════════════════════════════════════════

update public.contacts
   set notes = 'Codice destinatario SDI: USAL8PV. Nelle offerte emesse da questa entita'' '
            || 'il master dichiara che i pagamenti vanno all''entita'' UK: e'' una '
            || 'condizione dell''offerta, non una regola di fatturazione — quale '
            || 'societa'' emette la fattura si decide al momento.',
       updated_at = now()
 where id = 'd270f2ed-b16b-43d1-ae4a-a1942ae41708';

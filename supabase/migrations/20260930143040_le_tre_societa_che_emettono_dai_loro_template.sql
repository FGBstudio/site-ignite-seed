-- ═══════════════════════════════════════════════════════════════════════════
-- Le tre società che emettono, dai loro template
--
-- I MASTER delle offerte — ITA, UK, CHINA — portano in fondo l'anagrafica
-- completa di chi emette, ed e' l'unica fonte che non puo' essere sbagliata:
-- e' quello che i clienti leggono.
--
--   FGB STUDIO ITALY SRL      Via Monte Napoleone 23, 20121 Milano
--                             P. IVA 12634970961 · SDI USAL8PV
--   FGB STUDIO * ZMYRNA LTD   3 The Shrubberies, George Lane, London E18 1BD
--                             VAT GB 215421643 · HSBC London Bridge
--   FGB STUDIO CHINA          Room 2855, 28th Floor (actual floor 24th)
--                             No. 550 Yan'an East Road, Huangpu, Shanghai
--
-- Le prime due c'erano gia' e sono esatte. La terza no: le offerte cinesi si
-- fanno, sono in RMB e portano il FAPIAO al 6%, ma la societa' nel sistema non
-- esisteva — quindi una fattura cinese non si sarebbe potuta emettere.
--
-- ── DUE COSE CHE I TEMPLATE DICONO E IL DATABASE NON SAPEVA ───────────────
-- Il master italiano scrive: «Tutti i pagamenti dovranno essere effettuati
-- presso la nostra entita' FGB studio con sede in UK». Chi emette e chi incassa
-- non sono la stessa societa', e il conto corrente da stampare su una fattura
-- italiana e' quello inglese. Non si copia l'IBAN sulla riga italiana — sarebbe
-- una seconda copia che un giorno divergera' — si scrive perche', e chi
-- genera il documento sa dove andare a prenderlo.
--
-- Il codice destinatario SDI dell'entita' italiana sta nelle note perche' oggi
-- non ha una colonna sua. Se le fatture elettroniche un giorno passeranno di
-- qui, quella colonna andra' fatta; finche' si emettono altrove, la nota basta
-- e non si aggiunge una colonna per un dato che nessuna funzione legge.
-- ═══════════════════════════════════════════════════════════════════════════

update public.contacts
   set notes = btrim(coalesce(notes || ' · ', '')
             || 'Codice destinatario SDI: USAL8PV. I pagamenti delle offerte emesse da '
             || 'questa entita'' vanno all''entita'' UK (FGB studio * Zmyrna Limited): '
             || 'e'' cosi'' che lo dichiara il master ITA, e le coordinate bancarie da '
             || 'stampare sono quelle inglesi.'),
       updated_at = now()
 where id = 'd270f2ed-b16b-43d1-ae4a-a1942ae41708'
   and coalesce(notes, '') not like '%USAL8PV%';

insert into public.contacts (
  kind, company_name, entity_code, address, city, country, notes
)
select
  'issuer',
  'FGB studio China',
  'cn',
  'Room 2855, 28th Floor (actual floor 24th), No. 550 Yan''an East Road, Huangpu District',
  'Shanghai',
  'China',
  'Anagrafica dal master offerte CHINA. Le offerte sono in RMB e portano il '
  || 'FAPIAO al 6% sul totale, che diventa il GRAND TOTAL. Mancano partita IVA '
  || 'cinese e coordinate bancarie: escono dalla prima fattura emessa, oppure '
  || 'vanno chieste.'
where not exists (
  select 1 from public.contacts where kind = 'issuer' and company_name = 'FGB studio China'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- L'anagrafica vera di Kering Eyewear
--
-- Il contatto era nato oggi alle 15:38 durante una prova, con «aaaaaaaaaa»
-- nella citta' e «aaaaaaaaaaaaaaaaaa» nella partita IVA: due campi obbligatori
-- riempiti per poter andare avanti. Succede, e va bene finche' qualcuno poi
-- torna a scriverci la verita' — perche' quei due campi finiscono
-- sull'intestazione di un'offerta, e «P.IVA aaaaaaaaaaaaaaaaaa» su un documento
-- mandato a Kering e' un danno che non si ripara ristampando il PDF.
--
--   Kering Eyewear Spa
--   via Altichiero 180, 35100 Padova, Italy
--   VAT IT04846890285
--
-- La ragione sociale prende la forma legale: «Kering Eyewear» e' il marchio,
-- «Kering Eyewear Spa» e' chi firma e chi paga, ed e' quello che va intestato.
--
-- La partita IVA resta come l'ha data l'amministrazione, col prefisso IT. Il
-- template la stampa preceduta da «P.IVA », quindi uscira' «P.IVA
-- IT04846890285»: corretto e ridondante insieme. La forma italiana pura
-- sarebbe «04846890285», come e' registrata FGB studio Italy srl. Si cambia in
-- un campo, ma non lo decido io al posto di chi emette.
--
-- E la commessa «Kering Eyewear office» aveva 12.000 euro da incassare e
-- nessun cliente a cui chiederli: ora ce l'ha.
-- ═══════════════════════════════════════════════════════════════════════════

update public.contacts
   set company_name = 'Kering Eyewear Spa',
       address      = 'Via Altichiero 180',
       postal_code  = '35100',
       city         = 'Padova',
       country      = 'Italy',
       vat_number   = 'IT04846890285',
       notes        = 'Societa fatturabile di KERING EYEWEAR. Anagrafica confermata '
                   || 'dall amministrazione il 24/09/2026, al posto dei segnaposto '
                   || 'inseriti durante una prova.'
 where id = 'a6e515e1-c4e9-485d-a817-6b7d18851e58';

-- La commessa trova il suo cliente.
update public.commesse
   set cliente_contact_id = 'a6e515e1-c4e9-485d-a817-6b7d18851e58'
 where nome = 'Kering Eyewear office'
   and cliente_contact_id is null;

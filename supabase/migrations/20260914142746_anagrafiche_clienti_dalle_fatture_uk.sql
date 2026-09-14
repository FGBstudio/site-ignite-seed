-- Le prime anagrafiche clienti del sistema.
--
-- `contacts` era vuota: la tendina della societa' fatturabile nel dialogo
-- offerta non ha mai avuto niente dentro. Queste 27 societa' sono estratte
-- dalle 33 fatture emesse da FGB studio * Zmyrna Limited (UK) fra giugno e
-- settembre 2026 — i documenti veri, non un elenco ricostruito a memoria.
--
-- `notes` porta la fattura da cui viene ciascuna riga: se un indirizzo risulta
-- sbagliato si sa dove andare a guardare.
--
-- Due righe portano la stessa societa': PRADA SAUDI ARABIA LIMITED fattura sia
-- per PRADA sia per MIU MIU (fatture 3.018 e 3.019, stesso giorno, stessa
-- anagrafica, due brand). La tendina filtra per brand, quindi la societa' deve
-- comparire sotto entrambi.
--
-- Undici societa' su ventisette non riportano nessun identificativo fiscale in
-- fattura. Restano nulle e non inventate: il generatore di offerte le segnala
-- gia' come incomplete, ed e' il comportamento giusto.

insert into public.contacts
  (kind, company_name, vat_number, tax_code, address, postal_code, city, country, notes, brand_id)
values
  ('client','Audemars Piguet (Marketing) S.A', null, null,
   'Route de France, 16','1348','Le Brassus (VD)','Switzerland',
   'Da fattura 2.985 (LEED Volume Prototype). Manca identificativo fiscale.',
   '48c593e9-69b8-4330-ad3d-06043d5af38d'),

  ('client','Audemars Piguet (Japan) Ltd', null, null,
   'CSS Building III 8F, 6-5-13 Ginza 6-chome, Chuo-Ku','104-0061','Tokyo','Japan',
   'Da fattura 2.987 (Tokyo Ginza Namiki). Manca identificativo fiscale.',
   '48c593e9-69b8-4330-ad3d-06043d5af38d'),

  ('client','Audemars Piguet Iberia, S.A.','A84508639', null,
   'C/ Serrano 66, 3a planta','28001','Madrid','Spain',
   'Da fattura 3.021 (Madrid Ortega).',
   '48c593e9-69b8-4330-ad3d-06043d5af38d'),

  ('client','Audemars Piguet (Malaysia) Sdn Bhd', null, null,
   'UG30A Upper Ground Floor, Starhill Gallery, 181 Jalan Bukit Bintang','55100','Kuala Lumpur','Malaysia',
   'Da fattura 3.020 (Kuala Lumpur). Manca identificativo fiscale.',
   '48c593e9-69b8-4330-ad3d-06043d5af38d'),

  ('client','Balenciaga Retail France','FR55908254535', null,
   '16-18 rue Vaneau','75007','Paris','France',
   'Da fattura 3.023 (Paris 336 Saint Honore).',
   '44cab0d4-5c21-427b-acd5-693695c175fb'),

  ('client','Boucheron Japan Limited', null, null,
   'Ginza Marronnier Bldg. 6F, 2-5-14 Ginza, Chuo-Ku','104-0061','Tokyo','Japan',
   'Da fattura 2.988 (Osaka Shinsaibashi). Manca identificativo fiscale.',
   'd0ef1edf-150c-4342-bb8d-9a4649e7c97f'),

  ('client','BOUCHERON Hong Kong Ltd.', null, null,
   '28/F, One Taikoo Place, 979 King''s Road', null,'Quarry Bay','Hong Kong',
   'Da fattura 3.007 (Pacific Place). Manca identificativo fiscale.',
   'd0ef1edf-150c-4342-bb8d-9a4649e7c97f'),

  ('client','Kering (Shanghai) Watches And Jewelry Ltd.', null, null,
   'Unit 2803, No. 968 West Beijing Road','200041','Shanghai','China',
   'Da fattura 3.022 (Shanghai IFC Pudong). Fattura il gruppo Kering, non Boucheron. Manca identificativo fiscale.',
   'd0ef1edf-150c-4342-bb8d-9a4649e7c97f'),

  ('client','Boucheron Taiwan Co., Limited', null, null,
   '9 Floor, No. 35, Lane 11, Guangfu North Road', null,'Taipei','Taiwan',
   'Da fattura 3.055 (Diamond Tower Taipei, nota di rettifica ritenuta). Manca identificativo fiscale.',
   'd0ef1edf-150c-4342-bb8d-9a4649e7c97f'),

  ('client','BOUCHERON MONACO', null, null,
   'One Monte-Carlo, Batiment B','98000','Monaco','Monaco',
   'Da fatture 3.047 e 3.048 (GREENY e GREENY Extra). Manca identificativo fiscale.',
   'd0ef1edf-150c-4342-bb8d-9a4649e7c97f'),

  ('client','BOUCHERON CANNES', null, null,
   '17, boulevard de la Croisette', null,'Cannes','France',
   'Da fatture 3.025 e 3.046 (GREENY monitoring). Manca identificativo fiscale.',
   'd0ef1edf-150c-4342-bb8d-9a4649e7c97f'),

  ('client','Modern Home W.L.L.', null, null,
   'Lagoona Mall, Westbay, P.O. Box 615', null,'Doha','Qatar',
   'Da fattura 3.056 (Lagoona Mall Doha, nota di rettifica ritenuta). DA CONFERMARE: non porta il nome del brand, probabile distributore o franchisee.',
   'd0ef1edf-150c-4342-bb8d-9a4649e7c97f'),

  ('client','BRIONI FRANCE S.A.S','FR84431769140', null,
   '100-110 Esplanade General de Gaulle, Coeur Defense 33eme etage','92400','Courbevoie','France',
   'Da fattura 3.006 (Paris Rue De Castiglione).',
   '1de0bd9b-ae9d-42e3-935f-a13f5f47d042'),

  ('client','CHANEL LLC', null, null,
   'Office 4, Suite 1402, Level 14, Boulevard Plaza Tower 1', null,'Downtown Dubai','United Arab Emirates',
   'Da fattura 2.989 (Wynn Palace Dubai). Manca identificativo fiscale.',
   '5060e0e1-0331-47af-a5db-eeaf88ceea6a'),

  ('client','JIMMY CHOO FLORENCE SRL','07771440968', null,
   'Viale Antonio Gramsci 15','50121','Firenze','Italy',
   'Da fattura 3.000 (Scandicci, targa LEED). Codice SDI: ZE7RB0G.',
   'd1190624-18b4-4ff0-9ef6-db18e59f3555'),

  ('client','LORO PIANA','01611400027', null,
   'Via Monte Napoleone 27','20121','Milano','Italy',
   'Da fattura 3.031 (Milano Monte Napoleone).',
   '6794650a-441a-4c18-adda-9755d1975fb3'),

  ('client','ALEXANDER McQUEEN TRADING', null, null,
   '5th Floor, Rear Suite, Oakfield House, 35 Perrymount Road','RH16 3BW','Haywards Heath','United Kingdom',
   'Da fattura 3.002 (London Old Bond Street). In fattura la citta'' e'' troncata in "HAYWARDS HEAT". Manca identificativo fiscale.',
   'd8fb7b32-f142-4b99-a1cb-f9726c49e67e'),

  ('client','MICHAEL KORS (NETHERLANDS) B.V.', null,'KVK 53823370',
   'John Hicksstraat 1','5928 SJ','Venlo','Netherlands',
   'Da fattura 3.001 (Leidschendam Westfield Mall), dove la ragione sociale e'' scritta "MICHALE KORS". Vale anche per Wien: la fattura 3.003 non riporta nessuna anagrafica.',
   '6a4e4f7a-28a6-424f-a8dc-7a4223699cbe'),

  ('client','PRADA SAUDI ARABIA LIMITED', null, null,
   'Office no. 331, 2nd Floor, Prince Sultan st.', null,'Jeddah','Saudi Arabia',
   'Da fattura 3.019 (Miu Miu Jeddah). Stessa societa'' anche sotto PRADA. Manca identificativo fiscale.',
   '245e3d37-397e-49eb-a7e7-e29b8ffb2a37'),

  ('client','POMELLATO SPA','IT00860690155', null,
   'Via Neera 37','20141','Milano','Italy',
   'Da fattura 3.010 (Miami Bal Harbour, Carbon Analysis).',
   'c42a6106-f3db-49b2-9163-fb63edc94ed7'),

  ('client','PRADA SAUDI ARABIA LIMITED', null, null,
   'Office no. 331, 2nd Floor, Prince Sultan st.', null,'Jeddah','Saudi Arabia',
   'Da fattura 3.018 (Prada Jeddah). Stessa societa'' anche sotto MIU MIU. Manca identificativo fiscale.',
   '66edfe43-44e0-4527-823e-5869acbba431'),

  ('client','PRADA USA CORP.', null,'FEI/EIN 13-3751431',
   '610 W. 52nd Street','10019','New York, NY','United States',
   'Da fattura 2.999 (Miami Design District).',
   '66edfe43-44e0-4527-823e-5869acbba431'),

  ('client','Prada Emirates LLC','100056370800003', null,
   'Garhoud Atrium, P.O. Box 2623', null,'Dubai','United Arab Emirates',
   'Da fattura 2.986 (Dubai Mall of the Emirates).',
   '66edfe43-44e0-4527-823e-5869acbba431'),

  ('client','Yves Saint Laurent BOUTIQUE FRANCE','FR76429057276', null,
   '37-39 Rue de Bellechasse','75007','Paris','France',
   'Dal modello MASTER FATTURE (Avenue Montaigne, Paris).',
   '246eb7b9-7fb8-4da6-9037-e2bb6887591e'),

  ('client','Tasa Meng Corporation', null, null,
   '3F-1, No. 57, Fu-Hsing North Road', null,'Taipei','Taiwan',
   'Da fatture 2.994, 2.995 e 2.996 (Versace Taoyuan Airport T2, schema 30/40/30). DA CONFERMARE: non porta il nome del brand, probabile distributore o franchisee. Su queste fatture si applica la ritenuta taiwanese del 20%.',
   'aaae805c-b345-48a8-a800-79f59314e9fe'),

  ('client','NGS Mechanical & Electrical Services', null, null,
   '54 A/B, Barrow Road, Dublin Industrial Estate','D11 FN76','Dublin','Ireland',
   'Da offerta di fornitura CLAIR per H.I.G Dublin - Lucan Lodge. SENZA BRAND: e'' l''impresa esecutrice, non una maison. Non comparira'' in nessuna tendina filtrata per brand finche'' non le si assegna un committente.',
   null),

  ('client','BHA Construction Ltd', null, null,
   'Kilbride, The Ballagh', null,'Enniscorthy, Co. Wexford','Ireland',
   'Da fattura 2.973 (Ballygunner, CLAIR). SENZA BRAND: e'' l''impresa esecutrice, non una maison. Non comparira'' in nessuna tendina filtrata per brand finche'' non le si assegna un committente.',
   null);

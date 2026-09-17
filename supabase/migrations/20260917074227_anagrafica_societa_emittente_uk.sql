-- La società che emette la fattura.
--
-- Mancava, ed era il punto che bloccava il processo quotation → payments: si
-- sapeva a chi fatturare (27 clienti caricati dalle fatture UK) ma non CHI
-- fattura. Un'offerta senza emittente non è un documento, è una bozza.
--
-- I dati vengono dalle fatture reali, non da una scheda: intestazione e piede
-- di «FGB INVOICE 2.994 — VERSACE TAOYUAN». Fatturare con una partita IVA
-- ricordata a memoria è il tipo di errore che si scopre dal commercialista.
--
-- `kind` ammetteva solo client|supplier. Si aggiunge 'issuer' invece di
-- riusare 'supplier': un fornitore è qualcuno che ci fattura, l'emittente
-- siamo noi, e confonderli significa vederci comparire fra i fornitori.

alter table public.contacts drop constraint if exists contacts_kind_check;
alter table public.contacts
  add constraint contacts_kind_check
  check (kind = any (array['client'::text, 'supplier'::text, 'issuer'::text]));

comment on column public.contacts.kind is
  'client = a chi fatturiamo · supplier = chi fattura a noi · issuer = una delle nostre societa'', quella che EMETTE il documento. I tre non si mescolano: un issuer fra i fornitori sarebbe un errore contabile silenzioso.';

-- Il blocco bancario completo. `iban` e `bank_name` c'erano gia'; per un
-- bonifico internazionale senza BIC la banca non parte, e il numero di conto
-- compare sulle fatture UK accanto all'IBAN.
alter table public.contacts
  add column if not exists bic text,
  add column if not exists bank_account text;

comment on column public.contacts.bic is
  'Codice BIC/SWIFT. Senza, un bonifico internazionale non parte: non e'' un di piu'' rispetto all''IBAN.';

insert into public.contacts (
  kind, company_name, vat_number, address, city, postal_code, country,
  bank_name, iban, bic, bank_account, notes
)
select
  'issuer',
  'FGB studio * Zmyrna Limited',
  'GB 215421643',
  'The Shrubberies, George Lane',
  'London',
  'E18 1BD',
  'United Kingdom',
  'HSBC London Bridge Branch',
  'GB52 HBUK 4012 7676 1859 88',
  'HBUKGB4B',
  '76185988',
  'Societa'' emittente UK. Dati presi dalle fatture reali (intestazione, piede e blocco bancario di FGB INVOICE 2.994 — VERSACE TAOYUAN Airport T2), non da una scheda anagrafica: e'' cio'' che i clienti hanno gia'' ricevuto stampato.'
where not exists (
  select 1 from public.contacts
   where kind = 'issuer' and company_name = 'FGB studio * Zmyrna Limited'
);

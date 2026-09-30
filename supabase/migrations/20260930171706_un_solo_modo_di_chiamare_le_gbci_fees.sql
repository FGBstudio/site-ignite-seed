-- ═══════════════════════════════════════════════════════════════════════════
-- Un solo modo di chiamare le GBCI fees
--
-- Nelle 166 fatture dell'archivio ci sono **156 diciture distinte**, e i concetti
-- veri sono una quindicina. La stessa cosa scritta in cinque modi:
--
--   11x  50% LEED ID + C GOLD          17x  #Reimbursement for GBCI Fees
--    6x  50% LEED GOLD Consultancy     10x  #Reimbursement for Bank & GBCI Fees
--    5x  50% LEED GOLD                  6x  100% Reimbursement GBCI fees
--    5x  50% LEED ID+C GOLD             6x  #Reimbursement for GBCI & Bank fees
--    3x  50% LEED ID+C Gold             3x  100% #Reimbursement forGBCI, shipping…
--
-- L'ultima ha anche uno spazio mancante — «forGBCI» — ed è finita su una fattura
-- vera, tre volte.
--
-- Le diciture sono di tre specie, e due di loro hanno già il loro posto:
--
-- | Specie | Dove sta |
-- |---|---|
-- | **servizio** (`LEED ID+C GOLD`) | `cert_catalog.dicitura_fattura` — il catalogo *è* l'elenco dei servizi |
-- | **evento della tranche** (`30% at the beginning`) | `cert_payment_milestones.name` — c'è già |
-- | **rimborso e voci ricorrenti** (`#Reimbursement for GBCI & Bank Fees`) | questa tabella |
--
-- Le diciture restano **modificabili sulla riga**: sono un punto di partenza, non
-- una gabbia. Ma chi emette sceglie da un elenco invece di ricordarsi come l'ha
-- scritta l'ultima volta, e fra sei mesi non ci sono sei modi di chiamare le GBCI
-- fees.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.cert_catalog
  add column if not exists dicitura_fattura text;

comment on column public.cert_catalog.dicitura_fattura is
  'Come questo servizio si chiama su una fattura. Può contenere {medaglia}, che viene sostituita con il livello della certificazione. Diverso da display_label, che è il nome interno.';

-- ═══════════════════════════════════════════════════════════════════════════
-- Le diciture ricavate dal catalogo, non inventate
--
-- Il modo in cui l'archivio le scrive è «LEED ID+C GOLD»: schema, sistema di
-- rating, medaglia. La tipologia (Retail, Commercial Interiors…) sulle fatture
-- non compare quasi mai, e infatti non entra.
-- ═══════════════════════════════════════════════════════════════════════════

update public.cert_catalog set dicitura_fattura =
  case
    -- LEED e BREEAM portano il sistema di rating: è quello che distingue
    -- «LEED ID+C» da «LEED BD+C» sul documento.
    when scheme = 'LEED' and rating_system is not null
      then 'LEED ' || rating_system || ' {medaglia} consultancy'
    when scheme = 'BREEAM' and rating_system is not null
      then 'BREEAM ' || rating_system || ' {medaglia} consultancy'
    when scheme = 'WELL' then 'WELL {medaglia} consultancy'
    when scheme = 'WiredScore' then 'WiredScore {medaglia} consultancy'
    when scheme = 'Envision' then 'Envision {medaglia} consultancy'

    -- Questi non hanno medaglia: il servizio è il servizio.
    when scheme = 'TAXONOMY' then 'EU Taxonomy'
    when scheme = 'CSRD' then 'CSRD reporting'
    when scheme = 'Energy' then 'Energy Model'
    when scheme = 'Energy_Audit' then 'Energy Audit'
    when scheme = 'Air' then 'Indoor Air Quality monitoring'
    when scheme = 'IAQ_Testing' then 'Indoor Air Quality testing'
    when scheme = 'MEP_Commissioning' then 'MEP Commissioning'
    when scheme = 'Envelope_Commissioning' then 'Envelope Commissioning'
    when scheme = 'WELL_PTA' then 'WELL Performance Testing Agent'
    when scheme = 'LEED_GC_Support' then 'LEED General Contractor support'
    when scheme = 'BREEAM_GC_Support' then 'BREEAM General Contractor support'
    when scheme = 'WELL_GC_Support' then 'WELL General Contractor support'
    else display_label
  end
where dicitura_fattura is null;

-- ═══════════════════════════════════════════════════════════════════════════

create table public.diciture_fattura (
  id uuid primary key default gen_random_uuid(),
  testo text not null unique,
  -- A cosa serve. Serve a raggruppare la tendina: chi cerca il rimborso delle
  -- GBCI fees non deve scorrere le voci di canone.
  categoria text not null
    check (categoria in ('rimborso', 'extra', 'canone', 'altro')),
  -- Quante volte compariva nell'archivio: è l'ordine in cui vanno proposte.
  -- Zero per quelle aggiunte a mano dopo.
  frequenza integer not null default 0,
  attiva boolean not null default true,
  note text,
  created_at timestamptz not null default now()
);

comment on table public.diciture_fattura is
  'Le diciture ricorrenti delle righe libere: rimborsi, extra, canoni. Ricavate dalle 166 fatture dell''archivio, dove la stessa cosa era scritta in cinque modi.';

alter table public.diciture_fattura enable row level security;

create policy "diciture leggibili agli autenticati"
  on public.diciture_fattura for select to authenticated using (true);

create policy "diciture gestite dall'amministrazione"
  on public.diciture_fattura for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- Le forme scelte sono quelle **più frequenti** nell'archivio, non quelle che
-- sembrano più belle: sono già la vostra lingua, e cambiarla ora vorrebbe dire
-- che le fatture nuove non somigliano a quelle vecchie.
insert into public.diciture_fattura (testo, categoria, frequenza, note) values
  ('#Reimbursement for GBCI Fees', 'rimborso', 17, 'la forma più usata nell''archivio'),
  ('#Reimbursement for Bank & GBCI Fees', 'rimborso', 10, null),
  ('#Reimbursement for GBCI & Bank Fees', 'rimborso', 5,
   'stessa cosa della precedente con le parole invertite: tenute entrambe perché entrambe sono state usate, ma una sola andrebbe scelta'),
  ('#Reimbursement for shipping fees', 'rimborso', 3, null),
  ('#Reimbursement for third entity fees', 'rimborso', 0,
   'la forma generica, per gli schemi che non passano da GBCI'),
  ('Additional call out', 'extra', 0, null),
  ('Additional services as agreed', 'extra', 0, null),
  ('Monitoring annual fee', 'canone', 0, null),
  ('Platform annual licence', 'canone', 0, null)
on conflict (testo) do nothing;

grant select on public.diciture_fattura to authenticated;

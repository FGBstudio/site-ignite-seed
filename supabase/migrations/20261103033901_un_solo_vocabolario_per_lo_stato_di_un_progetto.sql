-- ═══════════════════════════════════════════════════════════════════════════
-- Un solo vocabolario per lo stato di un progetto
--
-- `certifications.status` portava due parole per lo stesso stato — `in_corso` e
-- `in_progress` — più un `active` isolato. Non era un dettaglio di forma: il
-- livello fatturazione conosce solo `in_corso`, quindi 55 progetti non
-- comparivano fra le commesse su cui si può emettere. Due percorsi di creazione
-- scrivevano due parole: offerta → approvazione → PM scriveva `in_corso`, il
-- wizard «crea progetto» scriveva `in_progress`.
--
-- Guardando le righe, però, `in_progress` non voleva dire «in corso»: **54 delle
-- 55 hanno una data di rilascio nel passato**, alcune del 2018. Sono progetti
-- certificati, etichettati male da un import. Tradurle tutte in `in_corso`
-- avrebbe unificato la parola e lasciato il significato sbagliato — avremmo
-- avuto 54 progetti «in lavorazione» consegnati anni fa.
--
-- Quindi la traduzione guarda il fatto, non la parola:
--   • data di rilascio nel passato  → `certificato` (54)
--   • nessuna data di rilascio      → `in_corso`    (1)
--   • `active`                      → `in_corso`    (1, ha un PM e nessun rilascio)
--
-- Poi il vocabolario si stringe. `in_progress` e `active` escono dal CHECK, così
-- nessuno li può più scrivere; esce anche `on_hold`, che il CHECK ammetteva
-- mentre un secondo vincolo lo vietava sempre — una contraddizione che restava
-- scritta nello schema.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. I certificati etichettati «in lavorazione».
update public.certifications
   set status = 'certificato'
 where status = 'in_progress'
   and issued_date is not null
   and issued_date <= current_date;

-- 2. Quelli davvero in lavorazione, e l'unico `active`.
update public.certifications
   set status = 'in_corso'
 where status in ('in_progress', 'active');

-- 3. Il vocabolario si stringe a quello che il flusso usa davvero.
alter table public.certifications
  drop constraint if exists certifications_status_check;

alter table public.certifications
  add constraint certifications_status_check check (
    status is null or status = any (array[
      'potential',           -- un'opportunità, senza prezzo
      'quotation',           -- offerta mandata
      'quotation_approved',  -- firmata, in attesa di un PM
      'da_configurare',      -- ha un PM, il lavoro va impostato
      'in_corso',            -- si lavora
      'completato',          -- consegnato, non ancora certificato dall'ente
      'certificato',         -- l'ente ha rilasciato
      'canceled'             -- uscita
    ])
  );

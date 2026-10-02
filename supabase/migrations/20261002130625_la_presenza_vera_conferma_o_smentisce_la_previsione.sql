-- ═══════════════════════════════════════════════════════════════════════════
-- La presenza vera conferma o smentisce la previsione
--
-- `hr_availability` è una **previsione**: dice dove una persona pensa di essere.
-- `hr_timbrature` sono **fatti**: dicono dove è stata. Finora erano due mondi che
-- non si parlavano — il calendario diceva `office` e le letture dicevano altro, e
-- nessuna schermata metteva le due cose sulla stessa riga. È così che il 1° ottobre
-- il calendario dava Cardoso in ufficio mentre il foglio firmato la dava assente.
--
-- Qui si incontrano. La regola è una sola, e vale in un verso:
--
--   • **ci sono letture** → la persona era in ufficio, e basta. La previsione non
--     conta più: se diceva `office` è *confermata*, se diceva altro è
--     *sovrascritta*, se non c'era è *senza previsione*. Un badge passato è un
--     fatto, e un fatto non si discute con un calendario.
--
--   • **non ci sono letture, e il giorno è passato** → la previsione è tutto quello
--     che si ha. Se prevedeva di stare fuori — smart working, ferie, malattia,
--     permesso, trasferta, non disponibile — l'assenza di letture la *conferma*. Se
--     prevedeva l'ufficio, nessuno è passato al varco: è *smentita*, e l'effettivo
--     resta vuoto perché nessuno sa dove fosse quella persona. È il segnale che
--     serve a chi chiude il mese.
--
--   • **non ci sono letture e il giorno non è passato** → è ancora una previsione, e
--     si chiama così. Il giorno di oggi non è smentito a metà mattina.
--
-- Niente di questo riscrive `hr_availability`. Sovrascrivere la riga renderebbe
-- impossibile dire «era previsto in ufficio e non è venuto», che è esattamente
-- l'informazione per cui si guarda questa tabella. L'effettivo si ricava ogni volta
-- dalle due fonti, quindi non può scollarsi da nessuna delle due: aggiungere una
-- lettura dimenticata rimette a posto la giornata senza toccare altro.
--
-- Il giorno è quello di Roma da entrambe le parti — `v_hr_giornate` raggruppa già
-- così — altrimenti chi entra alle 00:30 finirebbe nella previsione di ieri.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.v_hr_giornata_effettiva as
with giorni as (
  select coalesce(a.user_id, g.user_id) as user_id,
         coalesce(a.date, g.giorno)     as giorno,
         a.status::text                 as previsione,
         a.note                         as nota_previsione,
         a.hours_planned,
         coalesce(g.letture, 0)         as letture,
         g.ingresso, g.pausa, g.ripresa, g.uscita,
         g.ancora_dentro, g.minuti_lavorati, g.minuti_pausa
    from public.hr_availability a
    full join public.v_hr_giornate g
      on g.user_id = a.user_id and g.giorno = a.date
)
select
  user_id,
  giorno,
  previsione,
  nota_previsione,
  hours_planned,
  letture,
  ingresso, pausa, ripresa, uscita,
  ancora_dentro, minuti_lavorati, minuti_pausa,

  -- Dov'è stata davvero. Vuoto solo quando era prevista in ufficio e non c'è
  -- nessuna lettura: lì non si sa, e dirlo è più utile che riempirlo.
  case
    when letture > 0 then 'office'
    when giorno >= (now() at time zone 'Europe/Rome')::date then previsione
    when previsione is null then null
    when previsione = 'office' then null
    else previsione
  end as effettivo,

  case
    when letture > 0 and previsione is null              then 'senza previsione'
    when letture > 0 and previsione = 'office'            then 'confermata'
    when letture > 0                                      then 'sovrascritta'
    when giorno >= (now() at time zone 'Europe/Rome')::date then 'prevista'
    when previsione is null                               then 'senza previsione'
    when previsione = 'office'                            then 'smentita'
    else 'confermata'
  end as esito,

  -- Comoda per filtrare: la riga che richiede uno sguardo umano.
  (letture = 0
   and giorno < (now() at time zone 'Europe/Rome')::date
   and previsione = 'office') as da_chiarire
from giorni;

-- ═══════════════════════════════════════════════════════════════════════════
-- Lo stato di avanzamento si calcola in un posto solo
--
-- `setup_status` non è una colonna. Non lo è in nessuna tabella e in nessuna
-- vista — verificato su tutto lo schema — eppure viene letto in **94 punti** del
-- front-end, e CLAUDE.md lo documenta come `certifications.status / setup_status`,
-- mandando chiunque a scriverci una `select`.
--
-- È calcolato in tre hook, e i tre non concordano:
--
--   • `useAdminCalendarData` — «in corso» richiede timeline **e** scorecard, e non
--     emette mai `online`;
--   • `useAdminPlannerData`  — «in corso» richiede solo la timeline, emette `online`;
--   • `usePMDashboard`       — come sopra, e lascia passare gli stati pre-operativi.
--
-- Misurato: **90 progetti hanno una timeline e non la scorecard**, e si leggono
-- «in corso» nella pagina Projects e «da configurare» nel calendario admin. Più
-- **16 Energy/Air che trasmettono**, che il calendario non sa chiamare `online`.
-- Centosei progetti su cui due schermate della stessa applicazione rispondono
-- diversamente alla stessa domanda.
--
-- Un helper TypeScript condiviso sarebbe costato meno e non sarebbe bastato: **la
-- divergenza è nei segnali tanto quanto nella scala**. I tre hook interrogano
-- milestone e allocazioni in tre modi diversi, e condividere la scala li avrebbe
-- lasciati a passarle input diversi. Qui la scala e i segnali stanno insieme, e
-- una query sola risponde.
--
-- **La scala, nell'ordine:**
--   1. gli stati pre-operativi passano come sono — un potenziale non si configura;
--   2. `certificato`: c'è una data di rilascio, oppure lo dice lo stato;
--   3. `online`: un Energy o un Air che trasmette. È il suo capolinea, e leggerlo
--      «in corso» manderebbe il PM a cercare un lavoro che non c'è;
--   4. `completato`: consegnato, non ancora certificato dall'ente;
--   5. `in_corso`: ha una timeline;
--   6. `da_configurare`: tutto il resto.
--
-- Al passo 5 **basta la timeline**, come già facevano due hook su tre. La
-- scorecard è un documento del lavoro, non la prova che il lavoro è iniziato: con
-- la scorecard obbligatoria, su 1320 progetti operativi ne risultano «in corso»
-- sette.
--
-- I tre segnali — timeline, scorecard, hardware — restano esposti come colonne
-- perché l'elenco di «cosa manca per configurare» si costruisce nel front-end,
-- accanto a chi lo mostra: non è uno stato, è un'indicazione d'interfaccia.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.v_progetti_stato as
 select c.*,
    (c.issued_date is not null or lower(coalesce(c.status, '')) = 'certificato') as e_certificato,
    (lower(coalesce(c.cert_type, '')) in ('energy', 'air')
     and lower(btrim(coalesce(c.cert_level, ''))) = 'online') as monitoraggio_online,
    exists (
      select 1 from public.certification_milestones m
       where m.certification_id = c.id and m.milestone_type = 'timeline'
    ) as ha_timeline,
    exists (
      select 1 from public.certification_milestones m
       where m.certification_id = c.id and m.milestone_type = 'scorecard'
    ) as ha_scorecard,
    exists (
      select 1 from public.project_allocations a where a.certification_id = c.id
    ) as ha_hardware,
    case
      -- 1 · Non e' lavoro operativo: resta com'e'.
      when lower(coalesce(c.status, '')) in
           ('potential', 'quotation', 'quotation_approved', 'canceled', 'cancelled')
        then lower(c.status)
      -- 2 · L'ente ha rilasciato.
      when c.issued_date is not null or lower(coalesce(c.status, '')) = 'certificato'
        then 'certificato'
      -- 3 · Il capolinea di un progetto di monitoraggio.
      when lower(coalesce(c.cert_type, '')) in ('energy', 'air')
       and lower(btrim(coalesce(c.cert_level, ''))) = 'online'
        then 'online'
      -- 4 · Consegnato, non ancora certificato.
      when lower(coalesce(c.status, '')) = 'completato'
        then 'completato'
      -- 5 · Si lavora: basta la timeline.
      when exists (select 1 from public.certification_milestones m
                    where m.certification_id = c.id and m.milestone_type = 'timeline')
        then 'in_corso'
      else 'da_configurare'
    end as setup_status
   from public.certifications c;

alter view public.v_progetti_stato set (security_invoker = on);

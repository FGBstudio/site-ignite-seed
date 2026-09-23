-- ═══════════════════════════════════════════════════════════════════════════
-- Le fee di terzi hanno un nome per schema, e Greeny non ne ha
--
-- Il wizard chiedeva «GBCI / IWBI Fees» a tutti, compreso Greeny — che non ha
-- nessun ente certificatore, quindi nessuna fee da versare a nessuno. E il
-- GBCI e' l'ente del LEED: chiamare cosi' la voce di un WELL o di un BREEAM
-- e' sbagliato due volte, perche' nomina l'ente di un altro schema.
--
-- L'etichetta diventa un dato del catalogo, che e' gia' l'unica fonte del
-- vocabolario delle certificazioni. Nulla vuol dire «questo servizio non ha
-- fee di terzi», e il campo sparisce invece di restare vuoto.
--
-- Nello stesso posto, il «Target Level» di Greeny: quel servizio non ha un
-- esito da raggiungere — il catalogo lo dice gia', outcome_model = 'none' — e
-- i valori che comparivano, «Pending» e «Online», sono stati di trasmissione
-- travestiti da obiettivo. Al loro posto una distinzione che serve davvero:
-- se questa e' la quotazione iniziale o un extra su un progetto gia' avviato.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.cert_catalog
  add column if not exists third_party_fee_label text;

comment on column public.cert_catalog.third_party_fee_label is
  'Come si chiamano le fee dell''ente certificatore per questo schema. Nullo = il servizio non ne ha, e il campo non si mostra.';

update public.cert_catalog set third_party_fee_label = 'GBCI fees'
 where scheme = 'LEED';

update public.cert_catalog set third_party_fee_label = 'Third entity fees'
 where scheme in ('WELL', 'BREEAM', 'Envision', 'WiredScore');

-- Tutto il resto resta nullo, e sono tre famiglie:
--   · i servizi di monitoraggio (Energy, Air) — nessun ente;
--   · le diagnosi e i quadri normativi (Energy Audit, TAXONOMY, CSRD);
--   · i servizi di supporto e commissioning, dove la fee dell'ente si paga
--     sulla certificazione principale e non su di noi.

-- ── Il tipo di quotazione ──────────────────────────────────────────────────
alter table public.certifications
  add column if not exists quotation_kind text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'certifications_quotation_kind_ck') then
    alter table public.certifications add constraint certifications_quotation_kind_ck
      check (quotation_kind is null or quotation_kind in ('starting', 'extra'));
  end if;
end $$;

comment on column public.certifications.quotation_kind is
  'starting = la quotazione che apre il progetto; extra = lavoro aggiuntivo su un progetto gia'' avviato. Sta qui e non in cert_level perche'' non e'' un livello di certificazione: e'' la natura dell''offerta.';

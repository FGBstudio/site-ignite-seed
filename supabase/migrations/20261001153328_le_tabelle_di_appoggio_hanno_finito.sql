-- ═══════════════════════════════════════════════════════════════════════════
-- Le tabelle di appoggio hanno finito
--
-- `import_chiavi` e `import_fatture` sono servite a far passare l'archivio dalla
-- carta al registro, e a poterlo contare prima che diventasse contabilità. Ora il
-- travaso è fatto e resterebbero dei tavoli apparecchiati in `public` che nessuno
-- userà più: fra sei mesi qualcuno le troverebbe e si chiederebbe se sono vive.
--
-- `import_conferme` resta: è l'unico posto dove è scritto **quale progetto** è
-- stato attaccato a quale sito e perché — 65 risolti, 18 no. Finché quei 18 non
-- sono decisi, quella tabella è la lista di cosa manca.
-- ═══════════════════════════════════════════════════════════════════════════

drop table if exists public.import_fatture;
drop table if exists public.import_chiavi;

comment on table public.import_conferme is
  'Il travaso dell''archivio ENTRATE: quale sito del documento corrisponde a quale progetto, e dove l''abbinamento non si è potuto fare. I 18 senza certification_id sono la lista di quello che resta da decidere.';

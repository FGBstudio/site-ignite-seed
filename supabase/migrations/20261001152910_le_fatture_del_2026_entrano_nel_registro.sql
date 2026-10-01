-- ═══════════════════════════════════════════════════════════════════════════
-- Le fatture del 2026 entrano nel registro
--
-- Dalla tabella di appoggio a `invoices`. L'emittente è FGB studio * Zmyrna
-- Limited per tutte: l'archivio ENTRATE è il suo, e il foglio delle entrate si
-- chiama «2026_Expenses_FGB_ZMYRNA LIMITED».
--
-- Il progetto si attacca solo dove le conferme di Matteo lo risolvono a **una**
-- certificazione: sulle altre resta nullo, e il sistema lo dice invece di
-- inventare una percentuale. Attribuirle per somiglianza metterebbe soldi sul
-- progetto di un altro marchio — l'errore che la revisione serviva a evitare.
--
-- Tre decisioni, e vale dirle.
--
-- **2.978 non entra, né l'una né l'altra.** Due documenti diversi — Kering Eyewear
-- per 12.500 e Versace Orlando per 16.750 — portano lo stesso numero, e lo
-- portano anche le due cartelle. Importarne una vorrebbe dire scegliere quale
-- delle due è archiviata male, e non lo so. Restano in appoggio, e il loro numero
-- è una domanda per chi le ha emesse.
--
-- **Il totale zero.** Quattro documenti non dicono l'importo. Per 2.983 lo dicono
-- le righe — 10.000 — e quella è una lettura, non una stima: il «Total» del
-- documento è scritto «1o.oo0,00», con la lettera o al posto degli zeri. Per
-- 2.918, 2.968 e 3.069 non lo dice nessuno, ed entrano a zero: falso come
-- importo, vero come stato — «questo documento non dice quanto».
--
-- **Lo stato non lo scrivo io.** Entrano «emesse»; poi arrivano gli incassi e il
-- giro giornaliero di Payments calcola chi è chiusa, chi è in sollecito, chi è
-- scaduta. Usare il meccanismo che esiste invece di scrivere gli stati a mano è
-- l'unico modo perché il registro resti coerente anche domani.
-- ═══════════════════════════════════════════════════════════════════════════

-- La fattura di Sarca 336 è la LEED: la riga dice «50% LEED Zero Carbon
-- consultancy». Il sito e i due progetti sono nati nella migrazione precedente.
insert into public.import_conferme (sito_doc, sito_db, brand_db, site_id, certificazioni, esito, certification_id)
select '– Sarca 336', 'MILANO, Sarca 336', 'SAVILLS', s.id, 2, 'creata su indicazione', c.id
  from public.sites s
  join public.certifications c on c.site_id = s.id and c.cert_type = 'LEED'
 where lower(s.name) = lower('MILANO, Sarca 336')
on conflict (sito_doc) do update set certification_id = excluded.certification_id,
                                     site_id = excluded.site_id,
                                     esito = excluded.esito;

insert into public.invoices (
  number, issue_date, issuer_contact_id, client_contact_id, certification_id,
  currency, exch_rate, total, vat_amount, payment_terms_days,
  po_riferimento, lifecycle_state, notes
)
select
  f.numero,
  f.data,
  (select id from public.contacts where kind='issuer' and entity_code='uk'),
  cl.id,
  cf.certification_id,
  f.valuta,
  1,
  case when f.totale > 0 then f.totale
       when f.numero = '2.983' then 10000   -- il «Total» scritto «1o.oo0,00»
       else 0
  end,
  f.iva,
  f.termini,
  f.po,
  'issued',
  'Importata dall''archivio ENTRATE (fattura Word del 2026) il 2026-10-01.'
from public.import_fatture f
join lateral (
  select c.id from public.contacts c
   where c.kind = 'client'
     and lower(btrim(regexp_replace(translate(c.company_name,'–—’','--'''),'[^a-zA-Z0-9]+',' ','g')))
       = lower(btrim(regexp_replace(translate(f.cliente,'–—’','--'''),'[^a-zA-Z0-9]+',' ','g')))
   limit 1
) cl on true
left join public.import_conferme cf on cf.sito_doc = f.sito_doc
where f.numero <> '2.978'
  and not exists (select 1 from public.invoices i where i.number = f.numero);

select
  (select count(*) from public.invoices) as fatture_in_registro,
  (select count(*) from public.invoices where notes like 'Importata dall''archivio ENTRATE%') as importate,
  (select count(*) from public.invoices where notes like 'Importata%' and certification_id is not null) as con_progetto,
  (select sum(total)::numeric(14,2) from public.invoices where notes like 'Importata%') as totale_importato;

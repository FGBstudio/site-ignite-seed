-- ═══════════════════════════════════════════════════════════════════════════
-- I tre totali che il documento non diceva, li dice il foglio
--
-- Tre documenti non hanno un importo leggibile — 2.918 e 2.968 di INTESA
-- COSTRUZIONI, 3.069 di FLORIDA REO — ed erano entrati a zero. Zero però non
-- regge alla prova dei fatti: il foglio di Francesca registra 4.000 incassati
-- sulla prima, 2.000 sulla seconda, 19.300 ancora da incassare sulla terza. Un
-- controllo del sistema l'ha detto a voce — «Incasso di 4.000 su 2.918: restano
-- solo 0.00» — e aveva ragione a fermarsi.
--
-- «Totale Paid» più «Not Paid» **è** la fattura: non è una stima, è la stessa
-- cifra scritta in un altro posto.
--
-- Non si corregge l'importo, si rifà la riga. `trg_fattura_emessa_immutabile`
-- vieta di cambiare il totale di una fattura emessa — e ha ragione: dopo
-- l'emissione un importo si corregge con una nota di credito, non con una UPDATE.
-- Ma queste tre sono nate sbagliate dieci minuti fa per un difetto di lettura, non
-- emesse sbagliate a un cliente: la cosa onesta è cancellarle e riscriverle, non
-- aprire tre note di credito per un errore che non è mai uscito da qui.
-- ═══════════════════════════════════════════════════════════════════════════

delete from public.invoice_righe
 where invoice_id in (
   select id from public.invoices
    where number in ('2.918','2.968','3.069')
      and notes like 'Importata dall''archivio ENTRATE%' and total = 0
 );

delete from public.invoices
 where number in ('2.918','2.968','3.069')
   and notes like 'Importata dall''archivio ENTRATE%'
   and total = 0;

insert into public.invoices (
  number, issue_date, issuer_contact_id, client_contact_id, certification_id,
  currency, exch_rate, total, vat_amount, payment_terms_days, po_riferimento,
  lifecycle_state, notes
)
select f.numero, f.data,
       (select id from public.contacts where kind='issuer' and entity_code='uk'),
       cl.id, cf.certification_id, f.valuta, 1, v.importo, 0, f.termini, f.po,
       'issued',
       'Importata dall''archivio ENTRATE (fattura Word del 2026) il 2026-10-01. Il documento non dice l''importo: viene dal foglio «Nota entrate» (Totale Paid + Not Paid).'
  from (values ('2.918', 4000::numeric), ('2.968', 2000), ('3.069', 19300)) as v(numero, importo)
  join public.import_fatture f on f.numero = v.numero
  join lateral (
    select c.id from public.contacts c
     where c.kind = 'client'
       and lower(btrim(regexp_replace(translate(c.company_name,'–—’','--'''),'[^a-zA-Z0-9]+',' ','g')))
         = lower(btrim(regexp_replace(translate(f.cliente,'–—’','--'''),'[^a-zA-Z0-9]+',' ','g')))
     limit 1
  ) cl on true
  left join public.import_conferme cf on cf.sito_doc = f.sito_doc
 where not exists (select 1 from public.invoices i where i.number = v.numero);

select number, total, issue_date
  from public.invoices where number in ('2.918','2.968','3.069') order by number;

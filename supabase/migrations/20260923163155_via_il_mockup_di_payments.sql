-- ═══════════════════════════════════════════════════════════════════════════
-- Via le sette fatture di prova
--
-- Erano nate il 18/09 per dare qualcosa da guardare a una schermata vuota, e
-- si riconoscono tutte dalla stessa nota: SEED-CANVAS. Clienti Prada su
-- progetti Fendi, importi tondi, stati sparsi apposta per mostrare i colori.
--
-- Da oggi il registro ospita documenti veri, e un finto in mezzo a trentadue
-- veri e' peggio di trentadue soli: nessuno si ricorda quale fosse quello da
-- non contare.
--
-- Si cancella dal basso: incassi, note di credito, solleciti e avvisi prima
-- delle fatture che li tengono in piedi.
-- ═══════════════════════════════════════════════════════════════════════════

delete from public.invoice_payments
 where invoice_id in (select id from public.invoices where notes = 'SEED-CANVAS');

delete from public.credit_notes
 where invoice_id in (select id from public.invoices where notes = 'SEED-CANVAS');

delete from public.invoice_reminders
 where invoice_id in (select id from public.invoices where notes = 'SEED-CANVAS');

delete from public.task_alerts
 where invoice_id in (select id from public.invoices where notes = 'SEED-CANVAS');

delete from public.invoices where notes = 'SEED-CANVAS';

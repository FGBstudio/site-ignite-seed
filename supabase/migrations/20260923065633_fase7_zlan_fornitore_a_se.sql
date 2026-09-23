-- ═══════════════════════════════════════════════════════════════════════════
-- ZLAN non e' Centrica
--
-- Nella tabella del monitoraggio «ZLAN» stava nella stessa colonna dei PO
-- Centrica, e a prima vista sembrava l'ordine PO-4. Non lo e': ZLAN e' una
-- societa' diversa e l'hardware e' diverso — sono i convertitori della
-- soluzione Schneider Reconfiguration, sottogruppo di Fendi Energy 2024.
--
-- L'ordine nasce in bozza: senza la fattura non ho una data, e un'uscita
-- senza data sulla timeline e' peggio di un'uscita assente. La ripartizione
-- per progetto invece e' gia' nota e viene registrata subito.
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.suppliers (name, default_currency, default_terms_days, notes)
select 'ZLAN', 'USD', 30,
       'Convertitori per la soluzione Schneider Reconfiguration. Fornitore distinto da Centrica. Fattura non ancora ricevuta al 23/09/2026.'
 where not exists (select 1 from public.suppliers where name = 'ZLAN');

insert into public.ops_purchase_orders
  (supplier, po_number, po_cost, currency, category, status, payment_status,
   supplier_id, corsia, stato_richiesta, cambio, po_monitoring, note_condizioni, descrizione)
select 'ZLAN', 'PO-ZLAN1', 260.00, 'USD', 'ENERGY', 'Ordered', 'Unpaid',
       s.id, 'merce', 'bozza',
       coalesce((select max(u.cambio) from public.uscite_previste u where u.valuta = 'USD' and u.cambio <> 1), 1),
       'ZLAN',
       'Condizioni non ancora note: manca la fattura. L''ordine resta in bozza e non genera flag di cassa.',
       'Convertitori ZLAN per Schneider Reconfiguration'
  from public.suppliers s
 where s.name = 'ZLAN'
   and not exists (select 1 from public.ops_purchase_orders where po_number = 'PO-ZLAN1');

-- La ripartizione per progetto si registra ora: e' quella che la tabella
-- del monitoraggio gia' dichiara. Diventera' cassa quando arrivera' la
-- fattura e l'ordine passera' ad approvato.
insert into public.po_allocazioni (po_id, certification_id, etichetta, importo, note)
select po.id, e.certification_id, e.project_name,
       e.total_package_cost_usd,
       'Da tabella energy · convertitore ZLAN'
  from public.ops_purchase_orders po
  join public.site_energy_records e on e.po_number = 'ZLAN'
 where po.po_number = 'PO-ZLAN1'
   and coalesce(e.total_package_cost_usd, 0) > 0
   and not exists (select 1 from public.po_allocazioni a where a.po_id = po.id);

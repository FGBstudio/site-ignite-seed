-- ═══════════════════════════════════════════════════════════════════════════
-- Fase 7 · Gli ordini Centrica erano in dollari, registrati in euro
--
-- Confrontando le rate con la testata dell'ordine e' saltato fuori uno
-- scarto costante del 17,17% su tutti e otto gli ordini Centrica: non un
-- errore di importo, ma il cambio. `po_cost` conteneva il controvalore in
-- euro di un ordine in dollari, e `currency` diceva EUR.
--
-- Qui l'ordine torna a dire quello che e': dollari, con il cambio che porta
-- esattamente all'euro gia' registrato. Nessun controvalore cambia.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.ops_purchase_orders disable trigger trg_po_genera_uscite;

update public.ops_purchase_orders po
   set currency = 'USD',
       cambio   = round(po.po_cost / c.importo, 6),
       po_cost  = c.importo
  from public.po_condizioni c
 where c.po_id = po.id
   and lower(trim(po.supplier)) = 'centrica'
   and po.currency = 'EUR'
   and c.importo > 0;

alter table public.ops_purchase_orders enable trigger trg_po_genera_uscite;

-- Le tre righe «Ordini Centrica» restano senza ordine di riferimento a
-- ragion veduta: sono la ripartizione per commessa di una spesa che il
-- fornitore non ha mai spaccato per progetto. Sono «quota», fuori dalle
-- somme, e servono solo a dire quanto di quella spesa pesa su chi.
update public.uscite_previste
   set note = coalesce(note || ' · ', '')
              || 'Quota per commessa: Centrica non ripartisce gli ordini per progetto, l''aggancio al singolo PO non esiste.'
 where riferimento = 'Ordini Centrica' and natura = 'quota';

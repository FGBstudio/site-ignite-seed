-- ═══════════════════════════════════════════════════════════════════════════
-- Centrica: la spesa scende sul progetto
--
-- Operazione dati che accompagna fn_ripartisci_uscite_da_energy. Idempotente:
-- rilanciarla ricostruisce lo stesso esito.
--
-- 1. Ogni fattura Centrica smette di essere una riga di cassa senza progetto
--    e diventa una riga «documento» (`quota`, fuori dalle somme).
-- 2. Sotto di essa nascono le righe di cassa, una per progetto, con le fette
--    lette dalla tabella del monitoraggio energia.
-- 3. Le tre vecchie righe «Ordini Centrica» — l'attribuzione per commessa
--    fatta a mano — si riducono a cio' che la ripartizione per PO non copre
--    ancora, cioe' i progetti energy a cui manca il tag del PO. Quando quel
--    tag ci sara' per tutti, queste righe varranno zero e spariranno.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1 · La fattura diventa il documento
update public.uscite_previste u
   set natura = 'quota'
  from public.ops_purchase_orders po
 where u.po_id = po.id
   and lower(trim(po.supplier)) = 'centrica'
   and u.natura = 'cassa'
   and u.po_allocazione_id is null;

-- 2 · Le quote per progetto
do $$
declare r record;
begin
  for r in select id from public.ops_purchase_orders
            where lower(trim(supplier)) = 'centrica' and po_monitoring is not null
  loop
    perform public.fn_ripartisci_uscite_da_energy(r.id);
  end loop;
end $$;

-- 3 · Cio' che la ripartizione per PO non copre ancora
with coperto as (
  select u.commessa_id, sum(u.importo_eur) as eur
    from public.uscite_previste u
   where u.natura = 'cassa' and u.note = 'Ripartizione da tabella energy'
     and u.commessa_id is not null
   group by 1
)
update public.uscite_previste u
   set importo = round(u.importo - coalesce(c.eur, 0), 2),
       descrizione = 'Hardware energy non ancora agganciato a un PO',
       note = 'Residuo dell''attribuzione per commessa: progetti energy senza tag PO nella tabella del monitoraggio. Va a zero quando il tag c''e'' per tutti.'
  from coperto c
 where u.riferimento = 'Ordini Centrica' and u.natura = 'quota'
   and c.commessa_id = u.commessa_id;

delete from public.uscite_previste
 where riferimento = 'Ordini Centrica' and natura = 'quota' and importo <= 0;

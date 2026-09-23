-- ═══════════════════════════════════════════════════════════════════════════
-- I sensori mancanti escono dalle scorte, e i costi dal listino
--
-- Sette righe della tabella energia avevano i sensori contati ma il costo a
-- zero. Non serviva un foglio esterno per riempirlo: il listino sta in
-- `products` — FGB-10/12/14 a 104,30, bridge LAN a 237,30 — ed e' lo stesso
-- che `productPricing.ts` dichiara unica fonte del prezzo hardware.
--
-- La formula «sensori x 104,30 + bridge x 237,30» riproduce al centesimo
-- cinque cifre indipendenti del foglio del cliente (Bal Harbour 1.488,90,
-- Milano Galleria 863,10, Pomellato Rodeo Drive 2.531,90, MK Munich 1.726,20,
-- SmartUP Hannover 3.679,20). Non e' una stima: e' il conto che il sistema
-- gia' sa fare, applicato dove nessuno l'aveva fatto.
--
-- Assegnare questi progetti al loro PO significa prelevarli dalle scorte:
-- il residuo «non allocato» di quell'ordine cala esattamente di tanto.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1 · I progetti a cui mancavano i pezzi li prendono dalle scorte ────────
-- Old Bond Street aveva la riga ma zero sensori; i dodici del pacchetto
-- escono dal PO-6, che infatti ha un residuo enorme.
update public.site_energy_records
   set total_sensors = 12, total_bridges = 1, no_pan10 = 12
 where project_name = 'London, Old Bond Street' and coalesce(total_sensors,0) = 0;

-- Macau Galaxy monta un convertitore ZLAN come le altre dodici della
-- riconfigurazione Schneider.
update public.site_energy_records
   set po_number = 'ZLAN',
       total_package_cost_usd = 20.00,
       total_package_cost_eur = round(20.00 * 0.8498, 2)
 where project_name = 'Taipa, Galaxy' and po_number is null;

-- ── 2 · Il costo, dal listino ──────────────────────────────────────────────
update public.site_energy_records e
   set total_package_cost_usd = round(
         coalesce(e.total_sensors,0) * p.sensore
       + coalesce(e.total_bridges,0) * p.bridge
       + coalesce(e.no_mango,0) * p.mango
       + coalesce(e.no_ct,0) * p.ct, 2),
       total_package_cost_eur = round((
         coalesce(e.total_sensors,0) * p.sensore
       + coalesce(e.total_bridges,0) * p.bridge
       + coalesce(e.no_mango,0) * p.mango
       + coalesce(e.no_ct,0) * p.ct) * 0.8498, 2),
       notes = coalesce(e.notes || ' · ', '') || 'Costo ricostruito dal listino prodotti il 23/09/2026.'
  from (
    select
      (select unit_cost from public.products where sku = 'FGB-10')   as sensore,
      (select unit_cost from public.products where sku = 'FGB-BR-LAN') as bridge,
      (select unit_cost from public.products where sku = 'MANGO')     as mango,
      (select unit_cost from public.products where sku = 'EXT-CT')    as ct
  ) p
 where coalesce(e.total_package_cost_usd, 0) = 0
   and (coalesce(e.total_sensors,0) > 0 or coalesce(e.total_bridges,0) > 0);

-- Beverly Hills, Rodeo Drive porta dieci sensori e un bridge, che a listino
-- fanno 1.280,30. Ne aveva registrati 2.531,90, che e' il costo dei ventidue
-- sensori dell'altra riga «Rodeo Drive». Lo stesso importo su due negozi
-- diversi era il segno che uno dei due era sbagliato: lo si corregge col
-- conto, non con un'opinione.
update public.site_energy_records e
   set total_package_cost_usd = round(
         coalesce(e.total_sensors,0) * 104.30 + coalesce(e.total_bridges,0) * 237.30, 2),
       total_package_cost_eur = round(
        (coalesce(e.total_sensors,0) * 104.30 + coalesce(e.total_bridges,0) * 237.30) * 0.8498, 2),
       notes = coalesce(e.notes || ' · ', '')
               || 'Costo riallineato al listino: dieci sensori e un bridge, non i ventidue dell''altra Rodeo Drive.'
 where e.project_name = 'Beverly Hills, Rodeo Drive'
   and round(coalesce(e.total_package_cost_usd,0),2) = 2531.90;

-- ── 3 · Da quale ordine sono usciti ────────────────────────────────────────
update public.site_energy_records set po_number = 'PO-5'
 where po_number is null
   and project_name in ('Bal Harbour', 'Bal Harbour — LEED', 'Rodeo Drive', 'Theatinerstrasse');

update public.site_energy_records set po_number = 'PO-6'
 where po_number is null
   and project_name in ('Geneva, Rue du Rhône', 'London, Old Bond Street');

-- ── 4 · Le due commesse LEED ───────────────────────────────────────────────
insert into public.commesse (nome, categoria, servizio, valuta, cambio_budget, termini_giorni, stato, note)
select v.nome, 'Energy', 'energy', 'EUR', 1, 31, 'aperta', v.note
  from (values
    ('LEED Platinum', 'Progetti energia a certificazione LEED Platinum.'),
    ('LEED Gold',     'Progetti energia a certificazione LEED Gold.')
  ) as v(nome, note)
 where not exists (select 1 from public.commesse k where k.nome = v.nome);

insert into public.commessa_progetti (commessa_id, certification_id)
select k.id, e.certification_id
  from public.site_energy_records e
  cross join public.commesse k
 where k.nome = 'LEED Platinum'
   and e.certification_id is not null
   and e.project_name in (
     'Boucheron Shanghai Xintiandi', 'Las Vegas', 'MILANO, Montenapoleone',
     'Theatinerstrasse', 'Galleria Vittorio Emanuele II', 'London, Regent Street',
     'Bal Harbour', 'Bal Harbour — LEED', 'Rodeo Drive', 'Beverly Hills, Rodeo Drive',
     'Ginza ', 'Audemars Piguet Chengdu TKL', 'Scandicci, Office',
     'Paris, Printemps Haussmann'
   )
   and not exists (
     select 1 from public.commessa_progetti cp where cp.certification_id = e.certification_id
   );

-- ── 5 · La cassa si riallinea da sola ──────────────────────────────────────
do $$
declare r record;
begin
  for r in select id from public.ops_purchase_orders
            where po_monitoring is not null and lower(trim(supplier)) = 'centrica'
  loop
    perform public.fn_ripartisci_uscite_da_energy(r.id);
  end loop;
end $$;

-- Le quote appena nate ereditano la commessa del progetto.
update public.uscite_previste u
   set commessa_id = cp.commessa_id
  from public.commessa_progetti cp
 where cp.certification_id = u.certification_id
   and u.commessa_id is distinct from cp.commessa_id;

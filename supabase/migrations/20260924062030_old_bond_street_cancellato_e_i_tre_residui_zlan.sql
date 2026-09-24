-- ═══════════════════════════════════════════════════════════════════════════
-- Old Bond Street cancellato, e i tre residui ZLAN rimessi al loro posto
--
-- OLD BOND STREET non si fa: costi a zero e certificazione annullata. I
-- 1.488,90 $ non svaniscono — l'ordine PO-6 a Centrica e' stato pagato per
-- 21.308,70 — ma smettono di essere il costo di un progetto e diventano
-- scorte. La funzione di ripartizione lo fa da se': assegna ai progetti
-- l'hardware delle loro schede e manda la differenza sulla riga «Scorte non
-- allocate».
--
-- I TRE RESIDUI. Quando Milano Galleria, Shanghai Plaza 66 (Women) e Hong Kong
-- Canton Road sono uscite dal sottogruppo Schneider, avevo corretto il
-- raggruppamento e lasciato a metà l'hardware: le prime due erano rimaste
-- kit ZLAN da 20 $, la terza senza nessun ordine — quindi dentro il grumo
-- «hardware senza PO» invece che in cassa su PO-2.
--
--   Milano Galleria     → PO-1   6 × 104,30 + 237,30 =   863,10
--   Plaza 66 (Women)    → PO-2   3 × 104,30 + 237,30 =   550,20
--   Canton Road         → PO-2   9 × 104,30 + 237,30 = 1.176,00
--
-- Contrariamente a quanto temevo, non e' una ripartizione proporzionale: ogni
-- progetto prende l'importo della propria scheda e solo il residuo di scorte
-- assorbe la differenza. Quindi Palazzo della Civilta' resta esattamente
-- 3.533,40 $ / 3.015,76 €, e nessuno degli altri ventinove progetti su PO-2 si
-- muove. Si muove la riga scorte, che e' il suo mestiere.
--
-- Gli euro delle due schede ritaggate li scrivo al cambio del rispettivo
-- ordine — 0,8535 per PO-1, 0,8537 per PO-2 — perche' e' il cambio a cui i
-- soldi sono usciti davvero, l'unico con una fattura dietro.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.certifications disable trigger trg_enforce_cert_not_on_hold;

-- ── Old Bond Street: niente hardware, niente progetto ─────────────────────
update public.site_energy_records r
   set total_sensors = 0, total_bridges = 0, no_mango = 0, no_ct = 0,
       additional_sensors = 0, additional_bridge = 0,
       sensor_total_cost = 0, bridge_total_cost = 0,
       total_package_cost_usd = 0, total_package_cost_eur = 0,
       po_number = null,
       status = 'Canceled',
       notes = 'Progetto cancellato il 24/09/2026: nessun hardware a carico. '
            || 'I 1.488,90 USD gia ordinati su PO-6 restano fra le scorte non allocate.'
 where r.certification_id = (select id from public.certifications
                              where name = 'London, Old Bond Street' and cert_type = 'Energy');

update public.certifications
   set status = 'canceled'
 where name = 'London, Old Bond Street' and cert_type = 'Energy';

-- ── I tre che non sono Schneider ──────────────────────────────────────────
update public.site_energy_records r
   set po_number = d.po,
       total_sensors = d.sensori,
       total_bridges = d.bridge,
       no_mango = 0, no_ct = 0, additional_bridge = 0,
       sensor_total_cost = d.sensori * 104.30,
       bridge_total_cost = d.bridge * 237.30,
       total_package_cost_usd = d.sensori * 104.30 + d.bridge * 237.30,
       total_package_cost_eur = round((d.sensori * 104.30 + d.bridge * 237.30) * d.cambio, 2),
       fx_rate_usd_eur = d.cambio,
       notes = 'Progetto normale, non Schneider Reconfiguration. Hardware su ' || d.po
            || ' dal listino prodotti, euro al cambio dell ordine.'
  from (values
         ('Milan, Galleria',            'PO-1',  6, 1, 0.8535),
         ('Shanghai, Plaza 66 (Women)', 'PO-2',  3, 1, 0.8537)
       ) as d(progetto, po, sensori, bridge, cambio)
 where r.certification_id = (select id from public.certifications
                              where name = d.progetto and cert_type = 'Energy');

update public.site_energy_records r
   set po_number = 'PO-2'
 where r.certification_id = (select id from public.certifications
                              where name = 'Hong Kong, Canton Road' and cert_type = 'Energy');

alter table public.certifications enable trigger trg_enforce_cert_not_on_hold;

-- ── Le ripartizioni si rifanno sugli ordini toccati ───────────────────────
do $$
declare r record;
begin
  for r in select id, po_number from public.ops_purchase_orders
            where po_number in ('PO-1A','PO-1B','PO-2A','PO-2B','PO-6','PO-ZLAN1')
            order by po_number
  loop
    perform public.fn_ripartisci_uscite_da_energy(r.id);
  end loop;
end $$;

-- ── E la quota «hardware senza PO» si riallinea ───────────────────────────
select public.fn_allinea_quote_hardware_energy();

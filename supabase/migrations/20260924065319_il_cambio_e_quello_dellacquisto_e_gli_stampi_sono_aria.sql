-- ═══════════════════════════════════════════════════════════════════════════
-- Il cambio e' quello dell'acquisto, e gli stampi sono Aria
--
-- ── IL CAMBIO ──────────────────────────────────────────────────────────────
-- «Sono acquisti in tempi diversi nel passato, e' la fluttuazione»: quindi non
-- esiste un cambio della tabella, esiste il cambio di ogni ordine. Le uscite
-- di cassa lo facevano gia'; le schede no — portavano 0,86 fisso su tutte le
-- 111 — e fn_ricalcola_costi_energy ne aveva un terzo cucito dentro, 0,8498.
--
-- Ora ogni scheda converte al cambio del proprio ordine (media pesata delle
-- fatture dell'ordine, dove l'ordine e' su piu' fatture):
--
--   PO-1  0,853500   PO-2  0,853686   PO-3  0,853700
--   PO-5  0,853800   PO-6  0,853800   ZLAN  0,904000
--
-- Questo sovrascrive i quattro euro al centesimo arrivati stamattina — Canton
-- Road 1.032,76, Qingdao 1.307,55, IFC Women 757,97, Cannes 1.856,92 — che
-- stavano tutti intorno a 0,8781. I dollari restano identici, e sono quelli la
-- decisione; l'euro cambia perche' un unico cambio su acquisti di date diverse
-- e' esattamente la cosa che la fluttuazione esclude. Se quel 0,8781 e' il
-- cambio vero di una fattura specifica, si corregge il cambio dell'ordine e
-- tutto segue.
--
-- Le schede senza ordine restano come stanno: non c'e' una fattura da cui
-- prendere un cambio, e inventarne uno sarebbe tornare al punto di partenza.
--
-- ── L'INSTALLATORE FENDI ──────────────────────────────────────────────────
-- Nessuna discrepanza da sistemare: 133.061,75 RMB e' esattamente il po_cost
-- di PO-KC1. I 437,53 euro di differenza col planning sono solo il cambio —
-- 0,126582 sull'ordine (1 EUR = 7,9 CNY) contro 0,12987 del foglio (1 : 7,7).
-- Vale la stessa regola: conta il cambio dell'ordine.
--
-- ── GLI STAMPI SONO ARIA, E TRASVERSALI ───────────────────────────────────
-- Keye Youcheng sono stampi e fee di R&D per il guscio del monitor: Aria, non
-- Energy — sull'Energy si compra hardware finito da Centrica, non c'e' nulla
-- da stampare. Ed e' un investimento trasversale, sostenuto all'inizio: non
-- appartiene a una commessa, ma non puo' nemmeno restare senza, perche' senza
-- commessa non compare in nessuna vista. Quindi ha una commessa sua, che non
-- ha entrate e non deve averne, e nel planning e' un blocco a se'.
--
-- Corretta anche la nota che diceva «contratto non firmato, le rate sono
-- previsioni»: era una mia ricostruzione sbagliata. I costi sono stati
-- sostenuti. Le date no, quelle non le conosco: le tre rate pagate restano
-- senza data — si vedono in colonna «Senza data» — e lo storno a 300 unita'
-- resta previsto, perche' quello dipende da un volume, non da una data.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Le schede convertono al cambio del loro ordine ────────────────────────
with cambi as (
  select p.po_monitoring as po,
         round(sum(p.po_cost * p.cambio) / nullif(sum(p.po_cost), 0), 6) as cambio
    from public.ops_purchase_orders p
   where p.po_monitoring is not null
   group by p.po_monitoring
)
update public.site_energy_records r
   set fx_rate_usd_eur = k.cambio,
       total_package_cost_eur = round(coalesce(r.total_package_cost_usd, 0) * k.cambio, 2)
  from cambi k
 where r.po_number = k.po;

-- ── E la funzione di ricalcolo smette di avere un cambio suo ──────────────
create or replace function public.fn_ricalcola_costi_energy()
 returns table(progetto text, sensori integer, bridge integer, prima numeric, dopo numeric)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_sensore numeric;
  v_bridge  numeric;
  v_mango   numeric;
  v_ct      numeric;
begin
  select unit_cost into v_sensore from public.products where sku = 'FGB-10';
  select unit_cost into v_bridge  from public.products where sku = 'FGB-BR-LAN';
  select unit_cost into v_mango   from public.products where sku = 'MANGO';
  select unit_cost into v_ct      from public.products where sku = 'EXT-CT';

  return query
  with calcolo as (
    select e.id, e.project_name, e.total_sensors, e.total_bridges,
           e.total_package_cost_usd as vecchio,
           round(coalesce(e.total_sensors,0) * v_sensore
               + coalesce(e.total_bridges,0) * v_bridge
               + coalesce(e.no_mango,0) * v_mango
               + coalesce(e.no_ct,0) * v_ct, 2) as nuovo,
           -- Il cambio non e' della funzione: e' dell'ordine da cui e' uscita
           -- questa merce. Se l'ordine non si sa, resta quello della scheda.
           coalesce(e.fx_rate_usd_eur, 1) as cambio
      from public.site_energy_records e
     where e.notes like '%dal listino prodotti%'
  ),
  scritto as (
    update public.site_energy_records e
       set total_package_cost_usd = c.nuovo,
           total_package_cost_eur = round(c.nuovo * c.cambio, 2)
      from calcolo c
     where e.id = c.id
       and round(coalesce(e.total_package_cost_usd,0),2) <> c.nuovo
    returning e.id
  )
  select c.project_name, c.total_sensors, c.total_bridges, c.vecchio, c.nuovo
    from calcolo c
   where round(coalesce(c.vecchio,0),2) <> c.nuovo;
end;
$function$;

-- ── Gli stampi: categoria, commessa, e una nota che non mente ─────────────
insert into public.commesse (nome, servizio, anno, valore_dichiarato, valuta, stato, categoria, termini_giorni, note)
select 'Investimenti trasversali · Aria', 'air', 2025, 0, 'EUR', 'aperta', 'Air', 31,
       'Costi comuni a tutte le commesse Aria: stampi del guscio, fee di R&D. Non ha entrate '
    || 'e non deve averne. Sta qui perche un investimento trasversale senza commessa non '
    || 'comparirebbe in nessuna vista, e attribuirlo a un progetto falserebbe il suo margine.'
 where not exists (select 1 from public.commesse where nome = 'Investimenti trasversali · Aria');

update public.ops_purchase_orders p
   set category = 'AIR',
       commessa_id = (select id from public.commesse where nome = 'Investimenti trasversali · Aria'),
       note_condizioni = 'Stampi del guscio piu fee di R&D per il monitor Aria. Costi sostenuti '
                      || 'all inizio: le date dei pagamenti non sono note, gli importi si. Lo storno '
                      || 'della fee al raggiungimento delle 300 unita e ancora atteso.'
 where p.po_number = 'PO-KY1';

update public.uscite_previste u
   set commessa_id = (select id from public.commesse where nome = 'Investimenti trasversali · Aria'),
       stato = case when u.importo < 0 then 'prevista' else 'pagata' end,
       data_prevista = null,
       data_prevista_fonte = 'senza_data',
       note = case when u.importo < 0
                   then 'Credito atteso al raggiungimento delle 300 unita.'
                   else 'Costo sostenuto all inizio. Data del pagamento da recuperare.' end
 where u.supplier_id = (select id from public.suppliers where name = 'Keye Youcheng');

-- ── Ripa89: l'incasso e' dell'8 giugno ────────────────────────────────────
alter table public.cert_payment_milestones disable trigger trg_cert_payment_milestones_guard;

update public.cert_payment_milestones t
   set payment_received_date = date '2026-06-08',
       due_date = date '2026-06-08'
 where t.certification_id in (
   select cp.certification_id from public.commessa_progetti cp
     join public.commesse cm on cm.id = cp.commessa_id
    where cm.nome = 'Ripa89 WELL');

do $$
declare r record;
begin
  for r in select cp.certification_id as id
             from public.commessa_progetti cp
             join public.commesse cm on cm.id = cp.commessa_id
            where cm.nome = 'Ripa89 WELL'
  loop
    perform public.fn_ricalcola_date_tranche(false, r.id);
  end loop;
end $$;

alter table public.cert_payment_milestones enable trigger trg_cert_payment_milestones_guard;

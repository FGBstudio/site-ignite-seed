-- ═══════════════════════════════════════════════════════════════════════════
-- Un costo derivato non si scrive una volta sola
--
-- Alle 07:25 ho calcolato dal listino il costo di sette schede che l'avevano
-- a zero. Alle 07:43 due di quelle schede hanno cambiato conteggio sensori —
-- Rodeo Drive da 22 a 10, Bal Harbour LEED da 12 a 10 — e il costo che avevo
-- scritto e' rimasto quello di prima. Un numero derivato che non si ricalcola
-- e' peggio di un numero mancante: sembra giusto.
--
-- Da qui in avanti quelle righe si riallineano con una chiamata. Si riconoscono
-- dalla nota che dice da dove viene il costo: le schede il cui costo e' stato
-- messo a mano non vengono toccate.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.fn_ricalcola_costi_energy()
returns table(progetto text, sensori integer, bridge integer, prima numeric, dopo numeric)
language plpgsql
security definer
set search_path = public
as $$
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
               + coalesce(e.no_ct,0) * v_ct, 2) as nuovo
      from public.site_energy_records e
     where e.notes like '%dal listino prodotti%'
  ),
  scritto as (
    update public.site_energy_records e
       set total_package_cost_usd = c.nuovo,
           total_package_cost_eur = round(c.nuovo * 0.8498, 2)
      from calcolo c
     where e.id = c.id
       and round(coalesce(e.total_package_cost_usd,0),2) <> c.nuovo
    returning e.id
  )
  select c.project_name, c.total_sensors, c.total_bridges, c.vecchio, c.nuovo
    from calcolo c
   where round(coalesce(c.vecchio,0),2) <> c.nuovo;
end;
$$;

comment on function public.fn_ricalcola_costi_energy() is
  'Riallinea al listino il costo delle schede il cui costo e'' stato ricostruito, dopo che i conteggi sensori sono cambiati. Non tocca le schede costate a mano.';

-- Prima applicazione: Rodeo Drive e Bal Harbour LEED tornano a 1.280,30, e
-- la ripartizione per progetto si rifa' su tutti gli ordini.
select public.fn_ricalcola_costi_energy();

do $$
declare r record;
begin
  for r in select id from public.ops_purchase_orders where po_monitoring is not null
  loop
    perform public.fn_ripartisci_uscite_da_energy(r.id);
  end loop;
end $$;

update public.uscite_previste u
   set commessa_id = cp.commessa_id
  from public.commessa_progetti cp
 where cp.certification_id = u.certification_id
   and u.commessa_id is distinct from cp.commessa_id;

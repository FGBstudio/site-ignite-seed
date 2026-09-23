-- ═══════════════════════════════════════════════════════════════════════════
-- La spesa hardware energy scende dal PO al progetto
--
-- Finora l'acquisto Centrica viveva in due posti che non si parlavano: la
-- cassa sulla fattura, senza progetto; e l'attribuzione in tre righe «quota»
-- per commessa, fuori dalle somme. Risultato: «Non attribuite · Centrica
-- PO-2A» sulla timeline, e commesse che sembravano non avere costi hardware.
--
-- La ripartizione vera c'e' gia', e sta nella tabella del monitoraggio
-- energia: ogni progetto dichiara da quale PO ha prelevato e per quanto
-- (`po_number`, `total_package_cost_usd`). Qui la si legge e la si usa.
--
-- Il modello diventa quello gia' usato per FoSensor: la fattura resta come
-- riga «quota» (il documento, fuori dalle somme), e sotto nascono le righe
-- «cassa», una per progetto. Nessun totale cambia.
--
-- Il residuo fra totale ordine e hardware assegnato non e' un errore: sono
-- scorte, trasporto e dogana. Resta una riga sua, dichiarata.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1 · L'ordine sa con che nome lo chiama il monitoraggio ─────────────────
-- Il registro ordini spezza in due quello che il monitoraggio chiama con un
-- nome solo: PO-1 la' sono PO-1A e PO-1B qui. La colonna tiene il ponte.
alter table public.ops_purchase_orders
  add column if not exists po_monitoring text;

comment on column public.ops_purchase_orders.po_monitoring is
  'Etichetta con cui site_energy_records.po_number chiama questo ordine. Piu'' ordini possono condividerla.';

update public.ops_purchase_orders po set po_monitoring = v.m
  from (values
    ('PO-1A', 'PO-1'), ('PO-1B', 'PO-1'),
    ('PO-2A', 'PO-2'), ('PO-2B', 'PO-2'),
    ('PO-3',  'PO-3'),
    ('PO-5',  'PO-5'),
    ('PO-6',  'PO-6')
  ) as v(num, m)
 where po.po_number = v.num and lower(trim(po.supplier)) = 'centrica';

-- PO-4 resta senza: l'hardware non e' ancora assegnato a nessun progetto.
update public.ops_purchase_orders
   set note_condizioni = coalesce(note_condizioni || ' · ', '')
                         || 'Hardware non ancora assegnato ad alcun progetto: la spesa resta non allocata.'
 where po_number = 'PO-4' and lower(trim(supplier)) = 'centrica';

-- ── 2 · Dalla tabella energy alle righe di cassa per progetto ──────────────
create or replace function public.fn_ripartisci_uscite_da_energy(p_po uuid)
returns table(righe_scritte integer, allocato numeric, residuo numeric)
returns null on null input
language plpgsql
security definer
set search_path = public
as $$
declare
  v_po      record;
  v_gruppo  numeric;   -- totale degli ordini che condividono l'etichetta
  v_hw      numeric;   -- hardware assegnato a progetti, in valuta d'ordine
  v_n       integer := 0;
begin
  select * into v_po from public.ops_purchase_orders where id = p_po;
  if v_po.id is null or v_po.po_monitoring is null then
    return query select 0, 0::numeric, 0::numeric;
    return;
  end if;

  select sum(coalesce(x.po_cost, 0)) into v_gruppo
    from public.ops_purchase_orders x
   where x.po_monitoring = v_po.po_monitoring;

  select coalesce(sum(e.total_package_cost_usd), 0) into v_hw
    from public.site_energy_records e
   where e.po_number = v_po.po_monitoring;

  if coalesce(v_gruppo, 0) = 0 then
    return query select 0, 0::numeric, 0::numeric;
    return;
  end if;

  -- Si rifa' solo cio' che ha scritto questa funzione: le righe figlie.
  delete from public.uscite_previste
   where po_id = p_po and natura = 'cassa' and po_allocazione_id is not null;

  -- Le allocazioni: una per progetto servito, piu' il residuo.
  delete from public.po_allocazioni where po_id = p_po;

  insert into public.po_allocazioni (po_id, certification_id, etichetta, importo, note)
  select p_po, e.certification_id, e.project_name,
         round(e.total_package_cost_usd * coalesce(v_po.po_cost,0) / v_gruppo, 2),
         'Da tabella energy · ' || e.total_sensors || ' sensori, ' || e.total_bridges || ' bridge'
    from public.site_energy_records e
   where e.po_number = v_po.po_monitoring
     and coalesce(e.total_package_cost_usd, 0) > 0;

  insert into public.po_allocazioni (po_id, certification_id, etichetta, importo, note)
  select p_po, null, 'Scorte non allocate',
         round(coalesce(v_po.po_cost,0) - v_hw * coalesce(v_po.po_cost,0) / v_gruppo, 2),
         'Differenza fra totale ordine e hardware assegnato ai progetti: scorte, trasporto, dogana.'
   where round(coalesce(v_po.po_cost,0) - v_hw * coalesce(v_po.po_cost,0) / v_gruppo, 2) <> 0;

  -- Le righe di cassa: ogni fattura dell'ordine si divide come si divide
  -- l'ordine. La riga «quota» resta la fattura, fuori dalle somme.
  with fatture as (
    select u.* from public.uscite_previste u
     where u.po_id = p_po and u.natura = 'quota'
  ),
  fette as (
    select a.id, a.certification_id, a.etichetta,
           a.importo / nullif(coalesce(v_po.po_cost,0), 0) as fetta
      from public.po_allocazioni a
     where a.po_id = p_po
  ),
  righe as (
    select f.id as fattura_id, t.id as alloc_id, t.certification_id, t.etichetta,
           round(f.importo * t.fetta, 2)
             + case when row_number() over (partition by f.id order by t.fetta desc, t.id) = 1
                    then f.importo - sum(round(f.importo * t.fetta, 2)) over (partition by f.id)
                    else 0 end as imp,
           f.supplier_id, f.corsia, f.riferimento, f.valuta, f.cambio, f.stato,
           f.data_prevista, f.data_prevista_fonte, f.data_effettiva, f.data_documento,
           f.data_ordine, f.evento_innesco, f.giorni_da_evento, f.po_condizione_id
      from fatture f cross join fette t
  ),
  scritte as (
    insert into public.uscite_previste (
      supplier_id, corsia, commessa_id, certification_id, commessa_etichetta,
      riferimento, descrizione, importo, valuta, cambio, natura, stato,
      data_prevista, data_prevista_fonte, data_effettiva, data_documento,
      data_ordine, evento_innesco, giorni_da_evento,
      po_id, po_condizione_id, po_allocazione_id, note
    )
    select
      r.supplier_id, r.corsia,
      cp.commessa_id,
      r.certification_id,
      coalesce(c.name, r.etichetta),
      r.riferimento,
      'Quota ' || r.riferimento || ' · ' || r.etichetta,
      r.imp, r.valuta, r.cambio, 'cassa', r.stato,
      r.data_prevista, r.data_prevista_fonte, r.data_effettiva, r.data_documento,
      r.data_ordine, r.evento_innesco, r.giorni_da_evento,
      p_po, r.po_condizione_id, r.alloc_id,
      'Ripartizione da tabella energy'
    from righe r
    left join public.certifications c on c.id = r.certification_id
    left join public.commessa_progetti cp on cp.certification_id = r.certification_id
    where r.imp is not null and r.imp <> 0
    returning 1 as uno
  )
  select count(*)::integer into v_n from scritte;

  return query select v_n,
                      round(v_hw * coalesce(v_po.po_cost,0) / v_gruppo, 2),
                      round(coalesce(v_po.po_cost,0) - v_hw * coalesce(v_po.po_cost,0) / v_gruppo, 2);
end;
$$;

comment on function public.fn_ripartisci_uscite_da_energy(uuid) is
  'Deriva la ripartizione per progetto di un ordine hardware dalla tabella del monitoraggio energia. Rilanciabile: correggi i sensori li'', rilanci qui.';

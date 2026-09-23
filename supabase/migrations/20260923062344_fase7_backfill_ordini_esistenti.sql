-- ═══════════════════════════════════════════════════════════════════════════
-- Fase 7 · Il pregresso entra nella catena
--
-- Le 80 righe di uscita sono state riconciliate a mano contro i fogli del
-- cliente. Qui non si tocca un importo: si dichiara da quale ordine e da
-- quale rata ciascuna discende, ricostruendo la catena
--   Richiesta di Fornitura -> condizioni -> uscite
-- che finora esisteva solo nella testa di chi ha scritto le righe.
--
-- Una cautela: su PO-8 la ripartizione cambia da rata a rata (Viale Richard
-- pesa 9.325,50 su tutte e tre, non una percentuale costante). Una rata
-- ricostruita non e' rigenerabile: il generatore la lascia stare.
--
-- NOTA · il corpo di fn_genera_uscite_da_po qui sotto e' stato poi sostituito
--   da 20260923062523 (nomi ambigui nei parametri di ritorno).
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.po_condizioni
  add column if not exists rigenerabile boolean not null default true;

comment on column public.po_condizioni.rigenerabile is
  'Falso sulle rate ricostruite dal pregresso: le loro righe di cassa sono riconciliate a mano e il generatore non le tocca.';

-- Il generatore impara a non calpestare cio' che non ha scritto lui.
create or replace function public.fn_genera_uscite_da_po(p_po uuid)
returns table(righe integer, importo numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_po      record;
  v_costo   numeric;
  v_n       integer := 0;
  v_tot     numeric := 0;
  v_alloc   integer;
begin
  select * into v_po from public.ops_purchase_orders where id = p_po;
  if v_po.id is null then
    raise exception 'Ordine % inesistente', p_po;
  end if;
  if v_po.supplier_id is null then
    raise exception 'L''ordine % non ha un fornitore: la riga di cassa non saprebbe a chi va', coalesce(v_po.po_number, p_po::text);
  end if;

  v_costo := coalesce(v_po.po_cost, 0);
  select count(*) into v_alloc from public.po_allocazioni where po_id = p_po;

  -- Si rigenera solo cio' che e' ancora previsione, non e' agganciato a una
  -- fattura, e appartiene a una rata che il generatore ha il diritto di rifare.
  delete from public.uscite_previste u
   where u.po_id = p_po
     and u.stato = 'prevista'
     and u.passive_invoice_id is null
     and (u.po_condizione_id is null
          or exists (select 1 from public.po_condizioni c
                      where c.id = u.po_condizione_id and c.rigenerabile));

  with cond as (
    select c.id, c.ordine, c.nome, c.evento, c.giorni, c.ripartita,
           coalesce(c.importo, round(v_costo * c.pct / 100.0, 2)) as importo
      from public.po_condizioni c
     where c.po_id = p_po
       and c.rigenerabile
       and not exists (
         select 1 from public.uscite_previste u
          where u.po_condizione_id = c.id
       )
  ),
  alloc as (
    select a.id, a.certification_id, a.etichetta, a.pct, a.importo
      from public.po_allocazioni a
     where a.po_id = p_po
  ),
  base as (
    select coalesce(sum(case when c.ripartita then c.importo end), 0) as ripartibile from cond c
  ),
  fette as (
    select a.id, a.certification_id, a.etichetta,
           coalesce(a.pct / 100.0,
                    case when b.ripartibile <> 0 then a.importo / b.ripartibile end,
                    0) as fetta
      from alloc a cross join base b
  ),
  intestazioni as (
    select c.id as cond_id, null::uuid as all_id, null::uuid as cert,
           null::text as etichetta, c.importo as imp,
           'quota'::text as natura, c.ordine, c.nome, c.evento, c.giorni
      from cond c
     where c.ripartita and v_alloc > 0
  ),
  ripartite as (
    select c.id as cond_id, f.id as all_id, f.certification_id as cert,
           f.etichetta,
           round(c.importo * f.fetta, 2)
             + case when row_number() over (partition by c.id order by f.fetta desc, f.id) = 1
                    then c.importo - sum(round(c.importo * f.fetta, 2)) over (partition by c.id)
                    else 0 end as imp,
           'cassa'::text as natura, c.ordine, c.nome, c.evento, c.giorni
      from cond c join fette f on true
     where c.ripartita and v_alloc > 0
    union all
    select c.id, null, v_po.certification_id, null, c.importo,
           'cassa', c.ordine, c.nome, c.evento, c.giorni
      from cond c
     where not c.ripartita or v_alloc = 0
  ),
  tutte as (
    select * from intestazioni union all select * from ripartite
  ),
  scritte as (
    insert into public.uscite_previste (
      supplier_id, corsia, commessa_id, certification_id, commessa_etichetta,
      riferimento, descrizione, importo, valuta, cambio, natura, stato,
      data_ordine, lead_time_giorni, evento_innesco, giorni_da_evento,
      data_prevista_fonte, po_id, po_condizione_id, po_allocazione_id, note
    )
    select
      v_po.supplier_id,
      coalesce(v_po.corsia, 'merce'),
      v_po.commessa_id,
      t.cert,
      coalesce(t.etichetta,
               case when t.natura = 'quota'
                    then coalesce(v_po.po_number, 'Ordine') || ' · rata ' || t.ordine end),
      coalesce(v_po.po_number, 'Ordine') || ' · rata ' || t.ordine,
      case when t.natura = 'quota' then 'Rata ' else 'Quota ' end || t.nome,
      t.imp,
      coalesce(v_po.currency, 'EUR'),
      coalesce(v_po.cambio, 1),
      t.natura,
      'prevista',
      coalesce(v_po.data_ordine, v_po.po_issued_date),
      v_po.lead_time_giorni,
      t.evento,
      t.giorni,
      'evento',
      p_po, t.cond_id, t.all_id,
      'Generata dalle condizioni di ' || coalesce(v_po.po_number, 'ordine')
    from tutte t
    where t.imp is not null and t.imp <> 0
    returning id, importo, natura
  )
  select count(*)::integer, coalesce(sum(case when natura = 'cassa' then importo end), 0)
    into v_n, v_tot
    from scritte;

  perform public.fn_ricalcola_date_uscite(false);

  return query select v_n, v_tot;
end;
$$;

-- ── Il backfill vero e proprio, a trigger spenti ───────────────────────────
alter table public.ops_purchase_orders disable trigger trg_po_genera_uscite;
alter table public.po_condizioni      disable trigger trg_condizioni_rigenerano;
alter table public.po_allocazioni     disable trigger trg_allocazioni_rigenerano;

-- 1 · Il fornitore smette di essere una stringa
update public.ops_purchase_orders po
   set supplier_id = s.id
  from public.suppliers s
 where lower(s.name) = lower(trim(po.supplier))
   and po.supplier_id is null;

-- 2 · Il cambio, preso dal cambio gia' usato sulle uscite di quella valuta
update public.ops_purchase_orders po
   set cambio = coalesce((select max(u.cambio) from public.uscite_previste u
                           where u.valuta = po.currency and u.cambio <> 1), 1)
 where po.cambio = 1 and coalesce(po.currency, 'EUR') <> 'EUR';

-- 3 · Gli ordini che mancavano
insert into public.ops_purchase_orders
  (supplier, po_number, po_cost, currency, category, status, payment_status,
   supplier_id, corsia, data_ordine, po_issued_date, stato_richiesta, cambio, note_condizioni)
select v.forn, v.num, v.costo, v.valuta, v.cat, v.stato, v.pag,
       s.id, v.corsia, v.ordine, v.ordine, 'approvata',
       coalesce((select max(u.cambio) from public.uscite_previste u where u.valuta = v.valuta and u.cambio <> 1), 1),
       v.note
  from (values
    ('FoSensor', 'PO-7',  56250.00, 'CNY', 'AIR',    'Ordered', 'Unpaid',  'merce',         date '2026-04-17', '30% deposito · 40% prima della spedizione · 30% a 45 gg dalla ricezione'),
    ('FoSensor', 'PO-8',  63325.00, 'CNY', 'AIR',    'Ordered', 'Partial', 'merce',         null,              '30/40/30 piu R&D CO2-CO fuori ripartizione. Data ordine non nota.'),
    ('FoSensor', 'PO-9',    600.00, 'CNY', 'AIR',    'Ordered', 'Unpaid',  'merce',         date '2026-09-11', '100% anticipato'),
    ('Kai Cheng','PO-KC1',133061.75,'CNY', 'ENERGY', 'Ordered', 'Partial', 'installazione', date '2025-03-01', 'Anticipo, meta installazioni, saldo. Importi da contratto, non percentuali tonde.'),
    ('Keye Youcheng','PO-KY1',11534.00,'USD','ENERGY','Draft',  'Unpaid',  'merce',         null,              'Contratto non firmato: le rate sono previsioni. Include lo storno della fee R&D a 300 unita.')
  ) as v(forn, num, costo, valuta, cat, stato, pag, corsia, ordine, note)
  join public.suppliers s on s.name = v.forn
 where not exists (select 1 from public.ops_purchase_orders x where x.po_number = v.num);

-- 4 · La data dell'ordine sugli ordini che gia' c'erano
update public.ops_purchase_orders po set data_ordine = v.d
  from (values
    ('PO-1',   'FoSensor', date '2024-08-28'),
    ('PO-2',   'FoSensor', date '2025-03-24'),
    ('PO- 3',  'FoSensor', date '2025-07-07'),
    ('PO- 4',  'FoSensor', date '2025-09-01'),
    ('PO-1A',  'Centrica', date '2025-03-19'),
    ('PO-1B',  'Centrica', date '2025-03-19'),
    ('PO-2A',  'Centrica', date '2025-08-27'),
    ('PO-2B',  'Centrica', date '2025-08-27'),
    ('PO-3',   'Centrica', date '2025-03-31'),
    ('PO-4',   'Centrica', date '2025-04-27'),
    ('PO-5',   'Centrica', date '2025-06-03'),
    ('PO-6',   'Centrica', date '2025-07-29')
  ) as v(num, forn, d)
 where po.po_number = v.num and lower(trim(po.supplier)) = lower(v.forn)
   and po.data_ordine is null;

-- Gli ordini esistenti sono fatti compiuti: approvati.
update public.ops_purchase_orders
   set stato_richiesta = 'approvata', approvata_il = coalesce(approvata_il, created_at)
 where stato_richiesta = 'bozza';

-- 5 · Le condizioni FoSensor, lette dalle righe «quota» del pregresso
insert into public.po_condizioni (po_id, ordine, nome, importo, evento, giorni, ripartita, rigenerabile, note)
select po.id,
       row_number() over (partition by po.id order by u.data_prevista, u.importo desc),
       split_part(u.descrizione, ' · ', 2),
       u.importo,
       coalesce(u.evento_innesco, 'ordine'),
       coalesce(u.giorni_da_evento, 0),
       true, false,
       'Ricostruita dal pregresso · fattura ' || coalesce(u.riferimento, '')
  from public.uscite_previste u
  join public.suppliers s on s.id = u.supplier_id and s.name = 'FoSensor'
  join (values
    ('FoSensor ordine 28/08/2024', 'PO-1'),
    ('FoSensor ordine 24/03/2025', 'PO-2'),
    ('FoSensor ordine 07/07/2025', 'PO- 3'),
    ('FoSensor ordine 01/09/2025', 'PO- 4'),
    ('FoSensor ordine 17/04/2026', 'PO-7'),
    ('FoSensor ordine N.D.',       'PO-8')
  ) as g(etichetta, num) on g.etichetta = u.commessa_etichetta
  join public.ops_purchase_orders po on po.po_number = g.num and lower(trim(po.supplier)) = 'fosensor'
 where u.natura = 'quota'
   and not exists (select 1 from public.po_condizioni c where c.po_id = po.id);

-- Le voci che non si ripartiscono: R&D, stampi, call-out.
insert into public.po_condizioni (po_id, ordine, nome, importo, evento, giorni, ripartita, rigenerabile, note)
select po.id,
       (select coalesce(max(c.ordine), 0) + 1 from public.po_condizioni c where c.po_id = po.id),
       split_part(u.descrizione, ' · ', 2),
       u.importo, coalesce(u.evento_innesco, 'ordine'), coalesce(u.giorni_da_evento, 0),
       false, false,
       'Ricostruita dal pregresso · fattura ' || coalesce(u.riferimento, '')
  from public.uscite_previste u
  join public.suppliers s on s.id = u.supplier_id and s.name = 'FoSensor'
  join (values
    ('FoSensor ordine 28/08/2024', 'PO-1'),
    ('FoSensor ordine N.D.',       'PO-8'),
    ('Kering Eyewear office',      'PO-9')
  ) as g(etichetta, num) on g.etichetta = u.commessa_etichetta
  join public.ops_purchase_orders po on po.po_number = g.num and lower(trim(po.supplier)) = 'fosensor'
 where u.natura = 'cassa' and u.descrizione like 'Fattura %'
   and not exists (select 1 from public.po_condizioni c where c.po_id = po.id and c.nome = split_part(u.descrizione, ' · ', 2));

-- 6 · Centrica: una fattura, una rata, net 30
insert into public.po_condizioni (po_id, ordine, nome, importo, evento, giorni, ripartita, rigenerabile, note)
select po.id, 1, 'Saldo a 30 giorni fine mese', u.importo,
       coalesce(u.evento_innesco, 'ordine'), coalesce(u.giorni_da_evento, 30),
       false, false,
       'Ricostruita dal pregresso · fattura ' || coalesce(u.riferimento, '')
  from public.uscite_previste u
  join public.suppliers s on s.id = u.supplier_id and s.name = 'Centrica'
  join public.ops_purchase_orders po
       on po.po_number = replace(u.commessa_etichetta, 'Centrica ', '')
      and lower(trim(po.supplier)) = 'centrica'
 where u.natura = 'cassa' and u.commessa_etichetta like 'Centrica PO-%'
   and not exists (select 1 from public.po_condizioni c where c.po_id = po.id);

-- 7 · Kai Cheng e Youcheng: le rate sono gli importi di contratto
insert into public.po_condizioni (po_id, ordine, nome, importo, evento, giorni, ripartita, rigenerabile, note)
select po.id,
       row_number() over (partition by po.id order by coalesce(u.data_prevista, date '2099-01-01'), abs(u.importo) desc),
       u.descrizione, u.importo,
       coalesce(u.evento_innesco, 'manuale'), coalesce(u.giorni_da_evento, 0),
       false, false, 'Ricostruita dal pregresso'
  from public.uscite_previste u
  join public.suppliers s on s.id = u.supplier_id
  join public.ops_purchase_orders po on po.supplier_id = s.id
 where s.name in ('Kai Cheng', 'Keye Youcheng')
   and po.po_number in ('PO-KC1', 'PO-KY1')
   and not exists (select 1 from public.po_condizioni c where c.po_id = po.id);

-- 8 · Le uscite dichiarano da dove vengono
--     a) righe «quota», voci non ripartite e rate uniche
update public.uscite_previste u
   set po_id = c.po_id, po_condizione_id = c.id
  from public.po_condizioni c
  join public.ops_purchase_orders po on po.id = c.po_id
 where u.po_condizione_id is null
   and u.supplier_id = po.supplier_id
   and u.importo = c.importo
   and (
     (u.natura = 'quota' and split_part(u.descrizione, ' · ', 2) = c.nome)
     or (u.natura = 'cassa' and u.descrizione like 'Fattura %' and split_part(u.descrizione, ' · ', 2) = c.nome)
     or (u.natura = 'cassa' and u.descrizione not like 'Quota %' and u.descrizione not like 'Fattura %' and u.descrizione = c.nome)
     or (u.natura = 'cassa' and u.commessa_etichetta like 'Centrica PO-%'
         and po.po_number = replace(u.commessa_etichetta, 'Centrica ', '')
         and c.nome = 'Saldo a 30 giorni fine mese')
   );

--     b) le allocazioni per progetto si agganciano alla rata omonima
update public.uscite_previste u
   set po_id = q.po_id, po_condizione_id = q.po_condizione_id
  from public.uscite_previste q
 where u.po_condizione_id is null
   and u.natura = 'cassa'
   and u.descrizione like 'Quota %'
   and q.natura = 'quota'
   and q.po_condizione_id is not null
   and q.riferimento = u.riferimento
   and split_part(q.descrizione, ' · ', 2) = split_part(u.descrizione, ' · ', 2);

-- 9 · La ripartizione, a memoria di come l'ordine e' stato diviso
insert into public.po_allocazioni (po_id, certification_id, etichetta, importo, note)
select u.po_id,
       u.certification_id,
       u.commessa_etichetta,
       sum(u.importo),
       'Ricostruita dal pregresso'
  from public.uscite_previste u
 where u.po_id is not null and u.natura = 'cassa' and u.descrizione like 'Quota %'
   and not exists (select 1 from public.po_allocazioni a where a.po_id = u.po_id)
 group by u.po_id, u.certification_id, u.commessa_etichetta;

--     e le uscite ricordano anche quella
update public.uscite_previste u
   set po_allocazione_id = a.id
  from public.po_allocazioni a
 where a.po_id = u.po_id
   and u.po_allocazione_id is null
   and u.natura = 'cassa' and u.descrizione like 'Quota %'
   and coalesce(a.certification_id::text, a.etichetta) = coalesce(u.certification_id::text, u.commessa_etichetta);

-- 10 · La commessa dell'ordine, dedotta da dove finiscono i soldi
update public.ops_purchase_orders po
   set commessa_id = v.k
  from (
    select u.po_id, min(u.commessa_id::text)::uuid as k, count(distinct u.commessa_id) as quante
      from public.uscite_previste u
     where u.po_id is not null and u.commessa_id is not null
     group by u.po_id
  ) v
 where v.po_id = po.id and v.quante = 1 and po.commessa_id is null;

alter table public.ops_purchase_orders enable trigger trg_po_genera_uscite;
alter table public.po_condizioni      enable trigger trg_condizioni_rigenerano;
alter table public.po_allocazioni     enable trigger trg_allocazioni_rigenerano;

-- I parametri di uscita si chiamavano «righe» e «importo»: quest'ultimo
-- collideva con la colonna omonima dentro il RETURNING, e il generatore
-- falliva appena una rata aveva un importo da scrivere. Nomi distinti.
drop function if exists public.fn_genera_uscite_da_po(uuid);

create function public.fn_genera_uscite_da_po(p_po uuid)
returns table(righe_scritte integer, importo_cassa numeric)
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

  delete from public.uscite_previste u
   where u.po_id = p_po
     and u.stato = 'prevista'
     and u.passive_invoice_id is null
     and (u.po_condizione_id is null
          or exists (select 1 from public.po_condizioni c
                      where c.id = u.po_condizione_id and c.rigenerabile));

  with cond as (
    select c.id, c.ordine, c.nome, c.evento, c.giorni, c.ripartita,
           coalesce(c.importo, round(v_costo * c.pct / 100.0, 2)) as quanto
      from public.po_condizioni c
     where c.po_id = p_po
       and c.rigenerabile
       and not exists (
         select 1 from public.uscite_previste u
          where u.po_condizione_id = c.id
       )
  ),
  alloc as (
    select a.id, a.certification_id, a.etichetta, a.pct, a.importo as quanto
      from public.po_allocazioni a
     where a.po_id = p_po
  ),
  base as (
    select coalesce(sum(case when c.ripartita then c.quanto end), 0) as ripartibile from cond c
  ),
  fette as (
    select a.id, a.certification_id, a.etichetta,
           coalesce(a.pct / 100.0,
                    case when b.ripartibile <> 0 then a.quanto / b.ripartibile end,
                    0) as fetta
      from alloc a cross join base b
  ),
  intestazioni as (
    select c.id as cond_id, null::uuid as all_id, null::uuid as cert,
           null::text as etichetta, c.quanto as imp,
           'quota'::text as tipo, c.ordine, c.nome, c.evento, c.giorni
      from cond c
     where c.ripartita and v_alloc > 0
  ),
  ripartite as (
    select c.id as cond_id, f.id as all_id, f.certification_id as cert,
           f.etichetta,
           round(c.quanto * f.fetta, 2)
             + case when row_number() over (partition by c.id order by f.fetta desc, f.id) = 1
                    then c.quanto - sum(round(c.quanto * f.fetta, 2)) over (partition by c.id)
                    else 0 end as imp,
           'cassa'::text as tipo, c.ordine, c.nome, c.evento, c.giorni
      from cond c join fette f on true
     where c.ripartita and v_alloc > 0
    union all
    select c.id, null, v_po.certification_id, null, c.quanto,
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
               case when t.tipo = 'quota'
                    then coalesce(v_po.po_number, 'Ordine') || ' · rata ' || t.ordine end),
      coalesce(v_po.po_number, 'Ordine') || ' · rata ' || t.ordine,
      case when t.tipo = 'quota' then 'Rata ' else 'Quota ' end || t.nome,
      t.imp,
      coalesce(v_po.currency, 'EUR'),
      coalesce(v_po.cambio, 1),
      t.tipo,
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
    returning uscite_previste.importo as scritto, uscite_previste.natura as tipo
  )
  select count(*)::integer, coalesce(sum(case when s.tipo = 'cassa' then s.scritto end), 0)
    into v_n, v_tot
    from scritte s;

  perform public.fn_ricalcola_date_uscite(false);

  return query select v_n, v_tot;
end;
$$;

comment on function public.fn_genera_uscite_da_po(uuid) is
  'Azione B: dalle condizioni negoziate dell''ordine alle uscite previste, tratteggiate. Non tocca cio'' che e'' gia'' pagato, fatturato o ricostruito dal pregresso.';

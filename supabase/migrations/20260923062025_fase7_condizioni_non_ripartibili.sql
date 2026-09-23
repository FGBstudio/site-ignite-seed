-- ═══════════════════════════════════════════════════════════════════════════
-- Fase 7 · Una rata puo' non essere di nessun progetto in particolare
--
-- Su PO-1 i 115.000 CNY di R&D e stampi non si dividono fra Tolstoj e
-- Luxottica come si dividono i sensori: sono un costo dell'ordine, non della
-- fornitura. Lo stesso vale per la R&D CO2-CO e per i call-out.
--
-- Senza questa distinzione il generatore spalmerebbe anche quelli, e le
-- percentuali di ripartizione andrebbero calcolate su un totale sbagliato.
--
-- NOTA · il corpo di fn_genera_uscite_da_po qui sotto e' stato poi sostituito
--   da 20260923062344 (flag rigenerabile) e 20260923062523 (nomi ambigui nei
--   parametri di ritorno). La versione valida e' quella.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.po_condizioni
  add column if not exists ripartita boolean not null default true;

comment on column public.po_condizioni.ripartita is
  'Se falso la rata non si divide fra i progetti: pesa intera sulla testata dell''ordine. R&D, stampi, call-out.';

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

  -- Si rigenera solo cio' che e' ancora previsione. Una rata gia' pagata, o
  -- gia' agganciata a una fattura ricevuta, e' un fatto: non si riscrive.
  delete from public.uscite_previste u
   where u.po_id = p_po
     and u.stato = 'prevista'
     and u.passive_invoice_id is null;

  with cond as (
    select c.id, c.ordine, c.nome, c.evento, c.giorni, c.ripartita,
           coalesce(c.importo, round(v_costo * c.pct / 100.0, 2)) as importo
      from public.po_condizioni c
     where c.po_id = p_po
       -- salta le rate le cui righe sono sopravvissute alla delete: sono storia
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
  -- La fetta di ciascun progetto: una percentuale, oppure un importo letto
  -- come quota del totale ripartibile — non del totale dell'ordine, che puo'
  -- contenere rate che non si dividono.
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
  -- La riga «quota»: la rata come la vedra' il fornitore, fuori dalle somme.
  intestazioni as (
    select c.id as cond_id, null::uuid as all_id, null::uuid as cert,
           null::text as etichetta, c.importo as imp,
           'quota'::text as natura, c.ordine, c.nome, c.evento, c.giorni
      from cond c
     where c.ripartita and v_alloc > 0
  ),
  -- Le righe «cassa»: una per progetto servito. Se la rata non si ripartisce,
  -- o se nessuno ha ripartito l'ordine, pesa intera sulla testata.
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

  -- Un solo punto di calcolo: le date le mette la funzione che le mette a tutti.
  perform public.fn_ricalcola_date_uscite(false);

  return query select v_n, v_tot;
end;
$$;

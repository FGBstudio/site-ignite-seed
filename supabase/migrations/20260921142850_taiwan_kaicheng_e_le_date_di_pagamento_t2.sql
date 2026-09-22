-- ═══════════════════════════════════════════════════════════════════════════
-- Quattro correzioni dal foglio Fendi Energy 2024.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1 · La data in cui il cliente pagherà ──────────────────────────────────
-- Diversa dalla scadenza della tranche: la tranche matura quando l'evento
-- accade, il cliente paga quando paga. Tenerle separate e' l'unico modo perche'
-- rieseguire fn_ricalcola_date_tranche non cancelli quello che sappiamo.
alter table public.cert_payment_milestones
  add column if not exists data_pagamento_prevista date;

comment on column public.cert_payment_milestones.data_pagamento_prevista is
  'Quando ci aspettiamo l incasso, quando lo sappiamo per altra via. Vince sulle stime dedotte dagli eventi.';

alter table public.cert_payment_milestones drop constraint if exists tranche_fonte_data_ammesse;
alter table public.cert_payment_milestones
  add constraint tranche_fonte_data_ammesse check (
    data_prevista_fonte is null or data_prevista_fonte in (
      'incasso', 'scadenza_fattura', 'pagamento_previsto',
      'evento_effettivo', 'evento_previsto',
      'ordine_hardware', 'primo_dato', 'telemetria_scartata', 'senza_data'
    )
  );


-- ── 2 · Taiwan: comanda il foglio ──────────────────────────────────────────
-- In database gli importi erano netto/0,8, nel foglio sono il netto. Il 20%
-- resta un'imposta che si aggiunge in fattura, non una ritenuta da lordizzare.
with corretti(nome_db, totale) as (values
  ('Kaohsiung, Hanshin Main',            7400.00),
  ('Taipei, Taipei 101',                 7700.00),
  ('Taipei, Breeze Center Xinyi',        4200.00),
  ('Taipei, Breeze Center Xinyi (Men)',  7400.00),
  ('Diamond Towers',                     4200.00),
  ('Kaohsiung, Hanshin Downtown',        4200.00)
),
bersagli as (
  select c.id as cert_id, e.id as rec_id, k.totale
  from corretti k
  join certifications c on c.name = k.nome_db and c.cert_type = 'Energy'
  join sites si on si.id = c.site_id
  join brands b on b.id = si.brand_id and b.name = 'FENDI'
  join site_energy_records e on e.certification_id = c.id
),
agg_record as (
  update site_energy_records e
     set quotation_value = b.totale, updated_at = now()
    from bersagli b
   where e.id = b.rec_id
  returning e.certification_id
)
update cert_payment_milestones m
   set amount = round(b.totale * (m.tranche_pct / 100.0), 2)
  from bersagli b
 where m.certification_id = b.cert_id
   and m.tranche_pct is not null;


-- ── 3 · Kai Cheng: un lotto solo ───────────────────────────────────────────
-- Le tre rate non sono tre lotti: sono il 30/30/40 di un contratto unico da
-- 133.061,75 RMB. Il primo anticipo e' stato versato piu' alto del dovuto e la
-- differenza e' rientrata dalla seconda rata — 45.324 + 34.513,05 fanno
-- 79.837,05, che e' esattamente il 60% del totale.
update public.uscite_previste u
   set commessa_etichetta = 'Fendi Energy 2024',
       note = case u.descrizione
         when 'Anticipo 30%' then
           'Versato 45.324 invece di 39.918,53: 5.405,47 di troppo, rientrati dalla rata successiva.'
         when 'Raggiungimento meta installazioni 30%' then
           'Ridotta a 34.513,05 per recuperare l eccesso dell anticipo. Le prime due rate fanno il 60% esatto.'
         else
           'Saldo del 40% sul contratto da 133.061,75 RMB.'
       end
  from public.suppliers s
 where s.id = u.supplier_id and s.name = 'Kai Cheng';


-- ── 4 · Le date di pagamento della seconda tranche ─────────────────────────
-- Solo dove il foglio le dichiara davvero: le righe con un «additional
-- callout» hanno in quella posizione la data del callout, non della tranche,
-- e sono escluse apposta.
with foglio(nome, data_pag) as (values
  ('Chongqing - Mix City',           date '2026-10-12'),
  ('Guangzhou - Taikoo Hui',         date '2026-10-12'),
  ('Nanjing Deji Plaza',             date '2026-10-04'),
  ('Qingdao - Hisense Plaza',        date '2026-10-17'),
  ('Shanghai - IFC - Women',         date '2026-10-08'),
  ('Shenzhen - Bay MixC',            date '2026-10-11'),
  ('Shenzhen - MixC',                date '2026-10-11'),
  ('Shenzhen Bay Mix City Kids',     date '2026-10-11'),
  ('Wuhan - Heartland 66',           date '2026-10-08'),
  ('Xi''an - Shin Kong Place - Men', date '2026-10-15'),
  ('ZHENGZHOU DAVID PLAZA',          date '2026-10-15')
),
norm as (
  select nome, data_pag,
         trim(regexp_replace(regexp_replace(lower(nome),
           '\y(fendi|red|energy|the)\y',' ','g'), '[^a-z0-9]+',' ','g')) as n
  from foglio
),
db as (
  select c.id as cert_id,
         trim(regexp_replace(regexp_replace(lower(c.name||' '||coalesce(si.city,'')),
           '\y(fendi|red|energy|the)\y',' ','g'), '[^a-z0-9]+',' ','g')) as n
  from certifications c
  join sites si on si.id = c.site_id
  join brands b on b.id = si.brand_id
  where b.name = 'FENDI' and c.cert_type = 'Energy'
),
abbinati as (
  select f.data_pag, m.cert_id
  from norm f
  join lateral (
    select d.cert_id, similarity(d.n, f.n) as sim
      from db d order by similarity(d.n, f.n) desc limit 1
  ) m on m.sim >= 0.55
)
update public.cert_payment_milestones m
   set data_pagamento_prevista = a.data_pag
  from abbinati a
 where m.certification_id = a.cert_id
   and m.tranche_order = 2;


-- ── 5 · La scala impara il gradino nuovo ───────────────────────────────────
create or replace function public.fn_ricalcola_date_tranche(p_solo_prova boolean default false)
returns table(fonte text, tranche integer, importo numeric)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return query
  with
  incassi as (
    select i.tranche_id, max(p.date) as d
      from public.invoices i
      join public.invoice_payments p on p.invoice_id = i.id
     where i.tranche_id is not null group by 1
  ),
  fatture as (
    select i.tranche_id, min(i.due_date) as d
      from public.invoices i
     where i.tranche_id is not null and i.due_date is not null group by 1
  ),
  ordine as (
    select c.id as cert_id, min(po.po_issued_date) as d
      from public.certifications c
      join public.hardwares h on h.site_id = c.site_id
      join public.ops_purchase_orders po on po.id = h.purchase_order_id
     where po.po_issued_date is not null group by 1
  ),
  telemetria as (
    select site_id, min(ts_day)::date as d from public.energy_daily group by 1
  ),
  calcolo as (
    select
      t.id, t.amount,
      case
        when t.payment_received_date is not null then t.payment_received_date
        when inc.d is not null then inc.d
        when fat.d is not null then fat.d
        when t.data_pagamento_prevista is not null then t.data_pagamento_prevista
        when cm.actual_date is not null then cm.actual_date
        when cm.due_date   is not null then cm.due_date
        when s.order_index = 4 and ord.d is not null then ord.d
        when s.order_index = 8 and tel.d is not null
             and (ord.d is null or tel.d >= ord.d) then tel.d
      end as data,
      case
        when t.payment_received_date is not null then 'incasso'
        when inc.d is not null then 'incasso'
        when fat.d is not null then 'scadenza_fattura'
        when t.data_pagamento_prevista is not null then 'pagamento_previsto'
        when cm.actual_date is not null then 'evento_effettivo'
        when cm.due_date   is not null then 'evento_previsto'
        when s.order_index = 4 and ord.d is not null then 'ordine_hardware'
        when s.order_index = 8 and tel.d is not null
             and (ord.d is null or tel.d >= ord.d) then 'primo_dato'
        when s.order_index = 8 and tel.d is not null then 'telemetria_scartata'
        else 'senza_data'
      end as f
    from public.cert_payment_milestones t
    left join public.cert_timeline_steps s on s.id = t.step_id
    left join lateral (
      select max(x.actual_date) as actual_date, max(x.due_date) as due_date
        from public.certification_milestones x
       where x.certification_id = t.certification_id and x.step_id = t.step_id
    ) cm on true
    left join incassi inc on inc.tranche_id = t.id
    left join fatture fat on fat.tranche_id = t.id
    left join public.certifications c on c.id = t.certification_id
    left join ordine ord on ord.cert_id = c.id
    left join telemetria tel on tel.site_id = c.site_id
  ),
  scritto as (
    update public.cert_payment_milestones m
       set data_prevista = k.data, data_prevista_fonte = k.f
      from calcolo k
     where m.id = k.id and not p_solo_prova
    returning m.id
  )
  select k.f, count(*)::integer, sum(k.amount)
    from calcolo k group by k.f order by 2 desc;
end;
$function$;

-- Ricalcolo del 21/09/2026 dopo questa migrazione:
--   senza_data           76 · 177.360 €
--   ordine_hardware      35 · 145.610 €
--   pagamento_previsto   11 ·  30.400 €
--   primo_dato            9 ·  19.240 €
--   telemetria_scartata   9 ·  27.890 €
--   incasso               2 ·  26.600 €

-- ═══════════════════════════════════════════════════════════════════════════
-- Fase 1 · Dare una data alle tranche
--
-- cert_payment_milestones sa quanto si incassa e a quale passo, ma non quando.
-- Senza un «quando» la griglia settimanale non ha niente da disegnare. Qui non
-- si chiede la data a nessuno: si scende una scala di fonti e si tiene la prima
-- che risponde, registrando quale e' stata. La fonte e' meta' del dato: un
-- incasso avvenuto e una stima non valgono uguale e non vanno disegnati uguale.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.cert_payment_milestones
  add column if not exists data_prevista date,
  add column if not exists data_prevista_fonte text;

comment on column public.cert_payment_milestones.data_prevista is
  'La settimana in cui questa tranche muove denaro. Calcolata da fn_ricalcola_date_tranche, mai scritta a mano.';
comment on column public.cert_payment_milestones.data_prevista_fonte is
  'Da quale gradino della scala viene la data. Decide come la griglia la disegna: piena se reale, tratteggiata se stimata.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tranche_fonte_data_ammesse') then
    alter table public.cert_payment_milestones
      add constraint tranche_fonte_data_ammesse check (
        data_prevista_fonte is null or data_prevista_fonte in (
          'incasso',            -- reale: i soldi sono arrivati
          'scadenza_fattura',   -- contrattuale: la fattura e' emessa
          'evento_effettivo',   -- prevista: il passo e' stato chiuso dal PM
          'evento_previsto',    -- stimata: il passo ha una data pianificata
          'ordine_hardware',    -- prevista: l'ordine fornitore e' partito
          'primo_dato',         -- prevista: il sito ha cominciato a trasmettere
          'telemetria_scartata',-- telemetria anteriore all'ordine: collaudo a banco
          'senza_data'          -- nessuna fonte: finisce nella colonna in fondo
        )
      );
  end if;
end $$;

create index if not exists idx_tranche_data_prevista
  on public.cert_payment_milestones (data_prevista)
  where data_prevista is not null;


-- ── La scala ───────────────────────────────────────────────────────────────
create or replace function public.fn_ricalcola_date_tranche(p_solo_prova boolean default false)
returns table(fonte text, tranche integer, importo numeric)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return query
  with
  -- 1 · I soldi sono gia' arrivati. Non si discute.
  incassi as (
    select i.tranche_id, max(p.date) as d
      from public.invoices i
      join public.invoice_payments p on p.invoice_id = i.id
     where i.tranche_id is not null
     group by 1
  ),
  -- 2 · La fattura e' emessa: la scadenza e' una data che possiamo esigere.
  fatture as (
    select i.tranche_id, min(i.due_date) as d
      from public.invoices i
     where i.tranche_id is not null and i.due_date is not null
     group by 1
  ),
  -- 5 · Quando e' partito l'ordine fornitore che serve questo sito.
  --     Dal legame strutturale pezzo -> ordine, mai dal campo testuale
  --     po_number: quello e' una famiglia («PO-2») e un match letterale
  --     finirebbe sull'ordine di un altro fornitore.
  ordine as (
    select c.id as cert_id, min(po.po_issued_date) as d
      from public.certifications c
      join public.hardwares h on h.site_id = c.site_id
      join public.ops_purchase_orders po on po.id = h.purchase_order_id
     where po.po_issued_date is not null
     group by 1
  ),
  -- 6 · Il primo giorno in cui il sito ha trasmesso.
  telemetria as (
    select site_id, min(ts_day)::date as d
      from public.energy_daily
     group by 1
  ),
  calcolo as (
    select
      t.id,
      t.amount,
      case
        when inc.d is not null then inc.d
        when fat.d is not null then fat.d
        when cm.actual_date is not null then cm.actual_date
        when cm.due_date   is not null then cm.due_date
        when s.order_index = 4 and ord.d is not null then ord.d
        when s.order_index = 8 and tel.d is not null
             and (ord.d is null or tel.d >= ord.d) then tel.d
      end as data,
      case
        when inc.d is not null then 'incasso'
        when fat.d is not null then 'scadenza_fattura'
        when cm.actual_date is not null then 'evento_effettivo'
        when cm.due_date   is not null then 'evento_previsto'
        when s.order_index = 4 and ord.d is not null then 'ordine_hardware'
        when s.order_index = 8 and tel.d is not null
             and (ord.d is null or tel.d >= ord.d) then 'primo_dato'
        -- Telemetria anteriore all'ordine: il sensore trasmetteva mentre lo
        -- configuravamo, settimane prima di partire. Non e' il primo dato del
        -- sito, e datarci sopra un incasso sarebbe sbagliato di mesi.
        when s.order_index = 8 and tel.d is not null then 'telemetria_scartata'
        else 'senza_data'
      end as f
    from public.cert_payment_milestones t
    left join public.cert_timeline_steps s on s.id = t.step_id
    left join lateral (
      select max(x.actual_date) as actual_date, max(x.due_date) as due_date
        from public.certification_milestones x
       where x.certification_id = t.certification_id
         and x.step_id = t.step_id
    ) cm on true
    left join incassi  inc on inc.tranche_id = t.id
    left join fatture  fat on fat.tranche_id = t.id
    left join public.certifications c on c.id = t.certification_id
    left join ordine   ord on ord.cert_id = c.id
    left join telemetria tel on tel.site_id = c.site_id
  ),
  scritto as (
    update public.cert_payment_milestones m
       set data_prevista = k.data,
           data_prevista_fonte = k.f
      from calcolo k
     where m.id = k.id
       and not p_solo_prova
    returning m.id
  )
  select k.f, count(*)::integer, sum(k.amount)
    from calcolo k
   group by k.f
   order by 2 desc;
end;
$function$;

comment on function public.fn_ricalcola_date_tranche(boolean) is
  'Riempie data_prevista su ogni tranche scendendo la scala delle fonti. Con p_solo_prova = true non scrive: restituisce solo il conteggio per fonte.';

revoke all on function public.fn_ricalcola_date_tranche(boolean) from public, anon;
grant execute on function public.fn_ricalcola_date_tranche(boolean) to authenticated, service_role;

-- Prima esecuzione, 21 settembre 2026:
--   ordine_hardware       35 tranche · 145.610 €
--   primo_dato            20 tranche ·  49.640 €
--   telemetria_scartata    9 tranche ·  27.890 €   (telemetria anteriore all'ordine)
--   senza_data            76 tranche · 186.135 €

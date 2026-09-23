-- ═══════════════════════════════════════════════════════════════════════════
-- Lo stato del monitoraggio lo decide il fatto, non la casella
--
-- Quarantuno siti trasmettevano dati e il monitoraggio ne dichiarava
-- cinquantasette «Upcoming», cioe' non ancora cominciati. Quindici avevano una
-- data di installazione e dicevano lo stesso «Upcoming». Trentuno erano
-- «Active» senza aver mai visto un sensore.
--
-- Due assi, non uno.
--
--   avanzamento : Upcoming -> Active -> Installed          (+ Postponed)
--   trasmissione: Y / N, derivata dalla freschezza del dato
--
-- «Completed» sparisce: installato e completato sono la stessa cosa, e due
-- parole per un fatto solo sono due occasioni di scriverle diverse. Installed
-- e' il capolinea; che poi un sito vada offline si legge nell'altro asse e
-- non tocca ne' l'avanzamento ne' le tranche gia' maturate.
--
-- Gli stati si muovono SOLO IN AVANTI. Declassare ventidue schede da «Active»
-- perche' il dato non le conferma sarebbe sostituire una casella arbitraria
-- con un'altra: quelle restano dove sono e vanno guardate a mano.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.fn_allinea_stato_monitoraggio(p_solo_prova boolean default true)
returns table(progetto text, prima text, dopo text, online_prima text, online_dopo text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with telemetria as (
    select site_id, max(ts_day)::date as ultimo
      from public.energy_daily where site_id is not null group by 1
  ),
  calcolo as (
    select
      e.id,
      coalesce(public.nome_canonico(b.name, si.city, c.name), e.project_name) as nome,
      coalesce(e.status, '') as stato_prima,
      coalesce(e.online_status, '') as online_prima,
      -- Il grado di avanzamento che il fatto giustifica.
      case when e.installation_date is not null or t.site_id is not null then 3
           when e.po_number is not null then 2
           else 1 end as grado_fatto,
      -- Quello che la casella dichiara oggi. «Completed» vale quanto
      -- «Installed»: e' lo stesso punto del percorso, scritto con due parole.
      case coalesce(e.status, '')
           when 'Installed' then 3 when 'Completed' then 3
           when 'Active' then 2 else 1 end as grado_scritto,
      coalesce(e.status, '') = 'Postponed' as sospesa,
      case when t.ultimo >= current_date - 30 then 'Y' else 'N' end as online_fatto
      from public.site_energy_records e
      left join public.certifications c on c.id = e.certification_id
      left join public.sites si on si.id = c.site_id
      left join public.brands b on b.id = si.brand_id
      left join telemetria t on t.site_id = c.site_id
  ),
  deciso as (
    select k.*,
      case
        when k.sospesa then 'Postponed'
        when k.grado_fatto > k.grado_scritto or k.stato_prima = 'Completed'
          then case greatest(k.grado_fatto, k.grado_scritto)
                 when 3 then 'Installed' when 2 then 'Active' else 'Upcoming' end
        -- Un valore fuori vocabolario e' comunque da riscrivere: «da_configurare»
        -- e' il vocabolario delle certificazioni, finito qui per mia svista.
        when k.stato_prima not in ('Upcoming','Active','Installed','Postponed')
          then case k.grado_fatto when 3 then 'Installed' when 2 then 'Active' else 'Upcoming' end
        else k.stato_prima
      end as stato_dopo
      from calcolo k
  ),
  scritto as (
    update public.site_energy_records e
       set status = d.stato_dopo,
           online_status = d.online_fatto
      from deciso d
     where e.id = d.id and not p_solo_prova
       and (e.status is distinct from d.stato_dopo
         or coalesce(e.online_status,'') is distinct from d.online_fatto)
    returning e.id
  )
  select d.nome, nullif(d.stato_prima,''), d.stato_dopo,
         nullif(d.online_prima,''), d.online_fatto
    from deciso d
   where d.stato_prima is distinct from d.stato_dopo
      or coalesce(d.online_prima,'') is distinct from d.online_fatto
   order by 1;
end;
$$;

comment on function public.fn_allinea_stato_monitoraggio(boolean) is
  'Deriva avanzamento e trasmissione dai fatti: installazione e telemetria. Avanza soltanto, non declassa mai.';

select count(*) from public.fn_allinea_stato_monitoraggio(false);

-- Bicester: installato, e ora offline. La telemetria pero' sta sul sito
-- gemello «Fendi Bicester Village outlet», che e' lo stesso negozio registrato
-- due volte — stesso caso di Diamond Towers. Finche' i due non si fondono, il
-- fatto va scritto a mano qui.
update public.site_energy_records e
   set status = 'Installed',
       online_status = 'N',
       notes = coalesce(e.notes || ' · ', '')
               || 'Installato e ora offline. La telemetria e'' registrata sul sito gemello '
               || '«Fendi Bicester Village outlet»: i due siti vanno uniti.'
  from public.certifications c
 where c.id = e.certification_id and c.name = 'Bicester, Outlet';

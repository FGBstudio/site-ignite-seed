-- ============================================================================
-- `masked` non deve mai tornare null
--
-- `is_admin(null)` restituisce null, non false. Per un chiamante non
-- riconosciuto `full_access` diventava quindi null, e `not full_access` tornava
-- null invece di true: la riga restava correttamente nascosta — null e' falso
-- in una WHERE — ma il flag che dice all'interfaccia "questa e' una vista
-- ridotta, non mostrare la causale" non si accendeva.
--
-- Un flag di riservatezza che vale null e' peggio di uno che vale false: chi
-- legge non sa di stare guardando una vista ridotta.
-- ============================================================================
create or replace function public.fn_hr_availability_window(p_from date, p_to date)
returns table (
  id            uuid,
  user_id       uuid,
  date          date,
  status        text,
  hours_planned numeric,
  note          text,
  is_self       boolean,
  masked        boolean
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with me as (select auth.uid() as uid, coalesce(public.is_admin(auth.uid()), false) as admin),
       month as (
         select date_trunc('month', current_date)::date as m_from,
                (date_trunc('month', current_date) + interval '1 month - 1 day')::date as m_to
       )
  select
    case when f.full_access then a.id end,
    a.user_id,
    a.date,
    case when f.full_access then a.status::text
         when public.fn_hr_is_available(a.status) then 'available'
         else 'unavailable' end,
    case when f.full_access then a.hours_planned end,
    case when f.full_access then a.note end,
    coalesce(a.user_id = me.uid, false),
    not f.full_access
  from public.hr_availability a
  cross join me
  cross join month
  cross join lateral (
    select coalesce(a.user_id = me.uid, false) or me.admin as full_access
  ) f
  where a.date between p_from and p_to
    and (f.full_access or a.date between month.m_from and month.m_to);
$function$;

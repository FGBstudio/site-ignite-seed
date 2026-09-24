-- ═══════════════════════════════════════════════════════════════════════════
-- Dall'installazione prevista nasce l'avviso di fattura
--
-- Il trigger sulla scheda di monitoraggio: appena c'e' una data prevista e non
-- c'e' ancora quella vera, Payments riceve l'avviso con la commessa e la
-- tranche del passo «primo dato» gia' indicate, e la data finisce in
-- scheduled_date cosi' l'avviso compare anche sul calendario del PM.
--
-- Quando l'installazione avviene davvero, l'avviso di previsione si chiude: da
-- quel momento l'incasso non e' piu' una previsione e ci pensa l'avviso che
-- nasce dalla milestone. Due avvisi per lo stesso incasso sarebbero uno di
-- troppo, e a restare deve essere quello che si appoggia a un fatto.
--
-- Poi le sedici date del planning, caricate dove mancava tutto. Tre sono gia'
-- passate — Shanghai Plaza 66 (Women) il 05/09, Guangzhou Taikoo Hui (Men) il
-- 10/09, Hong Kong Elements il 23/09 — e restano cosi' come sono: una
-- previsione scaduta e' un'informazione, mentre spostarla in avanti per farla
-- sembrare ancora valida non lo e'.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.trg_installazione_prevista_payments()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tranche record;
  v_nome    text;
  v_chiave  text;
begin
  if new.certification_id is null then
    return new;
  end if;

  v_chiave := 'billing_due:prevista:' || new.certification_id::text;

  -- L'installazione e' avvenuta: la previsione ha finito il suo lavoro.
  if new.installation_date is not null then
    perform public.fn_chiudi_alert(v_chiave);
    return new;
  end if;

  if new.installation_date_planned is null then
    perform public.fn_chiudi_alert(v_chiave);
    return new;
  end if;

  -- La tranche del passo «primo dato»: e' quella che l'installazione sblocca.
  select t.* into v_tranche
    from public.cert_payment_milestones t
    join public.cert_timeline_steps s on s.id = t.step_id
   where t.certification_id = new.certification_id
     and s.order_index = 8
     and t.status <> 'Paid'
   order by t.tranche_order nulls last
   limit 1;

  select name into v_nome from public.certifications where id = new.certification_id;

  perform public.fn_apri_alert(
    'billing_due',
    'Installazione prevista — prepara la fattura · ' || coalesce(v_nome, ''),
    'Installazione pianificata per il '
      || to_char(new.installation_date_planned, 'DD/MM/YYYY')
      || case
           when v_tranche.id is not null
             then '. Tranche attesa: ' || coalesce(v_tranche.name, 'saldo') || ' · '
                  || to_char(coalesce(v_tranche.amount, 0), 'FM999G999G990D00') || ' EUR.'
           else '. Nessuna tranche agganciata al primo dato: verifica lo schema di pagamento.'
         end
      || ' La data e una previsione: la fattura si emette a installazione avvenuta.',
    v_chiave,
    new.certification_id,
    null,
    '/payments/da-emettere?cert=' || new.certification_id::text
      || coalesce('&tranche=' || v_tranche.id::text, ''),
    new.installation_date_planned
  );

  return new;
end;
$function$;

drop trigger if exists trg_energy_installazione_prevista on public.site_energy_records;

create trigger trg_energy_installazione_prevista
  after insert or update of installation_date_planned, installation_date
  on public.site_energy_records
  for each row execute function public.trg_installazione_prevista_payments();

-- ── Le sedici date del planning ───────────────────────────────────────────
update public.site_energy_records r
   set installation_date_planned = d.quando
  from (values
         ('Beijing, China World Mall Mall', date '2026-10-10'),
         ('Beijing, Sanlitun',              date '2026-10-10'),
         ('Beijing, Shin Kong Place (Men)', date '2026-10-11'),
         ('Beijing, SKP (Women)',           date '2026-10-11'),
         ('Dalian, Olympia 66',             date '2026-10-14'),
         ('Guangzhou, Taikoo Hui (Men)',    date '2026-09-10'),
         ('Harbin, Charter (Women)',        date '2026-10-15'),
         ('Hong Kong, Elements',            date '2026-09-23'),
         ('Hong Kong, Elements (Men)',      date '2026-09-23'),
         ('Hong Kong, Landmark',            date '2026-09-24'),
         ('Hong Kong, Pacific Place',       date '2026-09-24'),
         ('Lótus, Four Seasons (DFS)',      date '2026-09-23'),
         ('Taipa, Galaxy',                  date '2026-09-23'),
         ('Sé, One Central',                date '2026-09-24'),
         ('Shanghai, Plaza 66 (Women)',     date '2026-09-05'),
         ('Shenyang, MixC',                 date '2026-10-13')
       ) as d(progetto, quando)
 where r.certification_id = (select id from public.certifications
                              where name = d.progetto and cert_type = 'Energy');

-- ── E le tranche prendono la loro data ────────────────────────────────────
select * from public.fn_ricalcola_date_tranche(false, null);

-- Payments, fase 2 — il passare del tempo, una volta al giorno.
--
-- Alcune transizioni non hanno un gesto che le provochi: una fattura non
-- «diventa» scaduta perche' qualcuno fa qualcosa, ma perche' passa una notte.
-- Questo e' il lavoro che quella notte deve fare.
--
-- Idempotente per costruzione: rieseguirlo dieci volte di fila lascia il
-- database dov'era. Serve, perche' un job che non si puo' rilanciare e' un job
-- che nessuno rilancia quando e' saltato.
--
-- Le date si leggono in Europe/Rome: un job che gira all'una di notte UTC
-- altrimenti manderebbe in scadenza le fatture con un giorno di anticipo
-- rispetto a quello che vede in pagina chi lavora a Milano.
create or replace function public.fn_payments_job_giornaliero()
returns table (passo text, righe integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
  v record;
  n integer;
begin
  -- ── 1 · Le scadute entrano in recall ───────────────────────────────────────
  n := 0;
  for v in
    select i.id, i.number, i.certification_id, f.client_name, f.project_name, f.residual, f.days_late
      from public.invoices i
      join public.v_invoices f on f.id = i.id
     where i.lifecycle_state = 'issued'
       and f.residual > 0
       and v_oggi > i.due_date
  loop
    update public.invoices
       set lifecycle_state = 'in_recall', recall_status = 'red', updated_at = now()
     where id = v.id;

    perform public.fn_apri_alert(
      'billing_due',
      'Scaduta: ' || v.number || ' · ' || coalesce(v.client_name, v.project_name, ''),
      'Residuo ' || to_char(v.residual, 'FM999G999G990D00') || ' — scaduta da ' || v.days_late || ' giorni.',
      'recall_red:' || v.id::text,
      v.certification_id,
      v.id
    );
    n := n + 1;
  end loop;
  passo := 'scadute -> recall rosso'; righe := n; return next;

  -- ── 2 · I gialli scaduti tornano rossi ─────────────────────────────────────
  -- «Bonifico disposto» vale 30 giorni. Passati quelli senza che sia arrivato
  -- niente, la promessa non vale piu' di prima: si torna a inseguire.
  n := 0;
  for v in
    select i.id, i.number, i.certification_id, f.client_name, f.project_name, f.residual
      from public.invoices i
      join public.v_invoices f on f.id = i.id
     where i.recall_status = 'yellow'
       and i.yellow_until is not null
       and v_oggi > i.yellow_until
       and f.residual > 0
  loop
    update public.invoices
       set recall_status = 'red', yellow_until = null, updated_at = now()
     where id = v.id;

    perform public.fn_chiudi_alert('recall_yellow:' || v.id::text);
    perform public.fn_apri_alert(
      'recall_yellow_expired',
      'Bonifico mai arrivato: ' || v.number || ' · ' || coalesce(v.client_name, v.project_name, ''),
      'I 30 giorni dalla nota «bonifico disposto» sono passati e il residuo e'' ancora ' ||
        to_char(v.residual, 'FM999G999G990D00') || '. La fattura torna rossa.',
      'recall_red:' || v.id::text,
      v.certification_id,
      v.id
    );
    n := n + 1;
  end loop;
  passo := 'gialli scaduti -> rosso'; righe := n; return next;

  -- ── 3 · Le passive scadute ─────────────────────────────────────────────────
  update public.passive_invoices
     set state = 'overdue'
   where state = 'to_pay' and v_oggi > due_date;
  get diagnostics n = row_count;
  passo := 'passive -> scadute'; righe := n; return next;

  -- ── 4 · Rete di sicurezza ──────────────────────────────────────────────────
  -- Se un incasso fosse stato inserito aggirando i trigger (una correzione a
  -- mano, un import), la fattura resterebbe aperta con residuo zero. Qui si
  -- rimette a posto: costa poco e chiude il buco.
  n := 0;
  for v in
    select f.id from public.v_invoices f
     where f.residual <= 0 and f.lifecycle_state <> 'closed'
  loop
    perform public.fn_riallinea_fattura(v.id);
    n := n + 1;
  end loop;
  passo := 'chiuse fuori sincrono'; righe := n; return next;
end;
$$;

comment on function public.fn_payments_job_giornaliero is
  'Transizioni che dipendono dal tempo. Idempotente: si puo'' rilanciare a mano senza effetti.';

-- ── Quando gira ──────────────────────────────────────────────────────────────
-- 05:10 UTC: le sette passate in Italia d'estate, le sei d'inverno. Prima che
-- qualcuno apra la sezione, dopo che la notte e' finita ovunque.
select cron.unschedule('payments-giornaliero')
 where exists (select 1 from cron.job where jobname = 'payments-giornaliero');

select cron.schedule(
  'payments-giornaliero',
  '10 5 * * *',
  $cron$ select public.fn_payments_job_giornaliero(); $cron$
);

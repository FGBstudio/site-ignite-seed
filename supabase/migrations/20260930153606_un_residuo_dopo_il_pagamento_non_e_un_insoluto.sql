-- ═══════════════════════════════════════════════════════════════════════════
-- Un residuo dopo il pagamento non è un insoluto
--
-- La prova ha messo in luce una contraddizione mia. La specifica dice che il
-- residuo dopo un pagamento diventa «giallo» e esce dalla cadenza; ma nel
-- database `yellow` ha gia' un significato preciso — c'e' una promessa viva —
-- e il vincolo `invoices_giallo_ha_promessa` lo impone. Erano due gialli
-- diversi chiamati con lo stesso nome.
--
-- Nella prova, una fattura da 4.000 incassata per 3.980 restava **rossa** con
-- venti euro di residuo: in elenco accanto a un insoluto da undicimila, come
-- se fossero lo stesso problema.
--
-- Gli stati del recall diventano tre, e ognuno dice una cosa sola:
--
--   red    scaduta e nessuno ha pagato        → si insegue, lunedi' e mercoledi'
--   yellow c'e' una promessa viva             → la palla e' dal cliente
--   nessuno pagata in parte, resta un residuo → da bilanciare a fine progetto
--
-- Il terzo resta in `in_recall` perche' deve restare sotto gli occhi — e' il
-- «li mandiamo con le cose di fine anno quando mancano le cifrette piccole» —
-- ma senza colore, perche' non c'e' niente da sollecitare.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.fn_payments_job_giornaliero()
returns table(passo text, righe integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
  -- 1 = lunedi', 3 = mercoledi'. E' il giro che l'amministrazione fa gia'.
  v_giorno_di_recall boolean := extract(isodow from v_oggi) in (1, 3);
  v record;
  n integer;
  v_chiave text;
begin
  -- ── 1 · Il preavviso: sette giorni prima ──────────────────────────────────
  -- Una fattura che sta per scadere non e' un problema: e' l'ultimo momento in
  -- cui si puo' evitare che lo diventi. Non compare se il cliente ha gia'
  -- promesso: la palla e' sua.
  n := 0;
  for v in
    select i.id, i.number, i.certification_id, f.client_name, f.project_name,
           f.residual, f.currency, (i.due_date - v_oggi) as mancano
      from public.invoices i
      join public.v_invoices f on f.id = i.id
     where f.residual > 0
       and i.lifecycle_state = 'issued'
       and i.due_date between v_oggi and v_oggi + 7
       and i.data_incasso_attesa is null
  loop
    perform public.fn_apri_alert(
      'recall_pre_scadenza',
      'Scade fra ' || v.mancano || ' giorni: ' || v.number || ' · ' ||
        coalesce(v.client_name, v.project_name, ''),
      'Un promemoria al cliente adesso costa meno di un sollecito dopo. Residuo ' ||
        to_char(v.residual, 'FM999G999G990D00') || ' ' || v.currency || '.',
      'recall_pre:' || v.id::text,
      v.certification_id,
      v.id
    );
    n := n + 1;
  end loop;
  passo := 'preavviso a 7 giorni'; righe := n; return next;

  -- ── 2 · Le scadute entrano in recall ─────────────────────────────────────
  -- Rosse solo quelle che nessuno ha pagato. Una pagata in parte e' scaduta
  -- anche lei, ma non e' la stessa cosa: entra senza colore.
  n := 0;
  for v in
    select i.id, f.paid_amount
      from public.invoices i
      join public.v_invoices f on f.id = i.id
     where i.lifecycle_state = 'issued'
       and f.residual > 0
       and v_oggi > i.due_date
  loop
    update public.invoices
       set lifecycle_state = 'in_recall',
           recall_status = case when v.paid_amount > 0 then null else 'red' end,
           updated_at = now()
     where id = v.id;
    perform public.fn_chiudi_alert('recall_pre:' || v.id::text);
    n := n + 1;
  end loop;
  passo := 'scadute -> recall'; righe := n; return next;

  -- ── 3 · Il pagamento arrivato ferma la cadenza ───────────────────────────
  -- Prima di aprire i solleciti di oggi: chi ha pagato qualcosa esce, anche se
  -- resta un residuo. Quel residuo si bilancia a fine progetto, e nessuno
  -- telefona il lunedi' e il mercoledi' per venti euro.
  n := 0;
  for v in
    select i.id
      from public.invoices i
      join public.v_invoices f on f.id = i.id
     where f.paid_amount > 0
       and f.residual > 0
       and (i.recall_status = 'red'
            or exists (select 1 from public.task_alerts a
                        where a.invoice_id = i.id and a.is_resolved = false
                          and a.dedup_key like 'recall_post:%'))
  loop
    update public.invoices
       set recall_status = null, updated_at = now()
     where id = v.id;
    perform public.fn_chiudi_recall(v.id);
    n := n + 1;
  end loop;
  passo := 'parziali fuori dalla cadenza'; righe := n; return next;

  -- ── 4 · Il sollecito: il giorno dopo, poi lunedi' e mercoledi' ───────────
  n := 0;
  for v in
    select i.id, i.number, i.certification_id, f.client_name, f.project_name,
           f.residual, f.currency, f.days_late, f.reminders_count
      from public.invoices i
      join public.v_invoices f on f.id = i.id
     where f.residual > 0
       and f.paid_amount = 0
       and i.lifecycle_state = 'in_recall'
       and coalesce(i.recall_status, '') = 'red'
       and v_oggi > i.due_date
       and (i.data_incasso_attesa is null or i.data_incasso_attesa < v_oggi)
       and (v_giorno_di_recall or v_oggi = i.due_date + 1)
  loop
    v_chiave := 'recall_post:' || v.id::text || ':' || v_oggi::text;
    -- Si chiude quello di prima e se ne apre uno nuovo: resta un avviso vivo
    -- per fattura, ma torna a farsi vedere anche se era stato archiviato.
    if not exists (select 1 from public.task_alerts
                    where dedup_key = v_chiave and is_resolved = false) then
      perform public.fn_chiudi_recall(v.id);
      perform public.fn_apri_alert(
        'recall_post_scadenza',
        'Sollecito: ' || v.number || ' · ' || coalesce(v.client_name, v.project_name, ''),
        'Scaduta da ' || v.days_late || ' giorni, residuo ' ||
          to_char(v.residual, 'FM999G999G990D00') || ' ' || v.currency ||
          case when v.reminders_count > 0
               then ' — ' || (v.reminders_count + 1) || '° sollecito.'
               else ' — primo sollecito.' end,
        v_chiave,
        v.certification_id,
        v.id
      );
      n := n + 1;
    end if;
  end loop;
  passo := 'solleciti aperti oggi'; righe := n; return next;

  -- ── 5 · I gialli scaduti tornano rossi ───────────────────────────────────
  n := 0;
  for v in
    select i.id, i.number, i.certification_id, f.client_name, f.project_name,
           f.residual, f.paid_amount
      from public.invoices i
      join public.v_invoices f on f.id = i.id
     where i.recall_status = 'yellow'
       and i.data_incasso_attesa is not null
       and v_oggi > i.data_incasso_attesa
       and f.residual > 0
  loop
    update public.invoices
       set recall_status = case when v.paid_amount > 0 then null else 'red' end,
           data_incasso_attesa = null, data_incasso_attesa_fonte = null,
           updated_at = now()
     where id = v.id;

    perform public.fn_apri_alert(
      'recall_yellow_expired',
      'Promessa non mantenuta: ' || v.number || ' · ' || coalesce(v.client_name, v.project_name, ''),
      'La data che il cliente aveva indicato e'' passata e il residuo e'' ancora ' ||
        to_char(v.residual, 'FM999G999G990D00') || '. La fattura torna nel giro.',
      'recall_red:' || v.id::text,
      v.certification_id,
      v.id
    );
    n := n + 1;
  end loop;
  passo := 'promesse scadute -> rosso'; righe := n; return next;

  -- ── 6 · Le passive scadute ───────────────────────────────────────────────
  update public.passive_invoices
     set state = 'overdue'
   where state = 'to_pay' and v_oggi > due_date;
  get diagnostics n = row_count;
  passo := 'passive -> scadute'; righe := n; return next;

  -- ── 7 · Rete di sicurezza ────────────────────────────────────────────────
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
$function$;

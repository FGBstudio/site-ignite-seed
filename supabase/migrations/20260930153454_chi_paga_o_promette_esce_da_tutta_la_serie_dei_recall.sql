-- ═══════════════════════════════════════════════════════════════════════════
-- Chi paga o promette esce da tutta la serie dei recall
--
-- Finche' l'avviso di sollecito era uno solo, chiuderlo per chiave esatta
-- bastava. Ora e' una serie datata — uno per ogni lunedi' e mercoledi' — e
-- `fn_chiudi_alert('recall_red:...')` ne lascerebbe aperti gli altri: il
-- cliente avrebbe pagato e in dashboard resterebbe scritto di sollecitarlo.
--
-- I tre momenti in cui un recall smette di avere senso sono sempre gli stessi:
-- il cliente ha pagato, il cliente ha promesso, la fattura si e' chiusa. Tutti
-- e tre ora chiudono l'intera serie.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  v record;
  v_def text;
begin
  for v in
    select p.oid, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('fn_riallinea_fattura', 'fn_registra_esito', 'fn_porta_a_insoluto')
  loop
    v_def := pg_get_functiondef(v.oid);
    if position('fn_chiudi_alert(''recall_red:''' in v_def) = 0
       and position('fn_chiudi_alert(''recall_yellow:''' in v_def) = 0 then
      continue;
    end if;
    -- La chiusura del rosso diventa la chiusura di tutta la serie; quella del
    -- giallo sparisce perche' la prima la comprende gia'.
    v_def := replace(v_def,
      'perform public.fn_chiudi_alert(''recall_red:'' || p_invoice_id::text);',
      'perform public.fn_chiudi_recall(p_invoice_id);');
    v_def := replace(v_def,
      'perform public.fn_chiudi_alert(''recall_yellow:'' || p_invoice_id::text);',
      '');
    execute v_def;
  end loop;
end $$;

-- Verifica: nessuna delle tre deve piu' chiudere un solo avviso per chiave.
do $$
declare v_resta text;
begin
  select string_agg(p.proname, ', ') into v_resta
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('fn_riallinea_fattura', 'fn_registra_esito', 'fn_porta_a_insoluto')
     and pg_get_functiondef(p.oid) like '%fn_chiudi_alert(''recall_red:%';
  if v_resta is not null then
    raise exception 'Queste chiudono ancora un solo avviso: %', v_resta;
  end if;
end $$;

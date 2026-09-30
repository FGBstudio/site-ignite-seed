-- ═══════════════════════════════════════════════════════════════════════════
-- I solleciti hanno un ritmo, e il sistema lo conosce
--
-- Oggi i recall si fanno «ogni lunedì e mercoledì», a memoria. Le regole vere
-- sono tre, e nessuna delle tre e' scritta da nessuna parte:
--
--   1. sette giorni PRIMA della scadenza → un promemoria verde: sta per
--      scadere. Serve a evitare il sollecito, non a farlo.
--   2. il giorno DOPO la scadenza → arancione: fai recall.
--   3. da li', ogni lunedi' e ogni mercoledi', finche' non arriva il pagamento.
--
-- ── QUANDO IL PAGAMENTO ARRIVA MA NON BASTA ───────────────────────────────
-- La cadenza si ferma lo stesso. Il residuo esce dal giro e si bilancia a fine
-- progetto, col meccanismo degli ammanchi. Nessuno telefona il lunedi' e il
-- mercoledi' per 19,50 euro, ma nessuno deve nemmeno dimenticarseli.
--
-- ── PERCHÉ GLI AVVISI PORTANO LA DATA NEL LORO NOME ───────────────────────
-- `fn_apri_alert` deduplica sulla chiave: riaprendo la stessa chiave non
-- succede niente, ed e' giusto — un avviso non deve moltiplicarsi se la
-- funzione gira tre volte nello stesso giorno. Ma il sollecito del mercoledi'
-- DEVE tornare a farsi vedere anche se quello del lunedi' era stato
-- archiviato: un sollecito rimandato non deve sparire. Quindi la chiave porta
-- la data — `recall_post:<fattura>:<giorno>` — e aprendo quella nuova si
-- chiude la precedente: un avviso vivo per fattura, che pero' ricompare.
--
-- Senza chiuderla, dopo un mese di insoluto la dashboard avrebbe nove avvisi
-- per la stessa fattura e nessuno la guarderebbe piu'.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1 · I due tipi nuovi ──────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                  where t.typname = 'task_alert_type' and e.enumlabel = 'recall_pre_scadenza') then
    alter type public.task_alert_type add value 'recall_pre_scadenza';
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                  where t.typname = 'task_alert_type' and e.enumlabel = 'recall_post_scadenza') then
    alter type public.task_alert_type add value 'recall_post_scadenza';
  end if;
end $$;

-- ── 2 · Chiudere TUTTI i recall di una fattura ────────────────────────────
-- Gli avvisi di sollecito ora sono una serie datata: chiuderne uno per chiave
-- esatta non basta piu'. Questa li chiude tutti, e la chiamano i tre posti in
-- cui un recall smette di avere senso: l'incasso, la promessa, la chiusura.
create or replace function public.fn_chiudi_recall(p_invoice_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_quanti integer;
begin
  update public.task_alerts
     set is_resolved = true, resolved_at = now(), resolved_kind = 'system'
   where is_resolved = false
     and (dedup_key like 'recall_%:' || p_invoice_id::text
          or dedup_key like 'recall_%:' || p_invoice_id::text || ':%');
  get diagnostics v_quanti = row_count;
  return v_quanti;
end;
$function$;

comment on function public.fn_chiudi_recall is
  'Chiude ogni avviso di sollecito di una fattura, compresa la serie datata della cadenza lunedi''/mercoledi''.';

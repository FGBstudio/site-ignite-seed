-- Payments, fase 2 — gli alert, e la regola che non si ripetono.
--
-- Un alert e' lavoro non fatto: resta finche' l'azione non e' compiuta, e si
-- chiude da solo quando il sistema si accorge che e' stata compiuta. Perche'
-- questo funzioni servono due cose che oggi mancano.

-- ── Un alert puo' non avere un autore ────────────────────────────────────────
-- `created_by` era obbligatorio, ma un alert generato da un incasso registrato
-- di notte da un job non ha nessuno che l'abbia scritto. NULL vuol dire «il
-- sistema», e distinguerlo conta: un alert messo da una persona e uno dedotto
-- da un evento non si leggono allo stesso modo.
alter table public.task_alerts alter column created_by drop not null;

-- Una fattura emessa a mano puo' non avere una commessa dietro: l'alert che la
-- riguarda deve poter esistere lo stesso.
alter table public.task_alerts alter column certification_id drop not null;

-- ── Lo stesso evento non genera due alert ────────────────────────────────────
-- Senza una chiave, il job che gira ogni notte ricreerebbe ogni notte lo stesso
-- «questa fattura e' scaduta», e in una settimana la schermata diventa
-- illeggibile proprio mentre il lavoro arretrato cresce.
--
-- La chiave la compone chi crea l'alert e descrive l'EVENTO, non il momento:
-- «billing_due:<tranche>» e' lo stesso fatto oggi e domani.
alter table public.task_alerts add column if not exists dedup_key text;

create unique index if not exists task_alerts_uno_per_evento
  on public.task_alerts (dedup_key)
  where dedup_key is not null and is_resolved = false;

comment on column public.task_alerts.dedup_key is
  'Identifica l''evento che ha generato l''alert. Finche'' l''alert e'' aperto, lo stesso evento non ne crea un secondo.';

/**
 * Apre un alert, se quello stesso lavoro non e' gia' aperto.
 *
 * Restituisce l'id dell'alert (nuovo o gia' esistente). SECURITY DEFINER
 * perche' la chiamano i trigger: chi registra un incasso non ha bisogno del
 * permesso di scrivere alert, e' il sistema che prende nota.
 */
create or replace function public.fn_apri_alert(
  p_tipo public.task_alert_type,
  p_titolo text,
  p_descrizione text,
  p_dedup_key text,
  p_certification_id uuid default null,
  p_invoice_id uuid default null,
  p_rotta text default '/invoice'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- Se c'e' gia' un alert aperto per questo evento, non se ne aggiunge un altro.
  select id into v_id
    from public.task_alerts
   where dedup_key = p_dedup_key and is_resolved = false
   limit 1;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.task_alerts
    (certification_id, invoice_id, alert_type, title, description, dedup_key, target_route, created_by)
  values
    (p_certification_id, p_invoice_id, p_tipo, p_titolo, p_descrizione, p_dedup_key, p_rotta, null)
  returning id into v_id;

  return v_id;
end;
$$;

/**
 * Chiude gli alert di un evento perche' l'azione risulta compiuta.
 *
 * Chiuso dal sistema, non spuntato da qualcuno: `resolved_kind` tiene la
 * differenza, perche' «il lavoro e' stato fatto» e «qualcuno ha tolto la
 * notifica» sono due cose diverse quando si guarda indietro.
 */
create or replace function public.fn_chiudi_alert(p_dedup_key text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quanti integer;
begin
  update public.task_alerts
     set is_resolved = true,
         resolved_at = now(),
         resolved_kind = 'system'
   where dedup_key = p_dedup_key and is_resolved = false;
  get diagnostics v_quanti = row_count;
  return v_quanti;
end;
$$;

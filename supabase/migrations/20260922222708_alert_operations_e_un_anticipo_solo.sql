-- ═══════════════════════════════════════════════════════════════════════════
-- Fase 2 e 3.A: l'alert per Operations, e l'anticipo che e' uno solo.
--
-- Due cose mancavano rispetto alla specifica.
--
-- La prima: all'approvazione partivano due alert «in simultanea», uno a
-- Payments e uno a Operations. Quello per Operations non e' mai nato — il tipo
-- esisteva nell'enum, nelle etichette e nelle icone, ma nessuna funzione lo
-- scriveva. Zero righe a database, e di conseguenza la Fase 3.A non partiva
-- affatto: nessuno diceva a Laura di assegnare un PM.
--
-- La seconda: «la prima tranche passa in stato Due». Il trigger ne promuoveva
-- invece tutte quelle senza passo agganciato, che su uno schema a tranche
-- libere vuol dire l'intera offerta esigibile il giorno della firma.
-- Ora e' una sola, la prima per ordine.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.trg_quotazione_approvata_payments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anticipo record;
begin
  if new.status is distinct from 'quotation_approved'
     or old.status is not distinct from new.status then
    return new;
  end if;

  -- ── L'anticipo, e solo quello ────────────────────────────────────────────
  -- Prima la tranche esplicitamente legata alla firma; se lo schema non ne ha
  -- una, la prima per ordine fra quelle che non aspettano un passo di
  -- progetto. Le altre restano pending: le sbloccherà il loro evento.
  select * into v_anticipo
    from public.cert_payment_milestones
   where certification_id = new.id
     and tranche_state = 'pending'
     and (trigger_event = 'quotation_signed' or step_id is null)
   order by (trigger_event = 'quotation_signed') desc nulls last,
            tranche_order nulls last,
            created_at
   limit 1;

  if found then
    update public.cert_payment_milestones
       set tranche_state = 'due'
     where id = v_anticipo.id;
  end if;

  -- ── Payments: emetti la prima fattura ────────────────────────────────────
  perform public.fn_apri_alert(
    'quotation_to_payments',
    'Quotazione approvata — emetti la prima fattura · ' || coalesce(new.name, ''),
    case
      when v_anticipo.id is not null
        then 'Anticipo alla firma esigibile: ' || coalesce(v_anticipo.name, 'tranche')
             || ' · ' || to_char(coalesce(v_anticipo.amount, 0), 'FM999G999G990D00') || ' EUR.'
      else 'Nessuna tranche definita sulla quotazione: emetti la fattura indicando gli importi.'
    end,
    'quotation_to_payments:' || new.id::text,
    new.id,
    null
  );

  -- ── Operations: assegna un PM ────────────────────────────────────────────
  -- Resta aperto finche' il progetto non ha un PM: e' «lavoro non fatto», e
  -- si chiude da solo quando qualcuno lo fa.
  if new.pm_id is null then
    perform public.fn_apri_alert(
      'quotation_to_operations',
      'Quotazione approvata — assegna un PM · ' || coalesce(new.name, ''),
      'Il progetto e stato venduto e non ha ancora un project manager.',
      'quotation_to_operations:' || new.id::text,
      new.id,
      null
    );
  end if;

  return new;
end;
$$;

-- ── L'alert di Operations si chiude quando il PM c'e' ──────────────────────
create or replace function public.trg_pm_assegnato_chiude_alert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.pm_id is not null and old.pm_id is distinct from new.pm_id then
    perform public.fn_chiudi_alert('quotation_to_operations:' || new.id::text);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cert_pm_assegnato on public.certifications;
create trigger trg_cert_pm_assegnato
  after update of pm_id on public.certifications
  for each row execute function public.trg_pm_assegnato_chiude_alert();

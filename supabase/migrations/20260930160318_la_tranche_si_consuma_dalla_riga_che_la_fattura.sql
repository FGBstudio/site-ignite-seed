-- ═══════════════════════════════════════════════════════════════════════════
-- La tranche si consuma dalla riga che la fattura
--
-- Il trigger che segna una tranche come «fatturata» e chiude il suo avviso
-- stava sulla fattura e leggeva `new.tranche_id`. Quella colonna non c'e' piu',
-- e il trigger faceva fallire ogni emissione.
--
-- Il posto giusto e' la riga: e' li' che vive il legame, ed e' l'unico punto
-- che sa rispondere anche quando una fattura ne consuma due. Prima, con due
-- tranche sulla stessa fattura, la seconda sarebbe rimasta «da emettere» e
-- l'avviso sarebbe restato aperto — con qualcuno che la fatturava una seconda
-- volta.
--
-- E si disfa: cancellando una riga la tranche torna da fatturare. Un legame che
-- si puo' solo creare e' un legame che prima o poi mente.
-- ═══════════════════════════════════════════════════════════════════════════

drop trigger if exists trg_invoices_consuma_tranche on public.invoices;

create or replace function public.trg_riga_consuma_tranche()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cert uuid;
begin
  if tg_op = 'DELETE' then
    if old.tranche_id is null then return old; end if;
    -- Torna da fatturare solo se nessun'altra riga la fattura ancora.
    if not exists (select 1 from public.invoice_righe r
                    where r.tranche_id = old.tranche_id and r.id <> old.id) then
      update public.cert_payment_milestones
         set tranche_state = 'due'
       where id = old.tranche_id;
    end if;
    return old;
  end if;

  if new.tranche_id is null then
    return new;
  end if;

  update public.cert_payment_milestones
     set tranche_state = 'invoiced'
   where id = new.tranche_id;

  perform public.fn_chiudi_alert('billing_due:' || new.tranche_id::text);

  select m.certification_id into v_cert
    from public.cert_payment_milestones m where m.id = new.tranche_id;
  if v_cert is not null then
    perform public.fn_chiudi_alert('quotation_to_payments:' || v_cert::text);
  end if;

  return new;
end;
$function$;

create trigger trg_invoice_righe_consuma_tranche
  after insert or delete on public.invoice_righe
  for each row execute function public.trg_riga_consuma_tranche();

drop function if exists public.trg_fattura_consuma_tranche();
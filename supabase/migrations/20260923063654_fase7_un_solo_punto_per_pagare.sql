-- ═══════════════════════════════════════════════════════════════════════════
-- Fase 7 · Una sola porta per registrare un pagamento
--
-- `fn_paga_fattura_passiva` esisteva gia' ed e' quella che la UI chiama da
-- mesi, ma toccava solo la fattura. Io ne avevo aggiunta una seconda che
-- muoveva anche la cassa: due porte per lo stesso gesto sono un bug che
-- aspetta il suo turno — si paga dalla vecchia e la timeline non si accorge.
--
-- La porta resta una: quella che la UI conosce, che ora fa tutto il lavoro.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.fn_paga_fattura_passiva(p_id uuid, p_data date default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_data date := coalesce(p_data, current_date);
  v_po   uuid;
begin
  if not coalesce(public.is_admin(auth.uid()), false) then
    raise exception 'Solo l''amministrazione registra i pagamenti ai fornitori';
  end if;

  update public.passive_invoices
     set state = 'paid',
         paid_date = v_data
   where id = p_id
  returning po_id into v_po;

  if not found then raise exception 'Fattura passiva inesistente'; end if;

  -- Azione D: le righe di cassa agganciate a questa fattura diventano un
  -- fatto. `reale` e' cio' che la WBS legge per disegnarle a linea piena.
  update public.uscite_previste
     set stato = 'pagata',
         data_effettiva = v_data,
         data_prevista = v_data,
         data_prevista_fonte = 'reale'
   where passive_invoice_id = p_id
     and stato <> 'annullata';

  if v_po is not null then
    perform public.fn_allarma_pay_when_paid(v_po);
  end if;
end;
$function$;

-- La seconda porta non serve piu'.
drop function if exists public.fn_registra_pagamento_passivo(uuid, date);

-- `passive_invoices.due_date` e' una colonna generata: ricezione piu' termini.
-- L'approvazione tentava di scriverla e sarebbe fallita alla prima fattura.
-- Ora la scadenza si sposta come si sposta davvero: cambiando i termini.
create or replace function public.fn_approva_fattura_passiva(
  p_invoice  uuid,
  p_scadenza date default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  f      record;
  po     record;
  v_scad date;
  v_n    integer;
begin
  if auth.uid() is not null and not coalesce(public.is_admin(auth.uid()), false) then
    raise exception 'Solo un ADMIN puo approvare una fattura passiva';
  end if;

  select * into f from public.passive_invoices where id = p_invoice;
  if f.id is null then raise exception 'Fattura % inesistente', p_invoice; end if;
  if f.po_condizione_id is null then
    raise exception 'La fattura % non e abbinata a nessuna rata d''ordine', coalesce(f.number, p_invoice::text);
  end if;

  select o.* into po
    from public.ops_purchase_orders o
    join public.po_condizioni c on c.po_id = o.id
   where c.id = f.po_condizione_id;

  -- La scadenza e' quella della fattura, salvo accordo diverso: in quel caso
  -- si spostano i termini, perche' la data e' calcolata da quelli.
  v_scad := coalesce(p_scadenza, f.due_date);

  update public.passive_invoices
     set stato_verifica = 'verificata',
         verificata_da  = coalesce(verificata_da, auth.uid()),
         verificata_il  = coalesce(verificata_il, now()),
         terms_days     = case when p_scadenza is not null
                               then (p_scadenza - received_date)
                               else terms_days end,
         po_id          = coalesce(po_id, po.id)
   where id = p_invoice;

  -- Le righe di cassa della rata prendono il documento e la sua scadenza.
  -- «contratto» dice al motore delle date di non dedurle piu': ora la data
  -- e' un impegno, non una previsione.
  update public.uscite_previste u
     set passive_invoice_id = p_invoice,
         riferimento        = coalesce(f.number, u.riferimento),
         data_documento     = coalesce(f.issue_date, f.received_date),
         data_prevista      = v_scad,
         data_prevista_fonte = 'contratto',
         stato              = 'approvata'
   where u.po_condizione_id = f.po_condizione_id
     and u.stato in ('prevista','approvata');

  get diagnostics v_n = row_count;

  if po.id is not null then
    perform public.fn_allarma_pay_when_paid(po.id);
  end if;

  return v_n;
end;
$$;

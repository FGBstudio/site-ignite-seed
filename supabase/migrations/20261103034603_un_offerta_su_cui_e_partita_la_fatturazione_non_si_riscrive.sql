-- ═══════════════════════════════════════════════════════════════════════════
-- Un'offerta su cui è partita la fatturazione non si riscrive
--
-- «Edit» su un'offerta non modifica le righe: le **cancella e le riscrive**. È
-- una scelta deliberata e sensata — una certificazione ancora in offerta non ha
-- dietro né fatture né lavoro svolto, e riscriverla da capo costa meno che
-- inseguire quale dei venti campi è cambiato.
--
-- Il guaio è l'«ancora». `invoices.certification_id` è `on delete set null`:
-- quando la riga vecchia se ne va, la fattura **resta nel registro senza
-- progetto**, e la riga nuova nasce con un id che nessuno le ricollega. Nessun
-- errore, nessun avviso: solo un progetto che da un momento all'altro risulta
-- meno fatturato di quanto sia, e una fattura orfana in mezzo alle altre.
--
-- Non è teorico. Al momento di scrivere questa migrazione due fatture erano
-- appese a certificazioni ancora in stato `quotation`, cioè esattamente quelle
-- che mostrano il bottone Edit: la **3.050** su Jio World Plaza e la **2.989** su
-- Wynn Palace.
--
-- La regola che mette il database è quella detta da Matteo: una volta che la
-- fatturazione è partita, l'offerta non si riscrive più. Due divieti, perché
-- «riscrivere» ha due forme:
--
--   • **cancellare** la certificazione — è come lavora Edit, ed è la strada che
--     stacca la fattura;
--   • **cambiare gli importi** — totale, fee dei servizi, fee dell'ente, valuta.
--     Una fattura emessa su un totale di ieri non si giustifica con un totale di
--     oggi, e se l'importo va corretto si corregge con una nota di credito.
--
-- Resta permesso tutto il resto: la data dell'ordine, le note, il PM, lo stato,
-- la timeline. Il dialogo «Complete» scrive solo `po_sign_date` e
-- `quotation_notes`, quindi continua a funzionare come prima.
--
-- Il messaggio nomina le fatture, perché chi lo legge deve poter andare a
-- vederle invece di indovinare quante e quali.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.trg_offerta_fatturata_non_si_riscrive()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_quali text;
  v_quante integer;
begin
  select count(*), string_agg(i.number, ', ' order by i.number)
    into v_quante, v_quali
    from public.invoices i
   where i.certification_id = old.id;

  if coalesce(v_quante, 0) = 0 then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    raise exception
      'Su «%» è già partita la fatturazione (% %): l''offerta non si cancella, perché la fattura resterebbe senza progetto.',
      coalesce(old.name, '?'),
      case when v_quante = 1 then 'fattura' else 'fatture' end,
      v_quali;
  end if;

  if new.total_fees    is distinct from old.total_fees
     or new.services_fees is distinct from old.services_fees
     or new.gbci_fees     is distinct from old.gbci_fees
     or new.currency      is distinct from old.currency then
    raise exception
      'Su «%» è già stata emessa % %: gli importi dell''offerta non si cambiano più. Per correggere un importo serve una nota di credito.',
      coalesce(old.name, '?'),
      case when v_quante = 1 then 'la fattura' else 'le fatture' end,
      v_quali;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_offerta_fatturata_non_si_riscrive on public.certifications;

create trigger trg_offerta_fatturata_non_si_riscrive
  before delete or update on public.certifications
  for each row execute function public.trg_offerta_fatturata_non_si_riscrive();

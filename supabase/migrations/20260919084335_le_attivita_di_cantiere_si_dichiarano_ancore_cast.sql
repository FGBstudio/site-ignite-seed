-- `ancora` e' un enum (`crono_ancora`), non testo: senza il cast il trigger
-- sarebbe morto al primo inserimento, che e' esattamente il momento in cui
-- serve. La funzione continua a ragionare in testo — cosi' resta leggibile e
-- riusabile — e la conversione avviene dove il valore viene scritto.
create or replace function public.trg_evento_deduce_ancora()
returns trigger
language plpgsql
as $$
declare
  v_ancora text;
begin
  if new.ancora is null and new.nome is not null then
    v_ancora := public.fn_ancora_da_nome(new.nome);
    if v_ancora is not null then
      new.ancora := v_ancora::public.crono_ancora;
    end if;
  end if;
  return new;
end;
$$;

-- L'ancora si assegna solo se quel posto e' libero.
--
-- `crono_eventi_ancora_unica` impone una sola ancora per tipo in ogni
-- cronoprogramma, e ha ragione: due «handover» vorrebbero dire due consegne.
-- Ma un trigger che assegna l'ancora a occhi chiusi farebbe fallire
-- l'inserimento di una seconda attivita' chiamata «Tender» — un'attivita'
-- legittima, rifiutata per un'etichetta che il sistema ha aggiunto da solo.
--
-- Quindi: si deduce l'ancora dal nome, ma la si scrive solo se nessun altro
-- evento di quel cronoprogramma la porta gia'. Chi arriva primo la prende; agli
-- altri resta il nome, che e' quello che il PM ha scritto e che nessuno tocca.
create or replace function public.trg_evento_deduce_ancora()
returns trigger
language plpgsql
as $$
declare
  v_ancora text;
begin
  if new.ancora is not null or new.nome is null then
    return new;
  end if;

  v_ancora := public.fn_ancora_da_nome(new.nome);
  if v_ancora is null then
    return new;
  end if;

  -- Il posto e' gia' occupato: si lascia stare. Meglio un'attivita' senza
  -- etichetta che un salvataggio che si rifiuta.
  if exists (
    select 1 from public.cronoprogramma_eventi e
     where e.cronoprogramma_id = new.cronoprogramma_id
       and e.ancora = v_ancora::public.crono_ancora
       and e.id is distinct from new.id
  ) then
    return new;
  end if;

  new.ancora := v_ancora::public.crono_ancora;
  return new;
end;
$$;

-- Il recupero delle attivita' gia' scritte e' stato eseguito a parte,
-- impersonando un amministratore (il trigger che protegge i progetti fermi
-- respinge gli altri) e prendendo, per ogni cronoprogramma e per ogni tipo di
-- ancora, la prima attivita' per ordine:
--
--   for r in
--     select distinct on (e.cronoprogramma_id, public.fn_ancora_da_nome(e.nome))
--            e.id, public.fn_ancora_da_nome(e.nome) as ancora_dedotta
--       from public.cronoprogramma_eventi e
--      where e.ancora is null
--        and public.fn_ancora_da_nome(e.nome) is not null
--        and not exists (
--          select 1 from public.cronoprogramma_eventi g
--           where g.cronoprogramma_id = e.cronoprogramma_id
--             and g.ancora = public.fn_ancora_da_nome(e.nome)::public.crono_ancora)
--      order by e.cronoprogramma_id, public.fn_ancora_da_nome(e.nome), e.ordine
--   loop … end loop;
--
-- Seguito da `fn_refresh_timeline_dates` su ogni commessa con cronoprogramma:
-- le date derivate della scaletta FGB non avevano mai avuto un'ancora a cui
-- agganciarsi, e solo adesso si potevano calcolare.

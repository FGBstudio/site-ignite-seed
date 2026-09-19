-- Un'attivita' che si chiama «Handover» È l'handover.
--
-- Il resto del sistema cerca l'inizio cantiere e la consegna per `ancora`:
-- la tabella PROJECTS, la colonna HANDOVER, il calcolo delle date derivate
-- della scaletta FGB. Le attivita' create da un modello, importate da un gantt
-- o scritte a mano arrivavano pero' con `ancora` nulla — il nome c'era, il
-- significato no.
--
-- Effetto: una PROJECT TIMELINE compilata da cima a fondo risultava «date di
-- cantiere non ancora compilate», l'handover restava vuoto in tabella e i passi
-- FGB ancorati al cantiere non si calcolavano mai. Dieci attivita' su dieci
-- riempite, e il sistema si comportava come se non ce ne fosse nessuna.
--
-- La regola sta qui e non nei tre punti che inseriscono: un trigger vale per il
-- modello, per l'import, per l'inserimento manuale e per quello che verra' dopo.
-- Scritta nei chiamanti, il quarto se la dimenticherebbe.
--
-- NOTA: questa versione scrive `ancora` senza cast e senza controllare il
-- vincolo di unicita'. Le due migrazioni successive (…084335 e …084400) la
-- correggono: `ancora` e' un enum, e per ogni cronoprogramma puo' esisterne una
-- sola per tipo.

/**
 * Riconosce l'ancora dal nome dell'attivita'.
 *
 * Solo se `ancora` non e' gia' dichiarata: quello che una persona ha scelto
 * esplicitamente non si tocca. I nomi riconosciuti sono quelli dei modelli e
 * dei gantt reali da cui i modelli sono stati ricavati.
 */
create or replace function public.fn_ancora_da_nome(p_nome text)
returns text
language sql
immutable
as $$
  select case
    -- «Construction End (Handover)» e «Handover» sono la stessa cosa; una
    -- «Construction end» senza handover invece e' solo la fine dei lavori.
    when p_nome ilike '%handover%' or p_nome ilike '%consegna%'        then 'handover'
    when p_nome ilike '%construction start%'
      or p_nome ilike '%site start%'
      or p_nome ilike '%inizio cantiere%'
      or p_nome ilike '%start of works%'                               then 'construction_start'
    when p_nome ilike 'tender%' or p_nome ilike '%lancio gara%'
      or p_nome ilike '%bando%'                                        then 'lancio_gara'
    else null
  end;
$$;

create or replace function public.trg_evento_deduce_ancora()
returns trigger
language plpgsql
as $$
begin
  if new.ancora is null and new.nome is not null then
    new.ancora := public.fn_ancora_da_nome(new.nome);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crono_eventi_ancora on public.cronoprogramma_eventi;
create trigger trg_crono_eventi_ancora
  before insert or update of nome, ancora on public.cronoprogramma_eventi
  for each row execute function public.trg_evento_deduce_ancora();

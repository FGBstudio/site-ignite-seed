-- Il nome di una persona: `display_name` non si salta.
--
-- Il difetto, visibile in interfaccia: Shikha Gadru compariva col suo nome e
-- Matteo Martignoni come «m.martignoni@fgb-studio.com», seduti nella stessa
-- lista. Non era un dato mancante — il nome c'era, in `display_name`, e
-- l'ordine di lettura `coalesce(full_name, email)` lo scavalcava.
--
-- Su 28 profili, 13 hanno il nome SOLO in `display_name`.
--
-- Lato frontend la regola vive adesso in `src/lib/nomePersona.ts`, in un posto
-- solo invece delle diciannove copie che c'erano. Qui si sistema l'unica
-- funzione del database che partecipava allo stesso errore: il nome del PM nel
-- portafoglio.
--
-- La sostituzione e' testuale sulla definizione corrente invece che una
-- riscrittura della funzione: `fn_portafoglio_siti` e' lunga, cambia spesso, e
-- ricopiarla per cambiare una `coalesce` significa portarsi dietro una copia
-- che invecchia. Se la stringa non c'e' piu', non fa nulla e non mente.

do $$
declare
  v_def text;
  v_nuovo text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'fn_portafoglio_siti';

  if v_def is null then
    raise notice 'fn_portafoglio_siti non esiste: niente da correggere.';
    return;
  end if;

  v_nuovo := replace(
    v_def,
    'coalesce(pr.full_name, pr.email)',
    'coalesce(nullif(trim(pr.full_name), ''''), nullif(trim(pr.display_name), ''''), pr.email)'
  );

  if v_nuovo = v_def then
    -- Gia' corretta, oppure la riga e' cambiata: in entrambi i casi non si
    -- tocca niente. Una migrazione che non trova cio' che cerca deve stare
    -- ferma, non indovinare.
    raise notice 'Nessuna sostituzione da fare su fn_portafoglio_siti.';
    return;
  end if;

  execute v_nuovo;
end $$;

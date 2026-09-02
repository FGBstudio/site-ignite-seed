-- ============================================================================
-- Energy e Air: il livello e' Pending oppure Online
--
-- Le due voci di catalogo avevano un livello solo, "Completed", che descrive
-- un lavoro finito e non un impianto che funziona: un progetto puo' essere
-- consegnato e i sensori muti.
--
-- La medaglia, per questi due, non e' una medaglia: un progetto di
-- monitoraggio non si certifica, si accende. Ha quindi due soli esiti
-- possibili, e sono uno stato di fatto, non un obiettivo da raggiungere.
--
--   Pending  i sensori sono previsti o installati, non trasmettono ancora
--   Online   trasmettono: per un progetto di monitoraggio e' il traguardo,
--            l'equivalente del certificato per una LEED
--
-- `outcome_model` resta 'none' di proposito: e' il campo che distingue i
-- servizi dalle certificazioni vere, e da cui dipendono l'etichetta
-- "Energy — Greeny" nel selettore e il raggruppamento in fondo all'elenco.
-- Cambiarlo per far comparire due livelli sposterebbe quelle voci fra le
-- certificazioni, dove non stanno.
-- ============================================================================

insert into public.cert_catalog_levels (catalog_id, level, order_index)
select k.id, v.level, v.order_index
  from public.cert_catalog k
 cross join (values ('Pending', 10), ('Online', 20)) as v(level, order_index)
 where k.scheme in ('Energy', 'Air')
   and not exists (
     select 1 from public.cert_catalog_levels l
      where l.catalog_id = k.id and l.level = v.level
   );

-- L'unica riga fuori vocabolario. "Completed" per un impianto di monitoraggio
-- voleva dire che era finito e trasmetteva: e' Online.
--
-- Il trigger che blocca le modifiche ai progetti sospesi si spegne per la
-- durata della transazione: qui non si cambia lo stato di un progetto, si
-- corregge una parola.
alter table public.certifications disable trigger trg_enforce_cert_not_on_hold;

update public.certifications
   set cert_level = 'Online',
       updated_at = now()
 where cert_type in ('Energy', 'Air')
   and btrim(coalesce(cert_level, '')) = 'Completed';

alter table public.certifications enable trigger trg_enforce_cert_not_on_hold;

-- "Completed" esce dal vocabolario solo DOPO aver spostato chi lo usava,
-- altrimenti il trigger di validazione rifiuterebbe la riga.
delete from public.cert_catalog_levels l
 using public.cert_catalog k
 where l.catalog_id = k.id
   and k.scheme in ('Energy', 'Air')
   and l.level = 'Completed';

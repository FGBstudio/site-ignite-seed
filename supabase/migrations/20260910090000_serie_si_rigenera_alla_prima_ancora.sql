-- ============================================================================
-- La serie non nasceva mai, nell'ordine reale
--
-- ── Il difetto ────────────────────────────────────────────────────────────
--
-- Il PM crea il cronoprogramma col solo handover contrattuale — l'unica data
-- che ha al kickoff — poi genera la timeline, e solo dopo, quando il GC
-- consegna il gantt, arriva il construction start.
--
-- Ma la serie dei report si generava alla materializzazione, quando l'ancora
-- di inizio era ancora nulla, e nessuno la rigenerava all'arrivo del dato: il
-- GC Support restava con zero report per sempre.
--
-- Nei test non si vedeva, perche' inserivo il construction start prima di
-- agganciare le certificazioni — un ordine che nella realta' non capita. E' il
-- tipo di errore che sopravvive a una batteria di prove verdi: ogni pezzo
-- funzionava, era la sequenza a non essere mai stata provata per intero.
--
-- ── La correzione ─────────────────────────────────────────────────────────
--
-- La prima compilazione di un'ancora rigenera anche la serie. Non serve per il
-- caso "l'ancora si sposta": quello passa da proposta e conferma, e
-- `fn_conferma_cascata` la rigenera gia'.
-- ============================================================================
create or replace function public.fn_crono_mirror_handover()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_data  date;
  v_prec  date;
  v_cert  record;
begin
  if new.ancora is null then return new; end if;

  v_data := coalesce(new.data_effettiva, new.data_pianificata);
  if v_data is null then return new; end if;

  v_prec := case when tg_op = 'UPDATE'
                 then coalesce(old.data_effettiva, old.data_pianificata) end;
  if v_prec is not distinct from v_data then return new; end if;

  for v_cert in
    select c.id, c.pm_id, c.on_hold, c.handover_date
      from public.certifications c
     where c.cronoprogramma_id = new.cronoprogramma_id
  loop
    if coalesce(v_cert.on_hold, false) then continue; end if;

    -- Prima compilazione: non e' uno spostamento, e' l'asse che nasce.
    -- Si applica, senza proposta.
    if v_prec is null then
      if new.ancora = 'handover' and v_cert.handover_date is distinct from v_data then
        update public.certifications set handover_date = v_data where id = v_cert.id;
      else
        perform public.fn_refresh_timeline_dates(v_cert.id);
      end if;
      -- E la serie si genera adesso, che l'ancora di inizio finalmente c'e'.
      perform public.fn_genera_serie(v_cert.id);
      continue;
    end if;

    insert into public.cronoprogramma_proposte
      (cronoprogramma_id, certification_id, evento_id, ancora,
       data_precedente, data_nuova, fonte, proposta_da)
    values
      (new.cronoprogramma_id, v_cert.id, new.id, new.ancora,
       v_prec, v_data, coalesce(new.fonte, 'fonte non indicata'), new.aggiornata_da)
    on conflict (certification_id, ancora) where stato = 'in_sospeso'
    do update set data_nuova    = excluded.data_nuova,
                  data_precedente = coalesce(public.cronoprogramma_proposte.data_precedente, excluded.data_precedente),
                  fonte         = excluded.fonte,
                  proposta_da   = excluded.proposta_da,
                  proposta_il   = now();
  end loop;

  return new;
end;
$function$;

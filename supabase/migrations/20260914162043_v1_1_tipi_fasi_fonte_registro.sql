-- ============================================================================
-- v1.1 — tipi di progetto, fasi con durata, fonte facoltativa,
--        registro che nomina la riga spostata
--
-- Specifica: specifica-v1.1-rinomine-tipi-ocr.md §2, §3, §8, §11.
-- ============================================================================

-- ── 1 · Il tipo di progetto ───────────────────────────────────────────────
--
-- La PROJECT TIMELINE ha un tipo che decide quali fasi vengono proposte:
-- progettazione+realizzazione, o sola costruzione (consulenza al GC).
-- Il terzo tipo della specifica, EXISTING, non sta qui: un progetto su
-- edificio esistente non ha una PROJECT TIMELINE, quindi il suo posto e'
-- l'override sulla certificazione, sotto.
alter table public.cronoprogrammi
  add column if not exists tipo text not null default 'design_construction'
  constraint cronoprogrammi_tipo_check
  check (tipo in ('design_construction', 'construction'));

comment on column public.cronoprogrammi.tipo IS
  'Cosa copre la PROJECT TIMELINE: progettazione+realizzazione o sola costruzione. Decide il template proposto, non lo schema dei dati.';

-- Il catalogo propone il tipo, il PM puo' correggerlo: un ID+C sul cantiere
-- di un altro e' CONSTRUCTION anche se la scaletta direbbe il contrario, e
-- l'override e' il posto dove quella conoscenza si scrive.
alter table public.certifications
  add column if not exists project_tipo text
  constraint certifications_project_tipo_check
  check (project_tipo in ('design_construction', 'construction', 'existing'));

comment on column public.certifications.project_tipo IS
  'Override del tipo di progetto proposto dal catalogo. EXISTING = niente PROJECT TIMELINE ne'' gate: si va dritti alla HQ FGB TIMELINE.';

-- ── 2 · Le fasi hanno una durata ──────────────────────────────────────────
--
-- Una fase va da data_pianificata a data_fine; una milestone ha inizio=fine
-- e lascia data_fine vuota. La famiglia serve al grafico e allo Status
-- derivato: e' la legenda del cronoprogramma greco, fatta colonna.
alter table public.cronoprogramma_eventi
  add column if not exists data_fine date,
  add column if not exists famiglia text
  constraint crono_eventi_famiglia_check
  check (famiglia is null or famiglia in ('design', 'permitting', 'construction', 'terze_parti'));

alter table public.cronoprogramma_eventi
  drop constraint if exists crono_eventi_fine_dopo_inizio;
alter table public.cronoprogramma_eventi
  add constraint crono_eventi_fine_dopo_inizio
  check (data_fine is null or data_pianificata is null or data_fine >= data_pianificata);

comment on column public.cronoprogramma_eventi.data_fine IS
  'Fine della fase. Vuota sulle milestone: una milestone e'' un istante, non un intervallo.';

-- ── 3 · La fonte non e' piu' obbligatoria ─────────────────────────────────
--
-- v1.1 §3 sostituisce v1 §3.5: la fonte resta consigliata e l'interfaccia la
-- chiede, ma non blocca il salvataggio. Un vincolo che costringe a inventare
-- "manuale" pur di salvare non produce provenienza: produce rumore uniforme.
alter table public.cronoprogramma_eventi
  drop constraint if exists crono_eventi_data_ha_fonte;

alter table public.cronoprogramma_registro
  alter column fonte drop not null;

-- ── 4 · Il registro nomina la riga spostata ───────────────────────────────
--
-- Difetto rilevato nella demo: il registro diceva sempre "handover" anche
-- quando si spostava un'altra riga. Il nome si congela qui dentro perche' la
-- voce e' storia: se la riga viene rinominata o cancellata, la voce deve
-- continuare a dire cosa si sposto' quel giorno.
alter table public.cronoprogramma_registro
  add column if not exists evento_nome text;

update public.cronoprogramma_registro r
   set evento_nome = e.nome
  from public.cronoprogramma_eventi e
 where e.id = r.evento_id
   and r.evento_nome is null;

-- ── 5 · Il gate rispetta l'override ───────────────────────────────────────
create or replace function public.fn_cert_richiede_cronoprogramma(p_certification_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case
    -- L'override del PM vince sul catalogo: EXISTING non ha gate,
    -- gli altri due tipi lo hanno per definizione.
    when (select project_tipo from public.certifications where id = p_certification_id) = 'existing'
      then false
    when (select project_tipo from public.certifications where id = p_certification_id)
         in ('design_construction', 'construction')
      then true
    -- Nessun override: decide la scaletta, come in v1 — ha un passo
    -- agganciato a un'ancora di cantiere?
    else exists (
      select 1 from public.cert_timeline_steps s
       where s.timeline_key = public.fn_timeline_key_for_cert(p_certification_id)
         and s.ancora is not null
    )
  end;
$function$;

create or replace function public.fn_cert_gate(p_certification_id uuid)
returns table (bloccata boolean, motivo text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    public.fn_cert_richiede_cronoprogramma(p_certification_id)
      and (select cronoprogramma_id from public.certifications where id = p_certification_id) is null,
    case
      when public.fn_cert_richiede_cronoprogramma(p_certification_id)
       and (select cronoprogramma_id from public.certifications where id = p_certification_id) is null
      then 'Questo progetto si innesta su un cantiere. Compila prima la PROJECT TIMELINE del sito, poi torna qui: Construction Start e Handover li erediterai da li''.'
    end;
$function$;

-- ── 6 · Ogni modifica di riga lascia traccia ──────────────────────────────
--
-- Le righe con ancora passano dalla cascata proposta-e-conferma, e la voce di
-- registro la scrive la conferma. Le righe libere non hanno proposte: la
-- traccia la scrive questo trigger, senza derivati economici — quelli
-- appartengono solo all'handover.
create or replace function public.fn_crono_registro_riga()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_old date;
  v_new date;
  v_chi uuid;
begin
  if new.ancora is not null then return new; end if;

  v_old := coalesce(old.data_effettiva, old.data_pianificata);
  v_new := coalesce(new.data_effettiva, new.data_pianificata);

  -- La prima compilazione non e' uno spostamento: e' l'asse che nasce.
  if v_old is null then return new; end if;
  if v_old is not distinct from v_new
     and old.data_fine is not distinct from new.data_fine then
    return new;
  end if;

  v_chi := coalesce(new.aggiornata_da, auth.uid());
  if v_chi is null then return new; end if;

  insert into public.cronoprogramma_registro
    (cronoprogramma_id, evento_id, evento_nome, chi,
     data_precedente, data_nuova, fonte, scostamento_giorni)
  values
    (new.cronoprogramma_id, new.id, new.nome, v_chi,
     v_old, v_new, new.fonte,
     case when v_new is not null then (v_new - v_old)::integer end);

  return new;
end;
$function$;

drop trigger if exists trg_crono_registro_riga on public.cronoprogramma_eventi;
create trigger trg_crono_registro_riga
  after update on public.cronoprogramma_eventi
  for each row execute function public.fn_crono_registro_riga();

-- ── 7 · La conferma nomina la riga, e monetizza solo l'handover ───────────
create or replace function public.fn_conferma_cascata(p_proposta_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  p        record;
  v_verd   record;
  v_reg_id uuid;
  v_nome   text;
begin
  select * into p from public.cronoprogramma_proposte where id = p_proposta_id and stato = 'in_sospeso';
  if p.id is null then
    raise exception 'Proposta inesistente o gia'' trattata';
  end if;

  select nome into v_nome from public.cronoprogramma_eventi where id = p.evento_id;

  if p.ancora = 'handover' then
    select * into v_verd from public.fn_cascata_verdetto(p.certification_id, p.data_nuova);
    update public.certifications
       set handover_date = p.data_nuova
     where id = p.certification_id;
  end if;

  perform public.fn_refresh_timeline_dates(p.certification_id);
  perform public.fn_genera_serie(p.certification_id);

  -- I derivati economici solo sull'handover: e' la data che sposta la fine
  -- della commessa e il numero dei report. Per le altre righe la voce dice
  -- cosa si e' mosso e basta — un numero finto accanto a un fatto vero
  -- toglierebbe credibilita' a entrambi.
  insert into public.cronoprogramma_registro
    (cronoprogramma_id, evento_id, evento_nome, chi, data_precedente, data_nuova, fonte,
     scostamento_giorni, scostamento_baseline_giorni, fine_stimata,
     scadenza_contratto, report_contrattuali, report_proiettati, note)
  values
    (p.cronoprogramma_id, p.evento_id,
     coalesce(v_nome, replace(p.ancora::text, '_', ' ')),
     coalesce(auth.uid(), p.proposta_da),
     p.data_precedente, p.data_nuova, p.fonte,
     (p.data_nuova - p.data_precedente)::integer,
     case when p.ancora = 'handover' then v_verd.scostamento_baseline end,
     case when p.ancora = 'handover' then v_verd.fine_stimata end,
     case when p.ancora = 'handover' then v_verd.scadenza_contratto end,
     case when p.ancora = 'handover' then v_verd.report_contrattuali end,
     case when p.ancora = 'handover' then v_verd.report_proiettati end,
     (select name from public.certifications where id = p.certification_id))
  returning id into v_reg_id;

  update public.cronoprogramma_proposte
     set stato = 'confermata', confermata_da = auth.uid(), confermata_il = now()
   where id = p_proposta_id;

  return v_reg_id;
end;
$function$;

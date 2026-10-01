-- ═══════════════════════════════════════════════════════════════════════════
-- Il PM può annotare i suoi progetti
--
-- `project_tasks` si poteva scrivere in tre modi: da amministratore, come
-- assegnatario di una riga che **esiste già**, o come membro di una squadra. Un
-- PM che non è amministratore non poteva **creare** niente — nemmeno un appunto
-- sul progetto di cui è responsabile.
--
-- Finché gli appunti si scrivevano da una schermata usata dagli amministratori
-- il buco non si vedeva. Appena le note nascono cliccando sulla settimana del
-- proprio progetto, è la cosa che impedisce al PM di usare la funzione fatta per
-- lui: il salvataggio sparirebbe in silenzio, perché una INSERT bloccata da RLS
-- non dice «non hai il permesso», dice «zero righe».
--
-- La condizione è la più stretta possibile: il progetto a cui l'appunto si
-- attacca deve avere **lui** come PM.
-- ═══════════════════════════════════════════════════════════════════════════

create policy "Il PM gestisce gli appunti dei suoi progetti"
  on public.project_tasks
  for all
  to authenticated
  using (
    certification_id is not null
    and exists (
      select 1 from public.certifications c
       where c.id = project_tasks.certification_id
         and c.pm_id = auth.uid()
    )
  )
  with check (
    certification_id is not null
    and exists (
      select 1 from public.certifications c
       where c.id = project_tasks.certification_id
         and c.pm_id = auth.uid()
    )
  );

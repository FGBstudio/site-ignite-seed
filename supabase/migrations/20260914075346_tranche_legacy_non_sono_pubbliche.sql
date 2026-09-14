-- payment_milestones era leggibile da chiunque avesse un accesso.
--
-- La policy diceva using(true): qualunque utente autenticato — compresi i
-- profili esterni — poteva leggere le tranche di pagamento di qualunque
-- certificazione. Oggi la tabella e' vuota e duplicata da
-- cert_payment_milestones, quindi non e' uscito niente; ma una tabella aperta
-- che aspetta dei dati e' una falla che si apre da sola il giorno in cui
-- qualcuno ci scrive dentro.
--
-- Chi governa il denaro lo legge: l'amministrazione su tutto, il PM soltanto
-- sui progetti che segue. Gli operativi non lo vedono, ed e' voluto: la
-- separazione fra Operations e Payments vale anche per una tabella vuota.

drop policy if exists "Payment milestones viewable by authenticated" on public.payment_milestones;

create policy "Le tranche le legge chi le governa"
  on public.payment_milestones
  for select
  using (
    public.has_role(auth.uid(), 'ADMIN'::public.app_role)
    or exists (
      select 1
        from public.certifications c
       where c.id = payment_milestones.certification_id
         and c.pm_id = auth.uid()
    )
  );

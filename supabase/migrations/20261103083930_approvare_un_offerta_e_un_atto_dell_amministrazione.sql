-- ═══════════════════════════════════════════════════════════════════════════
-- Approvare un'offerta è un atto dell'amministrazione
--
-- `approve-quotation-v2` verifica il JWT e il ruolo admin, ed è **mai chiamata da
-- nessuno**: l'interfaccia approva con una `update` diretta. Oggi il risultato
-- giusto arriva comunque, ma per due regole che non parlano di approvazione — le
-- RLS danno l'UPDATE solo all'admin o al PM del progetto, e un'offerta non ha PM;
-- e la rotta `/quotations` è ADMIN-only. Nessuno controlla *l'approvazione*: il
-- controllo è un effetto collaterale di altro.
--
-- E la funzione, intanto, non è innocua: è deployata con `verify_jwt = false`,
-- quindi è **pubblicamente raggiungibile** e si verifica il token da sola. Un
-- endpoint pubblico, inutilizzato, che scrive sullo stato commerciale dei
-- progetti, è superficie d'attacco a beneficio zero. Inoltre non sa niente delle
-- offerte unificate: chiamata su una di tre righe che condividono un
-- `quotation_group_id` ne approverebbe una e lascerebbe le altre in offerta.
--
-- La regola si sposta qui, dove vale **da qualunque strada arrivi la scrittura** —
-- interfaccia, funzione, MCP, Lovable. Tre righe invece di centosettantotto, e la
-- funzione si può cancellare: con questa migrazione se ne vanno anche le cartelle
-- `supabase/functions/approve-quotation` e `-v2` e la voce in `config.toml`.
--
-- `auth.uid() is null` passa di proposito. Non è una scappatoia: è il caso dei
-- lavori di servizio — il giro giornaliero di Payments, una migrazione, un import
-- — che girano senza un utente e devono poter sistemare i dati. Il trigger
-- protegge dalle scritture *di una persona*, e una persona ha sempre un uid.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.trg_approvazione_solo_amministrazione()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if lower(coalesce(new.status, '')) <> 'quotation_approved'
     or lower(coalesce(old.status, '')) = 'quotation_approved' then
    return new;
  end if;

  if auth.uid() is null or coalesce(public.is_admin(auth.uid()), false) then
    return new;
  end if;

  raise exception
    'Approvare un''offerta è un atto dell''amministrazione: «%» resta in offerta.',
    coalesce(new.name, '?');
end;
$function$;

drop trigger if exists trg_approvazione_solo_amministrazione on public.certifications;

create trigger trg_approvazione_solo_amministrazione
  before update on public.certifications
  for each row execute function public.trg_approvazione_solo_amministrazione();

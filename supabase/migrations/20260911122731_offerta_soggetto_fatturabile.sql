-- ============================================================================
-- A chi si emette l'offerta
--
-- ── Il buco ───────────────────────────────────────────────────────────────
--
-- In anagrafica ci sono brand ("PRADA") e holding ("Prada Group"). Nessuno dei
-- due e' un soggetto fatturabile: non hanno partita IVA, non hanno una sede
-- legale, non si puo' intestare loro un'offerta.
--
-- La societa' esiste gia' come tabella — `contacts` ha company_name,
-- vat_number, tax_code, indirizzo, IBAN e PEC — ma non e' mai collegata alla
-- commessa. Il risultato e' che "a chi emettiamo" vive solo nella testa di chi
-- scrive l'offerta, e va riscritto a mano ogni volta.
--
-- Qui diventa un dato: la certificazione punta alla societa' a cui e'
-- intestata. Da li' la ereditano l'offerta e, piu' avanti, le tranche di
-- fatturazione — che oggi identificano il cliente solo attraverso
-- `certification_id`, cioe' non lo identificano affatto.
-- ============================================================================

alter table public.certifications
  add column if not exists billing_contact_id uuid
  references public.contacts(id) on delete set null;

create index if not exists certifications_billing_contact_idx
  on public.certifications (billing_contact_id)
  where billing_contact_id is not null;

comment on column public.certifications.billing_contact_id IS
  'La societa'' a cui si intesta offerta e fattura. Il brand non basta: non ha partita IVA.';

-- Il menu a tendina si regge su questo: scelto il brand, si offrono le sue
-- societa'. Senza indice e' una scansione a ogni apertura del form.
create index if not exists contacts_brand_idx
  on public.contacts (brand_id)
  where brand_id is not null;

-- ── Le voci dell'offerta ──────────────────────────────────────────────────
--
-- `quotation_notes` esiste ma e' testo libero: va bene per una nota, non per
-- un elenco che il template stampa riga per riga. Un array dice quello che e'.
alter table public.certifications
  add column if not exists quotation_line_items text[];

comment on column public.certifications.quotation_line_items IS
  'Le voci dell''offerta, una per riga. Finiscono nel PDF cosi'' come sono.';

-- Il prezzo di listino, quello barrato accanto al totale. Nullo = nessuno
-- sconto da mostrare, e nel PDF non compare niente.
alter table public.certifications
  add column if not exists quotation_list_price numeric;

comment on column public.certifications.quotation_list_price IS
  'Prezzo pieno prima dello sconto. Se valorizzato compare barrato accanto al totale; se nullo non compare nulla.';

-- ============================================================================
-- Riservatezza dei contatti
--
-- La policy diceva `using (true)`: qualunque utente autenticato poteva leggere
-- l'intera rubrica — partite IVA, codici fiscali, IBAN, PEC. Fra gli utenti
-- autenticati ci sono sette profili esterni con ruolo `viewer`, perche' questo
-- progetto Supabase serve anche la dashboard cliente.
--
-- La rotta /contacts e' gia' riservata ad ADMIN e PM: qui il database dice la
-- stessa cosa che diceva l'interfaccia, cosi' non si aggira interrogando i dati
-- direttamente.
-- ============================================================================
drop policy if exists "Authenticated users can view contacts" on public.contacts;

create policy contacts_select_interni on public.contacts
  for select to authenticated
  using (
    coalesce(public.is_admin(auth.uid()), false)
    or exists (
      select 1 from public.user_roles r
       where r.user_id = auth.uid()
         and upper(r.role::text) in ('PM', 'ADMIN')
    )
  );

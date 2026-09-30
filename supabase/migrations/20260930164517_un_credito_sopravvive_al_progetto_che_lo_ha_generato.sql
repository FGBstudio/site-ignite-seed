-- ═══════════════════════════════════════════════════════════════════════════
-- Un credito sopravvive al progetto che lo ha generato
--
-- «Louis Vuitton cancella il progetto a metà strada. Questi 6.750 mi rimangono a
-- credito e lui mi dice: li useremo per un progetto futuro.»
--
-- Oggi quella frase vive in una mail, e fra diciotto mesi quando Marco fa
-- l'offerta nuova nessuno se la ricorda. Non c'e' posto dove metterla: le
-- `credit_notes` sono note di credito su **una fattura** — riducono quel
-- documento — mentre questo e' un credito che resta al cliente quando il
-- progetto non esiste piu'.
--
-- Il saldo del cliente **non si scrive**: è la somma dei crediti aperti. Un
-- saldo scritto è un saldo che diverge dal primo credito che cambia stato.
--
-- Un credito non si cancella mai: cambia stato. «usato» quando finisce in
-- un'offerta nuova, «rimborsato» quando i soldi tornano indietro, «perso»
-- quando si decide di non riconoscerlo. Cancellarlo vorrebbe dire perdere la
-- prova di una promessa fatta a un cliente.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.crediti_cliente (
  id uuid primary key default gen_random_uuid(),

  -- A chi. È il contatto, non il brand: paga una società, e può essere la stessa
  -- per marchi diversi dello stesso gruppo.
  contact_id uuid not null references public.contacts(id) on delete restrict,

  -- Da dove viene. Resta anche se il progetto viene cancellato — è il motivo per
  -- cui il credito esiste, e senza di lui il credito non si sa spiegare.
  certification_id_origine uuid references public.certifications(id) on delete set null,

  importo numeric(14,2) not null check (importo > 0),
  valuta text not null default 'EUR',
  motivo text not null,

  stato text not null default 'aperto'
    check (stato in ('aperto', 'usato', 'rimborsato', 'perso')),

  -- Dove è finito. Obbligatorio quando lo stato è «usato»: un credito usato su
  -- niente è un credito sparito.
  usato_su_certification_id uuid references public.certifications(id) on delete set null,
  usato_il date,

  data date not null default current_date,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),

  -- «Usato» senza dire dove non è un'informazione, è una perdita di traccia.
  constraint crediti_usato_dice_dove check (
    stato <> 'usato' or usato_su_certification_id is not null
  ),
  -- Un credito non si usa sul progetto che lo ha generato: quel progetto è
  -- cancellato, e se non lo fosse non ci sarebbe un credito.
  constraint crediti_non_si_usa_sullorigine check (
    usato_su_certification_id is null
    or certification_id_origine is null
    or usato_su_certification_id <> certification_id_origine
  )
);

comment on table public.crediti_cliente is
  'Il credito che resta a un cliente quando un progetto si chiude prima di consumare quello che aveva pagato. Sopravvive al progetto: non si cancella, cambia stato.';

create index crediti_cliente_per_contatto on public.crediti_cliente (contact_id, stato);
create index crediti_cliente_per_origine on public.crediti_cliente (certification_id_origine);

alter table public.crediti_cliente enable row level security;

-- Chi vede i progetti vede i crediti: sono una parte della storia commerciale,
-- e Marco deve poterli leggere quando prepara un'offerta.
create policy "crediti leggibili agli autenticati"
  on public.crediti_cliente for select
  to authenticated using (true);

-- Scriverli è dell'amministrazione: è un impegno verso un cliente, non una nota.
create policy "crediti scritti dall'amministrazione"
  on public.crediti_cliente for insert
  to authenticated with check (public.is_admin(auth.uid()));

create policy "crediti aggiornati dall'amministrazione"
  on public.crediti_cliente for update
  to authenticated using (public.is_admin(auth.uid()));

-- Nessuna policy di DELETE: un credito non si cancella. Chi ne ha registrato
-- uno per sbaglio lo porta a «perso» con una nota che lo dice.

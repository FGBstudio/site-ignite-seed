-- ═══════════════════════════════════════════════════════════════════════════
-- «admin» e «ADMIN» sono lo stesso ruolo
--
-- Salvare una quotazione falliva con «new row violates row-level security
-- policy for table cert_payment_milestones», su un utente che l'interfaccia
-- mostra come ADMIN. Non era un permesso mancante: erano due domande diverse
-- sulla stessa cosa, che rispondevano l'una il contrario dell'altra.
--
--   is_admin(uid)              →  role IN ('admin', 'superuser')   →  VERO
--   has_role(uid, 'ADMIN')     →  role = 'ADMIN'                   →  FALSO
--
-- L'enum app_role porta entrambe le grafie — viewer, editor, admin, superuser
-- dal vocabolario storico, poi ADMIN, PM, document_manager e gli altri da
-- quello nuovo — e le due convivono senza che nulla dica che «admin» e «ADMIN»
-- sono la stessa persona. Tutti e otto gli amministratori hanno la riga
-- storica, minuscola.
--
-- Cosi' `certifications`, che usa is_admin, accettava la certificazione, e
-- `cert_payment_milestones`, che usa has_role, rifiutava le sue tranche: la
-- quotazione nasceva a meta', con un totale e nessuna scaletta di fatturazione.
-- Ne sono rimaste tre, dalle prove di oggi.
--
-- ── PERCHÉ SI CORREGGE LA FUNZIONE, NON LA POLICY ─────────────────────────
-- Perche' non e' una policy a essere sbagliata: sono ventisette, su venti
-- tabelle, piu' nove funzioni, e chiedono tutte 'ADMIN'. Sistemarne una avrebbe
-- lasciato in piedi le altre ventisei — commesse, ordini di fornitura, uscite
-- previste, fatture passive, task, canvas — tutte in scrittura negate a chi
-- dovrebbe governarle. La domanda «questo utente e' un amministratore» deve
-- avere una risposta sola, e non puo' dipendere da come e' scritta la riga che
-- qualcuno ha inserito anni fa.
--
-- Non allarga i permessi di nessuno: quegli otto utenti sono gia' amministratori
-- per is_admin, che governa certificazioni, prodotti e progetti. Le due funzioni
-- smettono di contraddirsi, e nessuno guadagna un accesso che non aveva. I PM
-- restano PM: la verifica e' stata rifatta dopo, e has_role(pm,'ADMIN') resta
-- falso.
--
-- L'equivalenza e' simmetrica di proposito: chi ha 'ADMIN' passa anche una
-- verifica scritta 'admin'. Un giorno le righe verranno normalizzate a una
-- grafia sola, e quel giorno questa funzione dovra' continuare a rispondere
-- bene mentre le due grafie convivono ancora.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
      from public.user_roles ur
     where ur.user_id = _user_id
       and (
         ur.role = _role
         -- Le grafie dello stesso ruolo: quella storica e quella nuova valgono
         -- l'una per l'altra, e «superuser» e' un amministratore anche lui —
         -- e' gia' cosi' che la legge is_admin.
         or (_role in ('ADMIN', 'admin', 'superuser')
             and ur.role in ('ADMIN', 'admin', 'superuser'))
       )
  )
$function$;

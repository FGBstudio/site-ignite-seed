## Problema individuato

Le tabelle del database **esistono e contengono dati** (`certifications` ha 840 righe), ma l'app mostra "No projects found" e tutti i contatori a 0.

La causa è che **nessuna tabella dello schema `public` ha più i GRANT** per i ruoli `authenticated`, `anon` e `service_role`. Senza GRANT espliciti, PostgREST (la Data API di Supabase) rifiuta silenziosamente le query e il frontend riceve risposte vuote — anche se le policy RLS sarebbero permissive. Questo è il tipico effetto collaterale di un progetto rigenerato/remixato dove le permission implicite non sono sopravvissute.

Verificato con:
- `SELECT count(*) FROM certifications` → 840
- `information_schema.role_table_grants` per `public.certifications` → 0 righe
- Tutte e ~90 le tabelle `public` risultano senza grant

## Soluzione

Una sola migrazione che ripristina i GRANT mancanti su tutte le tabelle base di `public`:

- `authenticated` → `SELECT, INSERT, UPDATE, DELETE` (le policy RLS continuano a filtrare per utente)
- `service_role` → `ALL` (necessario per edge functions e codice admin)
- `anon` → **non concesso** in modo massivo: lo aggiungerò esplicitamente solo per le tabelle che devono essere pubbliche se emergeranno casi (al momento l'app è auth-only)

Userò il loop "bulk restore" raccomandato dalla guida Supabase, che applica i GRANT solo dove mancano e quindi non sovrascrive eventuali revoke deliberate.

## Cosa NON cambia

- Nessuna policy RLS toccata
- Nessuno schema modificato
- Nessun file frontend modificato (la query del Projects page è corretta, il problema è puramente di permessi DB)

Dopo l'esecuzione, la pagina Operations tornerà a mostrare le 840 certificazioni filtrate dalle policy esistenti.

Il problema è identificato: il pulsante sta chiamando la nuova funzione sul backend Lovable Cloud (`pquld...`), ma la sessione utente e i dati reali sono sull’altro backend usato dal client (`vejq...`). Quindi la funzione prova a validare un token emesso da un progetto diverso e risponde correttamente `401 Unauthorized`. Non è un problema del ruolo Admin in UI: è un mismatch tra endpoint funzione e backend dati/auth.

Piano di fix:

1. Riallineare la chiamata frontend al backend dati effettivo
   - In `src/pages/Quotations.tsx`, smetto di costruire l’URL funzione con `import.meta.env.VITE_SUPABASE_URL`, perché punta al backend sbagliato.
   - Uso il client già configurato per `/quotations`, cioè `supabase.functions.invoke('approve-quotation-v2', ...)`, così token, funzione e database stanno sullo stesso progetto usato da `certifications`.

2. Rendere deployabile la nuova funzione sul backend corretto
   - Il file `supabase/config.toml` è già puntato al backend dati/auth effettivo (`vejq...`), quindi la nuova Edge Function deve vivere lì, non sull’altro backend.
   - Deploy della funzione `approve-quotation-v2` su quel backend.

3. Correggere l’autorizzazione admin lato funzione
   - La funzione continuerà a validare il bearer token con `getClaims()` sullo stesso backend del token.
   - Poi controllerà `user_roles` con ruolo `ADMIN`.
   - Per sicurezza gestirà anche eventuali ruoli in formato lowercase/uppercase (`ADMIN` / `admin`) se presenti nei dati.

4. Verificare tabella `certifications` e privilegi sul backend corretto
   - Leggo schema colonne: `status`, `quotation_approved_at`, `quotation_approved_by`.
   - Leggo grant e policy su `certifications` / `user_roles`.
   - Se mancano grant necessari per Data API o service role, preparo una migration mirata, senza rendere pubbliche tabelle non necessarie.

5. Aggiornare UI e cache Operations
   - Dopo successo, aggiorno subito cache `quotations-list` e `admin-planner-all-certifications`.
   - Poi refetch forzato di entrambe le fonti, così Operations › Quotations Approved si popola dalla tabella `certifications` aggiornata.

6. Verifica reale
   - Test endpoint: una chiamata senza token deve dare 401; una chiamata con sessione admin deve passare.
   - Test browser: click su `Mark as Approved` deve chiamare `approve-quotation-v2` sul backend corretto, ricevere `200`, spostare la riga fuori da Pending e farla comparire in Operations › Quotations Approved.
Piano per ricostruire il flusso da zero, senza continuare a rattoppare il vecchio percorso:

1. Creare una nuova Edge Function dedicata
   - Nome: `approve-quotation-v2`.
   - Input: `certification_id`.
   - Output: la riga aggiornata minima: `id`, `status`, `quotation_approved_at`, `name`, `client`.
   - Userà il backend con service role, quindi non dipenderà dalle policy client-side che stanno producendo errori opachi.

2. Autorizzazione lato server
   - La funzione leggerà il token dell’utente dalla richiesta.
   - Verificherà che l’utente abbia ruolo `ADMIN` nella tabella `user_roles`.
   - Se non è admin, ritorna `403 Forbidden` con messaggio chiaro.

3. Aggiornamento database atomico
   - La funzione controllerà che la certification esista e sia in stato `quotation`.
   - Aggiornerà:
     - `status = 'quotation_approved'`
     - `quotation_approved_at = now`
     - `quotation_approved_by = userId`
   - Ritornerà errore leggibile se il record non esiste, è già stato approvato/cancellato, o il DB rifiuta l’update.

4. Frontend Quotations: usare solo il nuovo canale
   - In `src/pages/Quotations.tsx`, `Mark as Approved` chiamerà `supabase.functions.invoke('approve-quotation-v2', ...)`.
   - Tolgo il direct update client-side che ora genera `[object Object]`.
   - Miglioro la gestione errori per mostrare sempre un messaggio stringa reale, anche quando l’errore arriva come oggetto.

5. Aggiornamento automatico Operations › Quotations Approved
   - Dopo successo, aggiorno subito la cache `quotations-list` togliendo la riga da Pending e impostandola come approved.
   - Invalidazione/refetch immediato di:
     - `quotations-list`
     - `admin-planner-all-certifications`
     - `task-alerts`
   - Così Operations ricarica dalla fonte corretta e la tab `Quotations Approved` vede subito `status = quotation_approved`.

6. Deploy e verifica
   - Deploy della nuova Edge Function.
   - Test diretto della funzione con la sessione preview, senza modificare dati reali a caso se non attraverso il click previsto.
   - Verifica network: il click deve chiamare `/functions/v1/approve-quotation-v2`, non il vecchio `approve-quotation` e non un update diretto REST.

Non toccherò:
- `src/integrations/supabase/client.ts`
- `.env`
- configurazione auth
- tabelle/schema esistenti, salvo emergano errori di colonne mancanti durante il test
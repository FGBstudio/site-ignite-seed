Conferma: sì, l’app è connessa a un DB Supabase esterno. Lo vedo da `src/integrations/supabase/client.ts`: il client che legge `certifications` usa il progetto esterno `vejq...`. Il problema attuale è che il bottone chiama una Edge Function su un altro backend (`pquld...`), quindi la funzione non ha una service key valida per il DB Supabase esterno e fallisce con `Invalid API key`.  
usa questa: sb_publishable_U50PEA4-VFDpQ_qS3DubBw_K0U680v8  
usa questa: [https://vejqfpznzcohtbggkfhr.supabase.co](https://vejqfpznzcohtbggkfhr.supabase.co)

Piano di correzione definitiva senza usare Lovable Cloud per questa azione:

1. Eliminare la Edge Function dal flusso `Mark as Approved`
  - Non chiameremo più `/functions/v1/approve-quotation-v2`.
  - Questo rimuove completamente il mismatch tra backend funzione e DB Supabase esterno.
2. Spostare l’approvazione in una funzione SQL del DB Supabase esterno
  - Creo una RPC PostgreSQL `public.approve_quotation_v2(certification_id uuid)` direttamente nel DB esterno.
  - La RPC gira `SECURITY DEFINER`, quindi può aggiornare `certifications` in modo controllato.
  - Dentro la RPC controllo `auth.uid()` e autorizzo solo utenti con ruolo `ADMIN` o `admin` in `public.user_roles`.
  - Aggiorna la riga in `public.certifications`:
    - `status = 'quotation_approved'`
    - `quotation_approved_at = now()`
    - `quotation_approved_by = auth.uid()`
  - Ritorna la certification aggiornata minima per aggiornare la UI.
3. Garantire permessi corretti sul DB Supabase esterno
  - Aggiungo `GRANT EXECUTE` della RPC ad `authenticated`.
  - Se servono grant Data API mirati su `certifications` o `user_roles`, li applico solo alle tabelle coinvolte, senza apertura anonima.
4. Frontend: chiamare il DB Supabase esterno via client già funzionante
  - In `src/pages/Quotations.tsx`, `handleApprove` userà:
    - `supabase.rpc('approve_quotation_v2', { certification_id: id })`
  - Quindi la chiamata passa dallo stesso client che già legge la tabella `certifications` e usa la stessa sessione utente.
5. Aggiornamento automatico Operations
  - Dopo successo, aggiorno subito cache `quotations-list` e `admin-planner-all-certifications`.
  - Poi refetch forzato delle stesse query, così Operations › Quotations Approved si popola dalla tabella `certifications` aggiornata.
6. Verifica
  - Test DB: verifico che la RPC esista e abbia permesso `EXECUTE` per utenti autenticati.
  - Test runtime: il click non deve più generare nessuna richiesta a `/functions/v1/approve-quotation-v2`; deve fare una chiamata REST/RPC al DB Supabase esterno e ricevere successo.
# Test E2E del flusso "PM crea alert → admin ricevono email"

## Diagnosi

Il flusso end-to-end è già cablato correttamente nel codice:

1. PM crea un task alert con `escalate_to_admin=true`
2. `useAdminEscalationNotifications` mostra il toast realtime nella dashboard admin (OK)
3. La funzione `dispatch-admin-escalation` risolve tutti gli admin (escludendo chi ha `notify_escalations_email=false`) e per ciascuno invoca `send-transactional-email` con il template `escalation-alert`

Il punto 3 sta **fallendo sistematicamente**: tutte le 6 email all'ultimo tentativo (alert `b800e74d…` del 27/04 12:10) hanno status `failed` con messaggio "Failed to enqueue email", e lo stesso era successo il 25/04. Mai arrivata una sola email.

**Causa root**: nel database `public` esistono **due versioni di `enqueue_email**`:

- `enqueue_email(queue_name text, payload json)`
- `enqueue_email(queue_name text, payload jsonb)`

Quando `send-transactional-email` chiama `supabase.rpc('enqueue_email', {...})`, PostgREST non riesce a scegliere fra i due overload e restituisce errore `PGRST203`. Il codice cattura l'errore e lo logga come "Failed to enqueue email", ma il messaggio originale (con il dettaglio dell'ambiguità) viene scartato. Per questo finora il problema sembrava un mistero.

L'overload `jsonb` è quello canonico creato dall'infrastruttura email (è quello atteso dalla pipeline `process-email-queue`). L'overload `json` è un duplicato (probabilmente da una migration manuale precedente) che va rimosso.

## Cosa farò una volta approvato

### 1. Migration: rimozione overload duplicato

Elimino la versione `json` lasciando intatta quella `jsonb`:

```sql
DROP FUNCTION IF EXISTS public.enqueue_email(text, json);
```

L'overload `jsonb` resta operativo e firma e permission restano invariati. Nessun impatto sulla pipeline auth o su altre code.

### 2. Test end-to-end reale del flusso

Dopo la migration:

a. **Identifico un alert esistente** già scalato (es. l'`alertId` `b800e74d-4d09-4554-937f-13671d145306` del log fallito) — oppure ti chiedo di crearne uno nuovo da PM se preferisci validare anche la parte UI/realtime.

b. **Invoco direttamente `dispatch-admin-escalation**` con quell'`alertId` (esattamente come fa il sistema in produzione quando un PM crea l'alert).

c. **Verifico la catena completa**:

- `dispatch-admin-escalation` risponde `{ ok: true, sent: N, failed: 0 }`
- `email_send_log` mostra una riga `pending` per ogni admin (subito dopo l'enqueue)
- Entro ~10 secondi il dispatcher cron `process-email-queue` cambia lo status in `sent`
- Nessuna riga finisce in `dlq` o `failed`
- Nessuna chiamata 4xx/5xx nei log Resend (verifico tramite log edge function)

d. **Conferma di consegna**: dato che la riga `sent` significa solo "Resend ha accettato il messaggio", ti confermo dal log la latenza e il `message_id`. Per la conferma fisica di arrivo in inbox basta che uno degli admin (es. `monitoring@fgb-studio.com` o il tuo indirizzo) controlli la posta — la logica di delivery dipende dal dominio root `fgb-studio.com` verificato su Resend, non posso ispezionarla dal mio lato.

## Cosa NON tocco

- Codice di `dispatch-admin-escalation`, `send-transactional-email`, template, registry
- Permessi RLS, code pgmq, cron job, vault secret
- Auth email hook e `RESEND_API_KEY` (restano isolati)
- DNS / configurazione dominio

## Domanda per te

Vuoi che il test parta:

- **(A)** dall'alert già esistente (`b800e74d…`) → test rapido, valida solo il path dispatch → email
- **(B)** da un alert nuovo che crei tu da UI come PM → test completo che include realtime toast admin + email

Lo decidi tu, in entrambi i casi attendo la tua conferma prima di lanciare il dispatch reale.  
  
Li lancerò entrambi, prima tu fai partire il tuo, poi io ne testo uno creando l'alert da dash